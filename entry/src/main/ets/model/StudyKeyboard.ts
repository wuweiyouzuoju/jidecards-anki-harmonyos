// SPDX-License-Identifier: AGPL-3.0-or-later
import { normalizeKeyboardChord } from './KeyboardInput';
export { normalizeKeyboardChord as normalizeStudyChord, keyboardChord as studyChord, KeyboardPressSession as StudyKeyboardSession } from './KeyboardInput';
export type StudyInputCommand = 'none' | 'consume' | 'undo' | 'back' | 'delete' | 'bury' | 'suspend' | 'replay' | 'flip' | 'again' | 'hard' | 'good' | 'easy' |
  'edit' | 'mark' | 'flag0' | 'flag1' | 'flag2' | 'flag3' | 'flag4' | 'flag5' | 'flag6' | 'flag7' |
  'menu' | 'guide' | 'whiteboard' | 'auto_advance';

export type StudyKeySide = 'question' | 'answer' | 'both';
export interface StudyKeyBinding { key: string; command: StudyInputCommand; side: StudyKeySide; }
export interface StudyKeyboard { version: number; bindings: StudyKeyBinding[]; }
export interface StudyKeyModifiers { ctrl: boolean; shift: boolean; alt: boolean; }
export interface StudyKeyboardAction { id: StudyInputCommand; titleKey: string; }
export interface StudyKeyboardField { id: string; titleKey: string; }
export const STUDY_KEYBOARD_FIELDS: StudyKeyboardField[] = [
  { id: 'close', titleKey: 'cancel' }, { id: 'save', titleKey: 'browser_detail_save' },
  { id: 'command', titleKey: 'study_keyboard_command' }, { id: 'side', titleKey: 'study_keyboard_side' },
  { id: 'key', titleKey: 'study_keyboard_key_hint' }, { id: 'record', titleKey: 'study_keyboard_record' },
  { id: 'add', titleKey: 'study_keyboard_add' }, { id: 'reset', titleKey: 'study_keyboard_reset' },
  { id: 'reload', titleKey: 'study_keyboard_reload' }
];
/** 设置、运行时与 JIDE 共用动作目录；只声明已经接通的学习操作。 */
export const STUDY_KEYBOARD_ACTIONS: StudyKeyboardAction[] = [
  { id: 'flip', titleKey: 'study_show_answer' },
  { id: 'again', titleKey: 'rating_again' }, { id: 'hard', titleKey: 'rating_hard' },
  { id: 'good', titleKey: 'rating_good' }, { id: 'easy', titleKey: 'rating_easy' },
  { id: 'undo', titleKey: 'study_undo' }, { id: 'replay', titleKey: 'study_replay_sound' },
  { id: 'edit', titleKey: 'study_edit_note' }, { id: 'mark', titleKey: 'card_mark_mark' },
  { id: 'bury', titleKey: 'study_bury' }, { id: 'suspend', titleKey: 'study_suspend' },
  { id: 'delete', titleKey: 'study_delete_card' }, { id: 'back', titleKey: 'study_back' },
  { id: 'flag0', titleKey: 'study_keyboard_flag0' },
  { id: 'flag1', titleKey: 'study_keyboard_flag1' }, { id: 'flag2', titleKey: 'study_keyboard_flag2' },
  { id: 'flag3', titleKey: 'study_keyboard_flag3' }, { id: 'flag4', titleKey: 'study_keyboard_flag4' },
  { id: 'flag5', titleKey: 'study_keyboard_flag5' }, { id: 'flag6', titleKey: 'study_keyboard_flag6' },
  { id: 'flag7', titleKey: 'study_keyboard_flag7' },
  { id: 'menu', titleKey: 'study_more' }, { id: 'guide', titleKey: 'study_keyboard_guide' },
  { id: 'whiteboard', titleKey: 'study_keyboard_whiteboard' },
  { id: 'auto_advance', titleKey: 'study_keyboard_auto_advance' }
];
export function studyChordLabel(key: string): string {
  return key.split('+').map((part: string): string => part === 'ctrl' ? 'Ctrl' : part === 'alt' ? 'Alt' :
    part === 'shift' ? 'Shift' : part === 'space' ? 'Space' : part === 'escape' ? 'Esc' :
      part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join('+');
}
export function defaultStudyKeyboard(): StudyKeyboard {
  const bindings: StudyKeyBinding[] = [];
  for (const key of ['space', 'enter', 'numpadenter']) {
    bindings.push({ key: key, command: 'flip', side: 'question' }, { key: key, command: 'good', side: 'answer' });
  }
  const ratings: StudyInputCommand[] = ['again', 'hard', 'good', 'easy'];
  for (let index: number = 0; index < ratings.length; index++) {
    bindings.push({ key: String(index + 1), command: ratings[index], side: 'answer' },
      { key: 'numpad' + String(index + 1), command: ratings[index], side: 'answer' });
  }
  bindings.push({ key: 'ctrl+z', command: 'undo', side: 'both' },
    { key: 'escape', command: 'back', side: 'both' }, { key: 'delete', command: 'delete', side: 'both' },
    { key: 'e', command: 'edit', side: 'both' }, { key: 'shift+8', command: 'mark', side: 'both' },
    { key: 'star', command: 'mark', side: 'both' }, { key: 'minus', command: 'bury', side: 'both' },
    { key: 'b', command: 'bury', side: 'both' }, { key: 's', command: 'suspend', side: 'both' },
    { key: 'shift+2', command: 'suspend', side: 'both' }, { key: 'at', command: 'suspend', side: 'both' },
    { key: 'r', command: 'replay', side: 'both' }, { key: 'f5', command: 'replay', side: 'both' });
  for (let flag: number = 1; flag <= 7; flag++) {
    const command: StudyInputCommand = ('flag' + flag) as StudyInputCommand;
    bindings.push({ key: 'ctrl+' + flag, command: command, side: 'both' },
      { key: 'ctrl+numpad' + flag, command: command, side: 'both' });
  }
  return { version: 1, bindings: bindings };
}
export function studyBindingConflict(bindings: StudyKeyBinding[], binding: StudyKeyBinding): boolean {
  return bindings.some((other: StudyKeyBinding): boolean => other.key === binding.key &&
    (other.side === binding.side || other.side === 'both' || binding.side === 'both'));
}
export function validateStudyKeyboard(value: StudyKeyboard): StudyKeyboard {
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 2 || value.version !== 1 ||
    !Array.isArray(value.bindings) || value.bindings.length > 256) throw new Error('invalid_study_keyboard');
  const bindings: StudyKeyBinding[] = [];
  for (const item of value.bindings) {
    if (item === null || typeof item !== 'object' || Object.keys(item).length !== 3 ||
      !STUDY_KEYBOARD_ACTIONS.some((action: StudyKeyboardAction): boolean => action.id === item.command) ||
      !['question', 'answer', 'both'].includes(item.side)) throw new Error('invalid_study_binding');
    const next: StudyKeyBinding = { key: normalizeKeyboardChord(item.key), command: item.command, side: item.side };
    if (studyBindingConflict(bindings, next)) throw new Error('study_key_conflict');
    bindings.push(next);
  }
  return { version: 1, bindings: bindings };
}
export function studyKeyboardCommand(bindings: StudyKeyBinding[], chord: string, phase: string): StudyInputCommand {
  const item: StudyKeyBinding | undefined = bindings.find((binding: StudyKeyBinding): boolean =>
    binding.key === chord && (binding.side === 'both' || binding.side === phase));
  if (item === undefined) return 'none';
  if (phase !== 'question' && phase !== 'answer') return ['back', 'undo'].includes(item.command) ? item.command : 'none';
  if (item.command === 'flip' && phase !== 'question') return 'none';
  if (['again', 'hard', 'good', 'easy'].includes(item.command) && phase !== 'answer') return 'none';
  return item.command;
}
