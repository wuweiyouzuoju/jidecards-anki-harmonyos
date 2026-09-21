import { cloneAgentCard } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { AgentCardBatch } from '../../entry/src/main/ets/model/agent/AgentCardBatch.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

// 只验证 ArkUI 接线；整批状态机使用直接导入的生产模型。
const source = readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets', import.meta.url), 'utf8');
const methods = ['保存单卡', '保存批次', '待保存数', '克隆卡片', 'currentMessageIndex', '更新卡片字段', '更新卡片选中'].map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness() {
  const broadcasts = [], writes = [], gate = deferred();
  const Page = new Function('cloneAgentCard', '$r', 'AppStorage', '笔记字段校验错误', stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + ';return Page;')(
    cloneAgentCard, value => value, { setOrCreate: (...args) => broadcasts.push(args) }, class extends Error {});
  const page = new Page(), scheduler = new AutoSyncScheduler();
  Object.assign(page, {
    pageDisposed: false, conversationId: 'original', cardBatch: new AgentCardBatch(scheduler, new SyncActivity()),
    消息列表: [{ id: 1, draftDeckId: 7, draftNotetypeId: 8, 批次保存中: false, 批次结果: '',
      卡片列表: ['a', 'b'].map(text => ({ fields: [text], 已选中: true, 状态: 'draft', 失败提示: '' })) }],
    取本地化文案: key => { assert.equal(page.pageDisposed, false, 'no UI access after disposal'); return key; },
    取本地化格式: (key, args) => key + args.join(','),
    更新消息: (index, update) => { assert.equal(page.pageDisposed, false); const message = structuredClone(page.消息列表[index]); update(message); page.消息列表[index] = message; },
    agentExecutor: {
      prepare: async draft => ({ draft, firstToken: 'confirmed' }),
      executeOrdinary: async (prepared, token) => {
        assert.equal(token, prepared.firstToken); writes.push(prepared.draft);
        if (writes.length === 1) await gate.promise;
        return { failed: 0 };
      }
    }
  });
  return { page, scheduler, broadcasts, writes, gate };
}

test('leaving during save completes all accepted drafts through confirmation executor without touching old UI', async () => {
  const h = harness(), result = h.page.保存批次(0);
  await new Promise(resolve => setImmediate(resolve));
  h.page.消息列表[0].卡片列表[1].fields[0] = 'late edit'; h.page.pageDisposed = true;
  assert.equal(h.scheduler.canSync(), false); h.gate.resolve(); await result;
  assert.deepEqual(h.writes.map(draft => draft.operations[0].after), ['a', 'b']);
  assert.ok(h.writes.every(draft => draft.affectedDeckIds[0] === 7 && draft.affectedNotetypeIds[0] === 8));
  assert.equal(h.broadcasts.length, 1); assert.equal(h.scheduler.canSync(), true);
});

test('late save cannot mark another conversation or replacement message as saved', async () => {
  for (const replaceConversation of [false, true]) {
    const h = harness(), result = h.page.保存批次(0);
    await new Promise(resolve => setImmediate(resolve));
    if (replaceConversation) h.page.conversationId = 'new';
    else h.page.消息列表[0].id = 2;
    const before = structuredClone(h.page.消息列表);
    h.gate.resolve(); await result; assert.deepEqual(h.page.消息列表, before);
    assert.equal(h.writes.length, 2);
  }
});

test('successful batch displays saved snapshots, clears busy state and rejects overlapping clicks', async () => {
  const h = harness(), result = h.page.保存批次(0);
  await h.page.保存批次(0); h.gate.resolve(); await result;
  assert.equal(h.writes.length, 2); assert.equal(h.page.消息列表[0].批次保存中, false);
  assert.ok(h.page.消息列表[0].卡片列表.every(card => card.状态 === 'saved'));
  assert.match(h.page.消息列表[0].批次结果, /all_ok2/);
});

test('failed cards remain editable for retry, while accepted or saved cards reject late editing', async () => {
  const h = harness(), card = h.page.消息列表[0].卡片列表[0];
  card.状态 = 'failed'; card.失败提示 = 'empty';
  h.page.更新卡片字段(0, 0, 0, 'corrected');
  assert.equal(h.page.消息列表[0].卡片列表[0].状态, 'draft');
  assert.equal(h.page.消息列表[0].卡片列表[0].失败提示, '');
  const result = h.page.保存批次(0);
  h.page.更新卡片字段(0, 0, 0, 'late'); h.page.更新卡片选中(0, 0, false);
  h.gate.resolve(); await result;
  assert.equal(h.writes[0].operations[0].after, 'corrected');
  h.page.更新卡片字段(0, 0, 0, 'saved change');
  assert.deepEqual(h.page.消息列表[0].卡片列表[0].fields, ['corrected']);
});
