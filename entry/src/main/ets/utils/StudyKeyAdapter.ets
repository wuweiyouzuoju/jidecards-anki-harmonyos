// SPDX-License-Identifier: AGPL-3.0-or-later
import { KeyCode } from '@kit.InputKit';
import { studyChord } from '../model/StudyKeyboard';
export function studyEventChord(event: KeyEvent, fallbackControl: boolean = false): string {
  if (event.metaKey !== undefined && event.metaKey !== 0) return '';
  return studyChord(studyKeyName(event.keyCode), {
    ctrl: event.getModifierKeyState?.(['Ctrl']) ?? fallbackControl,
    shift: event.getModifierKeyState?.(['Shift']) ?? false,
    alt: event.getModifierKeyState?.(['Alt']) ?? false
  });
}
export function studyKeyName(code: number): string {
  if (code >= KeyCode.KEYCODE_A && code <= KeyCode.KEYCODE_Z) return String.fromCharCode(97 + code - KeyCode.KEYCODE_A);
  if (code >= KeyCode.KEYCODE_0 && code <= KeyCode.KEYCODE_9) return String(code - KeyCode.KEYCODE_0);
  if (code >= KeyCode.KEYCODE_F1 && code <= KeyCode.KEYCODE_F12) return 'f' + String(1 + code - KeyCode.KEYCODE_F1);
  if (code >= KeyCode.KEYCODE_NUMPAD_0 && code <= KeyCode.KEYCODE_NUMPAD_9) return 'numpad' + String(code - KeyCode.KEYCODE_NUMPAD_0);
  switch (code) {
    case KeyCode.KEYCODE_BACK: return 'back';
    case KeyCode.KEYCODE_CTRL_LEFT: return 'control';
    case KeyCode.KEYCODE_CTRL_RIGHT: return 'control';
    case KeyCode.KEYCODE_SHIFT_LEFT: case KeyCode.KEYCODE_SHIFT_RIGHT: return 'shift';
    case KeyCode.KEYCODE_ALT_LEFT: case KeyCode.KEYCODE_ALT_RIGHT: return 'alt';
    case KeyCode.KEYCODE_META_LEFT: case KeyCode.KEYCODE_META_RIGHT: return 'meta';
    case KeyCode.KEYCODE_Z: return 'z';
    case KeyCode.KEYCODE_Y: return 'y';
    case KeyCode.KEYCODE_ESCAPE: return 'escape';
    case KeyCode.KEYCODE_FORWARD_DEL: return 'delete';
    case KeyCode.KEYCODE_STAR: return 'star';
    case KeyCode.KEYCODE_B: return 'b';
    case KeyCode.KEYCODE_AT: return 'at';
    case KeyCode.KEYCODE_S: return 's';
    case KeyCode.KEYCODE_R: return 'r';
    case KeyCode.KEYCODE_SPACE: return 'space';
    case KeyCode.KEYCODE_ENTER: return 'enter';
    case KeyCode.KEYCODE_1: return '1';
    case KeyCode.KEYCODE_2: return '2';
    case KeyCode.KEYCODE_3: return '3';
    case KeyCode.KEYCODE_4: return '4';
    case KeyCode.KEYCODE_DEL: return 'backspace';
    case KeyCode.KEYCODE_TAB: return 'tab';
    case KeyCode.KEYCODE_DPAD_UP: return 'arrowup';
    case KeyCode.KEYCODE_DPAD_DOWN: return 'arrowdown';
    case KeyCode.KEYCODE_DPAD_LEFT: return 'arrowleft';
    case KeyCode.KEYCODE_DPAD_RIGHT: return 'arrowright';
    case KeyCode.KEYCODE_MOVE_HOME: return 'home';
    case KeyCode.KEYCODE_MOVE_END: return 'end';
    case KeyCode.KEYCODE_PAGE_UP: return 'pageup';
    case KeyCode.KEYCODE_PAGE_DOWN: return 'pagedown';
    case KeyCode.KEYCODE_INSERT: return 'insert';
    case KeyCode.KEYCODE_MINUS: return 'minus';
    case KeyCode.KEYCODE_EQUALS: return 'equals';
    case KeyCode.KEYCODE_COMMA: return 'comma';
    case KeyCode.KEYCODE_PERIOD: return 'period';
    case KeyCode.KEYCODE_SLASH: return 'slash';
    case KeyCode.KEYCODE_BACKSLASH: return 'backslash';
    case KeyCode.KEYCODE_SEMICOLON: return 'semicolon';
    case KeyCode.KEYCODE_APOSTROPHE: return 'quote';
    case KeyCode.KEYCODE_GRAVE: return 'backquote';
    case KeyCode.KEYCODE_LEFT_BRACKET: return 'bracketleft';
    case KeyCode.KEYCODE_RIGHT_BRACKET: return 'bracketright';
    case KeyCode.KEYCODE_NUMPAD_ENTER: return 'numpadenter';
    case KeyCode.KEYCODE_NUMPAD_ADD: return 'numpadadd';
    case KeyCode.KEYCODE_NUMPAD_SUBTRACT: return 'numpadsubtract';
    case KeyCode.KEYCODE_NUMPAD_MULTIPLY: return 'numpadmultiply';
    case KeyCode.KEYCODE_NUMPAD_DIVIDE: return 'numpaddivide';
    case KeyCode.KEYCODE_NUMPAD_DOT: return 'numpaddot';
    default: return Number.isInteger(code) && code > 0 && code <= 999999 ? 'code:' + String(code) : '';
  }
}
