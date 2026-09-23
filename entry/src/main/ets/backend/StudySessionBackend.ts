// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
import { UNBURY_MODE_ALL } from '../proto/messages/SchedulerMessages';
import { 笔记服务 } from './笔记服务';
import type { StudySessionBackend } from '../model/StudySessionController';
import type { CardAnswerInput, CongratsInfo, QueuedCardsView, SchedulingStatesRaw } from '../proto/messages/SchedulerMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';
import { 调度器服务 } from './调度器服务';
import { 卡片渲染服务 } from './卡片渲染服务';
import { 集合服务 } from './集合服务';
import { 卡片服务 } from './卡片服务';
import { 牌组配置服务 } from './牌组配置服务';
import type { Card } from '../proto/messages/CardsMessages';
import type { DeckConfigsForUpdateView } from '../proto/messages/DeckConfigMessages';
import { StudyOptions } from '../model/StudyTiming';
import { jideChoiceQuestionFromNote } from '../model/JideChoice';
import type { JideChoiceQuestion } from '../model/JideChoice';
import { 笔记类型服务 } from './笔记类型服务';

/** 复用既有 RPC 编解码，不在应用层重建调度状态。 */
export class AnkiStudySessionBackend implements StudySessionBackend {
  private scheduler: 调度器服务;
  private renderer: 卡片渲染服务;
  private collection: 集合服务;
  private notes: 笔记服务 = new 笔记服务();
  private cards: 卡片服务 = new 卡片服务();
  private deckConfigs: 牌组配置服务 = new 牌组配置服务();
  private notetypes: 笔记类型服务 = new 笔记类型服务();

  constructor(scheduler: 调度器服务, renderer: 卡片渲染服务, collection: 集合服务) {
    this.scheduler = scheduler;
    this.renderer = renderer;
    this.collection = collection;
  }

  async updateNote(note: EditableNote): Promise<void> { await this.notes.更新笔记([note], false); }
  async buryCard(cardId: number, mode: number): Promise<void> { await this.scheduler.埋藏或暂停卡片(cardId, mode); }
  async removeCard(cardId: number): Promise<void> { await this.cards.删除卡片([cardId]); }
  async unburyDeck(deckId: number): Promise<void> { await this.scheduler.按牌组恢复埋藏(deckId, UNBURY_MODE_ALL); }
  async canUndo(): Promise<boolean> { return (await this.collection.获取撤销状态()).undo.length > 0; }
  queuedCards(deckId: number): Promise<QueuedCardsView> { return this.scheduler.获取队首卡片(deckId); }
  renderCard(cardId: number): Promise<RenderedCard> { return this.renderer.渲染既有卡片(cardId); }
  async choiceQuestion(noteId: number): Promise<JideChoiceQuestion | null> {
    const note = await this.notes.获取笔记(noteId);
    const notetype = await this.notetypes.获取笔记类型(note.notetypeId);
    return jideChoiceQuestionFromNote(note.fields, notetype.fieldNames);
  }
  /** 筛选牌组遵循原牌组配置；每张卡重新读取，避免子牌组或同步后沿用旧设置。 */
  async studyOptions(cardId: number): Promise<StudyOptions> {
    const card: Card = await this.cards.获取卡片(cardId);
    const deckId: number = card.originalDeckId > 0 ? card.originalDeckId : card.deckId;
    const view: DeckConfigsForUpdateView = await this.deckConfigs.获取牌组配置编辑视图(deckId);
    const configId: number | undefined = view.currentDeck?.configId;
    for (const entry of view.allConfigs) {
      if (entry.config.id === configId && entry.config.config !== null) {
        const config = entry.config.config;
        const options: StudyOptions = new StudyOptions();
        options.autoplay = !config.disableAutoplay;
        options.skipQuestionWhenReplayingAnswer = config.skipQuestionWhenReplayingAnswer;
        options.waitForAudio = config.waitForAudio;
        options.showTimer = config.showTimer;
        options.stopTimerOnAnswer = config.stopTimerOnAnswer;
        options.capAnswerTimeToSecs = config.capAnswerTimeToSecs;
        options.secondsToShowQuestion = config.secondsToShowQuestion;
        options.secondsToShowAnswer = config.secondsToShowAnswer;
        options.questionAction = config.questionAction;
        options.answerAction = config.answerAction;
        return options;
      }
    }
    throw new Error('Card deck configuration unavailable');
  }
  describeStates(states: SchedulingStatesRaw): Promise<string[]> { return this.scheduler.描述下一档状态(states); }
  answer(input: CardAnswerInput): Promise<void> { return this.scheduler.提交评分(input); }
  async undo(): Promise<void> { await this.collection.撤销(); }
  congrats(): Promise<CongratsInfo> { return this.scheduler.获取完成页信息(); }
}
