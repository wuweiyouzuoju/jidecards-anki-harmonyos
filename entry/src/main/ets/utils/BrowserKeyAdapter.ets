// SPDX-License-Identifier: AGPL-3.0-or-later
import { KeyCode } from '@kit.InputKit';
export function browserKeyName(code: number): string {
  switch (code) {
    case KeyCode.KEYCODE_A: return 'a';
    case KeyCode.KEYCODE_B: return 'b';
    case KeyCode.KEYCODE_C: return 'c';
    case KeyCode.KEYCODE_D: return 'd';
    case KeyCode.KEYCODE_E: return 'e';
    case KeyCode.KEYCODE_F: return 'f';
    case KeyCode.KEYCODE_G: return 'g';
    case KeyCode.KEYCODE_H: return 'h';
    case KeyCode.KEYCODE_I: return 'i';
    case KeyCode.KEYCODE_J: return 'j';
    case KeyCode.KEYCODE_K: return 'k';
    case KeyCode.KEYCODE_L: return 'l';
    case KeyCode.KEYCODE_M: return 'm';
    case KeyCode.KEYCODE_N: return 'n';
    case KeyCode.KEYCODE_O: return 'o';
    case KeyCode.KEYCODE_P: return 'p';
    case KeyCode.KEYCODE_Q: return 'q';
    case KeyCode.KEYCODE_R: return 'r';
    case KeyCode.KEYCODE_S: return 's';
    case KeyCode.KEYCODE_T: return 't';
    case KeyCode.KEYCODE_U: return 'u';
    case KeyCode.KEYCODE_V: return 'v';
    case KeyCode.KEYCODE_W: return 'w';
    case KeyCode.KEYCODE_X: return 'x';
    case KeyCode.KEYCODE_Y: return 'y';
    case KeyCode.KEYCODE_Z: return 'z';
    case KeyCode.KEYCODE_0: return '0';
    case KeyCode.KEYCODE_1: return '1';
    case KeyCode.KEYCODE_2: return '2';
    case KeyCode.KEYCODE_3: return '3';
    case KeyCode.KEYCODE_4: return '4';
    case KeyCode.KEYCODE_5: return '5';
    case KeyCode.KEYCODE_6: return '6';
    case KeyCode.KEYCODE_7: return '7';
    case KeyCode.KEYCODE_ESCAPE: return 'escape';
    case KeyCode.KEYCODE_FORWARD_DEL: return 'delete';
    case KeyCode.KEYCODE_SPACE: return ' ';
    case KeyCode.KEYCODE_ENTER: return 'enter';
    case KeyCode.KEYCODE_DPAD_UP: return 'arrowup';
    case KeyCode.KEYCODE_DPAD_DOWN: return 'arrowdown';
    case KeyCode.KEYCODE_F5: return 'f5';
    default: return '';
  }
}
