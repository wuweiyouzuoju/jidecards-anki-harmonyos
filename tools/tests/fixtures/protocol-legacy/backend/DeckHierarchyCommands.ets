// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组服务 } from './牌组服务';
import { assertDeckReparentUnchanged, planDeckReparent } from '../model/DeckReparent';
import type { DeckReparentPlan } from '../model/DeckReparent';
import { assertDeckRenameUnchanged, planDeckRename } from '../model/DeckRename';
import type { DeckRenamePlan } from '../model/DeckRename';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { syncActivity } from '../model/SyncSettings';
import { 加载牌组顺序, 保存牌组顺序 } from '../model/牌组顺序存储';
import { deckOrderSnapshot, planDeckReorder, assertDeckOrderUnchanged, deckDropParent, planDeckDrop } from '../model/DeckReorder';
import type { DeckOrderSnapshot, DeckReorderPlan, DeckDropTarget, DeckOrderEntry } from '../model/DeckReorder';

// 首页和 JIDE 的所有层级/顺序写入共用队列；失败不阻断下一项。
let arrangementQueue: Promise<void> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result: Promise<T> = arrangementQueue.then(operation, operation);
  arrangementQueue = result.then((): void => {}, (): void => {});
  return result;
}
function storageParent(parentId: number): string { return parentId === 0 ? '' : String(parentId); }

/** 手动与 JIDE 共用 Core/本机顺序写入；平台存储留在 ArkTS 适配层。 */
export class DeckHierarchyCommands {
  private readonly decks: 牌组服务 = new 牌组服务();

  async prepareRename(deckId: number, name: string): Promise<DeckRenamePlan> {
    return planDeckRename(await this.decks.获取牌组树(), deckId, name);
  }

  /** 名称与移动共用队列；提交一条 Core 事务，子牌组更新与撤销均由 Core 完成。 */
  async executeRename(plan: DeckRenamePlan): Promise<void> {
    const accepted: DeckRenamePlan = JSON.parse(JSON.stringify(plan)) as DeckRenamePlan;
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    return serialized(async (): Promise<void> => { try {
      if (syncActivity.isCollectionBusy()) throw new Error('deck_move_sync_busy');
      assertDeckRenameUnchanged(await this.decks.获取牌组树(), accepted);
      const source = accepted.changes.find((change): boolean => change.id === accepted.deckId);
      if (source === undefined) throw new Error('deck_rename_missing');
      await this.decks.重命名牌组(accepted.deckId, source.after);
      autoSyncScheduler.request();
    } finally { autoSyncScheduler.endOperation(owner); } });
  }

  async prepare(deckIds: number[], parentId: number): Promise<DeckReparentPlan> {
    return planDeckReparent(await this.decks.获取牌组树(), deckIds, parentId);
  }

  async execute(plan: DeckReparentPlan): Promise<number> {
    const accepted: DeckReparentPlan = JSON.parse(JSON.stringify(plan)) as DeckReparentPlan;
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    return serialized(async (): Promise<number> => { try {
      if (syncActivity.isCollectionBusy()) throw new Error('deck_move_sync_busy');
      assertDeckReparentUnchanged(await this.decks.获取牌组树(), accepted);
      const count: number = await this.decks.调整牌组父级(accepted.deckIds, accepted.parentId);
      autoSyncScheduler.request();
      return count;
    } finally {
      autoSyncScheduler.endOperation(owner);
    } });
  }

  async readOrder(parentId: number): Promise<DeckOrderSnapshot> {
    await arrangementQueue;
    return deckOrderSnapshot(await this.decks.获取牌组树(), parentId,
      await 加载牌组顺序(storageParent(parentId), true));
  }

  async prepareReorder(parentId: number, ids: number[]): Promise<DeckReorderPlan> {
    return planDeckReorder(await this.readOrder(parentId), ids);
  }

  async executeReorder(plan: DeckReorderPlan): Promise<void> {
    const accepted: DeckReorderPlan = JSON.parse(JSON.stringify(plan)) as DeckReorderPlan;
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    return serialized(async (): Promise<void> => { try {
      if (syncActivity.isCollectionBusy()) throw new Error('deck_move_sync_busy');
      const snapshot: DeckOrderSnapshot = deckOrderSnapshot(await this.decks.获取牌组树(), accepted.parentId,
        await 加载牌组顺序(storageParent(accepted.parentId), true));
      assertDeckOrderUnchanged(snapshot, accepted);
      planDeckReorder(snapshot, accepted.after.map((entry: DeckOrderEntry): number => entry.id));
      await 保存牌组顺序(storageParent(accepted.parentId), accepted.after.map((entry: DeckOrderEntry): string => String(entry.id)));
    } finally { autoSyncScheduler.endOperation(owner); } });
  }

  /** 松手冻结同级 ID 和落点；仅保存本机顺序，不能从排序路径修改层级。 */
  async executeDrop(drop: DeckDropTarget): Promise<void> {
    const accepted: DeckDropTarget = JSON.parse(JSON.stringify(drop)) as DeckDropTarget;
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    return serialized(async (): Promise<void> => { try {
      if (syncActivity.isCollectionBusy()) throw new Error('deck_move_sync_busy');
      const root = await this.decks.获取牌组树();
      const parentId: number = deckDropParent(root, accepted);
      const plan = planDeckDrop(root, accepted, await 加载牌组顺序(storageParent(parentId), true));
      assertDeckOrderUnchanged(deckOrderSnapshot(await this.decks.获取牌组树(), parentId,
        await 加载牌组顺序(storageParent(parentId), true)), plan);
      await 保存牌组顺序(storageParent(parentId), plan.after.map((entry: DeckOrderEntry): string => String(entry.id)));
    } finally { autoSyncScheduler.endOperation(owner); } });
  }
}
