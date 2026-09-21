// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentHistoryList } from '../components/agent/AgentHistoryList';
import { createAgentMessage, cloneAgentCard, cloneAgentTrace, cloneAgentMessage, projectAgentHistory, restoreAgentMessages } from '../model/agent/AgentConversationView';
import type { 卡片草稿, 聊天消息 } from '../model/agent/AgentConversationView';
import { AgentEditableCard } from '../components/agent/AgentEditableCard';
import { AgentCardBatch } from '../model/agent/AgentCardBatch';
import type { AgentBatchResult } from '../model/agent/AgentCardBatch';
import { buildProviderDraftContext, limitProviderInput } from '../model/agent/AgentProviderContext';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

// AI 制卡/改卡共享页：带结构化工具、可编辑草稿与显式确认的轻量 Agent。
// 由 首页.ets 通过 Navigation pathStack 以 NavDestination 形式入栈（与 添加笔记页 同机制）。
// 顶部：返回与历史；目标牌组和笔记类型位于本地对话设置卡。
// 中间：聊天消息流。AI 返回的卡片以草稿形式内嵌在 AI 消息里，可勾选、可编辑字段、批量保存。
// 底部：材料输入框 + 发送按钮。
// 所有写入都经 AgentDraftExecutor，最终仍只调用现有 Anki ArkTS Service。
// 不支持 Image Occlusion（走独立 RPC，本页直接从笔记类型候选中过滤）。

import { common } from '@kit.AbilityKit';
import { AgentSessionController } from '../backend/agent/AgentSessionController';
import { AgentWorkspaceStore } from '../backend/agent/AgentWorkspaceStore';
import { AgentCheckpointStore } from '../backend/agent/AgentCheckpointStore';
import { AgentAuxiliaryTools } from '../backend/agent/AgentAuxiliaryTools';
import { AgentActionCard } from '../components/agent/AgentActionCard';
import type { AgentAction } from '../model/agent/AgentAction';
import type { AgentWorkspaceState, AgentDeckPreference } from '../model/agent/AgentMemory';
import { 牌组服务 } from '../backend/牌组服务';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { buildAgentSessionInstructions } from '../model/agent/AgentSessionContext';
import { parseAgentBoldRuns } from '../model/agent/AgentTextFormatting';
import type { AgentTimelineBlock, AgentContentPart } from '../model/agent/AgentTimeline';
import { appendAgentTimelineText, appendAgentTimelineReference,
  cloneAgentTimeline, agentDraftProgressText, agentContentParts, agentDraftOperationImages } from '../model/agent/AgentTimeline';
import type { AgentTextRun } from '../model/agent/AgentTextFormatting';
import { canAnswerClarification } from '../model/agent/AgentClarification';
import { KeyboardAvoidMode } from '@kit.ArkUI';
import { 后端会话 } from '../backend/后端会话';
import { 笔记服务, 笔记字段校验错误 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { 卡片服务 } from '../backend/卡片服务';
import type { AgentEvent, AgentMode, AgentToolTrace, AgentToolTraceStatus, ChangeDraft, DraftOperation, ProviderId, SearchSource } from '../model/agent/AgentTypes';
import type { ProviderFunctionTool, ProviderInputItem, ProviderTurnRequest } from '../model/agent/ProviderProtocol';
import { agentFunctionTools } from '../model/agent/AgentToolCatalog';
import {
  explicitSourceEvidenceRequested,
  explicitWebSearchRequested
} from '../model/agent/AgentPolicy';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER } from '../model/agent/ProviderCatalog';
import { AgentRunner, AgentRunObserver, AgentRunResult } from '../backend/agent/AgentRunner';
import { AgentTransportError } from '../backend/agent/AgentTransport';
import { AgentScope } from '../backend/agent/AgentScope';
import { AgentToolRegistry } from '../backend/agent/AgentToolRegistry';
import { CardAgentTools } from '../backend/agent/CardAgentTools';
import { HighRiskAgentTools } from '../backend/agent/HighRiskAgentTools';
import {
  AgentDraftExecutionResult,
  AgentDraftExecutor,
  PreparedAgentDraft
} from '../backend/agent/AgentDraftExecutor';
import type { AgentConfirmationToken } from '../model/agent/AgentConfirmation';
import { buildFailedOperationsRetryDraft } from '../model/agent/AgentDraftRetry';
import type {
  AgentClarificationAnswer,
  AgentClarificationOption,
  AgentClarificationRequest,
  AgentClarificationView
} from '../model/agent/AgentClarification';
import {
  buildClarificationAnswerText,
  buildClarificationAnswerVisibleText,
  cloneAgentClarificationView
} from '../model/agent/AgentClarification';
import type { AgentReadinessReason, AgentTaskSetup, AgentTaskSnapshot } from '../model/agent/AgentTaskContext';
import {
  buildAgentTaskProviderText,
  buildAgentTaskVisibleText,
  evaluateAgentReadiness
} from '../model/agent/AgentTaskContext';
import { agentContextFieldHasOmittedMedia, sanitizeAgentContextField } from '../model/agent/AgentMediaPolicy';
import { explicitYearClozeRequested, inferRequestedCardCount } from '../model/agent/AgentRequestIntent';
import {
  AgentSettings,
  defaultAgentSettings,
  isAgentProviderConfigured,
  loadAgentSettings
} from '../backend/agent/AgentSettingsStore';
import { loadAgentSecret } from '../backend/agent/AgentSecretStore';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 简洁模式AppStorage键 } from '../model/简洁模式存储';
import { CustomTransition } from '../utils/自定义转场';
import { 按下态按钮 } from '../components/common/按下态按钮';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { Card } from '../proto/messages/CardsMessages';
import { NOTE_TYPE_KIND_NORMAL } from '../proto/messages/NotetypeMessages';
import type { NotetypeCapabilities, NotetypeNameId } from '../proto/messages/NotetypeMessages';
import { AgentConversation, AgentHistoryAudit, AgentHistoryResult, deleteAgentConversation, loadAgentConversations, saveAgentConversation } from '../model/agent/AgentConversationStore';
import { AgentDisclosureCard } from '../components/agent/AgentDisclosureCard';
import { AgentSetupCard } from '../components/agent/AgentSetupCard';
import { AgentClarificationCard } from '../components/agent/AgentClarificationCard';
import {
  mergeAgentImportedFiles,
  AGENT_IMPORT_MAX_FILES,
  AgentImportedFile,
  agentImportedFileNames,
  buildAgentImportedFilesContext,
  successfulAgentImportedFiles
} from '../model/agent/AgentFileImport';
import { selectAndParseAgentFiles } from '../backend/agent/AgentFileImportService';

/** 建卡目标牌组候选（通过 Navigation param 传入） */
export interface AI制卡牌组选项 {
  id: number;
  name: string;
}

/** 笔记类型下拉候选 */
export interface AI制卡笔记类型选项 {
  id: number;
  name: string;
}

/** Navigation 入栈参数（与 添加笔记页参数 同风格） */
export interface AI制卡页参数 {
  mode?: AgentMode;
  deckId?: string;
  deckName?: string;
  deckOptions?: AI制卡牌组选项[];
  cardIds?: number[];
  noteIds?: number[];
  templateIdx?: number;
}

interface CardSaveMessages { failed: string; empty: string; duplicate: string; cloze: string; }

interface 页面AI配置 { apiKey: string; baseUrl: string; model: string; }

class 页面Agent观察者 implements AgentRunObserver {
  private readonly callback: (event: AgentEvent) => void;
  constructor(callback: (event: AgentEvent) => void) { this.callback = callback; }
  onEvent(event: AgentEvent): void { this.callback(event); }
}

