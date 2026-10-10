// SPDX-License-Identifier: AGPL-3.0-or-later
import { NOTE_EDITOR_TOOLS, NOTE_EDITOR_COMMON_TOOL_IDS, NOTE_EDITOR_FORMAT_TOGGLE_IDS, NOTE_FIELD_EDITING_SUPPORT } from './NoteFieldEditing';
import type { NoteEditorTool } from './NoteFieldEditing';

export const NOTE_EDITOR_GRIP_AVAILABILITY_KEY: string = 'note_editor_grip_availability';
export const NOTE_EDITOR_WHEEL_SESSION_KEY: string = 'noteEditorWheelSession';
export const NOTE_EDITOR_WHEEL_VISIBLE_COUNT: number = 7;
export const NOTE_EDITOR_WHEEL_DRAG_GAIN: number = 1.08;
export interface NoteEditorWheelState {
  cloze: boolean;
  source: boolean;
  expanded: boolean;
  activeIds: string[];
  fieldName?: string;
  optionsOpen?: boolean;
  optionToolId?: string;
  optionId?: string;
}
export interface NoteEditorWheelTool extends NoteEditorTool { active: boolean; }
export function noteWheelToolIsToggle(id: string, source: boolean): boolean {
  return !source && NOTE_EDITOR_FORMAT_TOGGLE_IDS.indexOf(id) >= 0;
}
/** 格式入口读取真实状态；一次性动作仅在点击反馈期间高亮。 */
export function noteWheelToolHighlighted(id: string, activeIds: string[], selectedId: string, source: boolean = false): boolean {
  if (NOTE_FIELD_EDITING_SUPPORT.formatOptionPicker.toolIds.indexOf(id) >= 0) return activeIds.indexOf(id) >= 0;
  if (noteWheelToolIsToggle(id, source)) return activeIds.indexOf(id) >= 0;
  return id === selectedId;
}
export function noteEditorWheelTools(state: NoteEditorWheelState): NoteEditorWheelTool[] {
  return NOTE_EDITOR_TOOLS.filter((tool: NoteEditorTool): boolean =>
    (state.cloze || tool.editing !== 'cloze_only'))
    .map((tool: NoteEditorTool): NoteEditorWheelTool => ({ id: tool.id, iconKey: tool.iconKey, editing: tool.editing,
      titleKey: tool.titleKey, longPressAction: tool.longPressAction,
      active: state.activeIds.indexOf(tool.id) >= 0 }));
}
export function noteEditorWheelCommonTools(state: NoteEditorWheelState): NoteEditorWheelTool[] {
  return noteEditorWheelTools(state).filter((tool: NoteEditorWheelTool): boolean => NOTE_EDITOR_COMMON_TOOL_IDS.indexOf(tool.id) >= 0);
}
export function noteEditorWheelOuterTools(state: NoteEditorWheelState): NoteEditorWheelTool[] {
  return noteEditorWheelTools(state).filter((tool: NoteEditorWheelTool): boolean => NOTE_EDITOR_COMMON_TOOL_IDS.indexOf(tool.id) < 0);
}
export function noteWheelIndex(index: number, count: number): number {
  return count <= 0 ? 0 : ((index % count) + count) % count;
}
export function noteWheelDistance(index: number, position: number, count: number): number {
  const distance: number = noteWheelIndex(index - position, count);
  return distance > count / 2 ? distance - count : distance;
}
export function noteWheelAngleStep(_radius: number, count: number = 7): number { return Math.PI * (count === 6 ? 30 : 25) / 180; }
export function noteWheelViewportHeight(height: number, top: number, keyboardTop: number): number {
  return keyboardTop > top ? Math.max(0, Math.min(height, keyboardTop - top)) : height;
}
export function noteWheelRadius(width: number, height: number): number {
  return Math.max(80, Math.min(158, width * 0.5, (height - 16) / 2));
}
export function noteWheelTrackRadius(radius: number, common: boolean = false, outerShown: boolean = true): number {
  // 图标和名称同属圆形按钮，外框只留7vp；小窗口按同一比例缩放两圈及按钮。
  return common ? radius * (outerShown ? 82 / 158 : 82 / 110) : radius * 128 / 158;
}
export function noteWheelCommonAngleStep(): number { return Math.PI * 30 / 180; }
export function noteWheelItemGap(radius: number): number { return 2 * noteWheelTrackRadius(radius) * Math.sin(noteWheelAngleStep(radius) / 2); }
/** 汉字长名称均分两行；完整名称仍用于读屏和软件认知。 */
export function noteWheelLabel(title: string, width: number, fontSize: number = 9): string {
  if (new RegExp('^[\\u3400-\\u9fff]+$').test(title) && title.length > Math.floor(width / fontSize)) {
    const middle: number = Math.floor(title.length / 2);
    return title.slice(0, middle) + '\n' + title.slice(middle);
  }
  return title;
}
/** 轴值是单次角度，先消除系统滚轮倍率，再由鼠标累积器控制每项所需格数。 */
export function noteWheelAxisDelta(axis: number, scrollStep: number = 1): number {
  return Number.isFinite(axis) ? axis / (15 * Math.max(1, scrollStep)) : 0;
}
export interface NoteWheelItemPosition { x: number; y: number; }
export interface NoteWheelOptionPosition extends NoteWheelItemPosition { size: number; }
/** 选项与轮盘同圆心且完整位于外缘之外；优先对齐入口角度，遇边界只移动弧段。 */
export function noteWheelOptionArcPosition(index: number, count: number, radius: number, centerY: number,
  anchorAngle: number, width: number, height: number, right: boolean): NoteWheelOptionPosition {
  const scale: number = radius / 158;
  const size: number = 42 * scale;
  const track: number = radius + size / 2 + 5 * scale;
  const inset: number = size / 2 + 8;
  const edgeAngle: number = Math.acos(Math.min(1, inset / track));
  const minAngle: number = Math.max(-edgeAngle, Math.asin(Math.max(-1, Math.min(1, (inset - centerY) / track))));
  const maxAngle: number = Math.min(edgeAngle, Math.asin(Math.max(-1, Math.min(1, (height - inset - centerY) / track))));
  // 按按钮弦长留6vp间隙；七档字号只占局部弧段，不铺满整个半圆。
  const step: number = 2 * Math.asin((size + 6 * scale) / (2 * track));
  const halfSpan: number = Math.max(0, count - 1) * step / 2;
  const middle: number = Math.max(minAngle + halfSpan, Math.min(maxAngle - halfSpan, anchorAngle));
  const angle: number = middle + (index - (count - 1) / 2) * step;
  return { x: (right ? width : 0) + (right ? -1 : 1) * track * Math.cos(angle),
    y: centerY + track * Math.sin(angle), size: size };
}
/** 两圈共用圆心：内圈30度、外圈25度角距，各圈上下镜像且相邻弦长相等。 */
export function noteWheelItemPosition(distance: number, radius: number, right: boolean, common: boolean = false,
  outerShown: boolean = true, outerCount: number = 7): NoteWheelItemPosition {
  const angle: number = distance * (common ? noteWheelCommonAngleStep() : noteWheelAngleStep(radius, outerCount));
  const track: number = noteWheelTrackRadius(radius, common, outerShown);
  const inward: number = track * Math.cos(angle);
  return { x: right ? radius - inward : inward, y: radius + track * Math.sin(angle) };
}
export function noteWheelHandleAngle(openProgress: number, right: boolean): number {
  return (right ? 1 - openProgress : openProgress) * 180;
}
export function noteWheelY(y: number, height: number, radius: number, collapsed: boolean): number {
  const half: number = collapsed ? 28 : radius;
  return Math.max(half + 8, Math.min(Math.max(half + 8, height - half - 8), y));
}

