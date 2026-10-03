// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { AppThemeMode } from '../settings/ThemeModeSession';
import type { ThemeId } from '../ThemeCatalog';
import { isThemeId } from '../settings/ThemeColorSession';
import { agentPreferenceDefinitions, agentWritablePreferenceIds, decodeWritablePreference } from './AgentPreferenceSettings';
import { SETTINGS_ENTRIES } from '../SettingsNavigation';
import { appInterfaceSurfaceIds } from '../AppInterface';

export interface AgentSettingDefinition {
  id: string;
  description: string;
  valueType: string;
  allowedValues: string[];
  scope: string;
  writable: boolean;
  writeTool: string;
  effect: string;
}

/** 只列已接通能力；不提供任意偏好键、RPC 或凭证读取。 */
export function agentSettingDefinitions(): AgentSettingDefinition[] {
  const definitions: AgentSettingDefinition[] = [
    { id: 'theme_mode', description: '应用深浅色偏好；system 跟随系统，与闪卡模板 CSS 配色独立。',
      valueType: 'enum', allowedValues: ['system', 'light', 'dark'], scope: 'device',
      writable: true, writeTool: 'set_theme_mode', effect: 'immediate_and_persistent' },
    { id: 'system_dark', description: '当前系统颜色状态；theme_mode=system 时决定应用深浅色。',
      valueType: 'boolean', allowedValues: [], scope: 'device', writable: false, writeTool: '', effect: 'read_only' },
    { id: 'color_theme', description: '应用主题色，与深浅色和闪卡模板配色独立；可用颜色及权益见 list_theme_colors。',
      valueType: 'enum', allowedValues: [], scope: 'device', writable: true,
      writeTool: 'propose_set_theme_color', effect: 'confirmed_persistent' },
    { id: 'fsrs_enabled', description: '整个 Anki 卡库的 FSRS 开关，不是单牌组选项；开启会重新调度卡片。',
      valueType: 'boolean', allowedValues: [], scope: 'collection', writable: true,
      writeTool: 'propose_set_fsrs', effect: 'confirmed_collection_write' }
  ];
  for (const preference of agentPreferenceDefinitions()) {
    const writable: boolean = agentWritablePreferenceIds().includes(preference.id);
    definitions.push({ id: preference.id, description: preference.description,
      valueType: preference.encoding === 'string_boolean' ? 'boolean' : typeof preference.defaultValue,
      allowedValues: preference.encoding === 'string_boolean' ? [] : preference.allowedValues.slice(),
      scope: 'device', writable: writable, writeTool: writable ? 'propose_set_setting' : '',
      effect: writable ? 'confirmed_persistent' : 'read_only' });
  }
  definitions.push({ id: 'language', description: '应用当前语言：zh-Hans 简体中文，en 英文。',
    valueType: 'enum', allowedValues: ['zh-Hans', 'en'], scope: 'device', writable: false, writeTool: '', effect: 'read_only' });
  definitions.push({ id: 'study_quick_answer', description: '学习快捷操作模式：0 关闭，1 四象限，2 手势；包含旧开关兼容解析。',
    valueType: 'enum', allowedValues: ['0', '1', '2'], scope: 'device', writable: false, writeTool: '', effect: 'read_only' });
  definitions.push({ id: 'graph_preferences', description: '全库统计偏好：周首日、分离暂停/埋藏计数、浏览链接及预测积压。',
    valueType: 'object', allowedValues: [], scope: 'collection', writable: false, writeTool: '', effect: 'read_only' });
  return definitions;
}

