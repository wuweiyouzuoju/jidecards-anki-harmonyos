// SPDX-License-Identifier: AGPL-3.0-or-later

import { 牌组服务 } from '../牌组服务';
import { DeckHierarchyCommands } from '../DeckHierarchyCommands';
import type { DeckReparentPlan } from '../../model/DeckReparent';
import type { DeckRenamePlan } from '../../model/DeckRename';
import type { DeckReorderPlan } from '../../model/DeckReorder';
import { 笔记类型服务 } from '../笔记类型服务';
import { 标准笔记类型种类 } from '../../proto/messages/NotetypeMessages';
import { AgentScope } from './AgentScope';
import { AgentWorkspaceStore } from './AgentWorkspaceStore';
import { assertNewNotetypeName, deckNameExists } from './AgentAuxiliaryTools';
import type { AnalysisActionPayload } from './AgentAuxiliaryTools';
import { AgentActionLedger } from '../../model/agent/AgentAction';
import { decodeSettingChange } from '../../model/agent/AgentSettingsTools';
import type { AgentSettingChange } from '../../model/agent/AgentSettingsTools';
import type { ThemeId } from '../../model/ThemeCatalog';
import { appThemeColorSession } from '../AppThemeService';
import { 设置FSRS开启状态 } from '../../model/FSRS控制器';
import { saveCardTextSize } from '../../utils/CardTextSizeStore';
import { saveDeckListStyle } from '../../utils/DeckListAppearanceStore';
import { saveStudyHaptics } from '../../utils/StudyHaptics';
import { LocalPreferenceWriteError } from '../../utils/LocalPreferenceWrite';
import type { AgentAction } from '../../model/agent/AgentAction';
import type { AgentExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentMemoryChange } from '../../model/agent/AgentMemory';
import { buildAgentNotetypeJson } from '../../model/agent/AgentNotetypeDesign';
import { collectionPreferenceEdits } from '../../model/agent/AgentMaintenanceTools';
import type { CollectionPreferencesAction, StudyControlsAction, ExportSubsetAction } from '../../model/agent/AgentMaintenanceActions';
import { reviewPreferences } from '../ReviewPreferencesService';
import { saveStudyControls } from '../StudyControlsService';
import { exportSubset, 完成导出 } from '../数据迁移服务';
import { 卡片服务 } from '../卡片服务';
import { 笔记服务 } from '../笔记服务';
import { readAgentExportSnapshot } from './AgentExportSnapshot';
import type { common } from '@kit.AbilityKit';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';
import { syncActivity } from '../../model/SyncSettings';
import { FsrsService, fsrsContextSnapshot } from '../FsrsService';
import type { FsrsSimulationAction } from '../../model/agent/AgentFsrsTools';
import type { AgentDeckOptionsAction } from '../../model/agent/AgentDeckOptionsTools';
import { executeAgentDeckOptionsAction } from './AgentDeckOptionsTools';

/** 会话拥有的辅助动作执行器；只消费已登记且内容未变的确认，提交时重新检查名称冲突。 */
export class AgentActionExecutor {
  private readonly scope: AgentScope;
  private readonly store: AgentWorkspaceStore;
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly ledger: AgentActionLedger = new AgentActionLedger();

  constructor(scope: AgentScope, store: AgentWorkspaceStore) { this.scope = scope; this.store = store; }

  registerPending(action: AgentAction): void { this.ledger.register(action); }

