// SPDX-License-Identifier: AGPL-3.0-or-later
import { keyboardEventChord, keyboardKeyName } from './KeyboardKeyAdapter';
export function studyEventChord(event: KeyEvent, fallbackControl: boolean = false): string { return keyboardEventChord(event, fallbackControl); }
export function studyKeyName(code: number): string { return keyboardKeyName(code); }
