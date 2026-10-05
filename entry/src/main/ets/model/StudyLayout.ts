// SPDX-License-Identifier: AGPL-3.0-or-later
export type StudyLayoutMode = 'bottom' | 'float' | 'smart';
export const STUDY_LAYOUT_MODES: StudyLayoutMode[] = ['bottom', 'float', 'smart'];
export const STUDY_GRIP_AVAILABILITY_KEY: string = 'studyGripAvailability';
export type StudyGripAvailability = 'unchecked' | 'available' | 'unsupported' | 'permission_denied' | 'failed';
export type StudyToolbarSide = 'left' | 'right';

export function decodeStudyLayout(value: string): StudyLayoutMode {
  return value === 'float' || value === 'smart' ? value : 'bottom';
}

export function studyLayoutIndex(mode: StudyLayoutMode | null): number {
  return mode === 'smart' ? 2 : mode === 'float' ? 1 : 0;
}

export interface StudyToolbarBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  fits: boolean;
}

/** 容器已经占有窗口坐标，安全区只在这里贡献一次；容纳不下完整评分栏时走底部布局。 */
export function studyToolbarBounds(width: number, height: number, topInset: number, bottomInset: number,
  toolbarWidth: number, toolbarHeight: number): StudyToolbarBounds {
  const left: number = 12;
  const top: number = Math.max(0, topInset) + 12;
  const right: number = width - toolbarWidth - 12;
  const bottom: number = height - Math.max(0, bottomInset) - toolbarHeight - 12;
  return { left: left, right: Math.max(left, right), top: top, bottom: Math.max(top, bottom),
    fits: Number.isFinite(width) && Number.isFinite(height) && right >= left && bottom >= top };
}

export function clampStudyToolbar(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function studyGripHintKey(availability: StudyGripAvailability): string {
  if (availability === 'unsupported') return 'settings_study_grip_unsupported';
  if (availability === 'permission_denied' || availability === 'failed') return 'settings_study_grip_failed';
  return 'settings_study_grip_hint';
}
