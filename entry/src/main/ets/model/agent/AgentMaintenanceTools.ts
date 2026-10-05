// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { ReviewPreferenceEdit } from '../../proto/messages/PreferencesMessages';
import { ReviewPreferenceField, validatePreferenceEdit } from '../../proto/messages/PreferencesMessages';
import { validateNotetypeLatexPatch } from './AgentNotetypeLatex';

const TEXT: string = '{"type":"string","minLength":1,"maxLength":60000}';
const ID: string = '{"type":"integer","minimum":1}';
function tool(name: string, description: string, properties: string, required: string, example: string): ProviderFunctionTool {
  return { name: name, description: description,
    parametersJson: `{"type":"object","properties":{${properties}},"required":[${required}],"additionalProperties":false}`,
    exampleArgumentsJson: example,
    rules: name.startsWith('propose_') ?
      'Call alone. Only discovered IDs. This creates an app-owned proposal, never writes. Wait for real user confirmation and execution. Stale targets fail; never claim completion before the result. No manual settings/menu entry exists for this capability.' :
      'Read only. Report actual returned state and supported boundaries. These are JIDE tools, not manual settings/menu entries.' };
}
/** 独立于手动界面目录的实际工具；只声明已接通的领域操作。 */
export function agentMaintenanceTools(): ProviderFunctionTool[] {
  const draft: string = `"draftId":${TEXT},"reason":${TEXT}`;
  return [
    tool('get_advanced_settings', '读取 JIDE 专用高级设置。collection 返回 Core FSRS 负担均衡、带步骤短期调度和历史备份保留策略；study 返回本机常亮与输入映射。不会读取凭证。',
      '"group":{"type":"string","enum":["collection","study"]}', '"group"', '{"group":"collection"}'),
    tool('propose_update_collection_preferences', '提出 Core 全库高级偏好修改。changesJson 为非空对象，只允许 loadBalancer、shortTermWithSteps 开关及 backupDaily、backupWeekly、backupMonthly、backupInterval 整数。间隔单位分钟，保留数可为零。省略项保留；不主动重排卡片。',
      `"changesJson":${TEXT}`, '"changesJson"', '{"changesJson":"{\\"loadBalancer\\":true}"}'),
    tool('propose_update_study_controls', '提出本机学习常亮与键盘/手势映射修改。controlsJson 为 get_advanced_settings(study) 返回的完整 controls 对象。keepScreenOn 为开关，gestureMode 为 inherit/off/gestures/tap_zones，keys/gestures 为 input、command 对象数组。keys 仅 space/enter/1/2/3/4/r/b/s，gestures 仅 left/right/double。command 可为 none/flip/again/hard/good/easy/undo/replay/bury/suspend。空映射沿用默认；评分仅答案面，退出/后台恢复常亮。',
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
    shortTermWithSteps: ReviewPreferenceField.ShortTermWithSteps, backupDaily: ReviewPreferenceField.BackupDaily,
    backupWeekly: ReviewPreferenceField.BackupWeekly, backupMonthly: ReviewPreferenceField.BackupMonthly,
    backupInterval: ReviewPreferenceField.BackupInterval };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length === 0) throw new Error('invalid_preferences_patch');
  return Object.keys(raw).map((key: string): ReviewPreferenceEdit => {
    if (!Object.keys(fields).includes(key)) throw new Error('invalid_preferences_patch');
    const field: ReviewPreferenceField = fields[key];
    const value: Object = raw[key];
    const boolean: boolean = field === ReviewPreferenceField.LoadBalancer || field === ReviewPreferenceField.ShortTermWithSteps;
    if ((boolean && typeof value !== 'boolean') || (!boolean && typeof value !== 'number')) throw new Error('invalid_preferences_patch');
    const edit: ReviewPreferenceEdit = { field: field, value: boolean ? (value === true ? 1 : 0) : value as number };
    validatePreferenceEdit(edit); return edit;
  });
}
