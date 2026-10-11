// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import type { AgentOperationBackend, OperationArguments, OperationSnapshot } from '../../model/agent/AgentOperations';
import { AgentOperationCoordinator, operationDefinition } from '../../model/agent/AgentOperations';
import { agentOperationHosts } from '../../model/agent/AgentOperationHost';
import { CoreAgentOperations, operationSnapshot } from './CoreAgentOperations';
import { 集合服务 } from '../集合服务';
import { 卡片服务 } from '../卡片服务';
import { 媒体服务 } from '../媒体服务';
import type { MediaSnapshotPage } from '../../proto/messages/MediaSnapshotMessages';
import { LocalBackups } from '../LocalBackups';
import { 导出集合, 完成导出 } from '../数据迁移服务';
import { readDeckAppearance, 保存牌组别名, 保存牌组色调, 清除牌组背景图 } from '../../model/牌组元数据存储';
import type { DeckAppearance } from '../../model/牌组元数据存储';
import { readHiddenDeckIds, 隐藏牌组, 取消隐藏牌组 } from '../../model/隐藏牌组存储';
import { 解析牌组色调 } from '../../model/主页模型';
import { 加载学习提醒设置, 保存学习提醒设置, 生成提醒项ID } from '../../model/学习提醒存储';
import type { 提醒项, 学习提醒设置 } from '../../model/学习提醒存储';
import { 刷新学习提醒 } from '../../model/学习提醒服务';
import { loadCustomSyncServer, loadVisibleSyncAuth, 加载媒体待同步, loadAutoSyncEnabled, saveCustomSyncServer, clearSyncCredentialsVerified } from '../../model/同步凭证存储';
import { loadBrowserIgnoreAccents, saveBrowserIgnoreAccents } from '../BrowserPreferencesStore';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';
import { syncActivity } from '../../model/SyncSettings';
import { normalizeSyncServer } from '../../model/SyncSettings';

interface StudyOperationCard { cardId: number; noteId: number; deckId: number; }
interface DeckAppearanceBaseline { appearance: DeckAppearance; hiddenIds: string[]; }
interface StudyOperationState {
  available: boolean; blocked: boolean; phase: string; audio: boolean;
  card: StudyOperationCard | null;
}