export function agentSettingsFunctionTools(): ProviderFunctionTool[] {
  const settings: AgentSettingDefinition[] = agentSettingDefinitions();
  const idsSchema: string = `{"type":"object","properties":{"ids":{"type":"array","minItems":1,"maxItems":${settings.length},"uniqueItems":true,"items":{"type":"string","enum":${JSON.stringify(settings.map((item: AgentSettingDefinition): string => item.id))}}}},"required":["ids"],"additionalProperties":false}`;
  return [
    { name: 'get_app_structure', description: '读取界面目录、当前页面和状态摘要；指定 surface 展开控件与选项，settings 配合 sectionId 读取设置分组。coverage 标示覆盖范围，状态来自 UI，能力来自当前工具；不含凭证，不等于截图或点击权限。',
      parametersJson: `{"type":"object","properties":{"surface":{"type":"string","enum":${JSON.stringify(appInterfaceSurfaceIds())}},"sectionId":{"type":"string","enum":${JSON.stringify(SETTINGS_ENTRIES.map((entry): string => entry.id))}}},"required":[],"additionalProperties":false}`,
      exampleArgumentsJson: '{"surface":"settings","sectionId":"appearance"}',
      rules: 'Read only. Fetch fresh structure when explaining app navigation or interface layout. sectionId requires surface=settings. coverage is explicit: do not invent details of other pages. available_in_section means the item exists there, not that the page is open. conditional is not currently visible. Empty writeTool does not grant an action. tools are the current turn declarations; write outcomes still require their own tools and confirmation.' },
    { name: 'list_settings', description: '列出助手已支持的应用设置、含义、取值和作用范围；不是所有底层配置。',
      parametersJson: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
      exampleArgumentsJson: '{}', rules: 'Read only. Unsupported settings are unavailable, never invent their values.' },
    { name: 'get_settings', description: '按 list_settings 中的 ID 批量读取外观、语言、学习操作、备份、同步和统计偏好；只读取请求的设置组。',
      parametersJson: idsSchema,
      exampleArgumentsJson: '{"ids":["theme_mode","system_dark"]}', rules: 'Read only. A read error does not mean the default value.' },
    { name: 'set_theme_mode', description: '按当前用户明确指令切换应用浅色、深色或跟随系统，保存并立即生效；提供应用撤销入口。',
      parametersJson: '{"type":"object","properties":{"mode":{"type":"string","enum":["system","light","dark"]}},"required":["mode"],"additionalProperties":false}',
      exampleArgumentsJson: '{"mode":"dark"}',
      rules: 'Reversible device setting write, not a card draft. Only the current user message can authorize the requested mode. Call at most once. If authorization is missing, ask for an explicit switch command. Report saved/applied separately; partial means do not claim completion or retry blindly. Undo is an app button, never a model-controlled token.' },
    { name: 'list_theme_colors', description: '读取应用主题色目录、种子色和实际可用状态；未解锁主题不可切换，不改变权益。',
      parametersJson: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
      exampleArgumentsJson: '{}', rules: 'Read only. Use returned IDs and available=true; never claim a locked theme is available.' },
    { name: 'propose_set_theme_color', description: '提出应用主题色修改，展示当前与目标主题；用户确认后保存并立即应用。',
      parametersJson: '{"type":"object","properties":{"themeId":{"type":"string","minLength":1,"maxLength":40}},"required":["themeId"],"additionalProperties":false}',
      exampleArgumentsJson: '{"themeId":"forest"}',
      rules: 'Call alone. Read list_theme_colors and choose an available theme ID. Produces a proposal, never writes. Confirmation rechecks current value and entitlement. This is device UI color, not card CSS. Report saved/applied separately; partial is not completed.' },
    { name: 'propose_set_fsrs', description: '提出整个卡库的 FSRS 开关修改，展示前后状态及重新调度影响；用户确认后才修改。',
      parametersJson: '{"type":"object","properties":{"enabled":{"type":"boolean"}},"required":["enabled"],"additionalProperties":false}',
      exampleArgumentsJson: '{"enabled":true}',
      rules: 'Call alone. Collection-wide setting, never deck-specific. Enabling reschedules cards; disabling does not restore previous scheduling. Produces a proposal, never writes before user confirmation. Stale proposals fail. Same-state requests do not reschedule. On unverified write outcome inspect get_settings before proposing again.' },
    { name: 'propose_set_setting', description: '提出本机卡片文字缩放、牌组列表宽度或学习触觉反馈修改；展示前后值，确认后共用设置页保存入口。value 为字符串：card_text_size 使用 50–200 的整数百分比，两个开关使用 true/false。',
      parametersJson: `{"type":"object","properties":{"settingId":{"type":"string","enum":${JSON.stringify(agentWritablePreferenceIds())}},"value":{"type":"string","minLength":1,"maxLength":8}},"required":["settingId","value"],"additionalProperties":false}`,
      exampleArgumentsJson: '{"settingId":"card_text_size","value":"130"}',
      rules: 'Call alone. Creates a proposal, never writes before user confirmation. Use list_settings for supported IDs and actual scope. Values are exact: card_text_size is an integer percentage 50–200; deck_list_narrow and study_haptics use true or false. Card scaling does not change template CSS; haptics preference does not guarantee device vibration. Confirmation rechecks the saved value. Stale proposals fail. After an unverified write read get_settings before making a new proposal.' },
    { name: 'get_deck_options', description: '读取真实牌组的学习选项、共享预设使用数量与牌组覆盖限额；不修改配置。',
      parametersJson: '{"type":"object","properties":{"deckId":{"type":"integer","minimum":1}},"required":["deckId"],"additionalProperties":false}',
      exampleArgumentsJson: '{"deckId":1}',
      rules: 'Read only. Use a deck ID discovered in this session. Preset limits are not the actual number scheduled today; parent limits and today overrides may apply. No inferred scheduling algorithm.' }
  ];
}

