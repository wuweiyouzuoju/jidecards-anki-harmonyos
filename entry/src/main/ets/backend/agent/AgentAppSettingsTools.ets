// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentSettingDefinitions, decodeSettingsArguments, requestedThemeMode } from '../../model/agent/AgentSettingsTools';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { isAppThemeMode } from '../../model/settings/ThemeModeSession';
import { AgentToolSchemaError } from '../../model/agent/AgentToolSchemas';
import type { DecodedSettingsArguments, AgentSettingChange } from '../../model/agent/AgentSettingsTools';
import { createAgentAction } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';
import type { ThemeId } from '../../model/ThemeCatalog';
import { THEME_CATALOG, UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../../model/ThemeCatalog';
import type { ThemeDefinition } from '../../model/ThemeCatalog';
import { agentPreferenceDefinitions } from '../../model/agent/AgentPreferenceSettings';
import type { AgentPreferenceDefinition } from '../../model/agent/AgentPreferenceSettings';
import { buildAgentDeckSettings } from '../../model/agent/AgentDeckSettings';
import type { AgentDeckSettings, AgentDeckSettingsView } from '../../model/agent/AgentDeckSettings';
import { readAgentPreference } from './AgentPreferenceReader';
import type { AgentPreferenceState } from './AgentPreferenceReader';
import { 当前语言模式 } from '../../model/语言存储';
import { readSavedStudyQuickAnswerMode } from '../../model/实验性功能存储';
import { 统计服务 } from '../统计服务';
import type { GraphPreferences } from '../../proto/messages/StatsMessages';
import { isThemeId } from '../../model/settings/ThemeColorSession';
import type { ThemeColorSession } from '../../model/settings/ThemeColorSession';
import { readFsrsEnabled } from '../../model/FSRS控制器';
import type { AppThemeMode, ThemeModeChange, ThemeModeSession } from '../../model/settings/ThemeModeSession';
import type { DeckConfigsForUpdateView, DeckConfigWithUseCount, DeckLimits } from '../../proto/messages/DeckConfigMessages';
import { appThemeSession, appThemeColorSession } from '../AppThemeService';
import { 牌组配置服务 } from '../牌组配置服务';
import { AgentScope } from './AgentScope';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler, AgentSettingToolHandler, AgentActionToolHandler } from './AgentToolRegistry';
import { common } from '@kit.AbilityKit';
import type { ProviderFunctionTool } from '../../model/agent/ProviderProtocol';
import { buildAgentAppStructure } from '../../model/agent/AgentAppStructure';
import type { AgentNavigationReadiness } from '../../model/agent/AgentAppNavigation';
import { appInterface } from '../AppInterfaceService';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY, CLOUD_DECK_CHANNEL_ENABLED } from '../../model/ReleaseFeatures';
import { themeDefinition } from '../../model/ThemeCatalog';

interface SettingsReadResult {
  requestedIds: string[];
  scope: string;
  themeMode?: AppThemeMode;
  systemDark?: boolean;
  effectiveDark?: boolean;
  activeMode?: AppThemeMode;
  colorTheme?: ThemeId;
  activeColorTheme?: ThemeId;
  fsrsEnabled?: boolean;
  preferences?: AgentPreferenceState[];
  language?: string;
  studyQuickAnswer?: number;
  graphPreferences?: GraphPreferences;
}

interface AgentThemeColorView { id: string; seed: string; available: boolean; }

interface DeckOptionsResult {
  deckId: number; deckName: string; presetId: number; presetName: string; presetUseCount: number;
  newPerDay: number; reviewsPerDay: number; learnStepsMinutes: number[];
  limits: DeckLimits | null; parentPresetIds: number[]; fsrs: boolean; applyAllParentLimits: boolean;
  newCardsIgnoreReviewLimit: boolean;
  settings: AgentDeckSettings; truncatedFields: string[];
}

class SettingsReadHandler implements AgentReadToolHandler {
  private readonly owner: AgentAppSettingsTools;
  private readonly name: string;
  constructor(owner: AgentAppSettingsTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 严格读取失败交 Registry/Runner 返回工具错误，不伪造默认值。 */
  execute(json: string): Promise<string> { return this.owner.read(this.name, json); }
}
class ThemeSettingHandler implements AgentSettingToolHandler {
  private readonly owner: AgentAppSettingsTools;
  constructor(owner: AgentAppSettingsTools) { this.owner = owner; }
  execute(json: string): Promise<string> { return this.owner.setTheme(json); }
}
class SettingsActionHandler implements AgentActionToolHandler {
  private readonly owner: AgentAppSettingsTools;
  private readonly name: string;
  constructor(owner: AgentAppSettingsTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 校验或读取失败交 Registry/Runner，不生成可确认动作。 */
  propose(json: string): Promise<AgentAction> { return this.owner.propose(this.name, json); }
}

/** 可逆设置独立授权；不接触卡库写入执行器，许可不进入历史。 */
export class AgentAppSettingsTools {
  private readonly scope: AgentScope;
  private readonly themes: ThemeModeSession;
  private readonly colors: ThemeColorSession;
  private readonly options: 牌组配置服务 = new 牌组配置服务();
  private readonly onThemeChange: (change: ThemeModeChange) => void;
  private allowedMode: AppThemeMode | null = null;
  private interfaceTools: ProviderFunctionTool[] = [];
  private navigationReadiness: () => AgentNavigationReadiness[] = (): AgentNavigationReadiness[] => [];

