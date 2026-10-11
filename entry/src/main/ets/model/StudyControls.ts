// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StudyInputCommand } from './StudyInputPolicy';
import { defaultStudyKeyboard, normalizeStudyChord, validateStudyKeyboard, studyKeyboardCommand } from './StudyKeyboard';
import type { StudyKeyboard, StudyKeyBinding } from './StudyKeyboard';

export const STUDY_CONTROLS_KEY: string = 'studyControls';
export interface StudyCommandMapping { input: string; command: StudyInputCommand; }
export interface StudyControls {
  keepScreenOn: boolean;
  gestureMode: string;
  keys: StudyCommandMapping[];
  gestures: StudyCommandMapping[];
  keyboard?: StudyKeyboard;
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
/** 旧 keys 是默认键位的覆盖；新 keyboard 是完整绑定，空数组表示全部禁用。 */
export function validateStudyControls(value: StudyControls): StudyControls {
  if (value === null || typeof value !== 'object' ||
    Object.keys(value).some((key: string): boolean => !['keepScreenOn', 'gestureMode', 'keys', 'gestures', 'keyboard'].includes(key)) ||
    typeof value.keepScreenOn !== 'boolean' || !['inherit', 'off', 'gestures', 'tap_zones'].includes(value.gestureMode)) {
    throw new Error('invalid_study_controls');
  }
  const result: StudyControls = { keepScreenOn: value.keepScreenOn, gestureMode: value.gestureMode,
    keys: mappings(value.keys, KEYS), gestures: mappings(value.gestures, ['left', 'right', 'double']) };
  if (value.keyboard !== undefined) {
    if (result.keys.length !== 0) throw new Error('ambiguous_study_keyboard');
    result.keyboard = validateStudyKeyboard(value.keyboard);
  }
  return result;
}
export function effectiveStudyKeyboard(controls: StudyControls): StudyKeyboard {
  if (controls.keyboard !== undefined) return validateStudyKeyboard(controls.keyboard);
  const keyboard: StudyKeyboard = defaultStudyKeyboard();
  for (const mapping of controls.keys) {
    const key: string = normalizeStudyChord(mapping.input);
    keyboard.bindings = keyboard.bindings.filter((item: StudyKeyBinding): boolean => item.key !== key);
    if (mapping.command !== 'none') keyboard.bindings.push({ key: key, command: mapping.command, side: 'both' });
  }
  return keyboard;
}
export function configuredStudyCommand(controls: StudyControls, chord: string, phase: string,
  blocked: boolean): StudyInputCommand {
  return blocked ? 'none' : studyKeyboardCommand(effectiveStudyKeyboard(controls).bindings, chord, phase);
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
