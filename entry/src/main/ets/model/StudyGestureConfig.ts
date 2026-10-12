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
  { id: 'none', titleKey: 'study_gesture_no_action' }, ...STUDY_KEYBOARD_ACTIONS
];
export const STUDY_GESTURE_FIELDS: StudyGestureInput[] = [
  { id: 'close', titleKey: 'cancel' }, { id: 'save', titleKey: 'browser_detail_save' },
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
    typeof value.enabled !== 'boolean' || !['four', 'nine'].includes(value.tapLayout) ||
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
  if (layout === 'four') return 'four_' + (ny < 0.5 ? 'top_' : 'bottom_') + (nx < 0.5 ? 'left' : 'right');
  if (layout !== 'nine') return '';
  const index: number = Math.min(2, Math.floor(ny * 3)) * 3 + Math.min(2, Math.floor(nx * 3));
  return 'nine_' + ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'][index];
}
/** 没有绑定即无操作；评分不能绕过答案面，完整配置不继承隐藏的旧映射。 */
export function studyGestureCommand(config: StudyGestureConfig, input: string, phase: string): StudyInputCommand {
  if (!config.enabled || !['question', 'answer'].includes(phase)) return 'none';
  const item: StudyGestureBinding | undefined = config.bindings.find((binding: StudyGestureBinding): boolean =>
    binding.input === input && (binding.side === 'both' || binding.side === phase));
  if (item === undefined || (item.command === 'flip' && phase !== 'question') ||
    (['again', 'hard', 'good', 'easy'].includes(item.command) && phase !== 'answer')) return 'none';
  return item.command;
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