  setInterfaceTools(tools: ProviderFunctionTool[]): void { this.interfaceTools = tools.slice(); }
  setNavigationReadiness(read: () => AgentNavigationReadiness[]): void { this.navigationReadiness = read; }

  constructor(scope: AgentScope, onThemeChange: (change: ThemeModeChange) => void,
    themes: ThemeModeSession = appThemeSession, colors: ThemeColorSession = appThemeColorSession) {
    this.scope = scope; this.themes = themes; this.colors = colors; this.onThemeChange = onThemeChange;
  }

  beginTurn(userText: string): void { this.allowedMode = requestedThemeMode(userText); }
  endTurn(): void { this.allowedMode = null; }

  register(registry: AgentToolRegistry): void {
    registry.registerRead('get_app_structure', new SettingsReadHandler(this, 'get_app_structure'));
    registry.registerRead('list_settings', new SettingsReadHandler(this, 'list_settings'));
    registry.registerRead('get_settings', new SettingsReadHandler(this, 'get_settings'));
    registry.registerRead('get_deck_options', new SettingsReadHandler(this, 'get_deck_options'));
    registry.registerRead('list_theme_colors', new SettingsReadHandler(this, 'list_theme_colors'));
    registry.registerSetting('set_theme_mode', new ThemeSettingHandler(this));
    registry.registerAction('propose_set_theme_color', new SettingsActionHandler(this, 'propose_set_theme_color'));
    registry.registerAction('propose_set_fsrs', new SettingsActionHandler(this, 'propose_set_fsrs'));
    registry.registerAction('propose_set_setting', new SettingsActionHandler(this, 'propose_set_setting'));
  }

