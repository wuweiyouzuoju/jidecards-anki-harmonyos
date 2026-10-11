// SPDX-License-Identifier: AGPL-3.0-or-later
import { defaultStudyKeyboard, studyChord, studyKeyboardCommand } from './StudyKeyboard';
import type { StudyInputCommand } from './StudyKeyboard';
export type { StudyInputCommand } from './StudyKeyboard';
export interface StudyKeyResult { control: boolean; command: StudyInputCommand; }
export function resolveStudyKey(key: string, down: boolean, control: boolean,
  phase: string, editing: boolean, guiding: boolean): StudyKeyResult {
  if (editing) return { control: false, command: 'none' };
  // 引导期间也要消费修饰键释放，防止引导结束后 Ctrl 粘住。
  if (!down) return { control: key === 'control' ? false : control, command: 'none' };
  if (guiding) return { control: control, command: 'none' };
  if (key === 'control') return { control: true, command: 'consume' };
  const command: StudyInputCommand = studyKeyboardCommand(defaultStudyKeyboard().bindings,
    studyChord(key, { ctrl: control, shift: false, alt: false }), phase);
  return { control: control, command: command };
}