interface AppOperationResult {
  completed?: boolean; reminders?: 学习提醒设置; created?: boolean; names?: string[]; ignoreAccents?: boolean;
  unused?: number; missing?: number; haveTrash?: boolean; reportPaging?: string; tagged?: number;
}
/** @throws {Error} 缺少平台上下文时拒绝操作。 */
function context(): common.UIAbilityContext {
  const value = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (value === undefined) throw new Error('ability_context_unavailable'); return value;
}
function isWorkflow(name: string, args: OperationArguments): boolean {
  return name === 'propose_import_data' || name === 'propose_sync' || (name === 'propose_sync_account' && args.operation === 'login') ||
    (name === 'propose_deck_appearance' && args.operation === 'background' && args.value === 'pick') || name === 'propose_study_command';
}
function workflowDomain(name: string): string { return name === 'propose_study_command' ? 'study' : 'home'; }
/** @throws {Error} 必填字段和目标 ID 必须完整有效。 */
function reminderItems(items: 提醒项[], args: OperationArguments, newId: number): 提醒项[] {
  const out: 提醒项[] = JSON.parse(JSON.stringify(items)) as 提醒项[];
  const index = out.findIndex((item): boolean => item.唯一ID === args.reminderId);
  if (args.operation !== 'create' && index < 0) throw new Error('reminder_missing');
  if (args.operation === 'delete') { out.splice(index, 1); return out; }
  if (args.operation === 'enable') {
    if (args.enabled === undefined) throw new Error('reminder_enabled_required'); out[index].开启 = args.enabled; return out;
  }
  if (args.hour === undefined || args.minute === undefined || args.title === undefined || args.content === undefined || args.enabled === undefined ||
    (args.operation === 'create' && args.reminderId !== undefined)) throw new Error('reminder_complete_fields_required');
  const item: 提醒项 = { 唯一ID: args.operation === 'create' ? newId : args.reminderId!, 小时: args.hour,
    分钟: args.minute, 标题: args.title, 内容: args.content, 开启: args.enabled };
  if (args.operation === 'create') out.push(item); else out[index] = item;
  return out;
}
/** 平台边界只持有领域服务与显式 UI 宿主，模型不能提供文件路径、凭证或存储键。 */
export class AppAgentOperations implements AgentOperationBackend {
  private core: CoreAgentOperations = new CoreAgentOperations();
  private media: 媒体服务 = new 媒体服务();
  private checked: MediaSnapshotPage | null = null;
  private checkedBaseline: string = '';
  /** @throws {Error} 媒体或集合读取失败不能作为空快照。 */
  private async inventory(): Promise<string> {
    const root = context().filesDir + '/collection.media'; const files: string[] = [];
    const visit = (path: string, prefix: string): void => {
      if (!fs.accessSync(path)) return;
      for (const name of fs.listFileSync(path).sort()) {
        const stat = fs.statSync(path + '/' + name);
        if (stat.isDirectory()) visit(path + '/' + name, prefix + name + '/');
        else files.push(prefix + name + ':' + stat.size + ':' + stat.mtime);
      }
    };
    visit(root, ''); return JSON.stringify([await new 集合服务().获取撤销状态(), files]);
  }
  /** @throws {Error} 维护只使用当前有效的已检查报告。 */
  private async checkedMedia(): Promise<MediaSnapshotPage> {
    if (this.checked === null || this.checkedBaseline !== await this.inventory()) throw new Error('run_confirmed_media_check_first');
    return this.checked;
  }
  /** @throws {Error} 无法读取端点时拒绝继续。 */
  private syncState(): string {
    return JSON.stringify({ loggedIn: loadVisibleSyncAuth() !== null, server: loadCustomSyncServer(),
      busy: syncActivity.isCollectionBusy(), mediaPending: 加载媒体待同步(), autoSync: loadAutoSyncEnabled() });
  }
  /** @throws {Error} 领域读取失败由工具调用方报告。 */
  async read(name: string, args: OperationArguments): Promise<string> {
    switch (name) {
      case 'get_sync_status': return this.syncState();
      case 'get_study_state': {
        try { return agentOperationHosts.read('study'); } catch (error) { return JSON.stringify({ available: false }); }
      }
      case 'get_deck_appearance': return JSON.stringify({ deckId: args.deckId, appearance: await readDeckAppearance(String(args.deckId)), hidden: (await readHiddenDeckIds()).includes(String(args.deckId)) });
      case 'get_reminders': return JSON.stringify(await 加载学习提醒设置());
      case 'get_backups': return JSON.stringify({ names: await new LocalBackups(context().filesDir).list(), includesMedia: false });
      case 'get_media_report': {
        const report = await this.checkedMedia();
        const page = args.scope === 'unused' ? await this.media.unusedPage(report.token, args.offset!) :
          args.scope === 'missing_notes' ? await this.media.missingNotesPage(report.token, args.offset!) : await this.media.reportPage(report.token, args.offset!);
        return JSON.stringify(page);
      }
      case 'get_saved_searches': return JSON.stringify({ savedSearches: JSON.parse(await this.core.read(name,args)) as Object, ignoreAccents: await loadBrowserIgnoreAccents() });
      default: return this.core.read(name,args);
    }
  }
  /** @throws {Error} 提案准备失败不得生成确认许可。 */
  async snapshot(name: string, args: OperationArguments): Promise<OperationSnapshot> {
    let baseline: Object; let notes: number[] = []; let cards: number[] = [];
    if (isWorkflow(name,args)) {
      baseline = agentOperationHosts.read(workflowDomain(name));
      if (name === 'propose_study_command') {
        const state = JSON.parse(baseline as string) as StudyOperationState;
        if (!state.available || state.blocked || state.card === null ||
          (args.operation === 'flip' && state.phase !== 'question') ||
          (args.operation === 'replay' && !state.audio) ||
          (!['flip','replay'].includes(args.operation!) && state.phase !== 'answer')) throw new Error('study_command_unavailable');
        cards = [state.card.cardId]; notes = [state.card.noteId];
      }
    } else if (name === 'propose_deck_appearance') {
      if (args.operation === 'hidden' && !['true','false'].includes(args.value!) || args.operation === 'tone' && 解析牌组色调(args.value!) === null ||
        args.operation === 'background' && args.value !== 'clear') throw new Error('invalid_deck_appearance');
      baseline = { appearance: await readDeckAppearance(String(args.deckId)), hiddenIds: await readHiddenDeckIds() } as DeckAppearanceBaseline;
    } else if (name === 'propose_reminder') {
      const settings = await 加载学习提醒设置(); reminderItems(settings.提醒项列表,args,Number.MAX_SAFE_INTEGER); baseline = settings;
    } else if (name === 'propose_create_backup' || name === 'propose_restore_backup') {
      const backups = await new LocalBackups(context().filesDir).list();
      if (name === 'propose_restore_backup' && !backups.includes(args.name!)) throw new Error('backup_missing');
      baseline = [backups, await new 集合服务().获取撤销状态()];
    } else if (name === 'propose_export_collection') baseline = await new 集合服务().获取撤销状态();
    else if (name === 'propose_sync_account') {
      if (args.operation === 'server') {
        if (args.value === undefined) throw new Error('sync_server_value_required');
        normalizeSyncServer(args.value);
      }
      if (syncActivity.isCollectionBusy()) throw new Error('sync_busy'); baseline = this.syncState();
    } else if (name === 'propose_set_ignore_accents') baseline = await loadBrowserIgnoreAccents();
    else if (name === 'propose_check_media') baseline = await this.inventory();
    else if (name === 'propose_media_maintenance') {
      baseline = await this.inventory();
      if (args.operation === 'tag_missing' || args.operation === 'trash_unused') {
        const report = await this.checkedMedia(); baseline = [baseline, report];
        if (args.operation === 'tag_missing') {
          let offset = 0;
          do { const page = await this.media.missingNotesPage(report.token,offset); notes.push(...(page.noteIds ?? [])); offset = page.nextOffset; } while (offset !== 0);
        }
      }
    } else return this.core.snapshot(name,args);
    const snapshot = operationSnapshot(name,args,baseline,cards,notes,args.deckId === undefined ? [] : [args.deckId]);
    if (name === 'propose_study_command') {
      const state = JSON.parse(baseline as string) as StudyOperationState;
      snapshot.deckIds = [state.card!.deckId];
      snapshot.preview[0].before = JSON.stringify({ cardId: state.card!.cardId, noteId: state.card!.noteId, phase: state.phase });
    }
    if (name === 'propose_deck_appearance') snapshot.preview[0].before = JSON.stringify(await readDeckAppearance(String(args.deckId)),null,2);
    if (name === 'propose_reminder') snapshot.preview[0].before = JSON.stringify(baseline,null,2);
    if (name === 'propose_media_maintenance' && this.checked !== null) snapshot.preview[0].before = JSON.stringify({ unused: this.checked.unusedCount, missing: this.checked.missingCount, haveTrash: this.checked.haveTrash });
    return snapshot;
  }
  /** @throws {Error} 真实执行失败上抛，确认消费后禁止自动重放。 */
  async execute(name: string, args: OperationArguments, snapshot: OperationSnapshot): Promise<string> {
    // 原宿主独自持有同步/迁移/学习租约；外层不抢集合以免嵌套死锁。
    if (isWorkflow(name,args)) return agentOperationHosts.execute(workflowDomain(name),name,args,JSON.parse(snapshot.baseline) as string);
    const owner: Object = new Object(); autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      if (JSON.stringify(await this.snapshot(name,args)) !== JSON.stringify(snapshot)) throw new Error('operation_changed_since_proposal');
      let result: AppOperationResult = { completed: true };
      switch (name) {
        case 'propose_deck_appearance': {
          const id = String(args.deckId);
          const before = JSON.parse(snapshot.baseline) as DeckAppearanceBaseline;
          if (args.operation === 'hidden') { if (args.value === 'true') await 隐藏牌组(id,JSON.stringify(before.hiddenIds)); else await 取消隐藏牌组(id,JSON.stringify(before.hiddenIds)); }
          else if (args.operation === 'alias') await 保存牌组别名(id,args.value!,before.appearance.alias);
          else if (args.operation === 'tone') { const tone = 解析牌组色调(args.value!); if (tone === null) throw new Error('invalid_deck_tone'); await 保存牌组色调(id,tone,before.appearance.tone); }
          else await 清除牌组背景图(id,before.appearance.background);
          result = JSON.parse(await this.read('get_deck_appearance',args)) as AppOperationResult; break;
        }
        case 'propose_reminder': {
          const before = await 加载学习提醒设置();
          const items = reminderItems(before.提醒项列表,args,args.operation === 'create' ? 生成提醒项ID() : 0);
          await 保存学习提醒设置(items,JSON.stringify(before.提醒项列表));
          try { await 刷新学习提醒(); }
          catch (error) { return JSON.stringify({ status: 'partial', saved: true, published: false, error: error instanceof Error ? error.message : 'notification_publish_failed' }); }
          result = { reminders: await 加载学习提醒设置() }; break;
        }
        case 'propose_create_backup': result = { created: await new LocalBackups(context().filesDir).create(true), names: await new LocalBackups(context().filesDir).list() }; break;
        case 'propose_restore_backup': await new LocalBackups(context().filesDir).restore(args.name!); break;
        case 'propose_export_collection': {
          const path = await 导出集合(context().filesDir,{ includeMedia: args.withMedia!, legacy: args.legacy! });
          const saved = await 完成导出(context(),path,'Jidecards.colpkg','.colpkg');
          return JSON.stringify({ status: saved === null ? 'cancelled' : 'completed', saved: saved !== null });
        }
        case 'propose_sync_account': {
          if (args.operation === 'logout') await clearSyncCredentialsVerified();
          else await saveCustomSyncServer(args.value ?? ''); result = JSON.parse(this.syncState()) as AppOperationResult; break;
        }
        case 'propose_set_ignore_accents': await saveBrowserIgnoreAccents(args.enabled!); result = { ignoreAccents: await loadBrowserIgnoreAccents() }; break;
        case 'propose_check_media': {
          if (this.checked !== null) await this.media.releaseSnapshot(this.checked.token);
          this.checked = null; this.checked = await this.media.createSnapshot(); this.checkedBaseline = await this.inventory();
          result = { unused: this.checked.unusedCount, missing: this.checked.missingCount, haveTrash: this.checked.haveTrash, reportPaging: 'get_media_report' }; break;
        }
        case 'propose_media_maintenance': {
          if (args.operation === 'empty_trash') await this.media.清空回收站();
          else if (args.operation === 'restore_trash') await this.media.恢复回收站();
          else { const report = await this.checkedMedia();
            if (args.operation === 'trash_unused') await this.media.trashSnapshot(report.token);
            else result = { tagged: await this.media.tagMissingNotes(report.token) };
          }
          if (this.checked !== null) { await this.media.releaseSnapshot(this.checked.token); this.checked = null; }
          break;
        }
        default: return await this.core.execute(name,args,snapshot);
      }
      return JSON.stringify({ status: 'completed', result: result });
    } finally {
      AppStorage.setOrCreate<number>('需要刷新主页',Date.now());
      AppStorage.setOrCreate<number>('cardContentChangedTick',Date.now());
      autoSyncScheduler.request(); autoSyncScheduler.endOperation(owner);
    }
  }
}
export const agentOperationCoordinator: AgentOperationCoordinator = new AgentOperationCoordinator(new AppAgentOperations());
