// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { CardAnswerInput, CongratsInfo, QueuedCardsView, SchedulingStatesRaw, StudyCard } from '../proto/messages/SchedulerMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity, syncActivity } from './SyncSettings';
import { StudyOptions } from './StudyTiming';
import { CardRenderPrefetch } from './CardRenderPrefetch';
import type { JideChoiceQuestion } from './JideChoice';
import { ReviewPreferences } from '../proto/messages/PreferencesMessages';
import type { CardMarkingState, FlagLabels } from './CardMarking';
import type { UndoStatus } from '../proto/messages/CollectionMessages';

export interface StudyAnswerProbe { step: number; card: string; reps: number; }
interface PendingStudyAnswer { input: CardAnswerInput; before: StudyAnswerProbe | null; }

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
  reviewPreferences(): Promise<ReviewPreferences>;
  describeStates(states: SchedulingStatesRaw): Promise<string[]>;
  answer(input: CardAnswerInput): Promise<void>;
  answerProbe?(cardId: number): Promise<StudyAnswerProbe>;
  historyStatus?(): Promise<UndoStatus>;
  undoExpected?(status: UndoStatus): Promise<void>;
  undo(): Promise<void>;
  redo?(): Promise<void>;
  buryNote?(noteId: number, mode: number): Promise<void>;
  congrats(): Promise<CongratsInfo>;
  choiceQuestion?(noteId: number): Promise<JideChoiceQuestion | null>;
  marking?(cardId: number): Promise<CardMarkingState>;
  flagLabels?(): Promise<FlagLabels>;
  setCardFlag?(cardId: number, flag: number): Promise<void>;
  setNoteMarked?(noteId: number, marked: boolean): Promise<void>;
  customizeStates?(card: StudyCard, script: string): Promise<SchedulingStatesRaw>;
}

export interface StudySnapshot {
  queue: QueuedCardsView;
  canUndo: boolean;
  card: StudyCard | null;
  rendered: RenderedCard | null;
  labels: string[];
  options: StudyOptions;
  choiceQuestion: JideChoiceQuestion | null;
  preferences: ReviewPreferences;
  marking: CardMarkingState | null;
  flagLabels: FlagLabels;
}

export interface StudyMarkingSnapshot { rendered: RenderedCard; marking: CardMarkingState | null; }

export interface StudyTimeboxNotice { seconds: number; answers: number; }

/** 编排取卡/评分，页面只消费完整快照；不改动调度算法和原始状态字节。 */
export class StudySessionController {
  private backend: StudySessionBackend;
  private scheduler: AutoSyncScheduler;
  private activity: SyncActivity;
  private disposed: boolean = false;
  private operations: number = 0;
  private complete: boolean = false;
  private readonly now: () => number;
  private timeboxLimit: number = 0;
  private timeboxElapsed: number = 0;
  private timeboxStarted: number | null = null;
  private timeboxAnswers: number = 0;
  private timeboxNotice: StudyTimeboxNotice | null = null;
  private customSchedulingScript: string = '';
  private acknowledgedScript: string = '';
  private customSchedulingError: string = '';
  private renderPrefetch: CardRenderPrefetch;
  private nextRenderId: number = 0;
  private pendingAnswer: PendingStudyAnswer | null = null;

  hasPendingAnswer(): boolean { return this.pendingAnswer !== null; }
  async historyStatus(): Promise<UndoStatus> {
    if (this.backend.historyStatus === undefined) throw new Error('History status unavailable');
    return this.backend.historyStatus();
  }
  undoExpected(status: UndoStatus): Promise<void> {
    return this.commitChange(async (): Promise<void> => {
      if (this.backend.undoExpected === undefined) throw new Error('Verified undo unavailable');
      await this.backend.undoExpected(status);
    });
  }

  /** 只有 Core 步号和卡片都未变才允许重送；核对失败或冲突保留待核对输入。 */
  private async reconcileAnswer(pending: PendingStudyAnswer): Promise<boolean> {
    if (pending.before === null || this.backend.answerProbe === undefined) throw new Error('Answer outcome unresolved');
    const after: StudyAnswerProbe = await this.backend.answerProbe(pending.input.cardId);
    if (after.step === pending.before.step && after.card === pending.before.card) return false;
    if (after.step === pending.before.step + 1 && after.reps === pending.before.reps + 1 &&
      after.card !== pending.before.card) return true;
    throw new Error('Answer outcome unresolved; Core state changed');
  }

  needsCustomSchedulingAcknowledgement(): boolean {
    return this.customSchedulingError !== '' && this.customSchedulingScript !== this.acknowledgedScript;
  }
  schedulingError(): string { return this.customSchedulingError; }
  acknowledgeCustomScheduling(): void {
    if (!this.disposed) this.acknowledgedScript = this.customSchedulingScript;
  }

