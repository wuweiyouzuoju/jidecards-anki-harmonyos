// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'entry/src/main/ets/backend/agent/HighRiskAgentTools.ets');

test('all six destructive or structural tools are high-risk proposals', () => {
  for (const name of [
    'propose_delete_notes', 'propose_delete_cards', 'propose_change_note_type',
    'propose_update_note_type_templates', 'propose_delete_deck', 'propose_delete_note_type',
  ]) {
    assert.equal(toolRiskOf(name), 'high_risk');
  }
});

test('high-risk tools calculate impact through official read services before drafting', () => {
  const source = fs.readFileSync(target, 'utf8');
  assert.match(source, /registerHighRiskDraft/g);
  assert.match(source, /获取笔记的卡片/);
  assert.match(source, /获取变更笔记类型信息/);
  assert.match(source, /获取笔记类型旧版/);
  assert.match(source, /readAgentDeckDeletionImpact/);
  assert.match(fs.readFileSync(path.join(root, 'entry/src/main/ets/backend/agent/AgentDeckDeletionImpact.ets'), 'utf8'), /搜索卡片/);
  assert.match(source, /搜索笔记/);
  assert.match(source, /affectedCardIds/);
  assert.match(source, /confirmationLevel:\s*2/);
});

test('proposal module performs no destructive or structural write', () => {
  const source = fs.readFileSync(target, 'utf8');
  assert.doesNotMatch(source, /\.删除卡片\(|\.删除牌组\(|\.移除笔记类型\(/);
  assert.doesNotMatch(source, /\.变更笔记类型\(|\.更新笔记类型旧版\(/);
  assert.doesNotMatch(source, /\.更新笔记\(|\.添加笔记\(/);
});

test('high-risk drafts use real cards and refuse more than the hard ceiling', () => {
  const source = fs.readFileSync(target, 'utf8');
  assert.match(source, /MAX_BATCH_LIMIT/);
  assert.match(source, /high_risk_batch_too_large/);
  assert.match(source, /baselineHash/);
  assert.match(source, /status:\s*'pending'/);
});