interface SettingsArguments {
  ids?: string[]; mode?: string; deckId?: number; themeId?: string; enabled?: boolean;
  settingId?: string; value?: string;
  surface?: string; sectionId?: string;
}
export interface DecodedSettingsArguments {
  ids: string[]; mode: AppThemeMode; deckId: number; themeId: ThemeId; enabled: boolean;
  settingId: string; value: string;
  surface: string; sectionId: string;
}

export interface AgentSettingChange {
  settingId: string;
  before: string;
  after: string;
}

/** 确认执行器重新校验完整语义，历史或错误载荷不能变成任意配置写入。 */
/** @throws {Error} 非法值由确认执行器保留失败状态，不写入偏好。 */
export function decodeSettingChange(json: string): AgentSettingChange {
  const value: AgentSettingChange = JSON.parse(json) as AgentSettingChange;
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== 3 || typeof value.before !== 'string' || typeof value.after !== 'string') {
    throw new Error('invalid_setting_change');
  }
  if (value.settingId === 'color_theme' && isThemeId(value.before) && isThemeId(value.after)) { return value; }
  if (value.settingId === 'fsrs_enabled' && ['true', 'false'].includes(value.before) &&
    ['true', 'false'].includes(value.after)) { return value; }
  if (agentWritablePreferenceIds().includes(value.settingId)) {
    decodeWritablePreference(value.settingId, value.before);
    decodeWritablePreference(value.settingId, value.after);
    return value;
  }
  throw new Error('invalid_setting_change');
}