  async executeConfirmed(action: AgentAction): Promise<string> {
    this.ledger.consume(action);
    try {
      const target: number[] = this.scope.currentCreateTarget();
      let result: string = '{"status":"completed"}';
      if (action.kind === 'deck_options_change') {
        result = await executeAgentDeckOptionsAction(this.scope, JSON.parse(action.payloadJson) as AgentDeckOptionsAction);
      } else if (action.kind === 'fsrs_simulation') {
        result = await this.simulateFsrsConfirmed(JSON.parse(action.payloadJson) as FsrsSimulationAction);
      } else if (action.kind === 'collection_preferences') {
        const payload: CollectionPreferencesAction = JSON.parse(action.payloadJson) as CollectionPreferencesAction;
        const current = await reviewPreferences.save(collectionPreferenceEdits(payload.changesJson), payload.before);
        result = JSON.stringify({ status: 'completed', scope: 'collection', preferences: current, rescheduled: false });
      } else if (action.kind === 'study_controls') {
        const payload: StudyControlsAction = JSON.parse(action.payloadJson) as StudyControlsAction;
        result = JSON.stringify({ status: 'completed', scope: 'device', controls: await saveStudyControls(payload.after, payload.before) });
      } else if (action.kind === 'export_subset') {
        result = await this.exportConfirmed(JSON.parse(action.payloadJson) as ExportSubsetAction);
        if (result.includes('"status":"cancelled"')) { action.resultJson = result; action.status = 'cancelled'; return result; }
      } else if (action.kind === 'setting_change') {
        const change: AgentSettingChange = decodeSettingChange(action.payloadJson);
        if (change.settingId === 'color_theme') {
          const outcome = await appThemeColorSession.setColor(change.after as ThemeId, change.before as ThemeId);
          result = JSON.stringify(outcome);
          if (outcome.status !== 'completed') {
            action.resultJson = result; action.status = 'failed'; return result;
          }
        } else if (change.settingId === 'fsrs_enabled') {
          const enabled: boolean = await 设置FSRS开启状态(change.after === 'true', change.before === 'true');
          result = JSON.stringify({ status: 'completed', fsrsEnabled: enabled, scope: 'collection',
            saved: true, rescheduled: enabled && change.before !== change.after });
        } else {
          if (change.settingId === 'card_text_size') {
            await saveCardTextSize(Number(change.after), Number(change.before));
          } else if (change.settingId === 'deck_list_style') {
            await saveDeckListStyle(change.after, change.before);
          } else if (change.settingId === 'study_haptics') {
            await saveStudyHaptics(change.after === 'true', change.before === 'true');
          } else { throw new Error('unsupported_setting_write'); }
          result = JSON.stringify({ status: 'completed', settingId: change.settingId,
            value: change.after, scope: 'device', saved: true, applied: true });
        }
      } else if (action.kind === 'memory_change') {
        await this.store.changeMemory(JSON.parse(action.payloadJson) as AgentMemoryChange, action.id);
      } else if (action.kind === 'analysis') {
        const payload: AnalysisActionPayload = JSON.parse(action.payloadJson) as AnalysisActionPayload;
        const ids: number[] = payload.noteIds ?? payload.requestedNoteIds ?? [];
        this.scope.retrieval.approveAnalysis(ids);
        this.scope.retrieval.approveAnalysis(payload.requestedNoteIds ?? []);
        result = '{"status":"approved","instruction":"Continue the original analysis in pages. Report actual coverage."}';
      } else if (action.kind === 'reorder_decks') {
        const plan: DeckReorderPlan = JSON.parse(action.payloadJson) as DeckReorderPlan;
        this.scope.assertReadableDeckIds(plan.after.map((entry): number => entry.id));
        if (plan.parentId !== 0) this.scope.assertReadableDeckIds([plan.parentId]);
        await new DeckHierarchyCommands().executeReorder(plan);
        result = JSON.stringify({ status: 'completed', scope: 'device', synced: false,
          parentId: plan.parentId, order: plan.after });
      } else if (action.kind === 'rename_deck') {
        const plan: DeckRenamePlan = JSON.parse(action.payloadJson) as DeckRenamePlan;
        this.scope.assertReadableDeckIds([plan.deckId]);
        await new DeckHierarchyCommands().executeRename(plan);
        result = JSON.stringify({ status: 'completed', deckId: plan.deckId, affectedDecks: plan.changes.length, changes: plan.changes });
      } else if (action.kind === 'reparent_decks') {
        const plan: DeckReparentPlan = JSON.parse(action.payloadJson) as DeckReparentPlan;
        this.scope.assertReadableDeckIds(plan.deckIds);
        if (plan.parentId !== 0) this.scope.assertReadableDeckIds([plan.parentId]);
        const count: number = await new DeckHierarchyCommands().execute(plan);
        result = JSON.stringify({ status: 'completed', movedDecks: count, affectedDecks: plan.changes.length,
          parentId: plan.parentId, changes: plan.changes });
      } else if (action.kind === 'create_deck' || action.kind === 'create_notetype') {
        const args: AgentExtensionArguments = JSON.parse(action.payloadJson) as AgentExtensionArguments;
        if (action.kind === 'create_deck') {
          if (deckNameExists(await this.decks.获取牌组树(), args.name)) { throw new Error('deck_name_exists'); }
          const id: number = await this.decks.创建牌组(args.name);
          this.scope.registerReadableDeckIds([id]); this.scope.configureCreateTarget(id, target[1]);
          result = JSON.stringify({ status: 'completed', deckId: id, name: args.name });
        } else {
          await assertNewNotetypeName(this.notetypes, args.name);
          const stock: string = await this.notetypes.获取标准笔记类型JSON(
            args.kind === 'cloze' ? 标准笔记类型种类.CLOZE : 标准笔记类型种类.BASIC);
          const id: number = await this.notetypes.添加笔记类型旧版(buildAgentNotetypeJson(stock, args));
          if (id <= 0) { throw new Error('notetype_creation_failed'); }
          this.scope.registerReadableNotetypeIds([id]); this.scope.configureCreateTarget(target[0], id);
          result = JSON.stringify({ status: 'completed', notetypeId: id, name: args.name });
        }
      } else {
        throw new Error('unsupported_action');
      }
      action.resultJson = result; action.status = 'completed';
      return result;
    } catch (error) {
      action.status = 'failed';
      if (error instanceof LocalPreferenceWriteError) {
        action.resultJson = JSON.stringify({ status: 'partial', saved: error.saved, applied: false,
          error: error.message, instruction: action.kind === 'study_controls' ?
            'Read get_advanced_settings(study) before proposing another change; storage rollback is unverified.' :
            'Read get_settings before proposing another change; storage rollback is unverified.' });
        return action.resultJson;
      }
      action.resultJson = JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : 'action_failed' });
      if (error instanceof Error) { throw error; }
      throw new Error('action_failed');
    }
  }

  /** @throws {Error} 目标变化、导出或文件保存失败交给同一提案结果，不能自动重试。 */
  private async simulateFsrsConfirmed(payload: FsrsSimulationAction): Promise<string> {
    this.scope.assertReadableDeckIds([payload.deckId]);
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      const fsrs: FsrsService = new FsrsService();
      const context = await fsrs.deckContext(payload.deckId);
      if (fsrsContextSnapshot(context) !== payload.snapshot) throw new Error('fsrs_config_changed_since_proposal');
      const result = await fsrs.daily(payload.input);
      autoSyncScheduler.request();
      return JSON.stringify({ status: 'completed', deckId: payload.deckId, presetId: context.config.id,
        input: payload.input, memoryStateCacheMayHaveChanged: true, rescheduled: false, result: result });
    } finally { autoSyncScheduler.endOperation(owner); }
  }

  /** @throws {Error} 目标变化、导出或文件保存失败交给同一提案结果，不能自动重试。 */
  private async exportConfirmed(payload: ExportSubsetAction): Promise<string> {
    if (payload.mode === 'notes') this.scope.assertReadableNoteIds(payload.ids); else this.scope.assertReadableCardIds(payload.ids);
    const owner: Object = new Object();
    autoSyncScheduler.beginOperation(owner);
    let path: string;
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    try {
      await syncActivity.waitForCollection();
      if (context === undefined) throw new Error('ability_context_unavailable');
      const notes: 笔记服务 = new 笔记服务(); const cards: 卡片服务 = new 卡片服务();
      for (let index: number = 0; index < payload.ids.length; index++) {
        const current: string = await readAgentExportSnapshot(payload.ids[index], payload.mode, notes, cards);
        if (current !== payload.snapshots[index]) throw new Error('export_subset_changed_since_proposal');
      }
      path = await exportSubset(context.filesDir, { mode: payload.mode, ids: payload.ids }, payload.format,
        payload.withMedia, payload.withScheduling);
    } finally { autoSyncScheduler.endOperation(owner); }
    // Core 导出已经结束，系统保存选择不占用集合；原流程负责取消和临时文件清理。
    const extension: string = payload.format === 'apkg' ? '.apkg' : '.txt';
    const uri: string | null = await 完成导出(context!, path!, 'jidecards-subset' + extension, extension);
    return JSON.stringify({ status: uri === null ? 'cancelled' : 'completed', saved: uri !== null,
      exportedItems: payload.ids.length, mode: payload.mode, format: payload.format });
  }
}
