// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../entry/src/main/ets/utils/UiFeedback.ets', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), { mode: 'transform' });

export function loadUiFeedback(hilog = { error() {}, warn() {} }) {
  return new Function('hilog', js + '\nreturn { resourceText, namedResourceText, showToastSafely };')(hilog);
}

export const uiFeedback = loadUiFeedback();

// Extracted page methods use the real shared helper, not a duplicated fallback implementation.
export function compileWithUiFeedback(...parameters) {
  const compiled = new Function(...Object.keys(uiFeedback), ...parameters);
  return function (...args) { return compiled.call(this, ...Object.values(uiFeedback), ...args); };
}
