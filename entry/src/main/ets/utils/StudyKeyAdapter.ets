// SPDX-License-Identifier: AGPL-3.0-or-later
import { KeyCode } from '@kit.InputKit';
export function studyKeyName(code: number): string {
  switch (code) {
    case KeyCode.KEYCODE_CTRL_LEFT: return 'control';
    case KeyCode.KEYCODE_CTRL_RIGHT: return 'control';
    case KeyCode.KEYCODE_Z: return 'z';
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
    default: return '';
  }
}