  constructor(backend: StudySessionBackend, scheduler: AutoSyncScheduler = autoSyncScheduler,
    activity: SyncActivity = syncActivity, now: () => number = (): number => Date.now()) {
    this.backend = backend;
    this.scheduler = scheduler;
    this.activity = activity;
    this.now = now;
    this.renderPrefetch = new CardRenderPrefetch((id: number): Promise<RenderedCard> => backend.renderCard(id), now);
  }

  clearPreparedCard(): void {
    this.nextRenderId = 0;
    this.renderPrefetch.clear();
  }

  /** 当前题面显示后再准备 Core 给出的候选；不提前提交评分或采用候选的调度状态。 */
  async prepareNextCard(): Promise<void> {
    const id: number = this.nextRenderId;
    if (this.disposed || id <= 0 || this.activity.isCollectionBusy()) return;
    this.beginOperation();
    try {
      await this.renderPrefetch.prepare(id);
    } finally { this.endOperation(); }
  }

  activate(): void {
    if (this.disposed) return;
    this.complete = false;
    this.scheduler.setStudyActive(this, true);
    this.activity.requestStudyPriority();
  }

  markComplete(): void {
    this.clearPreparedCard();
    this.pauseTimebox();
    this.complete = true;
    this.updateAvailability();
  }

  dispose(): void {
    this.clearPreparedCard();
    this.pauseTimebox();
    this.timeboxNotice = null;
    this.disposed = true;
    this.updateAvailability();
  }