@Component
export struct AI制卡页 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  /** Navigation 入栈参数 */
  pageDeckId: string = '';
  pageDeckName: string = '';
  pageDeckOptions: AI制卡牌组选项[] = [];
  pageMode: AgentMode = 'create';
  pageCardIds: number[] = [];
  pageNoteIds: number[] = [];
  pageTemplateIdx: number = -1;
  /** 页面栈：关闭时 pop 返回首页 */
  pathStack: NavPathStack = new NavPathStack();

  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 卡片服务实例: 卡片服务 = new 卡片服务();
  private readonly 聊天滚动器: Scroller = new Scroller();
  private followAgentTail: boolean = true;
  private agentScrollTimer: number = -1;
  private readonly agentScope: AgentScope = new AgentScope();
  private readonly agentExecutor: AgentDraftExecutor = new AgentDraftExecutor();
  private agentRunner: AgentRunner | null = null;
  private sessionController: AgentSessionController | null = null;
  private checkpointStore: AgentCheckpointStore | null = null;
  private workspaceStore: AgentWorkspaceStore | null = null;
  private 本地范围卡片IDs: number[] = [];
  private 本地范围笔记IDs: number[] = [];
  private 本地范围牌组IDs: number[] = [];
  private 本地范围笔记类型IDs: number[] = [];
  private pageDisposed: boolean = false;
  private readonly cardBatch: AgentCardBatch = new AgentCardBatch();
  private conversationId: string = `agent-${Date.now()}-${Math.random()}`;
  private 历史执行结果: AgentHistoryResult[] = [];
  private omittedMediaInContext: boolean = false;

  @State private 消息列表: 聊天消息[] = [];
  @State private 输入草稿: string = '';
  @State private 处理中: boolean = false;
  @State private 牌组ID: number = 0;
  @State private 牌组选项: AI制卡牌组选项[] = [];
  @State private 已选笔记类型ID: number = 0;
  @State private 笔记类型选项: AI制卡笔记类型选项[] = [];
  @State private 笔记类型名: string = '';
  @State private 字段名列表: string[] = [];
  @State private noteTypeKind: number = NOTE_TYPE_KIND_NORMAL;
  @State private clozeFieldOrds: number[] = [];
  @State private AI配置: 页面AI配置 =
    { apiKey: '', baseUrl: DEEPSEEK_PROVIDER.baseUrl, model: DEEPSEEK_PROVIDER.defaultModel };
  private agentSettings: AgentSettings = defaultAgentSettings();
  @State private 页面Provider: ProviderId = 'deepseek';
  @State private 本地入口上下文: string = '';
  @State private 显示历史区: boolean = false;
  @State private 历史会话列表: AgentConversation[] = [];
  @State private 错误信息: string = '';
  @State private 导入文件列表: AgentImportedFile[] = [];
  @State private 文件解析中: boolean = false;

  private 下一个消息ID值: number = 1;

  @StorageProp(简洁模式AppStorage键) @Watch('applyToolPresentationMode') private simpleMode: boolean = true;
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下色: string = '#1E4FB8';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;
  private 上一键盘避让模式: KeyboardAvoidMode = KeyboardAvoidMode.OFFSET;

  // 图片遮盖第一版仍走独立 RPC；填空能力改由 Anki 后端结构提供，不再按名称猜测。
  private static readonly 图片遮盖笔记类型名集合: string[] = ['Image Occlusion', '图片遮盖', '影像遮擋'];

  async aboutToAppear(): Promise<void> {
    // 聊天页底部是 TextArea + Button 整行操作区。默认 OFFSET 只保证获焦文本/光标可见，
    // 可能让同行发送按钮仍被键盘裁剪；RESIZE 会压缩页面可用高度，让整个输入区位于键盘上方。
    this.上一键盘避让模式 = this.getUIContext().getKeyboardAvoidMode();
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调
    CustomTransition.getInstance().注册NavParam('AiCardPage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    this.牌组选项 = this.pageDeckOptions;
    this.追加稳定IDs(this.本地范围卡片IDs, this.pageCardIds);
    this.追加稳定IDs(this.本地范围笔记IDs, this.pageNoteIds);
    this.追加稳定IDs(this.本地范围牌组IDs,
      this.pageDeckOptions.map((item: AI制卡牌组选项): number => item.id));
    const 入参牌组ID: number = this.pageDeckId === '' ? 0 : parseInt(this.pageDeckId);
    const 命中入参: boolean = this.牌组选项.some((项: AI制卡牌组选项): boolean => 项.id === 入参牌组ID);
    this.牌组ID = 命中入参 ? 入参牌组ID : 0;
    await this.loadProviderConfiguration();
    await this.加载笔记类型列表();
    const abilityContext: common.UIAbilityContext | null = this.取能力上下文();
    if (abilityContext !== null) {
      this.workspaceStore = new AgentWorkspaceStore(abilityContext);
      this.checkpointStore = new AgentCheckpointStore(abilityContext);
      await this.restoreCreateSelection();
    }
    const registry: AgentToolRegistry = new AgentToolRegistry();
    new CardAgentTools(this.agentScope).register(registry, this.pageMode);
    if (this.pageMode === 'edit') { new HighRiskAgentTools(this.agentScope).register(registry); }
    this.agentRunner = new AgentRunner(registry);
    if (this.workspaceStore !== null) {
      const auxiliary: AgentAuxiliaryTools = new AgentAuxiliaryTools(this.agentScope, this.workspaceStore);
      auxiliary.register(registry);
      this.sessionController = new AgentSessionController(this.agentRunner, this.agentScope, this.workspaceStore, auxiliary);
    }
    await this.加载本地入口上下文();
  }

  aboutToDisappear(): void {
    this.pageDisposed = true;
    if (this.agentScrollTimer >= 0) { clearTimeout(this.agentScrollTimer); this.agentScrollTimer = -1; }
    if (this.agentRunner !== null) { this.agentRunner.cancel(); }
    this.getUIContext().setKeyboardAvoidMode(this.上一键盘避让模式);
    CustomTransition.getInstance().注销NavParam('AiCardPage');
  }

  /** 从设置页的唯一配置源加载当前 Provider 坐标与密钥。 */
  private async loadProviderConfiguration(): Promise<void> {
    try {
      this.agentSettings = await loadAgentSettings();
    } catch (error) {
      this.agentSettings = defaultAgentSettings();
    }
    const provider: ProviderId = this.agentSettings.selectedProvider;
    this.页面Provider = provider;
    const baseUrl: string = provider === 'deepseek' ? DEEPSEEK_PROVIDER.baseUrl :
      (provider === 'openai' ? OPENAI_PROVIDER.baseUrl : this.agentSettings.customBaseUrl);
    const model: string = provider === 'deepseek' ? this.agentSettings.deepseekModel :
      (provider === 'openai' ? this.agentSettings.openaiModel : this.agentSettings.customModel);
    this.AI配置 = { apiKey: await loadAgentSecret(provider), baseUrl: baseUrl, model: model };
  }

  private hasPendingAction(): boolean {
    return this.消息列表.some((message: 聊天消息): boolean =>
      message.action !== null && (message.action.status === 'pending' || message.action.status === 'executing'));
  }

  private appendDeckOptions(node: DeckTreeNode, output: AI制卡牌组选项[], prefix: string = ''): void {
    const full: string = prefix.length === 0 ? node.name : `${prefix}::${node.name}`;
    if (node.deckId > 0) { output.push({ id: node.deckId, name: full }); }
    for (const child of node.children) { this.appendDeckOptions(child, output, node.deckId > 0 ? full : ''); }
  }

  private async refreshDeckOptions(): Promise<void> {
    const options: AI制卡牌组选项[] = [];
    this.appendDeckOptions(await new 牌组服务().获取牌组树(), options);
    this.牌组选项 = options;
  }

  private async restoreCreateSelection(): Promise<void> {
    if (this.workspaceStore === null || this.pageMode !== 'create') { return; }
    try {
      await this.refreshDeckOptions();
      const state: AgentWorkspaceState = await this.workspaceStore.load();
      if (this.牌组ID === 0) {
        const previous: AI制卡牌组选项 | undefined = this.牌组选项.find(
          (item: AI制卡牌组选项): boolean => item.id === state.lastDeckId);
        this.牌组ID = previous === undefined ? (this.牌组选项[0]?.id ?? 0) : previous.id;
      }
      const preferred: AgentDeckPreference | undefined = state.deckPreferences.find(
        (item: AgentDeckPreference): boolean => item.deckId === this.牌组ID);
      const type: AI制卡笔记类型选项 | undefined = this.笔记类型选项.find(
        (item: AI制卡笔记类型选项): boolean => preferred !== undefined && item.id === preferred.notetypeId);
      const selected: number = type === undefined ? (this.笔记类型选项[0]?.id ?? 0) : type.id;
      if (selected > 0) { await this.加载笔记类型(selected); }
    } catch (error) { this.错误信息 = this.取本地化文案($r('app.string.ai_agent_preferences_failed')); }
  }

  private async selectDeckWithPreference(id: number): Promise<void> {
    this.牌组ID = id;
    if (this.pageMode === 'create' && this.workspaceStore !== null) {
      try {
        const state: AgentWorkspaceState = await this.workspaceStore.load();
        const preferred: AgentDeckPreference | undefined = state.deckPreferences.find(
          (item: AgentDeckPreference): boolean => item.deckId === id);
        if (preferred !== undefined && this.笔记类型选项.some(
          (item: AI制卡笔记类型选项): boolean => item.id === preferred.notetypeId)) {
          await this.加载笔记类型(preferred.notetypeId);
        }
        await this.workspaceStore.saveSelection(id, this.已选笔记类型ID);
      } catch (error) { this.错误信息 = this.取本地化文案($r('app.string.ai_agent_preferences_failed')); }
    }
  }

  private async selectNotetypeWithPreference(id: number): Promise<void> {
    if (id === 0) { this.选择笔记类型(0); return; }
    await this.加载笔记类型(id);
    if (this.pageMode === 'create' && this.workspaceStore !== null) {
      try { await this.workspaceStore.saveSelection(this.牌组ID, this.已选笔记类型ID); }
      catch (error) { this.错误信息 = this.取本地化文案($r('app.string.ai_agent_preferences_failed')); }
    }
  }

  private async syncSessionTarget(): Promise<void> {
    if (this.pageMode !== 'create') { return; }
    const target: number[] = this.agentScope.currentCreateTarget();
    if (target[0] > 0) { this.牌组ID = target[0]; }
    await this.refreshDeckOptions();
    if (target[1] > 0 && target[1] !== this.已选笔记类型ID) {
      await this.加载笔记类型列表();
      await this.加载笔记类型(target[1]);
    }
    if (this.workspaceStore !== null) { await this.workspaceStore.saveSelection(this.牌组ID, this.已选笔记类型ID); }
  }

  private async resolveAction(messageIndex: number, accepted: boolean): Promise<void> {
    if (this.处理中 || this.sessionController === null) { return; }
    const action: AgentAction | null = this.sessionController.getAction();
    if (action === null || action.status !== 'pending' || this.消息列表[messageIndex].action?.id !== action.id) { return; }
    this.处理中 = true;
    let resultJson: string = '{"status":"cancelled_by_user","instruction":"Do not repeat the same proposal."}';
    try {
      if (accepted) {
        // 先持久化 executing 意图；崩溃恢复不能把不确定写入当成未执行自动重试。
        action.status = 'executing';
        this.saveSessionCheckpoint();
        action.status = 'pending';
        resultJson = await this.sessionController.auxiliary.executeConfirmed(action);
        AppStorage.setOrCreate<number>('noteAddedTick', Date.now());
        await this.syncSessionTarget();
      } else { action.status = 'cancelled'; action.resultJson = resultJson; }
    } catch (error) {
      action.status = 'failed';
      resultJson = action.resultJson.length > 0 ? action.resultJson : '{"status":"failed"}';
      this.错误信息 = this.取本地化文案($r('app.string.ai_agent_action_failed'));
    } finally {
      this.更新消息(messageIndex, (message: 聊天消息): void => { message.action = action; });
      this.处理中 = false;
      await this.保存当前会话历史();
    }
    const visible: string = this.取本地化文案(accepted ? $r('app.string.ai_agent_action_confirmed_continue') :
      $r('app.string.ai_agent_action_cancelled_continue'));
    const result: AgentRunResult | null = await this.runAgentTurn(visible, visible, 0, '', resultJson);
    if (result?.clarification !== null && result?.clarification !== undefined) {
      this.appendClarificationMessage(result.clarification);
      await this.保存当前会话历史();
    }
  }

  private async resumePausedTask(messageIndex: number): Promise<void> {
    if (this.处理中) { return; }
    this.更新消息(messageIndex, (message: 聊天消息): void => { message.taskStatus = ''; });
    const visible: string = this.取本地化文案($r('app.string.ai_agent_task_resume'));
    const result: AgentRunResult | null = await this.runAgentTurn(visible, visible, 0, '', '{"status":"continue"}');
    if (result?.clarification !== null && result?.clarification !== undefined) {
      this.appendClarificationMessage(result.clarification);
      await this.保存当前会话历史();
    }
  }

  private 追加稳定IDs(target: number[], values: number[]): void {
    for (const value of values) {
      if (value > 0 && target.indexOf(value) < 0) { target.push(value); }
    }
  }

  /** 刷新当前操作目标；保留会话已发现的只读对象和检索游标。 */
  private 重建本轮AgentScope(): void {
    this.agentScope.beginTurn();
    this.agentScope.configureBatchLimit(this.agentSettings.batchLimit);
    this.agentScope.configureCreateTarget(
      this.pageMode === 'create' ? this.牌组ID : 0,
      this.pageMode === 'create' ? this.已选笔记类型ID : 0);

    this.agentScope.registerCardIds(this.本地范围卡片IDs);
    this.agentScope.registerNoteIds(this.本地范围笔记IDs);
    this.agentScope.registerDeckIds(this.本地范围牌组IDs);
    this.agentScope.registerNotetypeIds(this.本地范围笔记类型IDs);
    if (this.牌组ID > 0) { this.agentScope.registerDeckIds([this.牌组ID]); }
    if (this.已选笔记类型ID > 0) { this.agentScope.registerNotetypeIds([this.已选笔记类型ID]); }
  }

  /** 仅从本地 Anki Service 读取并显示，绝不在页面出现时调用 AgentRunner。 */
  private async 加载本地入口上下文(): Promise<void> {
    if (this.pageMode !== 'edit') { return; }
    const summary: string[] = [];
    const noteIds: number[] = this.pageNoteIds.slice();
    for (const cardId of this.pageCardIds) {
      try {
        const card: Card = await this.卡片服务实例.获取卡片(cardId);
        if (noteIds.indexOf(card.noteId) < 0) { noteIds.push(card.noteId); }
        this.追加稳定IDs(this.本地范围笔记IDs, [card.noteId]);
        this.追加稳定IDs(this.本地范围牌组IDs, [card.deckId]);
        summary.push(`card=${card.id} note=${card.noteId} deck=${card.deckId} template=${card.templateIdx}`);
      } catch (error) { summary.push(`card=${cardId} unavailable`); }
    }
    for (const noteId of noteIds) {
      try {
        const note: EditableNote = await this.笔记服务实例.获取笔记(noteId);
        const siblings: number[] = await this.笔记服务实例.获取笔记的卡片(noteId);
        this.追加稳定IDs(this.本地范围笔记类型IDs, [note.notetypeId]);
        this.追加稳定IDs(this.本地范围卡片IDs, siblings);
        const safeFields: string[] = [];
        for (const field of note.fields) {
          if (agentContextFieldHasOmittedMedia(field)) { this.omittedMediaInContext = true; }
          safeFields.push(sanitizeAgentContextField(field));
        }
        summary.push(`note=${note.id} type=${note.notetypeId} fields=${JSON.stringify(safeFields)} tags=${JSON.stringify(note.tags)} cards=${siblings.length}`);
      } catch (error) { summary.push(`note=${noteId} unavailable`); }
    }
    this.本地入口上下文 = summary.join('\n');
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return 上下文 === undefined ? null : 上下文;
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    try {
      return 上下文.resourceManager.getStringSync(资源.id);
    } catch (错误) {
      return '';
    }
  }

  /** 交由 ResourceManager 处理 %s、%d 和带序号的本地化占位符。 */
  private 取本地化格式(资源: Resource, 参数: Array<string | number>): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) { return ''; }
    try {
      return 上下文.resourceManager.getStringSync(资源.id, ...参数);
    } catch (错误) {
      return '';
    }
  }

  private selectedDeckName(): string {
    const selected: AI制卡牌组选项 | undefined = this.牌组选项.find(
      (item: AI制卡牌组选项): boolean => item.id === this.牌组ID);
    return selected === undefined ? '' : selected.name;
  }

  private selectedNotetypeName(): string {
    const selected: AI制卡笔记类型选项 | undefined = this.笔记类型选项.find(
      (item: AI制卡笔记类型选项): boolean => item.id === this.已选笔记类型ID);
    return selected === undefined ? this.笔记类型名 : selected.name;
  }

  private anki搜索引号值(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  private 改卡搜索范围(): string {
    if (this.pageMode !== 'edit') { return ''; }
    const parts: string[] = [];
    const deckName: string = this.selectedDeckName();
    const notetypeName: string = this.selectedNotetypeName();
    if (this.牌组ID > 0 && deckName.length > 0) {
      parts.push(`deck:"${this.anki搜索引号值(deckName)}"`);
    }
    if (this.已选笔记类型ID > 0 && notetypeName.length > 0) {
      parts.push(`note:"${this.anki搜索引号值(notetypeName)}"`);
    }
    return parts.join(' ');
  }

  private providerReady(): boolean {
    return isAgentProviderConfigured(this.agentSettings, this.AI配置.apiKey);
  }

  private taskSetup(): AgentTaskSetup {
    return {
      mode: this.pageMode,
      deckId: this.牌组ID,
      deckName: this.牌组ID > 0 ? this.selectedDeckName() : '',
      notetypeId: this.已选笔记类型ID,
      notetypeName: this.已选笔记类型ID > 0 ? this.selectedNotetypeName() : '',
      fieldNames: this.字段名列表.slice(),
      noteTypeKind: this.noteTypeKind,
      clozeFieldOrds: this.clozeFieldOrds.slice(),
      expanded: true
    };
  }

  private hasPendingClarification(): boolean {
    for (const message of this.消息列表) {
      if (message.kind === 'clarification' && message.clarification !== null &&
        (message.clarification.state === 'pending' || message.clarification.state === 'submitting' ||
          message.clarification.state === 'submit_failed')) { return true; }
    }
    return false;
  }

  private readinessReason(): AgentReadinessReason {
    const effectiveInput: string = this.输入草稿.trim().length > 0 ? this.输入草稿 :
      (successfulAgentImportedFiles(this.导入文件列表).length > 0 ? 'imported-file' : '');
    return evaluateAgentReadiness(this.taskSetup(), effectiveInput,
      this.providerReady(), this.cardBatch.isRunning() || this.处理中 || this.文件解析中 || this.hasPendingClarification() || this.hasPendingAction());
  }

  private canSubmit(): boolean {
    return this.readinessReason() === 'ready';
  }

  private taskSnapshot(input: string): AgentTaskSnapshot {
    const setup: AgentTaskSetup = this.taskSetup();
    return {
      mode: setup.mode, deckId: setup.deckId, deckName: setup.deckName,
      notetypeId: setup.notetypeId, notetypeName: setup.notetypeName,
      fieldNames: setup.fieldNames.slice(), noteTypeKind: setup.noteTypeKind,
      clozeFieldOrds: setup.clozeFieldOrds.slice(), userText: input,
      localContext: this.本地入口上下文.length > 0 ? this.本地入口上下文 : '无预选卡片，可使用搜索工具。',
      omittedMedia: this.omittedMediaInContext,
      batchLimit: this.agentSettings.batchLimit
    };
  }

  private editSetupContext(): string {
    if (this.pageCardIds.length > 0 || this.pageNoteIds.length > 0) {
      return this.取本地化格式($r('app.string.ai_agent_edit_selected_context'),
        [`${this.pageCardIds.length}`, `${this.pageNoteIds.length}`]);
    }
    return this.取本地化文案($r('app.string.ai_agent_edit_search_welcome'));
  }

  /** 预选改卡沿用入口传入的稳定 ID，不再让对话重新选择搜索范围。 */
  private hasFixedEditSelection(): boolean {
    return this.pageMode === 'edit' && (this.pageCardIds.length > 0 || this.pageNoteIds.length > 0);
  }

  /** 首条消息发送前显示已锁定的目标数量。 */
  private selectedEditContext(): string {
    if (this.pageCardIds.length > 0) {
      return this.取本地化格式($r('app.string.ai_agent_edit_selected_cards'),
        [`${this.pageCardIds.length}`]);
    }
    return this.取本地化格式($r('app.string.ai_agent_edit_selected_notes'),
      [`${this.pageNoteIds.length}`]);
  }

  /** 每轮声明完整只读工具；可读搜索结果不会自动获得写入权限。 */
  private providerFunctionToolsForTurn(): ProviderFunctionTool[] {
    return agentFunctionTools(this.agentSettings.batchLimit, this.pageMode);
  }

  private 选择笔记类型(notetypeId: number): void {
    if (notetypeId > 0) {
      this.加载笔记类型(notetypeId);
      return;
    }
    this.已选笔记类型ID = 0;
    this.笔记类型名 = '';
    this.字段名列表 = [];
    this.noteTypeKind = NOTE_TYPE_KIND_NORMAL;
    this.clozeFieldOrds = [];
    this.错误信息 = '';
  }

  // ========================================================
  // 笔记类型加载：拉取列表 → 过滤 Image Occlusion；只为明确选择加载能力。
  // ========================================================

  private async 加载笔记类型列表(): Promise<void> {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      this.错误信息 = this.取本地化文案($r('app.string.ai_card_err_no_notetype'));
      return;
    }
    try {
      await 后端会话.获取实例().确保已打开(上下文.filesDir);
      const 名称列表: NotetypeNameId[] = await this.笔记类型服务实例.获取笔记类型名列表();
      // 第一版不支持 Image Occlusion（独立 RPC 建卡流程），直接从候选中剔除
      const 可用列表: NotetypeNameId[] = 名称列表.filter(
        (项: NotetypeNameId): boolean =>
          AI制卡页.图片遮盖笔记类型名集合.indexOf(项.name) < 0);
      if (可用列表.length === 0) {
        this.错误信息 = this.取本地化文案($r('app.string.ai_card_err_no_notetype'));
        return;
      }
      this.笔记类型选项 = 可用列表.map((项: NotetypeNameId): AI制卡笔记类型选项 =>
        ({ id: 项.id, name: 项.name }));
      this.追加稳定IDs(this.本地范围笔记类型IDs,
        可用列表.map((item: NotetypeNameId): number => item.id));
      this.已选笔记类型ID = 0;
      this.笔记类型名 = '';
      this.字段名列表 = [];
    } catch (错误) {
      this.已选笔记类型ID = 0;
      this.笔记类型名 = '';
      this.字段名列表 = [];
      this.noteTypeKind = NOTE_TYPE_KIND_NORMAL;
      this.clozeFieldOrds = [];
      this.错误信息 = this.取本地化文案($r('app.string.ai_card_err_no_notetype'));
    }
  }

  private async 加载笔记类型(notetypeId: number): Promise<void> {
    try {
      const 能力: NotetypeCapabilities = await this.笔记类型服务实例.获取笔记类型能力(notetypeId);
      this.已选笔记类型ID = 能力.notetypeId;
      this.笔记类型名 = 能力.name;
      this.字段名列表 = 能力.fieldNames;
      this.noteTypeKind = 能力.kind;
      this.clozeFieldOrds = 能力.clozeFieldOrds;
      this.错误信息 = '';
    } catch (错误) {
      this.已选笔记类型ID = 0;
      this.笔记类型名 = '';
      this.字段名列表 = [];
      this.noteTypeKind = NOTE_TYPE_KIND_NORMAL;
      this.clozeFieldOrds = [];
      this.错误信息 = this.取本地化文案($r('app.string.ai_card_err_no_notetype'));
    }
  }

  // ========================================================
  // 消息流：不可变数据结构 + 整列表替换（与 添加笔记页 更新字段 同款思路）
  // 属性绑定统一经 this.消息列表[索引] 读取，保证 @State 重赋值后 UI 刷新。
  // ========================================================

  private 下一个消息ID(): number {
    const id: number = this.下一个消息ID值;
    this.下一个消息ID值++;
    return id;
  }

  private 空消息(角色: string, 正文: string, 是否错误: boolean): 聊天消息 {
    return createAgentMessage(this.下一个消息ID(), 角色, 正文, 是否错误);
  }

  private 克隆卡片(卡: 卡片草稿): 卡片草稿 {
    return cloneAgentCard(卡);
  }

  private 克隆工具追踪(追踪: AgentToolTrace): AgentHistoryAudit {
    return cloneAgentTrace(追踪);
  }

  private 克隆历史审计(追踪: AgentToolTrace): AgentHistoryAudit {
    return cloneAgentTrace(追踪);
  }

  private 克隆消息(消息: 聊天消息): 聊天消息 {
    return cloneAgentMessage(消息);
  }

  /** 对某条消息做克隆-修改-回写；保证 ForEach 键不变时属性绑定仍走 @State 通道。 */
  private 更新消息(消息索引: number, 修改: (消息: 聊天消息) => void): void {
    const 列表: 聊天消息[] = this.消息列表.slice();
    const 消息: 聊天消息 = this.克隆消息(列表[消息索引]);
    修改(消息);
    列表[消息索引] = 消息;
    this.消息列表 = 列表;
  }

  private 更新卡片字段(消息索引: number, 卡片索引: number, 字段索引: number, 值: string): void {
    if (this.pageDisposed || this.消息列表[消息索引].批次保存中 ||
      this.消息列表[消息索引].卡片列表[卡片索引].状态 === 'saved') return;
    this.更新消息(消息索引, (消息: 聊天消息): void => {
      const 卡: 卡片草稿 = this.克隆卡片(消息.卡片列表[卡片索引]);
      const fields: string[] = 卡.fields.slice();
      fields[字段索引] = 值;
      卡.fields = fields;
      卡.状态 = 'draft';
      卡.失败提示 = '';
      消息.卡片列表[卡片索引] = 卡;
    });
  }

  private 更新卡片选中(消息索引: number, 卡片索引: number, 值: boolean): void {
    if (this.pageDisposed || this.消息列表[消息索引].批次保存中 ||
      this.消息列表[消息索引].卡片列表[卡片索引].状态 === 'saved') return;
    this.更新消息(消息索引, (消息: 聊天消息): void => {
      const 卡: 卡片草稿 = this.克隆卡片(消息.卡片列表[卡片索引]);
      卡.已选中 = 值;
      消息.卡片列表[卡片索引] = 卡;
    });
  }

  private 追加消息(消息: 聊天消息): void {
    this.消息列表 = this.消息列表.concat([消息]);
    this.滚动到底部();
  }

  private 滚动到底部(): void {
    this.followAgentTail = true;
    this.queueAgentTimelineScroll();
  }

  /** 合并密集的流式布局更新；用户向上阅读后取消待执行的跟随滚动。 */
  private queueAgentTimelineScroll(): void {
    if (!this.followAgentTail || this.agentScrollTimer >= 0) { return; }
    this.agentScrollTimer = setTimeout(() => {
      this.agentScrollTimer = -1;
      if (!this.followAgentTail) { return; }
      try {
        this.聊天滚动器.scrollEdge(Edge.Bottom);
      } catch (错误) {
        // 滚动失败不影响功能
      }
    }, 50);
  }

  private 取Agent错误文案(错误: Error): string {
    if (错误 instanceof AgentTransportError) {
      if (错误.kind === 'http') {
        if (错误.detailMessage.length > 0) {
          return this.取本地化格式($r('app.string.ai_agent_http_error_detail'),
            [错误.statusCode, 错误.detailMessage]);
        }
        return this.取本地化格式($r('app.string.ai_agent_http_error'), [错误.statusCode]);
      }
      if (错误.kind === 'network') {
        return this.取本地化文案($r('app.string.ai_card_err_network'));
      }
      if (错误.kind === 'cancelled') {
        return this.取本地化文案($r('app.string.ai_agent_turn_cancelled'));
      }
    }
    if (错误.message === 'cancelled') {
      return this.取本地化文案($r('app.string.ai_agent_turn_cancelled'));
    }
    if (错误.message === 'web_search_disabled') {
      return this.取本地化文案($r('app.string.ai_agent_web_search_disabled'));
    }
    if (错误.message === 'web_search_provider_unsupported') {
      return this.取本地化文案($r('app.string.ai_agent_web_search_provider_unsupported'));
    }
    if (错误.message === 'web_search_not_executed') {
      return this.取本地化文案($r('app.string.ai_agent_web_search_not_executed'));
    }
    if (错误.message === 'web_search_sources_missing') {
      return this.取本地化文案($r('app.string.ai_agent_web_search_sources_missing'));
    }
    if (错误.message === 'web_search_unsupported') {
      return this.取本地化文案($r('app.string.ai_agent_web_search_unsupported'));
    }
    if (错误.message === 'agent_provider_limit' || 错误.message === 'agent_tool_limit') {
      return this.取本地化文案($r('app.string.ai_agent_turn_limit_reached'));
    }
    if (错误.message === 'agent_no_valid_draft') {
      return this.取本地化文案($r('app.string.ai_agent_no_valid_draft'));
    }
    if (错误.message === 'agent_repeated_tool_failure') {
      return this.取本地化文案($r('app.string.ai_agent_repeated_tool_failure'));
    }
    return 错误.message.length > 0 ? 错误.message :
      this.取本地化文案($r('app.string.ai_card_err_network'));
  }

  private 取消当前请求(): void {
    if (this.agentRunner !== null) { this.agentRunner.cancel(); }
    this.cancelPendingClarifications();
  }

  private 构建Provider输入(): ProviderInputItem[] {
    const values: ProviderInputItem[] = [];
    for (const message of this.消息列表) {
      if (!(message.kind === 'normal' || message.kind === 'clarification')) { continue; }
      const text: string = message.providerText.length > 0 ? message.providerText : message.正文;
      if (text.length > 0) {
        values.push({
          kind: 'message', role: message.角色 === 'user' ? 'user' : 'assistant',
          content: text, callId: '', name: '', argumentsJson: '', output: ''
        });
      }
      if (message.角色 === 'ai') {
        const draftContext: string = this.构建消息草稿上下文(message);
        if (draftContext.length > 0) {
          values.push({
            kind: 'message', role: 'assistant', content: draftContext,
            callId: '', name: '', argumentsJson: '', output: ''
          });
        }
      }
    }
    return limitProviderInput(values);
  }

  private 构建消息草稿上下文(message: 聊天消息): string {
    return buildProviderDraftContext(message);
  }

  private async 发送(): Promise<void> {
    const 输入: string = this.输入草稿.trim();
    const reason: AgentReadinessReason = this.readinessReason();
    if (reason !== 'ready') { return; }
    const importedFiles: AgentImportedFile[] = this.导入文件列表.slice();
    const fileContext: string = buildAgentImportedFilesContext(importedFiles);
    const defaultRequest: string = this.取本地化文案(this.pageMode === 'create' ?
      $r('app.string.ai_agent_file_default_create_request') :
      $r('app.string.ai_agent_file_default_edit_request'));
    const userRequest: string = 输入.length > 0 ? 输入 : defaultRequest;
    const providerRequest: string = fileContext.length > 0 ? `${userRequest}\n\n${fileContext}` : userRequest;
    const fileNames: string = agentImportedFileNames(importedFiles);
    const visibleRequest: string = fileNames.length > 0 ? `${userRequest}\n\n${this.取本地化格式(
      $r('app.string.ai_agent_file_summary'), [fileNames])}` : userRequest;
    const providerSnapshot: AgentTaskSnapshot = this.taskSnapshot(providerRequest);
    const visibleSnapshot: AgentTaskSnapshot = this.taskSnapshot(visibleRequest);
    this.输入草稿 = '';
    this.导入文件列表 = [];
    const result: AgentRunResult | null = await this.runAgentTurn(
      buildAgentTaskProviderText(providerSnapshot), buildAgentTaskVisibleText(visibleSnapshot), 0, userRequest);
    if (result !== null && result.status === 'awaiting_clarification' && result.clarification !== null) {
      this.appendClarificationMessage(result.clarification);
      await this.保存当前会话历史();
    }
  }

  private async runAgentTurn(providerText: string, visibleUserText: string,
    existingUserMessageId: number = 0, intentText: string = visibleUserText, resumeOutput: string = ''): Promise<AgentRunResult | null> {
    if (this.pageDisposed || this.cardBatch.isRunning() || this.处理中 || this.agentRunner === null || this.sessionController === null) { return null; }
    this.重建本轮AgentScope();
    this.agentScope.configureCreateConstraints(this.pageMode === 'create' &&
      explicitYearClozeRequested(providerText));
    this.错误信息 = '';
    let userMessageId: number = existingUserMessageId;
    let foundExisting: boolean = false;
    if (existingUserMessageId > 0) {
      for (let index: number = 0; index < this.消息列表.length; index++) {
        if (this.消息列表[index].id === existingUserMessageId) {
          this.更新消息(index, (message: 聊天消息): void => {
            message.正文 = visibleUserText;
            message.providerText = providerText;
          });
          foundExisting = true;
          break;
        }
      }
    }
    if (!foundExisting) {
      const userMessage: 聊天消息 = this.空消息('user', visibleUserText, false);
      userMessage.providerText = providerText;
      userMessageId = userMessage.id;
      this.追加消息(userMessage);
    }
    this.storeClarificationAnswerMessageId(userMessageId);
    this.处理中 = true;
    const aiMessage: 聊天消息 = this.空消息('ai', '', false);
    aiMessage.streaming = true;
    this.追加消息(aiMessage);
    const aiIndex: number = this.消息列表.length - 1;
    const conversationId: string = this.conversationId;
    try {
      const request: ProviderTurnRequest = {
        apiKey: this.AI配置.apiKey,
        baseUrl: this.AI配置.baseUrl,
        model: this.AI配置.model,
        instructions: this.构建Agent指令(),
        input: this.构建Provider输入(),
        functionTools: this.providerFunctionToolsForTurn(),
        // 联网搜索功能已关闭：设置 UI 隐藏，不再读取历史存档，运行时恒为 off。
        searchMode: 'off',
        // 只分析用户可见要求，不扫描任务配置或本地卡片内容，避免上下文里的“联网”等词误触发。
        requiresWebSearch: explicitWebSearchRequested(intentText),
        requiresSearchEvidence: explicitSourceEvidenceRequested(intentText),
        requiresDraft: false,
        expectedDraftCount: this.pageMode === 'create' ?
          inferRequestedCardCount(intentText, this.agentSettings.batchLimit) : 0,
        reasoningEffort: 'low', maxOutputTokens: 32768
      };
      const observer: 页面Agent观察者 = new 页面Agent观察者(
        (event: AgentEvent): void => {
          const index: number = this.currentMessageIndex(conversationId, aiMessage.id);
          if (index >= 0) this.处理Agent事件(index, event);
        });
      const result: AgentRunResult = await this.sessionController.run(this.agentSettings.selectedProvider, request, observer, resumeOutput);
      if (this.currentMessageIndex(conversationId, aiMessage.id) < 0) return null;
      await this.syncSessionTarget();
      if (this.currentMessageIndex(conversationId, aiMessage.id) < 0) return null;
      if (result.status === 'awaiting_clarification') {
        this.更新消息(aiIndex, (message: 聊天消息): void => {
          message.taskStatus = 'waiting';
        });
      } else {
        if (result.action !== undefined) {
          this.更新消息(aiIndex, (message: 聊天消息): void => { message.action = result.action ?? null; });
        }
        if (result.status === 'paused') {
          this.更新消息(aiIndex, (message: 聊天消息): void => { message.taskStatus = 'paused'; message.是否错误 = false; });
        }
        this.接收Agent草稿(aiIndex, result.drafts);
      }
      return result;
    } catch (错误) {
      if (this.currentMessageIndex(conversationId, aiMessage.id) < 0) return null;
      const 异常: Error = 错误 instanceof Error ? 错误 : new Error(`${错误}`);
      const 错误文案: string = this.取Agent错误文案(异常);
      this.更新消息(aiIndex, (message: 聊天消息): void => {
        message.正文 = message.正文.length > 0 ? `${message.正文}\n\n${错误文案}` : 错误文案;
        appendAgentTimelineText(message.timeline, 'text', 错误文案);
        for (const block of message.timeline) {
          if (block.kind === 'draft') { block.index = -1; block.indexes = []; }
        }
        message.是否错误 = true;
        message.kind = message.providerText.length > 0 ? 'normal' : 'error';
      });
      return null;
    } finally {
      if (this.currentMessageIndex(conversationId, aiMessage.id) >= 0) {
        this.更新消息(aiIndex, (message: 聊天消息): void => { message.streaming = false; });
        this.处理中 = false;
        await this.保存当前会话历史();
      }
    }
  }

  private storeClarificationAnswerMessageId(messageId: number): void {
    for (let index: number = this.消息列表.length - 1; index >= 0; index--) {
      const view: AgentClarificationView | null = this.消息列表[index].clarification;
      if (this.消息列表[index].kind === 'clarification' &&
        view !== null && view.state === 'submitting') {
        this.更新消息(index, (message: 聊天消息): void => {
          message.answerMessageId = messageId;
        });
        return;
      }
    }
  }

  private appendClarificationMessage(request: AgentClarificationRequest): void {
    if (this.hasPendingClarification()) { throw new Error('clarification_already_pending'); }
    const message: 聊天消息 = this.空消息('ai', request.question, false);
    message.kind = 'clarification';
    message.clarification = {
      request: request, selectedOptionId: '', supplementalText: '',
      state: 'pending'
    };
    message.expanded = true;
    this.追加消息(message);
  }

  private selectClarificationOption(messageIndex: number, optionId: string): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      if (message.clarification !== null &&
        (message.clarification.state === 'pending' || message.clarification.state === 'submit_failed')) {
        message.clarification.selectedOptionId = optionId;
      }
    });
  }

  private updateClarificationSupplement(messageIndex: number, value: string): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      if (message.clarification !== null &&
        (message.clarification.state === 'pending' || message.clarification.state === 'submit_failed')) {
        message.clarification.supplementalText = value;
      }
    });
  }

  private async continueClarification(messageIndex: number): Promise<void> {
    const source: AgentClarificationView | null = this.消息列表[messageIndex].clarification;
    if (source === null || !canAnswerClarification(source) || this.处理中) { return; }
    const view: AgentClarificationView = cloneAgentClarificationView(source);
    const option: AgentClarificationOption | undefined = view.request.options.find(
      (item: AgentClarificationOption): boolean => item.id === view.selectedOptionId);
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      if (message.clarification !== null) {
        message.clarification.state = 'submitting';
      }
    });
    const answer: AgentClarificationAnswer = {
      clarificationId: view.request.id, optionId: option === undefined ? '' : option.id,
      optionLabel: option === undefined ? '' : option.label,
      supplementalText: view.supplementalText.trim()
    };
    let inheritedIntent: string = buildClarificationAnswerVisibleText(answer);
    for (let index: number = messageIndex - 1; index >= 0; index--) {
      if (this.消息列表[index].角色 === 'user' && this.消息列表[index].正文.length > 0) {
        inheritedIntent = `${this.消息列表[index].正文}\n${inheritedIntent}`;
        break;
      }
    }
    this.重建本轮AgentScope();
    const result: AgentRunResult | null = await this.runAgentTurn(
      buildClarificationAnswerText(view.request, answer),
      buildClarificationAnswerVisibleText(answer),
      this.消息列表[messageIndex].answerMessageId,
      inheritedIntent, JSON.stringify(answer));
    const current: AgentClarificationView | null = this.消息列表[messageIndex].clarification;
    if (result === null) {
      if (current !== null && current.state !== 'cancelled') {
        this.更新消息(messageIndex, (message: 聊天消息): void => {
          if (message.clarification !== null) {
            message.clarification.state = 'submit_failed';
          }
        });
      }
      await this.保存当前会话历史();
      return;
    }
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      if (message.clarification !== null) {
        message.clarification.state = 'resolved';
        message.expanded = false;
      }
    });
    if (result.status === 'awaiting_clarification' && result.clarification !== null) {
      this.appendClarificationMessage(result.clarification);
    }
    await this.保存当前会话历史();
  }

  private cancelPendingClarifications(): void {
    for (let index: number = 0; index < this.消息列表.length; index++) {
      const view: AgentClarificationView | null = this.消息列表[index].clarification;
      if (view !== null && (view.state === 'pending' || view.state === 'submitting' ||
        view.state === 'submit_failed')) {
        this.更新消息(index, (message: 聊天消息): void => {
          if (message.clarification !== null) {
            message.clarification.state = 'cancelled';
            message.expanded = false;
          }
        });
      }
    }
  }

  private 构建Agent指令(): string {
    return buildAgentSessionInstructions(this.taskSetup(), this.agentSettings.batchLimit);
  }

  private 处理Agent事件(messageIndex: number, event: AgentEvent): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      if (event.kind === 'text_delta') {
        message.正文 += event.text;
        message.providerText += event.text;
        appendAgentTimelineText(message.timeline, 'text', event.text);
      }
      if (event.kind === 'reasoning_delta' || event.kind === 'reasoning_summary') {
        message.推理摘要 += event.text;
        appendAgentTimelineText(message.timeline,
          event.kind === 'reasoning_summary' ? 'summary' : 'reasoning', event.text);
        if (event.kind === 'reasoning_summary') { message.reasoningIsSummary = true; }
      }
      if ((event.kind === 'tool_progress' || event.kind === 'tool_call') && event.toolCall !== null) {
        const block: AgentTimelineBlock = appendAgentTimelineReference(message.timeline, 'tool', event.toolCall.id);
        block.toolName = event.toolCall.name;
        block.text = agentDraftProgressText(event.toolCall.name, event.toolCall.argumentsJson);
      }
      if ((event.kind === 'tool_started' || event.kind === 'tool_completed' || event.kind === 'tool_failed') &&
        event.toolTrace !== null) {
        const trace: AgentToolTrace = this.克隆工具追踪(event.toolTrace);
        let existingIndex: number = -1;
        for (let index: number = 0; index < message.工具过程.length; index++) {
          if (message.工具过程[index].callId === trace.callId) { existingIndex = index; break; }
        }
        if (existingIndex < 0) { trace.expanded = !this.simpleMode; message.工具过程.push(trace); }
        else {
          trace.expanded = message.工具过程[existingIndex].expanded;
          message.工具过程[existingIndex] = trace;
        }
        const block: AgentTimelineBlock = appendAgentTimelineReference(message.timeline, 'tool', trace.callId);
        block.toolName = trace.toolName;
        block.index = existingIndex < 0 ? message.工具过程.length - 1 : existingIndex;
        if (event.kind === 'tool_completed') { block.text = ''; }
      }
      if (event.kind === 'search_source' && event.source !== null) {
        message.来源列表.push({ url: event.source.url, title: event.source.title });
        const block: AgentTimelineBlock = appendAgentTimelineReference(message.timeline, 'source', event.source.url);
        block.text = `${event.source.title}\n${event.source.url}`;
      }
      if (event.kind === 'error') { message.是否错误 = true; }
    });
    if (event.kind === 'tool_completed' && this.agentRunner !== null) {
      this.showAgentDraftProgress(messageIndex, this.agentRunner.getPartialDrafts());
    }
  }

  /** 每个工具校验出草稿后立即显示内容；运行中仅预览，最终接收时开放编辑和确认。 */
  private showAgentDraftProgress(messageIndex: number, drafts: ChangeDraft[]): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      for (const draft of drafts) {
        const block: AgentTimelineBlock = appendAgentTimelineReference(message.timeline, 'draft', draft.id);
        block.text = draft.summary + '\n\n' + draft.operations.map((operation: DraftOperation, index: number): string => {
          const text: string = operation.before.length > 0 ?
            this.取本地化格式($r('app.string.ai_agent_operation_diff'), [operation.before, operation.after]) : operation.after;
          return text + agentDraftOperationImages(draft, index).map((url: string): string => `\n\n![](${url})`).join('');
        }).join('\n\n');
        block.images = agentDraftOperationImages(draft, -1);
      }
    });
  }

  private 接收Agent草稿(messageIndex: number, drafts: ChangeDraft[]): void {
    if (drafts.length === 0) { return; }
    this.showAgentDraftProgress(messageIndex, drafts);
    const cards: 卡片草稿[] = [];
    const changes: ChangeDraft[] = [];
    const timeline: AgentTimelineBlock[] = cloneAgentTimeline(this.消息列表[messageIndex].timeline);
    for (const draft of drafts) {
      const block: AgentTimelineBlock = appendAgentTimelineReference(timeline, 'draft', draft.id);
      block.indexes = [];
      block.index = -1;
      const createOnly: boolean = draft.operations.length > 0 &&
        draft.operations.every((operation: DraftOperation): boolean => operation.kind === 'create_note') &&
        (draft.imageAttachments ?? []).length === 0;
      if (createOnly) {
        const groupedFields: Map<number, string[]> = new Map<number, string[]>();
        for (const operation of draft.operations) {
          let fields: string[] | undefined = groupedFields.get(operation.noteId);
          if (fields === undefined) {
            fields = this.字段名列表.map((_name: string): string => '');
            groupedFields.set(operation.noteId, fields);
          }
          if (operation.fieldOrd >= 0 && operation.fieldOrd < fields.length) {
            fields[operation.fieldOrd] = operation.after;
          }
        }
        for (const fields of groupedFields.values()) {
          block.indexes.push(cards.length);
          cards.push({ fields: fields, 已选中: true, 状态: 'draft', 失败提示: '' });
        }
      } else { block.index = changes.length; changes.push(draft); }
    }
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      message.timeline = timeline;
      message.卡片列表 = cards;
      message.draftDeckId = this.牌组ID;
      message.draftNotetypeId = this.已选笔记类型ID;
      message.draftTargetLabel = `${this.selectedDeckName()} · ${this.selectedNotetypeName()}`;
      message.字段名列表 = this.字段名列表.slice();
      message.变更草稿列表 = changes;
      if (message.正文.length === 0) {
        message.正文 = cards.length > 0 ?
          this.取本地化格式($r('app.string.ai_card_generated_summary'), [`${cards.length}`]) :
          this.取本地化格式($r('app.string.ai_agent_changes_generated'), [changes.length]);
        appendAgentTimelineText(message.timeline, 'text', message.正文);
      }
    });
    this.queueAgentTimelineScroll();
  }

  private 影响范围(draft: ChangeDraft): string {
    return this.取本地化格式($r('app.string.ai_agent_impact'), [
      draft.affectedNoteIds.length, draft.affectedCardIds.length,
      draft.affectedDeckIds.length, draft.affectedNotetypeIds.length
    ]);
  }

  private 更新草稿操作(messageIndex: number, draftIndex: number, operationIndex: number, after: string): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      const draft: ChangeDraft = message.变更草稿列表[draftIndex];
      draft.operations[operationIndex].after = after;
      message.变更草稿列表[draftIndex] = draft;
    });
  }

  /** 第一次 UI 事件：重读基线并生成 level-1 短时令牌。 */
  private async 准备执行草稿(messageIndex: number, draftIndex: number): Promise<void> {
    const draft: ChangeDraft = this.消息列表[messageIndex].变更草稿列表[draftIndex];
    try {
      const prepared: PreparedAgentDraft = await this.agentExecutor.prepare(draft);
      if (draft.risk === 'high_risk') {
        this.getUIContext().showAlertDialog({
          title: this.取本地化文案($r('app.string.ai_agent_danger_title')),
          message: `${this.取本地化文案($r('app.string.ai_agent_danger_body'))}\n${this.影响范围(draft)}\n${draft.summary}`,
          autoCancel: false,
          primaryButton: { value: $r('app.string.cancel'), action: (): void => { draft.status = 'pending'; } },
          secondaryButton: {
            value: $r('app.string.continue'), fontColor: $r('app.color.error_text'),
            action: (): void => { this.打开高风险最终确认(messageIndex, draftIndex, prepared); }
          }
        });
      } else {
        this.getUIContext().showAlertDialog({
          title: this.取本地化文案($r('app.string.ai_agent_confirm_title')),
          message: `${this.取本地化文案($r('app.string.ai_agent_confirm_body'))}\n${this.影响范围(draft)}`,
          primaryButton: { value: $r('app.string.cancel'), action: (): void => { draft.status = 'pending'; } },
          secondaryButton: {
            value: $r('app.string.settings_confirm'),
            action: (): void => { this.执行普通草稿(messageIndex, draftIndex, prepared); }
          }
        });
      }
    } catch (error) { this.记录草稿错误(messageIndex, error); }
  }

  /** 第二次、不同的 UI 事件：签发 level-2 令牌后显示永久操作最终确认。 */
  private 打开高风险最终确认(messageIndex: number, draftIndex: number,
    prepared: PreparedAgentDraft): void {
    try {
      const secondToken: AgentConfirmationToken =
        this.agentExecutor.authorizeHighRisk(prepared, prepared.firstToken);
      this.getUIContext().showAlertDialog({
        title: this.取本地化文案($r('app.string.ai_agent_danger_final_title')),
        message: `${this.取本地化文案($r('app.string.ai_agent_danger_final_body'))}\n${this.影响范围(prepared.draft)}`,
        autoCancel: false,
        primaryButton: { value: $r('app.string.cancel'), action: (): void => { prepared.draft.status = 'pending'; } },
        secondaryButton: {
          value: $r('app.string.settings_confirm'), fontColor: $r('app.color.error_text'),
          action: (): void => { this.执行高风险草稿(messageIndex, draftIndex, prepared, secondToken); }
        }
      });
    } catch (error) { this.记录草稿错误(messageIndex, error); }
  }

  private async 执行普通草稿(messageIndex: number, draftIndex: number,
    prepared: PreparedAgentDraft): Promise<void> {
    try {
      const result: AgentDraftExecutionResult =
        await this.agentExecutor.executeOrdinary(prepared, prepared.firstToken);
      this.记录执行结果(messageIndex, draftIndex, result);
    } catch (error) { this.记录草稿错误(messageIndex, error); }
  }

  private async 执行高风险草稿(messageIndex: number, draftIndex: number,
    prepared: PreparedAgentDraft, secondToken: AgentConfirmationToken): Promise<void> {
    try {
      const result: AgentDraftExecutionResult =
        await this.agentExecutor.executeHighRisk(prepared, prepared.firstToken, secondToken);
      this.记录执行结果(messageIndex, draftIndex, result);
    } catch (error) { this.记录草稿错误(messageIndex, error); }
  }

  private 记录执行结果(messageIndex: number, draftIndex: number,
    result: AgentDraftExecutionResult): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      message.批次结果 = this.取本地化格式(
        $r('app.string.ai_agent_execution_result'), [result.succeeded, result.failed, result.status]);
      const original: ChangeDraft = message.变更草稿列表[draftIndex];
      const retry: ChangeDraft | null = buildFailedOperationsRetryDraft(
        original, result, `${original.id}-retry-${Date.now()}`);
      if (retry !== null) {
        message.变更草稿列表[draftIndex] = retry;
      } else {
        original.status = 'completed';
        message.变更草稿列表[draftIndex] = original;
      }
    });
    this.历史执行结果.push({
      draftId: result.draftId, status: result.status,
      succeeded: result.succeeded, failed: result.failed
    });
    this.保存当前会话历史();
    if (result.succeeded > 0) {
      AppStorage.setOrCreate<number>('noteAddedTick', Date.now());
      // 改卡：广播卡片内容变更，让仍留在栈里的学习页重渲染当前卡。
      // 与 noteAddedTick 分开——新建笔记不改变当前卡内容，不该触发学习页重渲染。
      if (this.pageMode === 'edit') {
        AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
      }
    }
  }

  private 记录草稿错误(messageIndex: number, error: Object): void {
    this.更新消息(messageIndex, (message: 聊天消息): void => {
      message.批次结果 = error instanceof Error ? error.message : `${error}`;
    });
  }

  // ========================================================
  // 保存：逐卡 新建笔记 → fields → 添加笔记；单卡失败不中断整批
  // ========================================================

  /** 该消息里还可保存的卡（已勾选且未入库；含失败卡，可重试）。 */
  private 待保存数(消息索引: number): number {
    let 数量: number = 0;
    const 消息: 聊天消息 = this.消息列表[消息索引];
    for (const 卡 of 消息.卡片列表) {
      if (卡.已选中 && 卡.状态 !== 'saved') {
        数量++;
      }
    }
    return 数量;
  }

  /** 保存一张卡。成功返回空串；失败返回本地化错误文案。 */
  private async 保存单卡(fields: string[], deckId: number, notetypeId: number, messages: CardSaveMessages): Promise<string> {
    try {
      const operations: DraftOperation[] = [];
      for (let fieldOrd: number = 0; fieldOrd < fields.length; fieldOrd++) {
        operations.push({
          kind: 'create_note', noteId: 0, cardId: 0, deckId: deckId,
          fieldOrd: fieldOrd, before: '', after: fields[fieldOrd]
        });
      }
      const draft: ChangeDraft = {
        id: `ui-create-${Date.now()}-${Math.random()}`, risk: 'write',
        summary: '用户确认创建可编辑卡片草稿', baselineHash: '', confirmationLevel: 1,
        status: 'pending', affectedNoteIds: [], affectedCardIds: [],
        affectedDeckIds: [deckId], affectedNotetypeIds: [notetypeId],
        operations: operations
      };
      const prepared: PreparedAgentDraft = await this.agentExecutor.prepare(draft);
      const result: AgentDraftExecutionResult = await this.agentExecutor.executeOrdinary(prepared, prepared.firstToken);
      return result.failed === 0 ? '' : messages.failed;
    } catch (错误) {
      if (错误 instanceof 笔记字段校验错误) {
        if (错误.messageKey === 'add_note_empty_error') {
          return messages.empty;
        }
        if (错误.messageKey === 'add_note_duplicate_error') {
          return messages.duplicate;
        }
        // MISSING_CLOZE / NOTETYPE_NOT_CLOZE / FIELD_NOT_CLOZE
        return messages.cloze;
      }
      return messages.failed;
    }
  }

  private async 保存批次(消息索引: number): Promise<void> {
    const message: 聊天消息 = this.消息列表[消息索引];
    if (this.pageDisposed || this.cardBatch.isRunning() || message.批次保存中 ||
      message.draftDeckId === 0 || message.draftNotetypeId === 0 || this.待保存数(消息索引) === 0) return;
    const messages: CardSaveMessages = {
      failed: this.取本地化文案($r('app.string.ai_card_save_failed')),
      empty: this.取本地化文案($r('app.string.add_note_empty_error')),
      duplicate: this.取本地化文案($r('app.string.add_note_duplicate_error')),
      cloze: this.取本地化文案($r('app.string.add_note_cloze_missing'))
    };
    const conversationId: string = this.conversationId;
    const messageId: number = message.id;
    const cards: 卡片草稿[] = message.卡片列表.map((card: 卡片草稿): 卡片草稿 => this.克隆卡片(card));
    this.更新消息(消息索引, (target: 聊天消息): void => { target.批次保存中 = true; });
    try {
      const result: AgentBatchResult = await this.cardBatch.run(cards, message.draftDeckId, message.draftNotetypeId,
        (fields: string[], deckId: number, notetypeId: number): Promise<string> => this.保存单卡(fields, deckId, notetypeId, messages),
        this.取本地化文案($r('app.string.ai_card_save_failed')),
        (cardIndex: number, failure: string): void => {
          const index: number = this.currentMessageIndex(conversationId, messageId);
          if (index < 0) return;
          this.更新消息(index, (target: 聊天消息): void => {
            const card: 卡片草稿 = this.克隆卡片(cards[cardIndex]);
            card.状态 = failure.length === 0 ? 'saved' : 'failed';
            card.失败提示 = failure;
            target.卡片列表[cardIndex] = card;
          });
        });
      if (result.succeeded > 0) AppStorage.setOrCreate<number>('noteAddedTick', Date.now());
      const index: number = this.currentMessageIndex(conversationId, messageId);
      if (index < 0) return;
      const text: string = result.failed === 0 ?
        this.取本地化格式($r('app.string.ai_card_batch_all_ok'), [`${result.succeeded}`]) :
        this.取本地化格式($r('app.string.ai_card_batch_done'), [`${result.succeeded}`, `${result.failed}`]);
      this.更新消息(index, (target: 聊天消息): void => { target.批次结果 = text; });
    } finally {
      const index: number = this.currentMessageIndex(conversationId, messageId);
      if (index >= 0) this.更新消息(index, (target: 聊天消息): void => { target.批次保存中 = false; });
    }
  }

  private currentMessageIndex(conversationId: string, messageId: number): number {
    if (this.pageDisposed || this.conversationId !== conversationId) return -1;
    return this.消息列表.findIndex((message: 聊天消息): boolean => message.id === messageId);
  }

  private saveSessionCheckpoint(): void {
    if (this.checkpointStore === null || this.sessionController === null) { throw new Error('checkpoint_unavailable'); }
    this.checkpointStore.save(this.conversationId, this.sessionController.exportState());
  }

  private async 保存当前会话历史(): Promise<void> {
    try {
      this.saveSessionCheckpoint();
      const history = projectAgentHistory(this.消息列表, this.取本地化文案(this.pageMode === 'create' ?
        $r('app.string.ai_agent_history_create_title') : $r('app.string.ai_agent_history_edit_title')));
      if (history.messages.length === 0) { return; }
      const conversation: AgentConversation = {
        id: this.conversationId, mode: this.pageMode, title: history.title, updatedAt: Date.now(),
        setup: this.taskSetup(),
        messages: history.messages, audits: history.audits, sources: history.sources,
        results: this.历史执行结果.slice()
      };
      await saveAgentConversation(conversation);
    } catch (error) {
      this.错误信息 = this.取本地化文案($r('app.string.ai_agent_checkpoint_failed'));
    }
  }

  /** 加载同模式历史到页面内列表；不再把会话伪装成 ActionMenu 按钮。 */
  private async 打开历史会话(): Promise<void> {
    if (this.pageDisposed || this.处理中 || this.文件解析中 || this.cardBatch.isRunning()) return;
    if (this.显示历史区) {
      this.显示历史区 = false;
      return;
    }
    this.显示历史区 = true;
    const all: AgentConversation[] = await loadAgentConversations();
    if (this.pageDisposed || !this.显示历史区) return;
    const sameMode: AgentConversation[] = [];
    for (const item of all) {
      if (item.mode === this.pageMode) { sameMode.push(item); }
    }
    this.历史会话列表 = sameMode;
  }

  /** 恢复可见历史、协议与检索进度；旧卡片写入令牌不恢复。 */
  private async 恢复历史会话(selected: AgentConversation): Promise<void> {
    if (this.pageDisposed || this.处理中 || this.文件解析中 || this.cardBatch.isRunning()) return;
    const restored: 聊天消息[] = restoreAgentMessages(selected, (): number => this.下一个消息ID(),
      this.取本地化文案($r('app.string.ai_agent_history_unassigned_tools')), !this.simpleMode);
    this.conversationId = selected.id;
    this.历史执行结果 = selected.results.slice();
    this.消息列表 = restored;
    if (this.sessionController !== null) {
      this.sessionController.clear();
      try {
        const state = this.checkpointStore?.load(selected.id);
        if (state !== undefined && state !== null) { this.sessionController.restore(state); }
        const action: AgentAction | null = this.sessionController.getAction();
        for (const message of restored) {
          if (action !== null && message.action?.id === action.id) { message.action = action; }
          else if (message.action?.status === 'pending' || message.action?.status === 'executing') {
            message.action.status = 'cancelled';
          }
        }
        this.消息列表 = restored.slice();
        if (this.sessionController.isPaused()) {
          const pausedMessage: 聊天消息 = this.空消息('ai', '', false);
          pausedMessage.taskStatus = 'paused';
          this.追加消息(pausedMessage);
        }
      } catch (error) { this.错误信息 = this.取本地化文案($r('app.string.ai_agent_checkpoint_failed')); }
    }
    this.显示历史区 = false;
    let validContext: boolean = true;
    if (this.pageMode === 'create') {
      const deckExists: boolean = this.牌组选项.some(
        (item: AI制卡牌组选项): boolean => item.id === selected.setup.deckId);
      const notetypeExists: boolean = this.笔记类型选项.some(
        (item: AI制卡笔记类型选项): boolean => item.id === selected.setup.notetypeId);
      if (!deckExists || !notetypeExists) {
        validContext = false;
        this.牌组ID = deckExists ? selected.setup.deckId : 0;
        this.已选笔记类型ID = 0;
      } else {
        this.牌组ID = selected.setup.deckId;
        await this.加载笔记类型(selected.setup.notetypeId);
        validContext = this.已选笔记类型ID === selected.setup.notetypeId && this.字段名列表.length > 0;
      }
    } else {
      const deckExists: boolean = selected.setup.deckId <= 0 || this.牌组选项.some(
        (item: AI制卡牌组选项): boolean => item.id === selected.setup.deckId);
      const notetypeExists: boolean = selected.setup.notetypeId <= 0 || this.笔记类型选项.some(
        (item: AI制卡笔记类型选项): boolean => item.id === selected.setup.notetypeId);
      this.牌组ID = deckExists ? selected.setup.deckId : 0;
      if (notetypeExists && selected.setup.notetypeId > 0) {
        await this.加载笔记类型(selected.setup.notetypeId);
      } else {
        this.选择笔记类型(0);
      }
    }
    if (!validContext) {
      this.cancelRestoredClarifications(this.取本地化文案(
        this.牌组ID === 0 ? $r('app.string.ai_agent_setup_missing_deck') :
          $r('app.string.ai_agent_setup_missing_notetype')));
    }
    this.滚动到底部();
  }

  private cancelRestoredClarifications(reason: string): void {
    for (let index: number = 0; index < this.消息列表.length; index++) {
      const view: AgentClarificationView | null = this.消息列表[index].clarification;
      if (view !== null && (view.state === 'pending' || view.state === 'submit_failed')) {
        this.更新消息(index, (message: 聊天消息): void => {
          if (message.clarification !== null) {
            message.clarification.state = 'cancelled';
            message.expanded = false;
            message.taskStatus = reason;
          }
        });
      }
    }
  }

  private 开始新会话(): void {
    if (this.pageDisposed || this.处理中 || this.文件解析中 || this.cardBatch.isRunning()) return;
    this.sessionController?.clear();
    this.cancelPendingClarifications();
    this.conversationId = `agent-${Date.now()}-${Math.random()}`;
    this.历史执行结果 = [];
    this.消息列表 = [];
    this.导入文件列表 = [];
    this.显示历史区 = false;
  }

  private async 选择并解析文件(): Promise<void> {
    if (this.处理中 || this.文件解析中 || this.hasPendingClarification() || this.hasPendingAction()) { return; }
    const remaining: number = AGENT_IMPORT_MAX_FILES - this.导入文件列表.length;
    if (remaining <= 0) {
      this.错误信息 = this.取本地化格式($r('app.string.ai_agent_file_max_count'),
        [AGENT_IMPORT_MAX_FILES]);
      return;
    }
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) {
      this.错误信息 = this.取本地化文案($r('app.string.ai_agent_file_picker_failed'));
      return;
    }
    // 文件选择器返回时不恢复 TextArea 焦点，避免导入后主动弹起输入法。
    this.getUIContext().getFocusController().clearFocus();
    const conversationId: string = this.conversationId;
    this.文件解析中 = true;
    try {
      const selected: AgentImportedFile[] = await selectAndParseAgentFiles(context, remaining);
      if (selected.length === 0) { return; }
      if (this.pageDisposed || conversationId !== this.conversationId) return;
      this.导入文件列表 = mergeAgentImportedFiles(this.导入文件列表, selected);
      this.错误信息 = '';
    } catch (error) {
      if (this.pageDisposed || conversationId !== this.conversationId) return;
      this.错误信息 = this.取本地化文案($r('app.string.ai_agent_file_picker_failed'));
    } finally {
      this.文件解析中 = false;
      if (!this.pageDisposed) this.getUIContext().getFocusController().clearFocus();
    }
  }

  private 移除导入文件(index: number): void {
    const next: AgentImportedFile[] = this.导入文件列表.slice();
    next.splice(index, 1);
    this.导入文件列表 = next;
  }

  private 导入文件状态文案(file: AgentImportedFile): string {
    if (file.errorCode.length === 0) {
      const sizeKb: number = Math.max(1, Math.ceil(file.byteSize / 1024));
      if (file.warningCode === 'content_truncated') {
        return this.取本地化格式($r('app.string.ai_agent_file_warning_truncated'), [sizeKb]);
      }
      if (file.warningCode === 'partial_content') {
        return this.取本地化格式($r('app.string.ai_agent_file_warning_partial'), [sizeKb]);
      }
      if (file.warningCode === 'ocr_used') {
        return this.取本地化格式($r('app.string.ai_agent_file_warning_ocr'), [sizeKb]);
      }
      if (file.warningCode === 'plain_text_detected') {
        return this.取本地化格式($r('app.string.ai_agent_file_warning_plain_text'), [sizeKb]);
      }
      return this.取本地化格式($r('app.string.ai_agent_file_ready'), [sizeKb]);
    }
    if (file.errorCode === 'unsupported_type') {
      const extension: string = file.extension.length > 0 ? file.extension :
        this.取本地化文案($r('app.string.ai_agent_file_unknown_type'));
      return this.取本地化格式($r('app.string.ai_agent_file_unsupported'), [extension]);
    }
    if (file.errorCode === 'file_too_large') {
      return this.取本地化文案($r('app.string.ai_agent_file_too_large'));
    }
    if (file.errorCode === 'empty_file') {
      return this.取本地化文案($r('app.string.ai_agent_file_empty'));
    }
    if (file.errorCode === 'encoding_unsupported') {
      return this.取本地化文案($r('app.string.ai_agent_file_encoding'));
    }
    if (file.errorCode === 'binary_content') {
      return this.取本地化文案($r('app.string.ai_agent_file_binary'));
    }
    if (file.errorCode === 'context_limit') {
      return this.取本地化文案($r('app.string.ai_agent_file_context_limit'));
    }
    if (file.errorCode === 'archive_too_large') {
      return this.取本地化文案($r('app.string.ai_agent_file_archive_too_large'));
    }
    if (file.errorCode === 'encrypted_file') {
      return this.取本地化文案($r('app.string.ai_agent_file_encrypted'));
    }
    if (file.errorCode === 'ocr_unavailable') {
      return this.取本地化文案($r('app.string.ai_agent_file_ocr_unavailable'));
    }
    if (file.errorCode === 'no_extractable_text') {
      return this.取本地化文案($r('app.string.ai_agent_file_no_text'));
    }
    if (file.errorCode === 'readerkit_unavailable') {
      return this.取本地化文案($r('app.string.ai_agent_file_readerkit_unavailable'));
    }
    if (file.errorCode === 'legacy_office') {
      return this.取本地化文案($r('app.string.ai_agent_file_legacy_office'));
    }
    if (file.errorCode === 'parse_failed') {
      return this.取本地化文案($r('app.string.ai_agent_file_parse_failed'));
    }
    return this.取本地化文案($r('app.string.ai_agent_file_read_failed'));
  }

  private 删除历史会话(selected: AgentConversation): void {
    this.getUIContext().showAlertDialog({
      title: this.取本地化文案($r('app.string.ai_agent_history_delete_title')),
      message: this.取本地化文案($r('app.string.ai_agent_history_delete_body')),
      primaryButton: { value: $r('app.string.cancel'), action: (): void => {} },
      secondaryButton: {
        value: $r('app.string.settings_confirm'), fontColor: $r('app.color.error_text'),
        action: (): void => {
          this.执行删除历史会话(selected.id);
        }
      }
    });
  }

  private async 执行删除历史会话(id: string): Promise<void> {
    await deleteAgentConversation(id);
    this.checkpointStore?.remove(id);
    this.历史会话列表 = this.历史会话列表.filter(
      (item: AgentConversation): boolean => item.id !== id);
    if (this.conversationId === id) { this.开始新会话(); }
  }

  // ========================================================
  // UI
  // ========================================================

  @Builder
  private 顶部条() {
    Row() {
      Row() {
        按下态按钮({
          文案: $r('app.string.study_back'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => {
            if (this.显示历史区) {
              this.显示历史区 = false;
            } else {
              this.pathStack.pop();
            }
          }
        })
      }
      .width('35%')
      Text(this.显示历史区 ? $r('app.string.ai_agent_history_title') :
        (this.pageMode === 'create' ? $r('app.string.ai_card_title') : $r('app.string.ai_card_edit')))
        .fontSize(应用尺寸.字号_标题)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .width('30%')
        .textAlign(TextAlign.Center)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Row({ space: 应用尺寸.间距_8 }) {
        if (this.显示历史区) {
          按下态按钮({
            文案: $r('app.string.ai_agent_history_new'),
            是否启用: !this.处理中 && !this.文件解析中 && !this.cardBatch.isRunning(),
            字色: this.动作主色,
          themeText: true,
            点击回调: (): void => { this.开始新会话(); }
          })
        } else {
          按下态按钮({
            文案: $r('app.string.ai_agent_history'),
            是否启用: !this.处理中 && !this.文件解析中 && !this.cardBatch.isRunning(),
            字色: $r('app.color.text_primary'),
            点击回调: (): void => {
              if (!this.处理中) { this.打开历史会话(); }
            }
          })
        }
      }
      .width('35%')
      .justifyContent(FlexAlign.End)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
    })
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private 历史区() {
    AgentHistoryList({ conversations: this.历史会话列表, conversationId: this.conversationId,
      onRestore: (item: AgentConversation): void => { this.恢复历史会话(item); },
      onDelete: (item: AgentConversation): void => { this.删除历史会话(item); }
    })
  }

  @Builder
  private 用户气泡(消息索引: number) {
    Row() {
      Blank()
      Text(this.消息列表[消息索引].正文)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.action_on_primary'))
        .backgroundColor(this.主色按钮背景色)
        .borderRadius(应用尺寸.圆角_面板)
        .padding({
          left: 应用尺寸.卡片内边距,
          right: 应用尺寸.卡片内边距,
          top: 应用尺寸.间距_10,
          bottom: 应用尺寸.间距_10
        })
        .constraintSize({ maxWidth: '82%' })
    }
    .width('100%')
  }

  @Builder
  private 卡片项(消息索引: number, 卡片索引: number) {
    AgentEditableCard({ card: this.消息列表[消息索引].卡片列表[卡片索引],
      fieldNames: this.消息列表[消息索引].字段名列表, busy: this.消息列表[消息索引].批次保存中,
      index: 卡片索引, messageId: this.消息列表[消息索引].id,
      onSelected: (selected: boolean): void => { this.更新卡片选中(消息索引, 卡片索引, selected); },
      onField: (index: number, value: string): void => { this.更新卡片字段(消息索引, 卡片索引, index, value); }
    })
  }

  @Builder
  private 变更草稿项(消息索引: number, 草稿索引: number) {
    Column({ space: 应用尺寸.间距_8 }) {
      Text(this.消息列表[消息索引].变更草稿列表[草稿索引].summary)
        .fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium).width('100%')
      Text(this.影响范围(this.消息列表[消息索引].变更草稿列表[草稿索引]))
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      ForEach(this.消息列表[消息索引].变更草稿列表[草稿索引].operations,
        (operation: DraftOperation, operationIndex: number) => {
          Column({ space: 应用尺寸.间距_4 }) {
            Text(this.取本地化格式($r('app.string.ai_agent_operation_target'),
              [operation.kind, operation.noteId, operation.cardId]))
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
            if (operation.kind === 'update_field' &&
              this.消息列表[消息索引].变更草稿列表[草稿索引].risk === 'write') {
              TextArea({ text: operation.after })
                .width('100%').height(72)
                .onChange((value: string): void => {
                  this.更新草稿操作(消息索引, 草稿索引, operationIndex, value);
                })
            } else {
              Text(this.取本地化格式($r('app.string.ai_agent_operation_diff'),
                [operation.before, operation.after]))
                .fontSize(应用尺寸.字号_正文_小).maxLines(6)
                .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
            }
            ForEach(agentDraftOperationImages(this.消息列表[消息索引].变更草稿列表[草稿索引], operationIndex), (url: string) => {
              Image(url).width('100%').height(180).objectFit(ImageFit.Contain)
            }, (url: string): string => url)
          }.width('100%')
        }, (_operation: DraftOperation, operationIndex: number): string => `op-${operationIndex}`)
      Button($r('app.string.ai_agent_draft_apply'))
        .width('100%').height(应用尺寸.按钮高度)
        .fontColor($r('app.color.action_on_primary'))
        .backgroundColor(this.消息列表[消息索引].变更草稿列表[草稿索引].risk === 'high_risk'
          ? $r('app.color.error_text') : this.主色按钮背景色)
        .enabled(this.消息列表[消息索引].变更草稿列表[草稿索引].status === 'pending')
        .onClick((): void => { this.准备执行草稿(消息索引, 草稿索引); })
    }
    .width('100%').padding(应用尺寸.间距_10)
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  private 工具状态文案(status: AgentToolTraceStatus): string {
    if (status === 'awaiting_confirmation') { return this.取本地化文案($r('app.string.ai_agent_tool_awaiting_confirmation')); }
    if (status === 'completed') { return this.取本地化文案($r('app.string.ai_agent_tool_completed')); }
    if (status === 'failed') { return this.取本地化文案($r('app.string.ai_agent_tool_failed')); }
    return this.取本地化文案($r('app.string.ai_agent_tool_started'));
  }

  /** Provider 使用稳定英文 ID；用户界面统一显示详细、可理解的本地化工具名称。 */
  private 工具显示名(toolName: string): string {
    switch (toolName) {
      case 'read_note_field': return this.取本地化文案($r('app.string.ai_agent_tool_read_note_field'));
      case 'configure_create_target': return this.取本地化文案($r('app.string.ai_agent_tool_configure_create_target'));
      case 'search_memory': return this.取本地化文案($r('app.string.ai_agent_tool_search_memory'));
      case 'propose_create_deck': return this.取本地化文案($r('app.string.ai_agent_tool_propose_create_deck'));
      case 'propose_create_note_type': return this.取本地化文案($r('app.string.ai_agent_tool_propose_create_note_type'));
      case 'propose_memory_change': return this.取本地化文案($r('app.string.ai_agent_tool_propose_memory_change'));
      case 'propose_analysis': return this.取本地化文案($r('app.string.ai_agent_tool_propose_analysis'));
      case 'request_clarification': return this.取本地化文案($r('app.string.ai_agent_tool_name_clarify'));
      case 'get_note_type_capabilities': return this.取本地化文案($r('app.string.ai_agent_tool_name_notetype_capabilities'));
      case 'get_note_context': return this.取本地化文案($r('app.string.ai_agent_tool_name_note_context'));
      case 'search_cards': return this.取本地化文案($r('app.string.ai_agent_tool_name_search_cards'));
      case 'search_notes': return this.取本地化文案($r('app.string.ai_agent_tool_name_search_notes'));
      case 'list_decks': return this.取本地化文案($r('app.string.ai_agent_tool_name_list_decks'));
      case 'list_notetypes': return this.取本地化文案($r('app.string.ai_agent_tool_name_list_notetypes'));
      case 'list_tags': return this.取本地化文案($r('app.string.ai_agent_tool_name_list_tags'));
      case 'get_notetype_details': return this.取本地化文案($r('app.string.ai_agent_tool_name_notetype_details'));
      case 'get_card_statistics': return this.取本地化文案($r('app.string.ai_agent_tool_name_card_statistics'));
      case 'search_images': return this.取本地化文案($r('app.string.ai_agent_tool_name_search_images'));
      case 'web_search': return this.取本地化文案($r('app.string.ai_agent_tool_name_web_search'));
      case 'create_flashcards': return this.取本地化文案($r('app.string.ai_agent_tool_name_create_flashcards'));
      case 'propose_update_notes': return this.取本地化文案($r('app.string.ai_agent_tool_name_update_notes'));
      case 'propose_move_cards': return this.取本地化文案($r('app.string.ai_agent_tool_name_move_cards'));
      case 'propose_delete_notes': return this.取本地化文案($r('app.string.ai_agent_tool_name_delete_notes'));
      case 'propose_delete_cards': return this.取本地化文案($r('app.string.ai_agent_tool_name_delete_cards'));
      case 'propose_change_note_type': return this.取本地化文案($r('app.string.ai_agent_tool_name_change_notetype'));
      case 'propose_update_note_type_templates':
        return this.取本地化文案($r('app.string.ai_agent_tool_name_update_templates'));
      case 'propose_delete_deck': return this.取本地化文案($r('app.string.ai_agent_tool_name_delete_deck'));
      case 'propose_delete_note_type': return this.取本地化文案($r('app.string.ai_agent_tool_name_delete_notetype'));
      default: return toolName;
    }
  }

  /** 模式只决定详情默认展开程度，不改变模型、工具权限或确认规则。 */
  private applyToolPresentationMode(): void {
    this.消息列表 = this.消息列表.map((message: 聊天消息): 聊天消息 => {
      const next: 聊天消息 = this.克隆消息(message);
      for (const trace of next.工具过程) { trace.expanded = !this.simpleMode; }
      return next;
    });
  }

  private 切换工具详情(消息索引: number, 追踪索引: number): void {
    this.更新消息(消息索引, (消息: 聊天消息): void => {
      if (追踪索引 >= 0 && 追踪索引 < 消息.工具过程.length) {
        消息.工具过程[追踪索引].expanded = !消息.工具过程[追踪索引].expanded;
      }
    });
  }

  @Builder
  private 工具过程项(消息索引: number, 追踪索引: number) {
    AgentDisclosureCard({
      title: this.取本地化格式($r('app.string.ai_agent_tool_round'), [
          this.消息列表[消息索引].工具过程[追踪索引].providerRound,
          this.消息列表[消息索引].工具过程[追踪索引].sequence
        ]) + ` · ${this.工具显示名(this.消息列表[消息索引].工具过程[追踪索引].toolName)}`,
      status: this.工具状态文案(this.消息列表[消息索引].工具过程[追踪索引].status),
      showStatus: true,
      expanded: this.消息列表[消息索引].工具过程[追踪索引].expanded,
      toggleLocked: false,
      onToggle: (): void => { this.切换工具详情(消息索引, 追踪索引); },
      content: (): void => { this.工具详情内容(消息索引, 追踪索引); }
    })
  }

  @Builder
  private 工具详情内容(消息索引: number, 追踪索引: number) {
        if (this.消息列表[消息索引].工具过程[追踪索引].legacySummary.length > 0) {
          Text(this.消息列表[消息索引].工具过程[追踪索引].legacySummary)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
        }
        Text($r('app.string.ai_agent_tool_arguments'))
          .fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium).width('100%')
        Text(this.消息列表[消息索引].工具过程[追踪索引].argumentsJson.length > 0 ?
          this.消息列表[消息索引].工具过程[追踪索引].argumentsJson : '—')
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
        if (this.消息列表[消息索引].工具过程[追踪索引].outputJson.length > 0) {
          Text($r('app.string.ai_agent_tool_output'))
            .fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium).width('100%')
          Text(this.消息列表[消息索引].工具过程[追踪索引].outputJson)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
        }
        if (this.消息列表[消息索引].工具过程[追踪索引].errorCode.length > 0) {
          Text(`${this.取本地化文案($r('app.string.ai_agent_tool_error_code'))}: ` +
            `${this.消息列表[消息索引].工具过程[追踪索引].errorCode}`)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
          Text(`${this.取本地化文案($r('app.string.ai_agent_tool_error_path'))}: ` +
            `${this.消息列表[消息索引].工具过程[追踪索引].errorPath || '—'}`)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
          if (this.消息列表[消息索引].工具过程[追踪索引].errorMessage.length > 0) {
            Text(this.消息列表[消息索引].工具过程[追踪索引].errorMessage)
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
          }
          Text(`${this.取本地化文案($r('app.string.ai_agent_tool_received_keys'))}: ` +
            `${JSON.stringify(this.消息列表[消息索引].工具过程[追踪索引].receivedKeys)}`)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          Text(`${this.取本地化文案($r('app.string.ai_agent_tool_allowed_keys'))}: ` +
            `${JSON.stringify(this.消息列表[消息索引].工具过程[追踪索引].allowedKeys)}`)
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          if (this.消息列表[消息索引].工具过程[追踪索引].validTemplateJson.length > 0) {
            Text($r('app.string.ai_agent_tool_template'))
              .fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium).width('100%')
            Text(this.消息列表[消息索引].工具过程[追踪索引].validTemplateJson)
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          }
          Text(this.取本地化格式($r('app.string.ai_agent_tool_repeat_count'),
            [this.消息列表[消息索引].工具过程[追踪索引].repeatCount]))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary')).width('100%')
        }
        if (this.消息列表[消息索引].工具过程[追踪索引].argumentsTruncated ||
          this.消息列表[消息索引].工具过程[追踪索引].outputTruncated ||
          this.消息列表[消息索引].工具过程[追踪索引].diagnosticTruncated) {
          Text($r('app.string.ai_agent_tool_truncated'))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary')).width('100%')
        }
  }

  /** 有真实思考、工具或正文时保留回复；澄清工具与下一条问题消息分别呈现。 */
  private hasVisibleAssistantContent(message: 聊天消息): boolean {
    return message.timeline.length > 0 || message.正文.length > 0 || message.推理摘要.length > 0 ||
      message.来源列表.length > 0 || message.卡片列表.length > 0 ||
      message.变更草稿列表.length > 0 || message.action !== null ||
      message.taskStatus === 'paused' || message.批次结果.length > 0 ||
      message.工具过程.length > 0;
  }

  /** 图片和文字按正文中的位置交替展示。 */
  @Builder
  private orderedAgentText(text: string) {
    ForEach(agentContentParts(text), (part: AgentContentPart) => {
      if (part.kind === 'image') {
        Image(part.text).width('100%').height(180).objectFit(ImageFit.Contain)
      } else {
        Text() {
          ForEach(parseAgentBoldRuns(part.text), (run: AgentTextRun) => {
            Span(run.text).fontWeight(run.bold ? FontWeight.Bold : FontWeight.Normal)
          })
        }.width('100%').fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
      }
    }, (part: AgentContentPart, index: number): string => `${index}-${part.kind}-${part.text.length}`)
  }

  /** 引用当前消息状态，工具状态变化不会把工具或后续内容挪到另一组。 */
  @Builder
  private agentTimelineItem(messageIndex: number, blockIndex: number) {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.消息列表[messageIndex].timeline[blockIndex].kind === 'tool') {
        if (this.消息列表[messageIndex].timeline[blockIndex].index >= 0) {
          this.工具过程项(messageIndex, this.消息列表[messageIndex].timeline[blockIndex].index)
        } else {
          Text(this.工具显示名(this.消息列表[messageIndex].timeline[blockIndex].toolName))
            .fontWeight(FontWeight.Medium).width('100%')
          Text(this.消息列表[messageIndex].streaming ? $r('app.string.ai_agent_draft_streaming') : $r('app.string.ai_agent_preview_only'))
            .fontColor($r('app.color.text_secondary')).width('100%')
        }
        if (this.消息列表[messageIndex].timeline[blockIndex].text.length > 0) {
          this.orderedAgentText(this.消息列表[messageIndex].timeline[blockIndex].text)
        }
      } else if (this.消息列表[messageIndex].timeline[blockIndex].kind === 'draft') {
        if (this.消息列表[messageIndex].timeline[blockIndex].indexes.length > 0) {
          Text(this.消息列表[messageIndex].draftTargetLabel).fontColor($r('app.color.text_secondary'))
          ForEach(this.消息列表[messageIndex].timeline[blockIndex].indexes, (cardIndex: number) => {
            this.卡片项(messageIndex, cardIndex)
          }, (cardIndex: number): string => `card-${cardIndex}`)
        } else if (this.消息列表[messageIndex].timeline[blockIndex].index >= 0) {
          this.变更草稿项(messageIndex, this.消息列表[messageIndex].timeline[blockIndex].index)
        } else {
          Text(this.消息列表[messageIndex].streaming ? $r('app.string.ai_agent_draft_streaming') : $r('app.string.ai_agent_preview_only'))
            .fontColor($r('app.color.text_secondary')).width('100%')
          this.orderedAgentText(this.消息列表[messageIndex].timeline[blockIndex].text)
        }
        ForEach(this.消息列表[messageIndex].timeline[blockIndex].images, (url: string) => {
          Image(url).width('100%').height(180).objectFit(ImageFit.Contain)
        }, (url: string): string => url)
      } else if (this.消息列表[messageIndex].timeline[blockIndex].kind === 'reasoning' ||
        this.消息列表[messageIndex].timeline[blockIndex].kind === 'summary') {
        Text(this.消息列表[messageIndex].timeline[blockIndex].kind === 'summary' ?
          $r('app.string.ai_agent_reasoning_summary') : $r('app.string.ai_agent_reasoning_process'))
          .fontWeight(FontWeight.Medium).width('100%')
        this.orderedAgentText(this.消息列表[messageIndex].timeline[blockIndex].text)
      } else {
        this.orderedAgentText(this.消息列表[messageIndex].timeline[blockIndex].text)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  /** 流式预览按版本刷新，已定稿的可编辑卡片保持稳定身份。 */
  private agentTimelineKey(messageIndex: number, block: AgentTimelineBlock): string {
    const trace: AgentToolTrace | undefined = block.kind === 'tool' && block.index >= 0 ?
      this.消息列表[messageIndex].工具过程[block.index] : undefined;
    return `${block.id}-${block.text.length}-${block.index}-${block.indexes.length}-${block.images.length}-${this.消息列表[messageIndex].streaming}-` +
      (trace === undefined ? '' : `${trace.status}-${trace.expanded}`);
  }

  @Builder
  private AI气泡(消息索引: number) {
    Row() {
      Column({ space: 应用尺寸.间距_10 }) {
        ForEach(this.消息列表[消息索引].timeline, (_block: AgentTimelineBlock, index: number) => {
          this.agentTimelineItem(消息索引, index)
        }, (block: AgentTimelineBlock): string => this.agentTimelineKey(消息索引, block))
        if (this.消息列表[消息索引].timelineTruncated) {
          Text($r('app.string.ai_agent_history_timeline_truncated'))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary')).width('100%')
        }
        if (this.消息列表[消息索引].timeline.length === 0) {
        if (this.消息列表[消息索引].推理摘要 !== '') {
          Text(this.消息列表[消息索引].reasoningIsSummary ? $r('app.string.ai_agent_reasoning_summary') : $r('app.string.ai_agent_reasoning_process'))
            .fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium)
          Text() {
            ForEach(parseAgentBoldRuns(this.消息列表[消息索引].推理摘要), (run: AgentTextRun) => {
              Span(run.text).fontWeight(run.bold ? FontWeight.Bold : FontWeight.Normal)
            })
          }
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary'))
          if (this.消息列表[消息索引].reasoningTruncated) {
            Text($r('app.string.ai_agent_history_reasoning_truncated'))
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary'))
          }
        }
        Text() {
          ForEach(parseAgentBoldRuns(this.消息列表[消息索引].正文), (run: AgentTextRun) => {
            Span(run.text).fontWeight(run.bold ? FontWeight.Bold : FontWeight.Normal)
          })
        }
          .fontSize(应用尺寸.字号_正文)
          .fontColor(this.消息列表[消息索引].是否错误
            ? $r('app.color.error_text') : $r('app.color.text_primary'))
          .width('100%')

        if (this.消息列表[消息索引].工具过程.length > 0) {
          Text($r('app.string.ai_agent_tool_process')).fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium)
          ForEach(this.消息列表[消息索引].工具过程, (_trace: AgentToolTrace, index: number) => {
            this.工具过程项(消息索引, index)
          }, (trace: AgentToolTrace, index: number): string => `${index}-${trace.callId}-${trace.status}`)
        }
        if (this.消息列表[消息索引].来源列表.length > 0) {
          Text($r('app.string.ai_agent_sources')).fontSize(应用尺寸.字号_正文_小).fontWeight(FontWeight.Medium)
          ForEach(this.消息列表[消息索引].来源列表, (source: SearchSource) => {
            Text() { ThemeTextSpans(`${source.title}\n${source.url}`, this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_正文_小)
              .fontColor(this.动作主色).width('100%')
          }, (source: SearchSource): string => source.url)
        }
        }

        if (this.消息列表[消息索引].action !== null) {
          AgentActionCard({ action: this.消息列表[消息索引].action!, disabled: this.处理中,
            onConfirm: (): void => { this.resolveAction(消息索引, true); },
            onCancel: (): void => { this.resolveAction(消息索引, false); } })
        }
        if (this.消息列表[消息索引].taskStatus === 'paused') {
          Text($r('app.string.ai_agent_task_paused'))
          Button($r('app.string.ai_agent_task_resume')).enabled(!this.处理中)
            .height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_按钮)
            .backgroundColor(this.主色按钮背景色).fontColor($r('app.color.action_on_primary'))
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick((): void => { this.resumePausedTask(消息索引); })
        }
        if (this.消息列表[消息索引].timeline.length === 0 && this.消息列表[消息索引].卡片列表.length > 0) {
          Text(this.消息列表[消息索引].draftTargetLabel).fontColor($r('app.color.text_secondary'))
        }
        if (this.消息列表[消息索引].timeline.length === 0 && this.消息列表[消息索引].卡片列表.length > 0) {
          ForEach(this.消息列表[消息索引].卡片列表,
            (卡: 卡片草稿, 卡片索引: number) => {
              this.卡片项(消息索引, 卡片索引)
            }, (卡: 卡片草稿, 卡片索引: number): string => `card-${卡片索引}`)
        }

        if (this.消息列表[消息索引].timeline.length === 0 && this.消息列表[消息索引].变更草稿列表.length > 0) {
          ForEach(this.消息列表[消息索引].变更草稿列表,
            (_draft: ChangeDraft, draftIndex: number) => {
              this.变更草稿项(消息索引, draftIndex)
            }, (draft: ChangeDraft): string => draft.id)
        }

        // 保存操作：本批次保存选中卡片
        if (this.消息列表[消息索引].卡片列表.length > 0) {
          Button(this.消息列表[消息索引].批次保存中
            ? $r('app.string.ai_card_saving_cards')
            : (this.待保存数(消息索引) > 0
              ? this.取本地化格式($r('app.string.ai_card_save_selected_count'),
                [`${this.待保存数(消息索引)}`])
              : $r('app.string.ai_card_save_selected')))
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.action_on_primary'))
            .backgroundColor(this.主色按钮背景色)
            .borderRadius(应用尺寸.圆角_胶囊)
            .enabled(this.待保存数(消息索引) > 0 && !this.消息列表[消息索引].批次保存中)
            .onClick((): void => {
              this.保存批次(消息索引);
            })
        }

        if (this.消息列表[消息索引].批次结果 !== '') {
          Text() { ThemeTextSpans(this.消息列表[消息索引].批次结果, this.themeAccentColors, this.getUIContext()) }
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.动作主色)
            .width('100%')
        }

        // 每轮 AI 回复末尾固定挂 AI 生成免责声明（覆盖思考/正文/工具/来源/草稿整轮产物）
        Text($r('app.string.ai_agent_generated_disclaimer'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .padding({ top: 应用尺寸.间距_4 })
      }
      .alignItems(HorizontalAlign.Start)
      .backgroundColor($r('app.color.surface_card'))
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
      .borderRadius(应用尺寸.圆角_面板)
      .padding(应用尺寸.卡片内边距)
      // 占满消息区宽度：左右边距对称（均为 卡片内边距），且内嵌卡片 width('100%')
      // 以此为确定的父宽解析，不会再超出气泡右边界。
      .width('100%')
    }
    .width('100%')
  }

  @Builder
  private clarificationBubble(messageIndex: number) {
    if (this.消息列表[messageIndex].clarification !== null) {
      AgentClarificationCard({
        clarification: this.消息列表[messageIndex].clarification!,
        noticeText: this.消息列表[messageIndex].taskStatus,
        onOptionSelected: (id: string): void => { this.selectClarificationOption(messageIndex, id); },
        onSupplementChanged: (value: string): void => {
          this.updateClarificationSupplement(messageIndex, value);
        },
        onContinue: (): void => { this.continueClarification(messageIndex); }
      })
    }
  }

  @Builder
  private 消息流() {
    Scroll(this.聊天滚动器) {
      Column({ space: 应用尺寸.pageSectionGap }) {
        if (this.hasFixedEditSelection()) {
          if (this.消息列表.length === 0) {
            Text(this.selectedEditContext())
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding({ top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_12 })
          }
        } else {
          AgentSetupCard({
            mode: this.pageMode,
            setup: this.taskSetup(),
            deckOptions: this.牌组选项,
            notetypeOptions: this.笔记类型选项,
            editContext: this.editSetupContext(),
            allDecksLabel: this.取本地化文案($r('app.string.ai_agent_edit_all_decks')),
            allNotetypesLabel: this.取本地化文案($r('app.string.ai_agent_edit_all_notetypes')),
            disabled: this.处理中 || this.hasPendingClarification(),
            onDeckSelected: (id: number): void => {
              this.selectDeckWithPreference(id);
              this.错误信息 = '';
            },
            onNotetypeSelected: (id: number): void => { this.selectNotetypeWithPreference(id); }
          })
        }
        ForEach(this.消息列表, (消息: 聊天消息, 消息索引: number) => {
          if (this.消息列表[消息索引].角色 === 'user') {
            this.用户气泡(消息索引)
          } else if (this.消息列表[消息索引].kind === 'clarification') {
            this.clarificationBubble(消息索引)
          } else if (this.hasVisibleAssistantContent(this.消息列表[消息索引])) {
            this.AI气泡(消息索引)
          }
        }, (消息: 聊天消息): string => `msg-${消息.id}`)
      }
      .width('100%')
      .onAreaChange((oldArea: Area, newArea: Area): void => {
        if (oldArea.height !== newArea.height) { this.queueAgentTimelineScroll(); }
      })
      .padding({
        left: 应用尺寸.页面内边距_水平,
        right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageContentTopInset,
        bottom: 应用尺寸.pageBottomInset
      })
    }
    .layoutWeight(1)
    .width('100%')
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
    .align(Alignment.Top)
    .onDidScroll((_xOffset: number, yOffset: number, state: ScrollState): void => {
      if (state !== ScrollState.Idle) {
        if (yOffset < 0) { this.followAgentTail = false; }
        else if (this.聊天滚动器.isAtEnd()) { this.followAgentTail = true; }
      }
    })
  }

  @Builder
  private 输入区() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.导入文件列表.length > 0) {
        Scroll() {
          Column({ space: 应用尺寸.间距_5 }) {
            ForEach(this.导入文件列表, (file: AgentImportedFile, index: number) => {
              Row({ space: 应用尺寸.间距_8 }) {
                Column({ space: 2 }) {
                  Text(file.name)
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_primary'))
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                    .width('100%')
                  Text(this.导入文件状态文案(file))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor(file.errorCode.length === 0 ?
                      $r('app.color.text_secondary') : $r('app.color.error_text'))
                    .maxLines(2)
                    .width('100%')
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)
                Button() {
                  Text() { ThemeTextSpans($r('app.string.ai_agent_file_remove'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_正文_小).fontColor(this.动作主色)
                }
                  .height(32)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor(this.动作主色)
                  .backgroundColor(Color.Transparent)
                  .onClick((): void => { this.移除导入文件(index); })
              }
              .width('100%')
              .padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_5, top: 4, bottom: 4 })
              .backgroundColor($r('app.color.surface_card'))
              .borderRadius(应用尺寸.圆角_卡片)
            }, (file: AgentImportedFile): string => file.id)
          }
          .width('100%')
        }
        .width('100%')
        .constraintSize({ maxHeight: 156 })
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }

      Row({ space: 应用尺寸.间距_10 }) {
        TextArea({
          placeholder: $r('app.string.ai_card_input_hint'),
          text: this.输入草稿
        })
          .width('100%')
          .layoutWeight(1)
          .height(应用尺寸.按钮高度 * 2 + 应用尺寸.间距_8)
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .placeholderColor($r('app.color.text_tertiary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
          .borderRadius(应用尺寸.圆角_面板)
          .padding(应用尺寸.间距_10)
          .enabled(!this.处理中 && !this.hasPendingClarification())
          .onChange((值: string): void => {
            this.输入草稿 = 值;
          })
        Column({ space: 应用尺寸.间距_8 }) {
          Button() {
            Stack() {
              // 两条文案都常驻布局、只切透明度：解析态显示「…」（窄于「导入」），
              // 按钮宽度恒为「导入」两字，与右侧发送按钮等宽，解析切换不抖动。
              Text() { ThemeTextSpans($r('app.string.ai_agent_import_files'), this.themeAccentColors, this.getUIContext()) }
                .fontSize(应用尺寸.字号_按钮)
                .fontColor(this.动作主色)
                .opacity(this.文件解析中 ? 0 : 1)
              Text() { ThemeTextSpans($r('app.string.ai_agent_file_parsing'), this.themeAccentColors, this.getUIContext()) }
                .fontSize(应用尺寸.字号_按钮)
                .fontColor(this.动作主色)
                .opacity(this.文件解析中 ? 1 : 0)
            }
            .alignContent(Alignment.Center)
          }
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .constraintSize({ minWidth: 0 })
            .fontSize(应用尺寸.字号_按钮)
            .fontColor(this.动作主色)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_胶囊)
            .enabled(!this.处理中 && !this.文件解析中 && !this.hasPendingClarification())
            .onClick((): void => { this.选择并解析文件(); })
          Button(this.处理中 ? $r('app.string.ai_agent_cancel') : $r('app.string.ai_card_send'))
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .constraintSize({ minWidth: 0 })
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.action_on_primary'))
            .backgroundColor(this.处理中 ? this.主色按钮按下色 : this.主色按钮背景色)
            .borderRadius(应用尺寸.圆角_胶囊)
            .enabled(this.处理中 || this.canSubmit())
            .onClick((): void => {
              if (this.处理中) { this.取消当前请求(); }
              else { this.发送(); }
            })
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
    }
    .width('100%')
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.间距_8,
      bottom: 应用尺寸.间距_8 + this.导航条高度
    })
  }

  build() {
    NavDestination() {
      Column() {
        this.顶部条()
        if (this.显示历史区) {
          this.历史区()
        } else {
          this.消息流()
          if (this.错误信息 !== '') {
            Text(this.错误信息)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.error_text'))
              .width('100%')
              .maxLines(3)
              .padding({
                left: 应用尺寸.页面内边距_水平,
                right: 应用尺寸.页面内边距_水平
              })
          }
          this.输入区()
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.页面底色微染值)
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .opacity(this.转场透明度)
  }
}
