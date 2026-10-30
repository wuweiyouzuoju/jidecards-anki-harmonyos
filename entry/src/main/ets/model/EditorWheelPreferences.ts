// SPDX-License-Identifier: AGPL-3.0-or-later
export const WHEEL_ON_ENTRY_KEY: string = 'editor_wheel_on_entry';
export const WHEEL_ON_KEYBOARD_KEY: string = 'editor_wheel_on_keyboard';
export function isWheelPreference(key: string): boolean {
  return key === WHEEL_ON_ENTRY_KEY || key === WHEEL_ON_KEYBOARD_KEY;
}