/** @throws {Error} 非法设置参数交给 Registry 返回具体字段错误。 */
export function decodeSettingsArguments(name: string, json: string): DecodedSettingsArguments {
  const definition: ProviderFunctionTool | undefined = agentSettingsFunctionTools().find(
    (tool: ProviderFunctionTool): boolean => tool.name === name);
  if (definition === undefined) { throw new Error('tool_unavailable'); }
  const raw: SettingsArguments = JSON.parse(json) as SettingsArguments;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { throw new Error('invalid_tool_arguments'); }
  const allowed: string[] = name === 'get_app_structure' ? ['surface', 'sectionId'] : name === 'get_settings' ? ['ids'] :
    (name === 'set_theme_mode' ? ['mode'] : (name === 'get_deck_options' ? ['deckId'] :
      (name === 'propose_set_theme_color' ? ['themeId'] : (name === 'propose_set_fsrs' ? ['enabled'] :
        (name === 'propose_set_setting' ? ['settingId', 'value'] : [])))));
  if (Object.keys(raw).some((key: string): boolean => allowed.indexOf(key) < 0)) { throw new Error('invalid_tool_arguments'); }
  if (name === 'get_app_structure') {
    if (raw.surface !== undefined && !appInterfaceSurfaceIds().includes(raw.surface)) {
      throw new Error('invalid_interface_surface');
    }
    if (raw.sectionId !== undefined && (raw.surface !== 'settings' ||
      !SETTINGS_ENTRIES.some((entry): boolean => entry.id === raw.sectionId))) throw new Error('invalid_interface_section');
  }
  if (name === 'get_settings' && (!Array.isArray(raw.ids) || raw.ids.length === 0 || raw.ids.length > agentSettingDefinitions().length ||
    new Set<string>(raw.ids).size !== raw.ids.length ||
    raw.ids.some((id: string): boolean => !agentSettingDefinitions().some((setting: AgentSettingDefinition): boolean => setting.id === id)))) {
    throw new Error('invalid_setting_ids');
  }
  if (name === 'propose_set_theme_color' && (typeof raw.themeId !== 'string' || !isThemeId(raw.themeId))) {
    throw new Error('invalid_theme_color');
  }
  if (name === 'propose_set_fsrs' && typeof raw.enabled !== 'boolean') { throw new Error('invalid_fsrs_enabled'); }
  if (name === 'propose_set_setting') {
    if (typeof raw.settingId !== 'string' || typeof raw.value !== 'string') { throw new Error('invalid_setting_value'); }
    decodeWritablePreference(raw.settingId, raw.value);
  }
  if (name === 'set_theme_mode' && raw.mode !== 'system' && raw.mode !== 'light' && raw.mode !== 'dark') {
    throw new Error('invalid_theme_mode');
  }
  if (name === 'get_deck_options' && (raw.deckId === undefined || !Number.isSafeInteger(raw.deckId) || raw.deckId <= 0)) {
    throw new Error('invalid_deck_id');
  }
  return { ids: raw.ids?.slice() ?? [], mode: (raw.mode ?? 'system') as AppThemeMode, deckId: raw.deckId ?? 0,
    themeId: (raw.themeId ?? 'aurora') as ThemeId, enabled: raw.enabled === true,
    settingId: raw.settingId ?? '', value: raw.value ?? '', surface: raw.surface ?? 'app', sectionId: raw.sectionId ?? '' };
}

/** 保守识别单条切换指令；问题、否定、引用和附件不能授予写入权限。 */
export function requestedThemeMode(text: string): AppThemeMode | null {
  const input: string = text.trim().toLowerCase();
  if (input.length > 160 || /[\n\r"“”‘’`?？]|笔记|卡片|模板|牌组|css|note|card|template|不|别|或|还是|吗|么|如何|怎么|是什么|为什么|是否|如果|假如|解释|讨论|建议|能否|don't|do not|never|without|how |whether|if /.test(input)) {
    return null;
  }
  if (!/切换|换成|换为|改成|改为|设为|设置为|启用|开启|关闭|关掉|用深色|用浅色|换深色|换浅色|switch|set |enable|turn /.test(input)) { return null; }
  if (/跟随系统|随系统|system/.test(input)) {
    return /关闭|关掉|turn off/.test(input) ? null : 'system';
  }
  const dark: boolean = /深色|暗色|夜间|dark/.test(input);
  const light: boolean = /浅色|亮色|日间|light/.test(input);
  if (dark === light) { return null; }
  if (/关闭|关掉|turn off/.test(input)) { return dark ? 'light' : 'dark'; }
  return dark ? 'dark' : 'light';
}
