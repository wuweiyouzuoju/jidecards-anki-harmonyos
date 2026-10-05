// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StudyInputCommand } from './StudyInputPolicy';

export const STUDY_CONTROLS_KEY: string = 'studyControls';
export interface StudyCommandMapping { input: string; command: StudyInputCommand; }
export interface StudyControls {
  keepScreenOn: boolean;
  gestureMode: string;
  keys: StudyCommandMapping[];
  gestures: StudyCommandMapping[];
}
export function defaultStudyControls(): StudyControls {
  return { keepScreenOn: false, gestureMode: 'inherit', keys: [], gestures: [] };
}
const COMMANDS: string[] = ['none', 'flip', 'again', 'hard', 'good', 'easy', 'undo', 'replay', 'bury', 'suspend'];
const KEYS: string[] = ['space', 'enter', '1', '2', '3', '4', 'r', 'b', 's'];
function mappings(items: StudyCommandMapping[], inputs: string[]): StudyCommandMapping[] {
  if (!Array.isArray(items) || items.length > inputs.length) throw new Error('invalid_study_mapping');
  const seen: Set<string> = new Set<string>();
  return items.map((item: StudyCommandMapping): StudyCommandMapping => {
    if (item === null || typeof item !== 'object' || Object.keys(item).length !== 2 ||
      !inputs.includes(item.input) || !COMMANDS.includes(item.command) || seen.has(item.input)) {
      throw new Error('invalid_study_mapping');
    }
    seen.add(item.input); return { input: item.input, command: item.command };
  });
}
/** JIDE 只编辑声明的学习操作，返回键、修饰键和删除键始终沿用原保护。 */
export function validateStudyControls(value: StudyControls): StudyControls {
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 4 ||
    typeof value.keepScreenOn !== 'boolean' || !['inherit', 'off', 'gestures', 'tap_zones'].includes(value.gestureMode)) {
    throw new Error('invalid_study_controls');
  }
  return { keepScreenOn: value.keepScreenOn, gestureMode: value.gestureMode,
    keys: mappings(value.keys, KEYS), gestures: mappings(value.gestures, ['left', 'right', 'double']) };
}
export function mappedStudyCommand(items: StudyCommandMapping[], input: string,
  phase: string, fallback: StudyInputCommand): StudyInputCommand {
  const mapping: StudyCommandMapping | undefined = items.find((item: StudyCommandMapping): boolean => item.input === input);
  if (mapping === undefined) return fallback;
  const command: StudyInputCommand = mapping.command;
  if (phase !== 'question' && phase !== 'answer') return 'none';
  if (['again', 'hard', 'good', 'easy'].includes(command) && phase !== 'answer') return 'none';
  if (command === 'flip' && phase !== 'question') return 'none';
  return command;
}
