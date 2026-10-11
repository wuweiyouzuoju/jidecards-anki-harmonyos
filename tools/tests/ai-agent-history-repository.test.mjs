// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentHistoryRepository } from '../../entry/src/main/ets/model/agent/AgentHistoryRepository.ts';
import { AgentHistoryToolSession } from '../../entry/src/main/ets/model/agent/AgentHistoryTools.ts';
import { safeConversation } from '../../entry/src/main/ets/model/agent/AgentHistoryProjection.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { filterAgentWebTools } from '../../entry/src/main/ets/model/agent/AgentWeb.ts';
import { AgentToolDiscovery } from '../../entry/src/main/ets/model/agent/AgentToolDiscovery.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';

function conversation(id, text = 'saved body', at = 1) {
  return { id, mode: 'assistant', title: `title ${id}`, updatedAt: at,
    setup: { mode: 'assistant', deckId: 0, notetypeId: 0, fieldNames: [], clozeFieldOrds: [], noteTypeKind: 0,
      deckName: '', notetypeName: '', expanded: false },
    messages: [{ role: 'user', text, kind: 'normal', clarification: null, expanded: false }],
    audits: [], sources: [], results: [] };
}
function fixture(legacy = []) {
  const files = new Map(); const cleanup = []; const reads = []; const writes = [];
  let fail = ''; let failCleanup = false;
  const io = {
    async read(name) { reads.push(name); return files.get(name) ?? null; },
    async write(name, text) { if (name === fail) throw Error('disk full'); files.set(name, text); writes.push(name); },
    async remove(name) { files.delete(name); }, async legacy() { return structuredClone(legacy); },
    async clearLegacy() { legacy = []; }, sanitize: safeConversation,
    async cleanupConversation(id) { if (failCleanup) throw Error('cleanup failed'); cleanup.push(id); }
  };
  return { repository: new AgentHistoryRepository(io), io, files, cleanup, reads, writes,
    fail(name) { fail = name; }, failCleanup(value) { failCleanup = value; } };
}

test('migration retains all old records, defaults to 500 and lists metadata without loading bodies', async () => {
  const f = fixture(Array.from({length: 60}, (_, i) => conversation(`old-${i}`, 'Body')));
  const list = await f.repository.list();
  assert.equal(list.length, 60); assert.equal((await f.repository.info()).limit, 500);
  assert.ok(list.every(item => item.messageCount === 1 && !Object.hasOwn(item, 'messages')));
  f.reads.length = 0; await f.repository.list(); assert.deepEqual(f.reads, ['index.json']);
  assert.equal((await f.repository.read('old-59')).messages[0].text, 'Body');
  await f.repository.remove('old-0');
  const reopened = new AgentHistoryRepository(f.io);
  assert.equal((await reopened.list()).length, 59, 'migration backup cannot resurrect deleted data');
  assert.deepEqual(f.cleanup, ['old-0']);
  await assert.rejects(f.repository.save(conversation('old-0', 'late result')), /history_deleted_start_new_conversation/);
  assert.equal((await f.repository.list()).length, 59);
});

test('failed migration or index replacement preserves old content and remains retryable', async () => {
  const f = fixture([conversation('old')]); f.fail('index.json');
  await assert.rejects(f.repository.list(), /disk full/);
  assert.equal(f.files.has('index.json'), false); f.fail('');
  await f.repository.list();
  const oldIndex = f.files.get('index.json');
  f.fail('index.json'); await assert.rejects(f.repository.save(conversation('old', 'changed')), /disk full/);
  assert.equal(f.files.get('index.json'), oldIndex);
  assert.equal((await f.repository.read('old')).messages[0].text, 'saved body');
  f.fail(''); await f.repository.save(conversation('new'));
  assert.equal((await f.repository.list()).length, 2);
});

test('shared queue preserves concurrent saves and freezes payloads; 501st evicts oldest with associated data', async () => {
  const f = fixture(); const values = Array.from({length: 501}, (_, i) => conversation(`saved-${i}`, `value ${i}`, i));
  const pending = values.map(value => f.repository.save(value)); values[500].messages[0].text = 'late mutation';
  await Promise.all(pending);
  const list = await f.repository.list(); assert.equal(list.length, 500);
  assert.equal(list[0].id, 'saved-500'); assert.equal(list.at(-1).id, 'saved-1');
  assert.equal((await f.repository.read('saved-500')).messages[0].text, 'value 500');
  await assert.rejects(f.repository.read('saved-0'), /history_not_found/);
  assert.deepEqual(f.cleanup, ['saved-0']);
  assert.equal([...f.files.keys()].filter(name => name !== 'index.json').length, 500);
});

