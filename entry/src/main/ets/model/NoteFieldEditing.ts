// SPDX-License-Identifier: AGPL-3.0-or-later
import { 文本中的填空编号 } from './填空解析器';

export interface FieldEditResult { text: string; start: number; end: number; }

/** 只修改选区，未触碰的 HTML/媒体/未知标记逐字保留。行为参考 AnkiDroid Toolbar。 */
export function wrapFieldSelection(text: string, start: number, end: number,
  prefix: string, suffix: string): FieldEditResult {
  const from: number = start < 0 ? text.length : Math.min(text.length, Math.max(0, Math.min(start, end)));
  const to: number = end < 0 ? text.length : Math.min(text.length, Math.max(from, Math.max(start, end)));
  const value: string = text.slice(0, from) + prefix + text.slice(from, to) + suffix + text.slice(to);
  const cursor: number = from === to ? from + prefix.length : to + prefix.length + suffix.length;
  return { text: value, start: cursor, end: cursor };
}

export function nextClozeNumber(fields: string[], same: boolean): number {
  let highest: number = 0;
  for (const field of fields) {
    for (const ordinal of 文本中的填空编号(field)) highest = Math.max(highest, ordinal);
  }
  return same ? Math.max(1, highest) : highest + 1;
}

export function parseNoteTags(value: string): string[] {
  const result: string[] = [];
  const seen: Set<string> = new Set<string>();
  for (const tag of value.split(new RegExp('\\s+'))) {
    const key: string = tag.toLowerCase();
    if (tag !== '' && !seen.has(key)) { result.push(tag); seen.add(key); }
  }
  return result;
}

export function noteDraftChanged(fields: string[], original: string[], tags: string, originalTags: string): boolean {
  return fields.length !== original.length || fields.some((value: string, index: number): boolean => value !== original[index])
    || parseNoteTags(tags).join(' ') !== parseNoteTags(originalTags).join(' ');
}
/** 公共字段输入的外观与初始模式，不包含 Core 字段身份。 */
export interface NoteFieldEditingOptions {
  rtl?: boolean;
  fontName?: string;
  fontSize?: number;
  description?: string;
  /** Anki 的历史命名：默认 HTML 源码模式，保留格式。 */
  plainText?: boolean;
  collapsed?: boolean;
}

export interface NoteFieldEditingSupport {
  fieldOptions: string[];
  minimumFontSize: number;
  maximumFontSize: number;
  plainTextMeaning: string;
  fontAvailability: string;
  tools: NoteEditorTool[];
  mediaTools: NoteEditorTool[];
  modeTools: NoteEditorTool[];
  modeControlPlacement: string;
  expandControlPlacement: string;
  expandTool: NoteEditorTool;
  collapseTool: NoteEditorTool;
  toolMenu: { layout: string; geometry: string; outerVisibility: string; defaultVisibility: string; initialSelection: string;
    buttonContent: string; formatSelection: string; toggleToolIds: string[]; oneShotFeedback: string; oneShotFlashMs: number;
    foldingSelection: string;
    target: string; visibleCount: number; commonToolIds: string[]; labels: string; labelLines: number; mouseNotchesPerTool: number;
    activation: string; rotation: string; grip: string; manualPosition: string };
}
export interface NoteEditorTool { id: string; titleKey: string; iconKey: string; editing: string; }

/** 按钮图标和 JIDE 工具认知共用；界面显隐与可点击状态仍由字段编辑器持有。 */
export const NOTE_EDITOR_TOOLS: NoteEditorTool[] = [
  { id: 'bold', titleKey: 'note_editor_bold', iconKey: 'ic_editor_bold', editing: 'visual_or_source' },
  { id: 'italic', titleKey: 'note_editor_italic', iconKey: 'ic_editor_italic', editing: 'visual_or_source' },
  { id: 'underline', titleKey: 'note_editor_underline', iconKey: 'ic_editor_underline', editing: 'visual_or_source' },
  { id: 'highlight', titleKey: 'note_editor_highlight', iconKey: 'ic_editor_highlight', editing: 'visual_or_source' },
  { id: 'break', titleKey: 'note_editor_break', iconKey: 'ic_editor_break', editing: 'visual_or_source' },
  { id: 'math', titleKey: 'note_editor_math', iconKey: 'ic_editor_math', editing: 'literal_math_delimiters' },
  { id: 'cloze_next', titleKey: 'note_editor_cloze_next', iconKey: 'ic_editor_cloze_next', editing: 'cloze_only' },
  { id: 'cloze_same', titleKey: 'note_editor_cloze_same', iconKey: 'ic_editor_cloze_same', editing: 'cloze_only' },
  { id: 'superscript', titleKey: 'note_editor_superscript', iconKey: 'ic_editor_superscript', editing: 'html_source_then_card_preview' },
  { id: 'subscript', titleKey: 'note_editor_subscript', iconKey: 'ic_editor_subscript', editing: 'html_source_then_card_preview' },
  { id: 'bullet_list', titleKey: 'note_editor_bullet_list', iconKey: 'ic_editor_bullet_list', editing: 'html_source_then_card_preview' },
  { id: 'numbered_list', titleKey: 'note_editor_numbered_list', iconKey: 'ic_editor_numbered_list', editing: 'html_source_then_card_preview' },
  { id: 'link', titleKey: 'note_editor_link', iconKey: 'ic_editor_link', editing: 'selection_or_label_link_dialog' },
  { id: 'clear_format', titleKey: 'note_editor_clear_format', iconKey: 'ic_editor_clear_format', editing: 'selection_or_typing_format' }
];
export const NOTE_EDITOR_COMMON_TOOL_IDS: string[] = ['bold', 'italic', 'underline', 'highlight', 'break', 'clear_format'];
export const NOTE_EDITOR_FORMAT_TOGGLE_IDS: string[] = ['bold', 'italic', 'underline', 'highlight'];
export const NOTE_EDITOR_ACTION_FLASH_MS: number = 100;
export const NOTE_FIELD_EXPAND_TOOL: NoteEditorTool =
  { id: 'expand', titleKey: 'note_editor_expand', iconKey: 'ic_editor_expand', editing: 'field_display_only' };
