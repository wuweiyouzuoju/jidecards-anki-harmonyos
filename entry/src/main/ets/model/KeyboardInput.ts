// SPDX-License-Identifier: AGPL-3.0-or-later
/** 页面无关的组合键和按下去重；具体命令由各页面拥有。 */
export interface KeyboardModifiers { ctrl: boolean; shift: boolean; alt: boolean; }
/** 一次按下只执行一次，持有键跨翻面不能连续评分；松开与焦点切换由宿主通知。 */
export class KeyboardPressSession {
  private held: Set<number> = new Set<number>();
  update(code: number, down: boolean): boolean {
    if (!down) { this.held.delete(code); return false; }
    if (this.held.has(code)) return false;
    this.held.add(code); return true;
  }
  reset(): void { this.held.clear(); }
}

const NAMED_KEYS: string[] = ['space', 'enter', 'escape', 'delete', 'backspace', 'tab',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'pageup', 'pagedown', 'insert',
  'numpadenter', 'numpadadd', 'numpadsubtract', 'numpadmultiply', 'numpaddivide', 'numpaddot'];

/** 物理键身份不受键盘布局影响；其余设备键可以用录制得到的 code:N 绑定。 */
export function normalizeKeyboardChord(input: string): string {
  if (typeof input !== 'string' || input.length > 80) throw new Error('invalid_study_key');
  const parts: string[] = input.trim().toLowerCase().split('+');
  const key: string = parts.pop() ?? '';
  const mods: Set<string> = new Set<string>();
  for (const part of parts) {
    if (!['ctrl', 'shift', 'alt'].includes(part) || mods.has(part)) throw new Error('invalid_study_key');
    mods.add(part);
  }
  const valid: boolean = /^[a-z0-9]$/.test(key) || /^f([1-9]|1[0-2])$/.test(key) ||
    /^numpad[0-9]$/.test(key) || /^code:[1-9][0-9]{0,5}$/.test(key) || NAMED_KEYS.includes(key) ||
    ['minus', 'equals', 'comma', 'period', 'slash', 'backslash', 'semicolon', 'quote', 'backquote', 'bracketleft', 'bracketright', 'star', 'at', 'exclamation'].includes(key);
  if (!valid) throw new Error('invalid_study_key');
  return (mods.has('ctrl') ? 'ctrl+' : '') + (mods.has('shift') ? 'shift+' : '') +
    (mods.has('alt') ? 'alt+' : '') + key;
}
export function keyboardChord(key: string, modifiers: KeyboardModifiers): string {
  if (key === '' || ['back', 'control', 'shift', 'alt', 'meta'].includes(key)) return '';
  return normalizeKeyboardChord((modifiers.ctrl ? 'ctrl+' : '') + (modifiers.shift ? 'shift+' : '') +
    (modifiers.alt ? 'alt+' : '') + key);
}
