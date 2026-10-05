// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 同一批输出由 native/rsharmony/tests/card_rendering.rs 的锁定 Core RPC 验证。
export const answerCases = JSON.parse(readFileSync(new URL('./fixtures/core-answer-comparison.json', import.meta.url), 'utf8'));
export const clozeCases = JSON.parse(readFileSync(new URL('./fixtures/core-cloze-typing.json', import.meta.url), 'utf8'));
export const coreTyping = {
  compareAnswer: async (expected, provided, combining) => {
    const row = answerCases.find(row => row.expected === expected && row.provided === provided && row.combining === combining);
    assert.ok(row, `Missing verified Core comparison: ${JSON.stringify([expected, provided, combining])}`);
    return row.html;
  },
  extractClozeForTyping: async (text, ordinal) => {
    const row = clozeCases.find(row => row.text === text && row.ordinal === ordinal);
    assert.ok(row, `Missing verified Core cloze: ${JSON.stringify([text, ordinal])}`);
    return row.expected;
  }
};
