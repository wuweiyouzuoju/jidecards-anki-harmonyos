// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentCardBatch } from '../../entry/src/main/ets/model/agent/AgentCardBatch.ts';
import { buildProviderDraftContext, limitProviderInput, truncateProviderText } from '../../entry/src/main/ets/model/agent/AgentProviderContext.ts';
import { mergeAgentImportedFiles } from '../../entry/src/main/ets/model/agent/AgentFileImport.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const message = content => ({ kind: 'message', role: 'user', content, callId: '', name: '', argumentsJson: '', output: '' });
const card = (text, selected = true, status = 'draft') => ({ fields: [text], 已选中: selected, 状态: status });

test('context truncation obeys every small budget, retains both ends when possible', () => {
  const value = 'BEGIN' + 'x'.repeat(500) + 'END';
  for (let budget = 0; budget < 600; budget++) assert.ok(truncateProviderText(value, budget).length <= budget);
  const result = truncateProviderText(value, 100);
  assert.ok(result.startsWith('BEGIN')); assert.ok(result.endsWith('END'));
  assert.match(result, /truncated/);
});

test('provider history retains latest items in order without exceeding aggregate or item limits', () => {
  const source = [message('old'.repeat(100)), message('x'.repeat(239999))];
  const result = limitProviderInput(source);
  assert.equal(result.reduce((sum, item) => sum + item.content.length, 0), 240000);
  assert.equal(result[1].content, source[1].content);
  assert.equal(source[0].content.length, 300);
  assert.deepEqual(limitProviderInput(Array.from({ length: 100 }, (_, i) => message(String(i)))).map(x => x.content),
    Array.from({ length: 80 }, (_, i) => String(i + 20)));
});

test('draft context preserves actual status and explicitly reports field and operation truncation', () => {
  const change = { id: 'd', risk: 'write', summary: 'summary', status: 'pending', operations:
    Array.from({ length: 201 }, () => ({ kind: 'update_field', noteId: 1, cardId: 2, deckId: 3, fieldOrd: 0, before: '', after: 'a' })) };
  const text = buildProviderDraftContext({ 卡片列表: [card('f'.repeat(3000), false, 'saved')], 变更草稿列表: [change], 批次结果: 'partial' });
  const context = JSON.parse(text.slice(text.indexOf('{')));
  assert.equal(context.cards[0].status, 'saved'); assert.equal(context.cards[0].selected, false);
  assert.equal(context.cards[0].fields[0].length, 2000);
  assert.equal(context.changes[0].operations.length, 200); assert.equal(context.truncated, true);
  assert.equal(context.executionResult, 'partial'); assert.match(text, /不代表已保存/);
});

test('batch fixes all accepted inputs before waiting, rejects overlap and continues after per-card failures', async () => {
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity(), batch = new AgentCardBatch(scheduler, activity);
  activity.reserveCollection();
  const cards = [card('first'), card('second'), card('third'), card('skip', false), card('saved', true, 'saved')];
  const writes = [], updates = [];
  const save = async (fields, deck, type) => { writes.push([fields, deck, type]); if (fields[0] === 'second') throw new Error('disk'); return ''; };
  const result = batch.run(cards, 1, 2, save, 'failed', (index, error) => updates.push([index, error]));
  cards[1].fields[0] = 'changed'; cards[2].已选中 = false;
  await assert.rejects(batch.run(cards, 3, 4, save, 'failed', () => {}), /already running/);
  assert.equal(writes.length, 0); assert.equal(scheduler.canSync(), false);
  activity.cancelReservation();
  assert.deepEqual(await result, { succeeded: 2, failed: 1 });
  assert.deepEqual(writes, [[['first'], 1, 2], [['second'], 1, 2], [['third'], 1, 2]]);
  assert.deepEqual(updates, [[0, ''], [1, 'failed'], [2, '']]);
  assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), true); assert.equal(batch.isRunning(), false);
});

test('batch retains sync ownership through final write and failed or empty batches do not request sync', async () => {
  for (const cards of [[], [card('fail')]]) {
    const scheduler = new AutoSyncScheduler(), batch = new AgentCardBatch(scheduler, new SyncActivity());
    await batch.run(cards, 1, 2, async () => 'error', 'failed', () => {});
    assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), false);
  }
  const scheduler = new AutoSyncScheduler(), batch = new AgentCardBatch(scheduler, new SyncActivity()), gate = deferred();
  const result = batch.run([card('accepted')], 1, 2, async () => { await gate.promise; return ''; }, 'failed', () => {});
  assert.equal(scheduler.canSync(), false); gate.resolve(); await result; assert.equal(scheduler.canSync(), true);
});

test('file merge enforces a shared text budget and count, keeps errors and never mutates parser results', () => {
  const file = (id, content, errorCode = '', warningCode = '') => ({ id, name: id, extension: '.txt', byteSize: 1, content, errorCode, warningCode });
  const previous = [file('a', 'a'.repeat(159999))], selected = [file('b', 'bbb'), file('bad', '', 'parse_failed'), file('c', 'c')];
  const merged = mergeAgentImportedFiles(previous, selected);
  assert.equal(merged[1].content, 'b'); assert.equal(merged[1].warningCode, 'content_truncated');
  assert.equal(merged[2].errorCode, 'parse_failed'); assert.equal(merged[3].errorCode, 'context_limit');
  assert.equal(selected[0].content, 'bbb'); assert.equal(previous[0].content.length, 159999);
  assert.equal(mergeAgentImportedFiles([], Array.from({ length: 20 }, (_, i) => file(String(i), 'a'))).length, 10);
});
