// SPDX-License-Identifier: AGPL-3.0-or-later
import { STUDY_KEYBOARD_ACTIONS } from './StudyKeyboard';
import type { StudyInputCommand, StudyKeySide, StudyKeyboardAction } from './StudyKeyboard';

export interface StudyGestureInput { id: string; titleKey: string; layout?: string; }
export interface StudyGestureBinding { input: string; command: StudyInputCommand; side: StudyKeySide; }
export interface StudyGestureConfig {
  version: number;
  enabled: boolean;
  tapLayout: string;
  bindings: StudyGestureBinding[];
}
/** 输入目录由设置、网页识别与 JIDE 共用；完整配置仅在实验版启用。 */
export const STUDY_GESTURE_INPUTS: StudyGestureInput[] = [
  { id: 'up', titleKey: 'study_gesture_up' }, { id: 'down', titleKey: 'study_gesture_down' },
  { id: 'left', titleKey: 'study_gesture_left' }, { id: 'right', titleKey: 'study_gesture_right' },
  { id: 'double', titleKey: 'study_gesture_double' },
  { id: 'two_finger', titleKey: 'study_gesture_two_finger' },
  { id: 'three_finger', titleKey: 'study_gesture_three_finger' },
  { id: 'four_finger', titleKey: 'study_gesture_four_finger' },
  { id: 'shake', titleKey: 'study_gesture_shake' },
  { id: 'point_top', titleKey: 'study_gesture_top', layout: 'points' },
  { id: 'point_bottom', titleKey: 'study_gesture_bottom', layout: 'points' },
  { id: 'point_left', titleKey: 'study_gesture_middle_left', layout: 'points' },
  { id: 'point_right', titleKey: 'study_gesture_middle_right', layout: 'points' },
  { id: 'four_top_left', titleKey: 'study_gesture_top_left', layout: 'four' },
  { id: 'four_top_right', titleKey: 'study_gesture_top_right', layout: 'four' },
  { id: 'four_bottom_left', titleKey: 'study_gesture_bottom_left', layout: 'four' },
  { id: 'four_bottom_right', titleKey: 'study_gesture_bottom_right', layout: 'four' },
  { id: 'nine_top_left', titleKey: 'study_gesture_top_left', layout: 'nine' },
  { id: 'nine_top', titleKey: 'study_gesture_top', layout: 'nine' },
  { id: 'nine_top_right', titleKey: 'study_gesture_top_right', layout: 'nine' },
  { id: 'nine_left', titleKey: 'study_gesture_middle_left', layout: 'nine' },
  { id: 'nine_center', titleKey: 'study_gesture_center', layout: 'nine' },
  { id: 'nine_right', titleKey: 'study_gesture_middle_right', layout: 'nine' },
  { id: 'nine_bottom_left', titleKey: 'study_gesture_bottom_left', layout: 'nine' },
  { id: 'nine_bottom', titleKey: 'study_gesture_bottom', layout: 'nine' },
  { id: 'nine_bottom_right', titleKey: 'study_gesture_bottom_right', layout: 'nine' }
];
export const STUDY_GESTURE_ACTIONS: StudyKeyboardAction[] = [
  { id: 'none', titleKey: 'study_gesture_no_action' }, ...STUDY_KEYBOARD_ACTIONS,
  { id: 'delete_note', titleKey: 'study_delete_note_title' },
  { id: 'page_up', titleKey: 'study_action_page_up' },
  { id: 'page_down', titleKey: 'study_action_page_down' },
  { id: 'tag', titleKey: 'add_note_tags' },
  { id: 'card_info', titleKey: 'browser_info_title' },
  { id: 'reschedule_note', titleKey: 'browser_action_set_due' },
  { id: 'user_action_1', titleKey: 'study_action_user_1' },
  { id: 'user_action_2', titleKey: 'study_action_user_2' },
  { id: 'user_action_3', titleKey: 'study_action_user_3' },
  { id: 'user_action_4', titleKey: 'study_action_user_4' },
  { id: 'user_action_5', titleKey: 'study_action_user_5' },
  { id: 'user_action_6', titleKey: 'study_action_user_6' },
  { id: 'user_action_7', titleKey: 'study_action_user_7' },
  { id: 'user_action_8', titleKey: 'study_action_user_8' },
  { id: 'user_action_9', titleKey: 'study_action_user_9' }
];
export const STUDY_GESTURE_FIELDS: StudyGestureInput[] = [
  { id: 'close', titleKey: 'cancel' }, { id: 'save', titleKey: 'browser_detail_save' },
  { id: 'help', titleKey: 'help_accessibility_description' },
  { id: 'enabled', titleKey: 'study_gesture_enabled' }, { id: 'layout', titleKey: 'study_gesture_layout' },
  { id: 'input', titleKey: 'study_gesture_input' }, { id: 'side', titleKey: 'study_keyboard_side' },
  { id: 'command', titleKey: 'study_keyboard_command' }, { id: 'add', titleKey: 'study_gesture_add' },
  { id: 'reset', titleKey: 'study_keyboard_reset' }, { id: 'reload', titleKey: 'study_keyboard_reload' }
];
export function studyGestureInputs(layout: string): StudyGestureInput[] {
  return STUDY_GESTURE_INPUTS.filter((item: StudyGestureInput): boolean => item.layout === undefined || item.layout === layout);
}
export function defaultStudyGestureConfig(): StudyGestureConfig {
  const bindings: StudyGestureBinding[] = [
    { input: 'left', command: 'good', side: 'answer' }, { input: 'right', command: 'hard', side: 'answer' },
    { input: 'double', command: 'flip', side: 'question' }
  ];
  for (const layout of ['four', 'nine']) {
    const positions: string[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];
    const ratings: StudyInputCommand[] = ['again', 'hard', 'good', 'easy'];
    positions.forEach((position: string, index: number): void => {
      bindings.push({ input: layout + '_' + position, command: 'flip', side: 'question' },
        { input: layout + '_' + position, command: ratings[index], side: 'answer' });
    });
  }
  return { version: 1, enabled: false, tapLayout: 'four', bindings: bindings };
}
export function validateStudyGestureConfig(value: StudyGestureConfig): StudyGestureConfig {
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 4 || value.version !== 1 ||
    typeof value.enabled !== 'boolean' || !['four', 'nine', 'points'].includes(value.tapLayout) ||
    !Array.isArray(value.bindings) || value.bindings.length > 64) throw new Error('invalid_study_gestures');
  const bindings: StudyGestureBinding[] = [];
  for (const item of value.bindings) {
    if (item === null || typeof item !== 'object' || Object.keys(item).length !== 3 ||
      !STUDY_GESTURE_INPUTS.some((input: StudyGestureInput): boolean => input.id === item.input) ||
      !STUDY_GESTURE_ACTIONS.some((action: StudyKeyboardAction): boolean => action.id === item.command) ||
      !['both', 'question', 'answer'].includes(item.side) ||
      bindings.some((other: StudyGestureBinding): boolean => other.input === item.input &&
        (other.side === item.side || other.side === 'both' || item.side === 'both'))) throw new Error('invalid_study_gesture_binding');
    bindings.push({ input: item.input, command: item.command, side: item.side });
  }
  return { version: 1, enabled: value.enabled, tapLayout: value.tapLayout, bindings: bindings };
}
export function studyGestureTapInput(layout: string, nx: number, ny: number): string {
  if (![nx, ny].every((value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1)) return '';
  if (layout === 'points') {
    const x: number = nx - 0.5, y: number = ny - 0.5;
    return 'point_' + (Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'top' : 'bottom'));
  }
  if (layout === 'four') return 'four_' + (ny < 0.5 ? 'top_' : 'bottom_') + (nx < 0.5 ? 'left' : 'right');
  if (layout !== 'nine') return '';
  const index: number = Math.min(2, Math.floor(ny * 3)) * 3 + Math.min(2, Math.floor(nx * 3));
  return 'nine_' + ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'][index];
}
/** AnkiDroid 评分命令：题面只翻答案，答案面才评分；非学习状态不执行。 */
export function studyGestureAction(command: StudyInputCommand, phase: string): StudyInputCommand {
  if (!['question', 'answer'].includes(phase)) return 'none';
  if (['again', 'hard', 'good', 'easy'].includes(command) && phase === 'question') return 'flip';
  return command === 'flip' && phase !== 'question' ? 'none' : command;
}
/** 未绑定不执行，显式卡面限制保留，完整配置不继承隐藏的旧映射。 */
export function studyGestureCommand(config: StudyGestureConfig, input: string, phase: string): StudyInputCommand {
  if (!config.enabled || !['question', 'answer'].includes(phase)) return 'none';
  const item: StudyGestureBinding | undefined = config.bindings.find((binding: StudyGestureBinding): boolean =>
    binding.input === input && (binding.side === 'both' || binding.side === phase));
  return item === undefined ? 'none' : studyGestureAction(item.command, phase);
}
export function completeStudyGestures(config: StudyGestureConfig | undefined, simple: boolean): StudyGestureConfig | undefined {
  return !simple && config?.enabled ? config : undefined;
}
export function activeStudyGestureInputs(config: StudyGestureConfig, phase: string): string[] {
  return studyGestureInputs(config.tapLayout).filter((input: StudyGestureInput): boolean =>
    studyGestureCommand(config, input.id, phase) !== 'none').map((input: StudyGestureInput): string => input.id);
}
/** 简洁版仍可修改旧控制/键盘，但不能创建、改写或删除实验版完整配置。 */
export function assertStudyGestureEdit(before: StudyGestureConfig | undefined,
  after: StudyGestureConfig | undefined, simple: boolean): void {
  if (simple && JSON.stringify(before) !== JSON.stringify(after)) throw new Error('study_gestures_experimental_only');
}