  /** @throws {Error} 真实状态不可读时由 Runner 记录工具错误，保持未读取状态。 */
  async read(name: string, json: string): Promise<string> {
    const args: DecodedSettingsArguments = this.decode(name, json);
    if (name === 'get_app_structure') {
      const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
      if (context === undefined) throw new Error('ability_context_unavailable');
      const simple: boolean | undefined = AppStorage.get<boolean>('simpleMode');
      const activeColor: string | undefined = AppStorage.get<string>('colorTheme');
      if (activeColor === undefined || !isThemeId(activeColor)) throw new Error('active_theme_color_unavailable');
      const savedSimple: boolean = simple === undefined ? (await readAgentPreference('simple_mode')).value === true : simple;
      return JSON.stringify(buildAgentAppStructure({ simple: savedSimple,
        agent: AppStorage.get<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY) ?? false,
        cloudDeck: CLOUD_DECK_CHANNEL_ENABLED, themeHasTextures: themeDefinition(activeColor).backgroundTextures.length > 0 },
        args.surface, args.sectionId, (key: string): string => context.resourceManager.getStringByNameSync(key),
        agentSettingDefinitions(), this.interfaceTools, appInterface.snapshot(),
        AppStorage.get<boolean>(APP_FOREGROUND_KEY) === false ? '' : appInterface.currentPage(),
        appInterface.currentContextPage(), this.navigationReadiness()));
    }
    if (name === 'list_settings') { return JSON.stringify({ settings: agentSettingDefinitions() }); }
    if (name === 'list_theme_colors') {
      const contents: string[] = AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [];
      const colors: AgentThemeColorView[] = THEME_CATALOG.map((theme: ThemeDefinition): AgentThemeColorView =>
        ({ id: theme.id, seed: theme.seed, available: isThemeAvailable(theme.id, contents) }));
      return JSON.stringify({ colors: colors });
    }
    if (name === 'get_settings') {
      const collectionIds: string[] = ['fsrs_enabled', 'graph_preferences'];
      const collection: number = args.ids.filter((id: string): boolean => collectionIds.includes(id)).length;
      const result: SettingsReadResult = { requestedIds: args.ids,
        scope: collection === 0 ? 'device' : (collection === args.ids.length ? 'collection' : 'device_and_collection') };
      if (args.ids.includes('theme_mode') || args.ids.includes('system_dark')) {
        const state = await this.themes.read();
        const active: string | undefined = AppStorage.get<string>('themeMode');
        if (active === undefined || !isAppThemeMode(active)) { throw new Error('active_theme_unavailable'); }
        result.themeMode = state.mode; result.systemDark = state.systemDark;
        result.effectiveDark = active === 'dark' || (active === 'system' && state.systemDark);
        result.activeMode = active as AppThemeMode;
      }
      if (args.ids.includes('color_theme')) {
        result.colorTheme = await this.colors.read();
        const active: string | undefined = AppStorage.get<string>('colorTheme');
        if (active === undefined || !isThemeId(active)) { throw new Error('active_theme_color_unavailable'); }
        result.activeColorTheme = active as ThemeId;
      }
      if (args.ids.includes('fsrs_enabled')) { result.fsrsEnabled = await readFsrsEnabled(); }
      if (args.ids.includes('language')) { result.language = 当前语言模式(); }
      if (args.ids.includes('study_quick_answer')) { result.studyQuickAnswer = await readSavedStudyQuickAnswerMode(); }
      if (args.ids.includes('graph_preferences')) { result.graphPreferences = await new 统计服务().获取图表偏好(); }
      const preferenceIds: string[] = agentPreferenceDefinitions().map((item: AgentPreferenceDefinition): string => item.id);
      for (const id of args.ids) {
        if (preferenceIds.includes(id)) {
          if (result.preferences === undefined) { result.preferences = []; }
          result.preferences.push(await readAgentPreference(id));
        }
      }
      return JSON.stringify(result);
    }
    if (name !== 'get_deck_options') { throw new Error('tool_unavailable'); }
    this.scope.assertReadableDeckIds([args.deckId]);
    const view: DeckConfigsForUpdateView = await this.options.获取牌组配置编辑视图(args.deckId);
    if (view.currentDeck === null) { throw new Error('deck_options_unavailable'); }
    const preset: DeckConfigWithUseCount | undefined = view.allConfigs.find(
      (item: DeckConfigWithUseCount): boolean => item.config.id === view.currentDeck?.configId);
    if (preset === undefined || preset.config.config === null) { throw new Error('deck_preset_unavailable'); }
    const settings: AgentDeckSettingsView = buildAgentDeckSettings(preset.config.config);
    const result: DeckOptionsResult = { deckId: args.deckId, deckName: view.currentDeck.name,
      presetId: preset.config.id, presetName: preset.config.name, presetUseCount: preset.useCount,
      newPerDay: preset.config.config.newPerDay, reviewsPerDay: preset.config.config.reviewsPerDay,
      learnStepsMinutes: settings.settings.learnSteps.slice(), limits: view.currentDeck.limits,
      parentPresetIds: view.currentDeck.parentConfigIds.slice(), fsrs: view.fsrs,
      applyAllParentLimits: view.applyAllParentLimits, newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit, settings: settings.settings, truncatedFields: settings.truncatedFields };
    return JSON.stringify(result);
  }

  async setTheme(json: string): Promise<string> {
    const args: DecodedSettingsArguments = this.decode('set_theme_mode', json);
    if (this.allowedMode === null || args.mode !== this.allowedMode) { throw new Error('theme_user_command_required'); }
    this.allowedMode = null;
    const change: ThemeModeChange = await this.themes.setMode(args.mode);
    this.onThemeChange(change);
    return JSON.stringify(change);
  }

  undo(id: string): Promise<ThemeModeChange> { return this.themes.undo(id); }

  /** @throws {Error} 校验或当前值读取失败，不产生修改提案，由 Runner 显示失败。 */
  async propose(name: string, json: string): Promise<AgentAction> {
    const args: DecodedSettingsArguments = this.decode(name, json);
    let change: AgentSettingChange;
    if (name === 'propose_set_theme_color') {
      if (!isThemeAvailable(args.themeId, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [])) {
        throw new Error('theme_color_locked');
      }
      change = { settingId: 'color_theme', before: await this.colors.read(), after: args.themeId };
    } else if (name === 'propose_set_fsrs') {
      change = { settingId: 'fsrs_enabled', before: `${await readFsrsEnabled()}`, after: `${args.enabled}` };
    } else if (name === 'propose_set_setting') {
      const current: AgentPreferenceState = await readAgentPreference(args.settingId);
      change = { settingId: args.settingId, before: `${current.value}`, after: args.value };
    } else { throw new Error('tool_unavailable'); }
    return createAgentAction('setting_change', JSON.stringify(change));
  }

  private decode(name: string, json: string): DecodedSettingsArguments {
    try { return decodeSettingsArguments(name, json); }
    catch (error) {
      throw new AgentToolSchemaError('invalid_tool_arguments', '', error instanceof Error ? error.message : 'Invalid setting arguments');
    }
  }
}