export const NOTE_FIELD_COLLAPSE_TOOL: NoteEditorTool =
  { id: 'collapse', titleKey: 'note_editor_collapse', iconKey: 'ic_editor_collapse', editing: 'field_display_only' };
export function noteFieldExpansionTool(expanded: boolean): NoteEditorTool {
  return expanded ? NOTE_FIELD_COLLAPSE_TOOL : NOTE_FIELD_EXPAND_TOOL;
}
export function noteEditorTool(id: string): NoteEditorTool {
  const tool: NoteEditorTool | undefined = NOTE_EDITOR_TOOLS.find((item: NoteEditorTool): boolean => item.id === id);
  if (tool === undefined) throw new Error(`Unknown note editor tool: ${id}`);
  return tool;
}
export const NOTE_FIELD_MEDIA_TOOLS: NoteEditorTool[] = [
  { id: 'image', titleKey: 'add_note_image_add', iconKey: 'ic_editor_image', editing: 'field_media_dialog' },
  { id: 'audio', titleKey: 'note_audio_add', iconKey: 'ic_editor_audio', editing: 'field_media_dialog' }
];
export function noteFieldMediaTool(id: string): NoteEditorTool {
  const tool: NoteEditorTool | undefined = NOTE_FIELD_MEDIA_TOOLS.find((item: NoteEditorTool): boolean => item.id === id);
  if (tool === undefined) throw new Error(`Unknown note field media tool: ${id}`);
  return tool;
}
export const NOTE_FIELD_MODE_TOOLS: NoteEditorTool[] = [
  { id: 'visual', titleKey: 'note_editor_visual', iconKey: 'ic_editor_source', editing: 'visual_mode_preserving_html' },
  { id: 'source_edit', titleKey: 'note_editor_source_edit', iconKey: 'ic_editor_source', editing: 'source_mode_preserving_html' }
];
export function noteFieldModeTool(id: string): NoteEditorTool {
  const tool: NoteEditorTool | undefined = NOTE_FIELD_MODE_TOOLS.find((item: NoteEditorTool): boolean => item.id === id);
  if (tool === undefined) throw new Error(`Unknown note field mode tool: ${id}`);
  return tool;
}
export const NOTE_FIELD_EDITING_SUPPORT: NoteFieldEditingSupport = {
  fieldOptions: ['rtl', 'font', 'size', 'description', 'plainText', 'collapsed'],
  minimumFontSize: 5, maximumFontSize: 300, plainTextMeaning: 'default_html_source_preserving_formatting',
  fontAvailability: 'installed fonts with system fallback; font file import is not available',
  tools: NOTE_EDITOR_TOOLS,
  mediaTools: NOTE_FIELD_MEDIA_TOOLS,
  modeTools: NOTE_FIELD_MODE_TOOLS,
  modeControlPlacement: 'above_each_editable_field',
  expandControlPlacement: 'inside_bottom_right_of_each_input',
  expandTool: NOTE_FIELD_EXPAND_TOOL,
  collapseTool: NOTE_FIELD_COLLAPSE_TOOL,
  toolMenu: { layout: 'screen_edge_semicircle', geometry: 'concentric_common_inner_and_rotating_outer_arcs',
    buttonContent: 'icon_above_caption_inside_circle', formatSelection: 'independent_multiple_format_toggles',
    toggleToolIds: NOTE_EDITOR_FORMAT_TOGGLE_IDS, oneShotFeedback: 'brief_flash_without_toggle',
    oneShotFlashMs: NOTE_EDITOR_ACTION_FLASH_MS,
    outerVisibility: 'experimental_mode_only',
    defaultVisibility: 'visible_and_expanded_without_input_focus',
    initialSelection: 'no_selected_tools', foldingSelection: 'collapse_preserves_formats_reopen_resets_formats',
    target: 'first_editable_field_then_last_focused_field', visibleCount: 7, commonToolIds: NOTE_EDITOR_COMMON_TOOL_IDS,
    labels: 'below_each_icon', labelLines: 2, mouseNotchesPerTool: 2,
    activation: 'click_tool_to_apply_rotation_preserves_multiple_selection',
    rotation: 'drag_arc_or_vertical_mouse_wheel', grip: 'holdingHandChanged_left_right_when_available',
    manualPosition: 'drag_handle_vertically_and_long_press_to_switch_side' }
};