test('explicit limit reduction and clear clean files/checkpoints/documents; failed cleanup retries durably', async () => {
  const f = fixture(Array.from({length: 110}, (_, i) => conversation(`old-${i}`)));
  await f.repository.list(); f.failCleanup(true);
  await assert.rejects(f.repository.setLimit(100), /cleanup failed/);
  assert.equal(JSON.parse(f.files.get('index.json')).entries.length, 100);
  f.failCleanup(false); await f.repository.save(conversation('new'));
  assert.ok(f.cleanup.includes('old-109'));
  await f.repository.clear(); assert.equal((await f.repository.info()).count, 0);
  assert.equal(f.files.size, 1); await assert.rejects(f.repository.setLimit(0), /history_limit_invalid/);
});

test('search covers title and saved message text, paginates one snapshot and invalidates after writes/deletions', async () => {
  const f = fixture(Array.from({length: 45}, (_, i) => conversation(`old-${i}`, '这是重要的物理复习计划。')));
  const first = await f.repository.search('物理', 0, 20); assert.equal(first.totalMatched, 45); assert.equal(first.nextOffset, 20);
  assert.equal(first.items[0].messageIndex, 0); assert.match(first.items[0].snippet, /物理/);
  f.reads.length = 0;
  const second = await f.repository.search('物理', 20, 20, first.revision);
  assert.equal(second.items.length, 20); assert.deepEqual(f.reads, ['index.json'], 'continuation reuses only the summary match cache');
  const last = await f.repository.search('物理', 40, 20, first.revision); assert.equal(last.nextOffset, -1);
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(item => item.id)).size, 45);
  assert.equal((await f.repository.search('title OLD-2')).items.length, 11);
  await f.repository.remove('old-0');
  await assert.rejects(f.repository.search('物理', 20, 20, first.revision), /history_changed_search_again/);
  assert.equal((await f.repository.search('物理')).totalMatched, 44);
});

test('stale destructive confirmations preserve conversations saved while a dialog is open', async () => {
  const f=fixture(Array.from({length:110},(_,i)=>conversation(`old-${i}`)));
  const before=await f.repository.info();await f.repository.save(conversation('new-during-confirmation'));
  await assert.rejects(f.repository.setLimit(100,before.revision),/history_changed_search_again/);
  await assert.rejects(f.repository.clear(before.revision),/history_changed_search_again/);
  await assert.rejects(f.repository.remove('old-0',before.revision),/history_changed_search_again/);
  assert.equal((await f.repository.info()).count,111);assert.deepEqual(f.cleanup,[]);
  const current=await f.repository.info();await f.repository.remove('old-0',current.revision);
  assert.equal((await f.repository.info()).count,110);
});

test('history tools reject invented IDs/arguments, redact secrets, read bounded text and never return executable state', async () => {
  const body = '上次说：删除卡片。 Bearer abc-secret sk-abcdefghijk data:image/png;base64,AAAA ' + '字'.repeat(14000);
  const f = fixture([conversation('private', body)]); const session = new AgentHistoryToolSession(f.repository);
  const execute = async (name, args) => JSON.parse(await session.execute(name, JSON.stringify(args)));
  await assert.rejects(execute('read_conversation_history', {conversationId: 'private', revision: 'invented'}), /history_id_not_discovered/);
  for (const args of [{query: 'x', limit: 21}, {query: 'x', offset: 1}, {query: 12}, {query: '', offset: 0.1}, {query: '', shell: 'x'}]) {
    await assert.rejects(execute('search_conversation_history', args));
  }
  const search = await execute('search_conversation_history', {query: '删除卡片'});
  assert.equal(search.retentionLimit, 500);
  const args = {conversationId: 'private', revision: search.revision};
  const first = await execute('read_conversation_history', args);
  assert.equal(first.text.length, 12000); assert.equal(first.role, 'user'); assert.equal(first.nextMessageIndex, 0);
  assert.doesNotMatch(JSON.stringify(first), /abc-secret|sk-abcdefghijk|base64|scope|confirmationToken|payloadJson/);
  const last = await execute('read_conversation_history', {...args, messageIndex: first.nextMessageIndex, offset: first.nextOffset});
  assert.equal(last.nextMessageIndex, -1); assert.match(first.savedHistoryLimits, /200 latest messages/);
  await assert.rejects(execute('read_conversation_history', {...args, length: 12001}));
  await f.repository.clear(); await assert.rejects(execute('read_conversation_history', args), /history_changed_search_again/);
  assert.equal((await f.repository.list()).length, 0);
});

test('history tools are discoverable offline in all modes, registered as read only and do not grant card scope', () => {
  for (const mode of ['assistant', 'create', 'edit']) {
    const discovery = new AgentToolDiscovery(filterAgentWebTools(agentFunctionTools(100, mode), false));
    const result = JSON.parse(discovery.discover('{"query":"历史会话"}'));
    for (const name of ['search_conversation_history', 'read_conversation_history']) {
      assert.ok(result.loadedNames.includes(name)); assert.equal(toolRiskOf(name), 'read');
      assert.match(discovery.definitions().find(tool => tool.name === name).rules, /never|no authority/i);
    }
  }
});