  async loadNext(deckId: number, isCurrent: () => boolean): Promise<StudySnapshot | null> {
    this.nextRenderId = 0;
    this.beginOperation();
    try {
      await this.activity.waitForCollection();
      if (this.disposed || !isCurrent()) return null;
      if (this.pendingAnswer !== null) throw new Error('Pending answer requires reconciliation before loading another card');
      const canUndo: boolean = await this.canUndo();
      if (this.disposed || !isCurrent()) return null;
      const preferences: ReviewPreferences = await this.backend.reviewPreferences();
      if (this.disposed || !isCurrent()) return null;
      this.setTimeboxLimit(preferences.timeLimitSecs);
      const queue: QueuedCardsView = await this.backend.queuedCards(deckId);
      if (this.disposed || !isCurrent()) return null;
      const card: StudyCard | null = queue.cards.length === 0 ? null : queue.cards[0];
      if (card === null) return { queue: queue, canUndo: canUndo, card: null, rendered: null, labels: [], options: new StudyOptions(), choiceQuestion: null, preferences: preferences, marking: null, flagLabels: {} };
      // 评分后仍先重新读 Core 队首；只对确认相同的卡复用预加载 HTML。
      const rendered: RenderedCard = await this.renderPrefetch.read(card.cardId);
      if (this.disposed || !isCurrent()) return null;
      const options: StudyOptions = await this.backend.studyOptions(card.cardId);
      if (this.disposed || !isCurrent()) return null;
      this.customSchedulingScript = options.customSchedulingScript ?? '';
      this.customSchedulingError = '';
      if (this.customSchedulingScript.trim() !== '' && this.customSchedulingScript !== this.acknowledgedScript) {
        try {
          if (this.backend.customizeStates === undefined) throw new Error('Custom scheduling runtime unavailable');
          const states = await this.backend.customizeStates(card, this.customSchedulingScript);
          if (this.disposed || !isCurrent()) return null;
          card.states = states;
        } catch (error) {
          if (this.disposed || !isCurrent()) return null;
          this.customSchedulingError = error instanceof Error && error.message !== ''
            ? error.message : 'Custom scheduling failed';
        }
      }
      const labels: string[] = await this.backend.describeStates(card.states);
      if (this.disposed || !isCurrent()) return null;
      const choiceQuestion: JideChoiceQuestion | null = this.backend.choiceQuestion === undefined
        ? null : await this.backend.choiceQuestion(card.noteId);
      if (this.disposed || !isCurrent()) return null;
      const marking: CardMarkingState | null = this.backend.marking === undefined ? null : await this.backend.marking(card.cardId);
      if (this.disposed || !isCurrent()) return null;
      const flagLabels: FlagLabels = this.backend.flagLabels === undefined ? {} : await this.backend.flagLabels();
      if (this.disposed || !isCurrent()) return null;
      this.nextRenderId = queue.cards.length > 1 ? queue.cards[1].cardId : 0;
      return { queue: queue, canUndo: canUndo, card: card, rendered: rendered, labels: labels, options: options,
        choiceQuestion: choiceQuestion, preferences: preferences, marking: marking, flagLabels: flagLabels };
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
    if (this.needsCustomSchedulingAcknowledgement()) throw new Error('Custom scheduling requires acknowledgement');
    if (!Number.isInteger(rating) || rating < 0 || rating > 3) throw new Error('Invalid rating');
    const states: SchedulingStatesRaw = card.states;
    const next: Uint8Array[] = [states.again, states.hard, states.good, states.easy];
    const input: CardAnswerInput = {
      cardId: card.cardId, currentState: states.current, newState: next[rating], rating: rating,
      answeredAtMillis: now, millisecondsTaken: Math.max(0, now - shownAt)
    };
    this.pauseTimebox();
    await this.commitChange(async (): Promise<void> => {
      let pending: PendingStudyAnswer | null = this.pendingAnswer;
      if (pending !== null) {
        if (pending.input.cardId !== card.cardId || pending.input.rating !== rating) throw new Error('Pending answer requires reconciliation');
        if (await this.reconcileAnswer(pending)) { this.pendingAnswer = null; return; }
      } else {
        const before: StudyAnswerProbe | null = this.backend.answerProbe === undefined ? null :
          await this.backend.answerProbe(card.cardId);
        pending = { input: input, before: before };
      }
      this.pendingAnswer = pending;
      try {
        await this.backend.answer(pending.input);
        this.pendingAnswer = null;
      } catch (error) {
        try {
          if (await this.reconcileAnswer(pending)) { this.pendingAnswer = null; return; }
        } catch (probeError) {
          throw new Error(`${error instanceof Error ? error.message : error}; ${probeError}`);
        }
        throw error;
      }
    }, true);
    if (!this.disposed) {
      this.timeboxAnswers++;
      this.pauseTimebox();
      if (this.timeboxLimit > 0 && this.timeboxElapsed >= this.timeboxLimit * 1000 && this.timeboxNotice === null) {
        this.timeboxNotice = { seconds: Math.floor(this.timeboxElapsed / 1000), answers: this.timeboxAnswers };
      }
    }
  }

  private setTimeboxLimit(seconds: number): void {
    if (seconds === this.timeboxLimit) return;
    this.pauseTimebox();
    this.timeboxLimit = seconds;
    this.continueTimebox();
  }

  resumeTimebox(): void {
    if (this.disposed || this.timeboxLimit <= 0 || this.timeboxNotice !== null || this.timeboxStarted !== null) return;
    this.timeboxStarted = this.now();
  }

  pauseTimebox(): void {
    if (this.timeboxStarted === null) return;
    this.timeboxElapsed += Math.max(0, this.now() - this.timeboxStarted);
    this.timeboxStarted = null;
  }

  pendingTimebox(): StudyTimeboxNotice | null { return this.disposed ? null : this.timeboxNotice; }

  /** 继续后开始新一段；切卡、编辑和后台只暂停，不清空累计。 */
  continueTimebox(): void {
    this.timeboxElapsed = 0;
    this.timeboxAnswers = 0;
    this.timeboxStarted = null;
    this.timeboxNotice = null;
  }

  undo(): Promise<void> {
    return this.commitChange((): Promise<void> => this.backend.undo());
  }

  redo(): Promise<void> {
    return this.commitChange(async (): Promise<void> => {
      if (this.backend.redo === undefined) throw new Error('Redo unavailable');
      await this.backend.redo();
    });
  }

  buryNote(noteId: number, mode: number): Promise<void> {
    return this.commitChange(async (): Promise<void> => {
      if (this.backend.buryNote === undefined) throw new Error('Note bury unavailable');
      await this.backend.buryNote(noteId, mode);
    });
  }

  setCardFlag(cardId: number, flag: number): Promise<void> {
    return this.commitChange(async (): Promise<void> => {
      if (this.backend.setCardFlag === undefined) throw new Error('Card marking unavailable');
      await this.backend.setCardFlag(cardId, flag);
    });
  }

  setNoteMarked(noteId: number, marked: boolean): Promise<void> {
    return this.commitChange(async (): Promise<void> => {
      if (this.backend.setNoteMarked === undefined) throw new Error('Note marking unavailable');
      await this.backend.setNoteMarked(noteId, marked);
    });
  }

  async refreshMarking(cardId: number, isCurrent: () => boolean): Promise<StudyMarkingSnapshot | null> {
    this.beginOperation();
    try {
      await this.activity.waitForCollection();
      if (this.disposed || !isCurrent()) return null;
      const rendered: RenderedCard = await this.backend.renderCard(cardId);
      if (this.disposed || !isCurrent()) return null;
      const marking: CardMarkingState | null = this.backend.marking === undefined ? null : await this.backend.marking(cardId);
      return this.disposed || !isCurrent() ? null : { rendered: rendered, marking: marking };
    } finally { this.endOperation(); }
  }

  saveNote(note: EditableNote, fields: string[], tags: string[],
    prepareFields: ((fields: string[]) => Promise<string[]>) | null = null): Promise<void> {
    const updated: EditableNote = {
      id: note.id, guid: note.guid, notetypeId: note.notetypeId,
      mtimeSecs: note.mtimeSecs, usn: note.usn, fields: fields.slice(), tags: tags.slice()
    };
    return this.commitChange(async (): Promise<void> => {
      // 媒体导入和笔记更新共用写入保护，离页后仍完成已接受的保存。
      if (prepareFields !== null) updated.fields = await prepareFields(updated.fields);
      await this.backend.updateNote(updated);
    });
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
  async commitChange(write: () => Promise<void>, preservePreparedCard: boolean = false): Promise<void> {
    if (!preservePreparedCard) this.clearPreparedCard();
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
