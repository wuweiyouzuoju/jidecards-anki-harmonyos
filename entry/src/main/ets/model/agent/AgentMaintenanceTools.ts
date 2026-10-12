// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { ReviewPreferenceEdit } from '../../proto/messages/PreferencesMessages';
import { ReviewPreferenceField, validatePreferenceEdit } from '../../proto/messages/PreferencesMessages';
import { validateNotetypeLatexPatch } from './AgentNotetypeLatex';
import { REVIEW_AUDIO_PREFERENCES } from '../ReviewAudioPreferences';
import { STUDY_KEYBOARD_ACTIONS } from '../StudyKeyboard';

const TEXT: string = '{"type":"string","minLength":1,"maxLength":60000}';
const ID: string = '{"type":"integer","minimum":1}';
function tool(name: string, description: string, properties: string, required: string, example: string): ProviderFunctionTool {
  return { name: name, description: description,
    parametersJson: `{"type":"object","properties":{${properties}},"required":[${required}],"additionalProperties":false}`,
    exampleArgumentsJson: example,
    rules: name.startsWith('propose_') ?
      'Call alone. Only discovered IDs. This creates an app-owned proposal, never writes. Wait for real user confirmation and execution. Stale targets fail; never claim completion before the result. Use the app-owned confirmation result; audio preferences also exist in Appearance settings.' :
      'Read only. Report actual returned state and supported boundaries. Audio preferences also exist in Appearance settings.' };
}
/** 独立于手动界面目录的实际工具；只声明已接通的领域操作。 */
export function agentMaintenanceTools(): ProviderFunctionTool[] {
  const draft: string = `"draftId":${TEXT},"reason":${TEXT}`;
  return [
    tool('get_browser_preferences', '读取浏览器真实模式、排序、副标题、Cards/Notes 各自显示列、最近搜索与 Core 忽略重音选项，返回 Core 列目录。显示列也有手动更多菜单入口。读取不修改浏览模式或激活列。', '', '', '{}'),
    tool('propose_update_browser_preferences', '提出浏览器偏好修改，确认后与手动界面共用保存队列。changesJson 只允许 mode(cards/notes)、sortColumn(Core 可排序 key 或空串默认)、sortReverse(boolean)、subtitleIndex(1牌组/2到期/4答案)、cardsColumns/notesColumns(有序 Core key 数组最多16项，空数组恢复默认)。省略项保留；先读取 get_browser_preferences。不会修改卡片内容或调度，不能设置任意配置键。忽略重音在此工具中只读，修改使用独立 propose_set_ignore_accents 提案或手动搜索选项。',
      `"changesJson":${TEXT}`, '"changesJson"', '{"changesJson":"{\\"cardsColumns\\":[\\"question\\",\\"answer\\"]}"}'),
    tool('get_filtered_deck', '读取已发现的既有过滤牌组真实配置。返回两个搜索条件、数量、排序、reschedule 与预览延时（秒）；普通牌组会失败。使用本工具后再提出修改。',
      `"deckId":${ID}`, '"deckId"', '{"deckId":1}'),
    tool('propose_update_filtered_deck', '提出既有过滤牌组配置修改，changesJson 只允许 reschedule、searchTerms、previewDelay、previewAgainSecs、previewHardSecs、previewGoodSecs。searchTerms 是1至2个完整 search/limit/order 对象，limit 1至100000，order 0至10，与 Core 排序一致。延时单位秒，0至86400。省略字段保留。确认后由 Core 保存并重新填充，已有卡归还原牌组；空结果仍保留牌组，不删除笔记或复习历史。提交前重查真实配置，过期提案失败。',
      `"deckId":${ID},"changesJson":${TEXT}`, '"deckId","changesJson"', '{"deckId":1,"changesJson":"{\\"reschedule\\":false}"}'),
    tool('get_advanced_settings', '读取 JIDE 高级设置。collection 返回 Core 换日小时 rollover、提前学习秒数 learnAheadSecs、计时分段秒数 timeLimitSecs、显示剩余 showRemaining/间隔 showIntervals，以及 FSRS 负担均衡、短期调度、备份保留和音频偏好；study 返回本机常亮、键盘及完整手势配置、动作/手势目录、实验版可编辑和生效状态。',
      '"group":{"type":"string","enum":["collection","study"]}', '"group"', '{"group":"collection"}'),
    tool('propose_update_collection_preferences', '修改 Core 全库偏好。changesJson 为非空对象，允许 rollover(0–23小时)、learnAheadSecs/timeLimitSecs(非负整秒)、showRemaining/showIntervals/loadBalancer/shortTermWithSteps/hideAudioPlayButtons/interruptAudioWhenAnswering(开关)、backupDaily/backupWeekly/backupMonthly(保留数)/backupInterval(分钟)。省略保留，不主动重排。',
      `"changesJson":${TEXT}`, '"changesJson"', '{"changesJson":"{\\"loadBalancer\\":true}"}'),
    tool('propose_update_study_controls', '提出本机学习常亮与键盘/手势映射修改，手动入口在设置→复习→学习快捷键。controlsJson 为 get_advanced_settings(study) 返回的完整 controls 对象。keepScreenOn 为开关，gestureMode 为 inherit/off/gestures/tap_zones。自由配置使用 keyboard:{version:1,bindings:[{key:"ctrl+shift+f5",command:"replay",side:"both"}]}，同时 keys 必须为[]。bindings 是完整列表，空列表禁用全部学习快捷键；可绑定字母、数字、F键、方向键、numpad键、标点键名与录制得到的code:N；Ctrl/Shift/Alt精确匹配。同一动作多个键，side为question/answer/both，同键同卡面冲突会拒绝。可用动作：' + STUDY_KEYBOARD_ACTIONS.map((item): string => item.id).join('/') + '。评分仍仅答案面。旧keys只为兼容旧配置；省略keyboard时旧空keys沿用默认。gestures仍为left/right/double及none/flip/again/hard/good/easy/undo/replay/bury/suspend。编辑框、弹窗与手写期间保留原输入保护，系统返回不可重绑。实验版另有设置→复习→完整手势配置，gestureConfig:{version:1,enabled:boolean,tapLayout:four/nine,bindings:[{input:up,command:replay,side:both}]}；输入使用 get_advanced_settings(study) 返回的 gestureInputs，未绑定/none不执行，四区和九宫格分别保留。仅实验版可创建/改写/删除完整配置；简洁版必须原样保留，运行时停用。',
      `"controlsJson":${TEXT}`, '"controlsJson"', '{"controlsJson":"{\\"keepScreenOn\\":true,\\"gestureMode\\":\\"inherit\\",\\"keys\\":[],\\"gestures\\":[]}"}'),
    tool('propose_export_subset', '提出导出已发现的笔记或卡片 ID 子集。mode=notes 包含全部兄弟卡；mode=cards 由 Core 处理所选卡及其笔记。format=apkg 或 text，text 按 mode 导出笔记/卡片文本。确认后弹出系统保存位置，取消不会报告保存成功。媒体与调度只适用于 APKG；不临时移动卡片，不接受路径。',
      `"ids":{"type":"array","items":${ID},"minItems":1,"maxItems":1000},"mode":{"type":"string","enum":["notes","cards"]},"format":{"type":"string","enum":["apkg","text"]},"withMedia":{"type":"boolean"},"withScheduling":{"type":"boolean"}`,
      '"ids","mode","format","withMedia","withScheduling"', '{"ids":[1],"mode":"notes","format":"apkg","withMedia":true,"withScheduling":false}'),
    tool('propose_duplicate_note', '将已有笔记复制成新增草稿，保留字段、标签与媒体引用。noteId 和目标 deckId 须先发现；Core 分配新身份，不复制来源卡片调度或复习日志。确认前零写入。',
      `"noteId":${ID},"deckId":${ID},${draft}`, '"noteId","deckId","draftId","reason"', '{"noteId":1,"deckId":1,"draftId":"copy-1","reason":"复制为新笔记"}'),
    tool('propose_update_notetype_fields', '提出共享笔记类型字段属性修改。fieldsJson 为补丁数组，fieldOrd 必填，支持 sticky/rtl/font/size/description/plainText/collapsed/excludeFromSearch；plainText 表示默认 HTML 源码模式，保留格式。font 仅使用已安装字体，未安装时系统回退；没有字体文件导入。sortFieldIndex 可选。保留字段名称、顺序、身份及未知属性。影响该类型跨牌组的全部卡片，高风险双重确认；不改变字段结构。',
      `"notetypeId":${ID},"fieldsJson":${TEXT},"sortFieldIndex":{"type":"integer","minimum":0},${draft}`,
      '"notetypeId","fieldsJson","draftId","reason"', '{"notetypeId":1,"fieldsJson":"[{\\"fieldOrd\\":0,\\"rtl\\":true}]","draftId":"fields-1","reason":"调整字段方向"}'),
    tool('propose_restore_notetype', '提出由 Anki Core 恢复共享笔记类型的标准字段结构、模板和 CSS。影响全部笔记/卡片，双重确认；额外字段内容或模板卡片可能被删除，自定义模板会覆盖。先检查当前字段及提案中的目标结构。forceKind 仅旧类型缺少原始种类时显式指定：0基础/1正反/2可选反向/3输入/4填空/5遮罩；默认由 Core 判断，不允许改变 normal/cloze kind。',
      `"notetypeId":${ID},"forceKind":{"type":"integer","minimum":0,"maximum":5},${draft}`,
      '"notetypeId","draftId","reason"', '{"notetypeId":1,"draftId":"restore-1","reason":"恢复标准模板"}'),
    tool('propose_update_notetype_latex', '提出共享笔记类型 LaTeX 配置修改。先用 get_notetype_details 读取真实 latexPre/latexPost/latexsvg；本工具 latexSvg 映射 Core latexsvg。latexPre/latexPost 为源码，最多各30000字符，省略保留，显式空串清空；latexSvg 为开关，至少指定一项。保留字段、模板、CSS、身份及未知属性。影响该类型跨牌组全部卡片，高风险双重确认；只保存配置，不提供本机 TeX 编译或生成预览。',
      `"notetypeId":${ID},"latexPre":{"type":"string","maxLength":30000},"latexPost":{"type":"string","maxLength":30000},"latexSvg":{"type":"boolean"},${draft}`,
      '"notetypeId","draftId","reason"', '{"notetypeId":1,"latexSvg":true,"draftId":"latex-1","reason":"使用 SVG LaTeX 输出"}')
  ];
}
export interface MaintenanceArguments {
  group?: string; changesJson?: string; controlsJson?: string;
  ids?: number[]; mode?: string; format?: string; withMedia?: boolean; withScheduling?: boolean;
  noteId?: number; deckId?: number; notetypeId?: number;
  fieldsJson?: string; sortFieldIndex?: number; forceKind?: number; draftId?: string; reason?: string;
  latexPre?: string; latexPost?: string; latexSvg?: boolean;
}
interface MaintenanceSchema { properties: Record<string, Object>; required: string[]; }
export function decodeMaintenanceArguments(name: string, json: string): MaintenanceArguments {
  const tool: ProviderFunctionTool | undefined = agentMaintenanceTools().find((item: ProviderFunctionTool): boolean => item.name === name);
  if (tool === undefined) throw new Error('tool_unavailable');
  const value: MaintenanceArguments = JSON.parse(json) as MaintenanceArguments;
  const schema: MaintenanceSchema = JSON.parse(tool.parametersJson) as MaintenanceSchema;
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key: string): boolean => !Object.keys(schema.properties).includes(key)) ||
    schema.required.some((key: string): boolean => !Object.keys(value).includes(key))) throw new Error('invalid_tool_arguments');
  for (const text of [value.changesJson, value.controlsJson, value.fieldsJson, value.draftId, value.reason]) {
    if (text !== undefined && (typeof text !== 'string' || text.trim().length === 0 || text.length > 60000)) throw new Error('invalid_tool_arguments');
  }
  for (const id of [value.noteId, value.deckId, value.notetypeId]) {
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('invalid_tool_arguments');
  }
  if (value.sortFieldIndex !== undefined && (!Number.isSafeInteger(value.sortFieldIndex) || value.sortFieldIndex < 0)) throw new Error('invalid_tool_arguments');
  if (value.forceKind !== undefined && (!Number.isInteger(value.forceKind) || value.forceKind < 0 || value.forceKind > 5)) throw new Error('invalid_tool_arguments');
  if (name === 'propose_update_notetype_latex') validateNotetypeLatexPatch({ latexPre: value.latexPre,
    latexPost: value.latexPost, latexSvg: value.latexSvg });
  if (name === 'get_advanced_settings' && value.group !== 'collection' && value.group !== 'study') throw new Error('invalid_tool_arguments');
  if (name === 'propose_export_subset') {
    if (!Array.isArray(value.ids) || value.ids.length === 0 || value.ids.length > 1000 ||
      value.ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0) ||
      new Set<number>(value.ids).size !== value.ids.length || !['notes', 'cards'].includes(value.mode ?? '') ||
      !['apkg', 'text'].includes(value.format ?? '') || typeof value.withMedia !== 'boolean' ||
      typeof value.withScheduling !== 'boolean' || (value.format === 'text' && (value.withMedia || value.withScheduling))) {
      throw new Error('invalid_tool_arguments');
    }
  }
  if (value.draftId !== undefined && value.draftId.length > 100) throw new Error('invalid_tool_arguments');
  if (value.reason !== undefined && value.reason.length > 2000) throw new Error('invalid_tool_arguments');
  return value;
}
export function collectionPreferenceEdits(json: string): ReviewPreferenceEdit[] {
  const raw: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
  const fields: Record<string, ReviewPreferenceField> = { loadBalancer: ReviewPreferenceField.LoadBalancer,
    rollover: ReviewPreferenceField.Rollover, learnAheadSecs: ReviewPreferenceField.LearnAheadSecs,
    timeLimitSecs: ReviewPreferenceField.TimeLimitSecs, showRemaining: ReviewPreferenceField.ShowRemaining, showIntervals: ReviewPreferenceField.ShowIntervals,
    shortTermWithSteps: ReviewPreferenceField.ShortTermWithSteps, backupDaily: ReviewPreferenceField.BackupDaily,
    backupWeekly: ReviewPreferenceField.BackupWeekly, backupMonthly: ReviewPreferenceField.BackupMonthly,
    backupInterval: ReviewPreferenceField.BackupInterval };
  for (const item of REVIEW_AUDIO_PREFERENCES) fields[item.key] = item.field;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length === 0) throw new Error('invalid_preferences_patch');
  return Object.keys(raw).map((key: string): ReviewPreferenceEdit => {
    if (!Object.keys(fields).includes(key)) throw new Error('invalid_preferences_patch');
    const field: ReviewPreferenceField = fields[key];
    const value: Object = raw[key];
    const boolean: boolean = field === ReviewPreferenceField.LoadBalancer || field === ReviewPreferenceField.ShortTermWithSteps ||
      field === ReviewPreferenceField.ShowRemaining || field === ReviewPreferenceField.ShowIntervals ||
      REVIEW_AUDIO_PREFERENCES.some((item): boolean => item.field === field);
    if ((boolean && typeof value !== 'boolean') || (!boolean && typeof value !== 'number')) throw new Error('invalid_preferences_patch');
    const edit: ReviewPreferenceEdit = { field: field, value: boolean ? (value === true ? 1 : 0) : value as number };
    validatePreferenceEdit(edit); return edit;
  });
}