/** 连续两个高加速度峰才触发一次；低谷重新武装，冷却跨翻面保留。 */
export class StudyShakeDetector {
  private peaks: number[] = [];
  private armed: boolean = true;
  private lastShake: number = -Infinity;
  clearPending(): void { this.peaks = []; this.armed = true; }
  reset(): void { this.peaks = []; this.armed = true; this.lastShake = -Infinity; }
  sample(x: number, y: number, z: number, now: number): boolean {
    if (![x, y, z, now].every(Number.isFinite)) return false;
    const acceleration: number = Math.sqrt(x * x + y * y + z * z);
    if (acceleration < 13) this.armed = true;
    if (acceleration < 22 || !this.armed) return false;
    this.armed = false;
    if (now - this.lastShake < 1500) return false;
    this.peaks = this.peaks.filter((time: number): boolean => now >= time && now - time <= 600);
    this.peaks.push(now);
    if (this.peaks.length < 2) return false;
    this.peaks = []; this.lastShake = now; return true;
  }
}

/** 官方白板工具由平台套件拥有，不声明不存在的可编程接口。 */
export const STUDY_GESTURE_SUPPORT: string = 'AnkiDroid rating gestures flip on question and grade on answer; explicit face restrictions apply; points=diagonal directions, four=legacy quadrants, nine=grid; delete_note removes the note and all cards after confirmation, delete retains current-card scope; official handwriting tool shortcuts for eraser, clear and pen color are platform-limited';
