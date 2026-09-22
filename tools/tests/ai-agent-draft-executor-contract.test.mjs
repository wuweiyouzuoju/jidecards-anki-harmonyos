// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AgentConfirmationError,
  AgentConfirmationManager,
} from '../../entry/src/main/ets/model/agent/AgentConfirmation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('confirmation tokens are draft-bound, level-bound, expiring and one-use', () => {
  const manager = new AgentConfirmationManager(1000);
  const level1 = manager.issue('draft-a', 1, 10_000);
  assert.throws(
    () => manager.consume(level1, 'draft-b', 1, 10_100),
    (error) => error instanceof AgentConfirmationError && error.code === 'confirmation_mismatch',
  );
  assert.doesNotThrow(() => manager.consume(level1, 'draft-a', 1, 10_100));
  assert.throws(() => manager.consume(level1, 'draft-a', 1, 10_200), /confirmation_already_used/);

  const expired = manager.issue('draft-a', 2, 20_000);
  assert.throws(() => manager.consume(expired, 'draft-a', 2, 21_001), /confirmation_expired/);
});

test('high-risk confirmation requires distinct level-one and level-two tokens', () => {
  const manager = new AgentConfirmationManager();
  const first = manager.issue('danger', 1, 1);
  const second = manager.issue('danger', 2, 2);
  assert.doesNotThrow(() => manager.consumePair(first, second, 'danger', 3));

  const only = manager.issue('danger-2', 1, 4);
  assert.throws(() => manager.consumePair(only, only, 'danger-2', 5), /confirmation_tokens_not_distinct/);
});

test('confirmation can be checked without consuming it before the second dialog', () => {
  const manager = new AgentConfirmationManager(1000);
  const first = manager.issue('danger-check', 1, 10_000);
  assert.doesNotThrow(() => manager.check(first, 'danger-check', 1, 10_100));
  assert.doesNotThrow(() => manager.consume(first, 'danger-check', 1, 10_200));
});

test('ChangeDraft executor exposes confirmation paths and revalidates before preparation', () => {
  const executor = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/backend/agent/AgentDraftExecutor.ets'), 'utf8',
  );
  assert.match(executor, /async prepare\(/);
  assert.match(executor, /draft_conflict/);
  assert.match(executor, /executeOrdinary/);
  assert.match(executor, /executeHighRisk/);
  assert.match(executor, /consumePair/);
  assert.match(executor, /获取笔记\(/);
  assert.match(executor, /获取卡片\(/);
  assert.match(executor, /获取笔记类型旧版\(/);
  assert.match(executor, /获取牌组树\(/);
});

test('runner and tool registry cannot import or call the write executor', () => {
  const runner = fs.readFileSync(path.join(root, 'entry/src/main/ets/backend/agent/AgentRunner.ets'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'entry/src/main/ets/backend/agent/AgentToolRegistry.ets'), 'utf8');
  assert.doesNotMatch(runner + registry, /AgentDraftExecutor|AgentActionExecutor|executeConfirmed|executeHighRisk|executeOrdinary/);
});

test('executor marks a post-confirmation baseline mismatch as conflict before writing', () => {
  const executor = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/backend/agent/AgentDraftExecutor.ets'), 'utf8',
  );
  assert.match(executor, /private async revalidateForExecution/);
  assert.match(executor, /draft\.status = 'conflict'/);
  assert.match(executor, /await this\.revalidateForExecution\(draft\)/g);
});