/** 跨 ±π 时累积最短角度；拖动过程中只移动，停稳后的提交由浮层负责。 */
export class NoteWheelRotation {
  private angle: number = 0;
  private total: number = 0;
  private right: boolean = true;
  private radius: number = 132;
  private step: number = Math.PI * 25 / 180;
  begin(x: number, y: number, radius: number, right: boolean, step: number = Math.PI * 25 / 180): void {
    this.right = right; this.radius = radius; this.total = 0;
    this.step = step;
    this.angle = this.at(x, y);
  }
  move(x: number, y: number): number {
    const angle: number = this.at(x, y);
    let delta: number = angle - this.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.total += delta; this.angle = angle;
    return -this.total / this.step * NOTE_EDITOR_WHEEL_DRAG_GAIN;
  }
  private at(x: number, y: number): number {
    return Math.atan2(y - this.radius, this.right ? this.radius - x : x);
  }
}

/** 鼠标独立于触摸增益：两格滚轮切一项，异常大轴值也不会跳过多项。 */
export class NoteWheelMouseRotation {
  private pending: number = 0;
  move(axis: number, scrollStep: number = 1): number {
    this.pending += Math.max(-0.5, Math.min(0.5, noteWheelAxisDelta(axis, scrollStep) / 2));
    const steps: number = this.pending >= 0 ? Math.floor(this.pending) : Math.ceil(this.pending);
    this.pending -= steps; return steps === 0 ? 0 : steps;
  }
  reset(): void { this.pending = 0; }
}

interface NoteEditorWheelField {
  id: string;
  available: boolean;
  onActive: (active: boolean) => void;
}
/** 一份表单持有一个会话；默认首字段，焦点切换只转交拥有者，失焦仍显示。 */
export class NoteEditorWheelSession {
  private fields: NoteEditorWheelField[] = [];
  private activeId: string = '';
  private visible: boolean = true;
  register(id: string, available: boolean, onActive: (active: boolean) => void): void {
    this.fields.push({ id: id, available: available, onActive: onActive });
    this.reconcile();
  }
  activate(id: string): void {
    if (!this.fields.some((field: NoteEditorWheelField): boolean => field.id === id && field.available)) return;
    this.activeId = id; this.reconcile();
  }
  setAvailable(id: string, available: boolean): void {
    const field: NoteEditorWheelField | undefined = this.fields.find((item: NoteEditorWheelField): boolean => item.id === id);
    if (field === undefined || field.available === available) return;
    field.available = available; this.reconcile();
  }
  setVisible(visible: boolean): void { this.visible = visible; this.reconcile(); }
  remove(id: string): void {
    const field: NoteEditorWheelField | undefined = this.fields.find((item: NoteEditorWheelField): boolean => item.id === id);
    this.fields = this.fields.filter((item: NoteEditorWheelField): boolean => item.id !== id);
    field?.onActive(false); this.reconcile();
  }
  private reconcile(): void {
    if (!this.fields.some((field: NoteEditorWheelField): boolean => field.id === this.activeId && field.available)) {
      this.activeId = this.fields.find((field: NoteEditorWheelField): boolean => field.available)?.id ?? '';
    }
    // 先移除旧浮层，再显示新浮层，避免两份握姿订阅和重叠点击区。
    for (const field of this.fields) if (field.id !== this.activeId || !this.visible) field.onActive(false);
    if (this.visible) this.fields.find((field: NoteEditorWheelField): boolean => field.id === this.activeId)?.onActive(true);
  }
}
