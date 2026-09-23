// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { CardAnswerInput, CongratsInfo, QueuedCardsView, SchedulingStatesRaw, StudyCard } from '../proto/messages/SchedulerMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity, syncActivity } from './SyncSettings';
import { StudyOptions } from './StudyTiming';
import type { JideChoiceQuestion } from './JideChoice';

/** 显式后端边界，允许在不加载 NAPI/ArkUI 的测试中验证学习会话。 */
export interface StudySessionBackend {
  updateNote(note: EditableNote): Promise<void>;
  buryCard(cardId: number, mode: number): Promise<void>;
  removeCard(cardId: number): Promise<void>;
  unburyDeck(deckId: number): Promise<void>;
  canUndo(): Promise<boolean>;
  queuedCards(deckId: number): Promise<QueuedCardsView>;
  renderCard(cardId: number): Promise<RenderedCard>;
  studyOptions(cardId: number): Promise<StudyOptions>;
  describeStates(states: SchedulingStatesRaw): Promise<string[]>;
  answer(input: CardAnswerInput): Promise<void>;
  undo(): Promise<void>;
  congrats(): Promise<CongratsInfo>;
  choiceQuestion?(noteId: number): Promise<JideChoiceQuestion | null>;
}

export interface StudySnapshot {
  queue: QueuedCardsView;
  canUndo: boolean;
  card: StudyCard | null;
  rendered: RenderedCard | null;
  labels: string[];
  options: StudyOptions;
  choiceQuestion: JideChoiceQuestion | null;
}

/** 编排取卡/评分，页面只消费完整快照；不改动调度算法和原始状态字节。 */
export class StudySessionController {
  private backend: StudySessionBackend;
  private scheduler: AutoSyncScheduler;
  private activity: SyncActivity;
  private disposed: boolean = false;
  private operations: number = 0;
  private complete: boolean = false;

  constructor(backend: StudySessionBackend, scheduler: AutoSyncScheduler = autoSyncScheduler,
    activity: SyncActivity = syncActivity) {
    this.backend = backend;
    this.scheduler = scheduler;
    this.activity = activity;
  }

  activate(): void {
    if (this.disposed) return;
    this.complete = false;
    this.scheduler.setStudyActive(this, true);
    this.activity.requestStudyPriority();
  }

  markComplete(): void {
    this.complete = true;
    this.updateAvailability();
  }

  dispose(): void {
    this.disposed = true;
    this.updateAvailability();
  }

  async loadNext(deckId: number, isCurrent: () => boolean): Promise<StudySnapshot | null> {
    this.beginOperation();
    try {
      await this.activity.waitForCollection();
      if (this.disposed || !isCurrent()) return null;
      const canUndo: boolean = await this.canUndo();
      if (this.disposed || !isCurrent()) return null;
      const queue: QueuedCardsView = await this.backend.queuedCards(deckId);
      if (this.disposed || !isCurrent()) return null;
      const card: StudyCard | null = queue.cards.length === 0 ? null : queue.cards[0];
      if (card === null) return { queue: queue, canUndo: canUndo, card: null, rendered: null, labels: [], options: new StudyOptions(), choiceQuestion: null };
      const rendered: RenderedCard = await this.backend.renderCard(card.cardId);
      if (this.disposed || !isCurrent()) return null;
      const options: StudyOptions = await this.backend.studyOptions(card.cardId);
      if (this.disposed || !isCurrent()) return null;
      const labels: string[] = await this.backend.describeStates(card.states);
      if (this.disposed || !isCurrent()) return null;
      const choiceQuestion: JideChoiceQuestion | null = this.backend.choiceQuestion === undefined
        ? null : await this.backend.choiceQuestion(card.noteId);
      if (this.disposed || !isCurrent()) return null;
      return { queue: queue, canUndo: canUndo, card: card, rendered: rendered, labels: labels, options: options,
        choiceQuestion: choiceQuestion };
    } finally {
      this.endOperation();
    }
  }

  async canUndo(): Promise<boolean> {
    try { return await this.backend.canUndo(); } catch (error) { return false; }
  }

  async congrats(): Promise<CongratsInfo> {
    this.beginOperation();
    try {
      await this.activity.waitForCollection();
      if (this.disposed) throw new Error('Study session disposed');
      const info: CongratsInfo = await this.backend.congrats();
      if (this.disposed) throw new Error('Study session disposed');
      return info;
    } finally {
      this.endOperation();
    }
  }

  async answer(card: StudyCard, rating: number, now: number, shownAt: number): Promise<void> {
    if (!Number.isInteger(rating) || rating < 0 || rating > 3) throw new Error('Invalid rating');
    const states: SchedulingStatesRaw = card.states;
    const next: Uint8Array[] = [states.again, states.hard, states.good, states.easy];
    const input: CardAnswerInput = {
      cardId: card.cardId, currentState: states.current, newState: next[rating], rating: rating,
      answeredAtMillis: now, millisecondsTaken: Math.max(0, now - shownAt)
    };
    await this.commitChange((): Promise<void> => this.backend.answer(input));
  }

  undo(): Promise<void> {
    return this.commitChange((): Promise<void> => this.backend.undo());
  }

  saveNote(note: EditableNote, fields: string[], tags: string[]): Promise<void> {
    const updated: EditableNote = {
      id: note.id, guid: note.guid, notetypeId: note.notetypeId,
      mtimeSecs: note.mtimeSecs, usn: note.usn, fields: fields.slice(), tags: tags.slice()
    };
    return this.commitChange((): Promise<void> => this.backend.updateNote(updated));
  }

  buryCard(cardId: number, mode: number): Promise<void> {
    return this.commitChange((): Promise<void> => this.backend.buryCard(cardId, mode));
  }

  removeCard(cardId: number): Promise<void> {
    return this.commitChange((): Promise<void> => this.backend.removeCard(cardId));
  }

  unburyDeck(deckId: number): Promise<void> {
    return this.commitChange((): Promise<void> => this.backend.unburyDeck(deckId));
  }

  /** 写入完成才通知同步；销毁页面不撤回已提交的写入，也不能提前释放集合占用。 */
  async commitChange(write: () => Promise<void>): Promise<void> {
    this.beginOperation();
    try {
      await this.activity.waitForCollection();
      await write();
      this.scheduler.request();
    } finally {
      this.endOperation();
    }
  }

  private beginOperation(): void {
    if (this.disposed) throw new Error('Study session disposed');
    this.operations++;
    this.activate();
  }

  private endOperation(): void {
    this.operations--;
    this.updateAvailability();
  }

  private updateAvailability(): void {
    if (this.operations > 0) return;
    if (this.disposed) this.scheduler.removeStudy(this);
    else if (this.complete) this.scheduler.setStudyActive(this, false);
  }
}
