// SPDX-License-Identifier: AGPL-3.0-or-later
import { AutoSyncScheduler, autoSyncScheduler } from '../AutoSyncScheduler';
import { SyncActivity, syncActivity } from '../SyncSettings';

export interface AgentBatchCard {
  fields: string[];
  已选中: boolean;
  状态: string;
}

export interface AgentBatchItem {
  index: number;
  fields: string[];
}

export interface AgentBatchResult { succeeded: number; failed: number; }

/** 点击保存即固定整批输入。执行器仍负责草稿验证和确认，页面离开不撤回已接受写入。 */
export class AgentCardBatch {
  private running: boolean = false;
  private scheduler: AutoSyncScheduler;
  private activity: SyncActivity;

  constructor(scheduler: AutoSyncScheduler = autoSyncScheduler, activity: SyncActivity = syncActivity) {
    this.scheduler = scheduler;
    this.activity = activity;
  }

  isRunning(): boolean { return this.running; }

  async run(cards: AgentBatchCard[], deckId: number, notetypeId: number,
    save: (fields: string[], deckId: number, notetypeId: number) => Promise<string>,
    failedMessage: string, progress: (index: number, failure: string) => void): Promise<AgentBatchResult> {
    if (this.running) throw new Error('Card batch already running');
    if (deckId <= 0 || notetypeId <= 0) throw new Error('Card batch target missing');
    const items: AgentBatchItem[] = [];
    for (let index: number = 0; index < cards.length; index++) {
      const card: AgentBatchCard = cards[index];
      if (card.已选中 && card.状态 !== 'saved') items.push({ index: index, fields: card.fields.slice() });
    }
    const result: AgentBatchResult = { succeeded: 0, failed: 0 };
    if (items.length === 0) return result;
    this.running = true;
    this.scheduler.beginOperation(this);
    try {
      await this.activity.waitForCollection();
      for (const item of items) {
        let failure: string = '';
        try { failure = await save(item.fields, deckId, notetypeId); }
        catch (error) { failure = failedMessage; }
        if (failure.length === 0) result.succeeded++;
        else result.failed++;
        progress(item.index, failure);
      }
      return result;
    } finally {
      if (result.succeeded > 0) this.scheduler.request();
      this.running = false;
      this.scheduler.endOperation(this);
    }
  }
}
