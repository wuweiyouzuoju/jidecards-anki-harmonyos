// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveBrowserCardIds, resolveBrowserNoteIds, snapshotNotetypeChange } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { setCardFlags } from '../../entry/src/main/ets/model/CardMarking.ts';
import { toggleBrowserCardState } from '../../entry/src/main/ets/model/BrowserCardState.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
const names = ['captureBrowserSelection', 'runBatchOperation', 'runBrowserOperation', 'isBrowserSelectionCurrent', '执行批量删除', '执行批量改牌组', '执行批量设置标志', '解析选中为卡片ID',
  '解析选中笔记的卡片ID', '退出多选', '执行批量挂起', '执行批量搁置', 'cardStateBackend', 'resetCards'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('resolveBrowserCardIds', 'resolveBrowserNoteIds', 'snapshotNotetypeChange', '$r', 'console', 'autoSyncScheduler', 'AppStorage', 'setCardFlags', 'toggleBrowserCardState', stripTypeScriptTypes(
  `class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Page;')(
  resolveBrowserCardIds, resolveBrowserNoteIds, snapshotNotetypeChange, key => key, { info() {} }, new AutoSyncScheduler(), { setOrCreate() {} }, setCardFlags, toggleBrowserCardState);

function harness(mode = 'notes') {
  const page = new Page(), calls = [];
  const notes = new Map([[11, [101, 102]], [12, [103]], [13, [104]]]);
  Object.assign(page, {
    operations: new BrowserOperationController(), selectionVersion: 0, searchVersion: 0,
    浏览模式值: mode, 选中ID列表: mode === 'notes' ? [11, 12] : [101],
    结果ID列表: [11, 12, 13], 行列表: [{ id: 11 }, { id: 12 }, { id: 13 }],
    多选模式值: true, 退出多选信号: 0, 批量忙碌: false, 批量错误: '',
    取本地化文案: key => key,
    笔记服务实例: { 获取笔记的卡片: async id => { calls.push(['lookup', id]); return notes.get(id) ?? []; } },
    卡片服务实例: {
      获取卡片: async id => ({ queue: -1 }),
      删除卡片: async ids => {
        calls.push(['delete', ids]);
        for (const [id, cards] of notes) {
          const remaining = cards.filter(card => !ids.includes(card));
          if (remaining.length) notes.set(id, remaining); else notes.delete(id);
        }
        return ids.length;
      },
      设置牌组: async (ids, deck) => { calls.push(['move', ids, deck]); },
      设置标志: async (ids, flag) => { calls.push(['flag', ids, flag]); }
    },
    执行搜索: async () => {
      calls.push(['search']);
      page.结果ID列表 = [...notes.keys()];
      page.行列表 = page.结果ID列表.map(id => ({ id }));
    }
  });
  page.markingBackend = { setFlag: (ids, flag) => page.卡片服务实例.设置标志(ids, flag) };
  return { page, calls, notes };
}

test('notes deletion resolves every sibling card, then displays actual backend results', async () => {
  const { page, calls, notes } = harness();
  await page.执行批量删除();
  assert.deepEqual(calls, [['lookup', 11], ['lookup', 12], ['delete', [101, 102, 103]], ['search']]);
  assert.deepEqual([...notes.keys()], [13]);
  assert.deepEqual(page.结果ID列表, [13]);
  assert.equal(page.多选模式值, false);
  assert.equal(page.批量忙碌, false);
});

test('card mode deletes only selected cards and preserves unselected siblings', async () => {
  const { page, calls, notes } = harness('cards');
  await page.执行批量删除();
  assert.deepEqual(calls, [['delete', [101]], ['search']]);
  assert.deepEqual(notes.get(11), [102]);
});

test('lookup and delete failures retain visible rows and selection for retry', async () => {
  for (const failLookup of [true, false]) {
    const { page, calls } = harness();
    if (failLookup) page.笔记服务实例.获取笔记的卡片 = async id => {
      if (id === 12) throw new Error('lookup failed');
      return [101, 102];
    };
    else page.卡片服务实例.删除卡片 = async () => { throw new Error('write failed'); };
    await page.执行批量删除();
    assert.deepEqual(page.结果ID列表, [11, 12, 13]);
    assert.deepEqual(page.选中ID列表, [11, 12]);
    assert.equal(page.多选模式值, true);
    assert.equal(page.批量忙碌, false);
    assert.match(page.批量错误, /delete_error/);
    assert.ok(!calls.some(call => call[0] === 'search' || call[0] === 'delete'));
  }
});

test('empty resolution and a zero-delete backend cannot hide existing notes locally', async () => {
  for (const empty of [true, false]) {
    const { page, calls } = harness();
    if (empty) page.笔记服务实例.获取笔记的卡片 = async () => [];
    page.卡片服务实例.删除卡片 = async ids => { calls.push(['delete', ids]); return 0; };
    await page.执行批量删除();
    assert.deepEqual(page.结果ID列表, [11, 12, 13]);
    assert.equal(calls.some(call => call[0] === 'delete'), !empty);
  }
});

test('notes move and flag use all sibling cards once, without passing note ids as card ids', async () => {
  for (const action of ['move', 'flag']) {
    const { page, calls } = harness();
    page.选中ID列表 = [11, 12, 11];
    if (action === 'move') await page.执行批量改牌组(88);
    else await page.执行批量设置标志(4);
    assert.deepEqual(calls.find(call => call[0] === action), [action, [101, 102, 103], action === 'move' ? 88 : 4]);
    assert.equal(page.批量错误, '');
    assert.equal(page.多选模式值, false);
  }
});

test('reset expands note siblings, freezes options and rejects a stale selection', async () => {
  const { page, calls } = harness();
  page.resetSelection = page.captureBrowserSelection();
  page.调度器服务实例 = {scheduleCardsAsNew: async (ids, options) => calls.push(['reset',ids,options])};
  const options = {restorePosition:true,resetCounts:false};
  const work = page.resetCards(options); options.resetCounts=true; await work;
  assert.deepEqual(calls,[['lookup',11],['lookup',12],['reset',[101,102,103],{restorePosition:true,resetCounts:false}],['search']]);
  const stale = harness('cards'); stale.page.resetSelection = stale.page.captureBrowserSelection();
  stale.page.selectionVersion++; stale.page.选中ID列表=[102];
  stale.page.调度器服务实例 = {scheduleCardsAsNew: async () => assert.fail('stale selection must not reset')};
  await stale.page.resetCards(options); assert.deepEqual(stale.calls,[]);
});
test('reset failure retains selection and disposed accepted reset never clears a new page', async () => {
  const {page} = harness('cards'); page.resetSelection=page.captureBrowserSelection();
  page.调度器服务实例={scheduleCardsAsNew: async()=>{throw Error('reset failed');}};
  await page.resetCards({restorePosition:false,resetCounts:true});
  assert.deepEqual(page.选中ID列表,[101]); assert.match(page.批量错误,/browser_reset_error/);
});

test('unsuspend uses only captured card IDs and expands every selected note sibling once', async () => {
  for (const mode of ['cards', 'notes']) {
    const { page, calls } = harness(mode);
    if (mode === 'notes') page.选中ID列表 = [11, 12, 11];
    page.调度器服务实例 = { 恢复埋藏与暂停的卡片: async ids => calls.push(['restore', ids]) };
    await page.执行批量挂起();
    assert.deepEqual(calls.find(call => call[0] === 'restore'), ['restore', mode === 'notes' ? [101,102,103] : [101]]);
    assert.equal(calls.at(-1)[0], 'search');
    assert.equal(page.多选模式值, false);
    assert.equal(page.批量忙碌, false);
  }
});

test('unsuspend failures retain selection and empty selections never call the Core write', async () => {
  for (const failure of ['lookup', 'write', 'empty']) {
    const { page, calls } = harness();
    page.调度器服务实例 = { 恢复埋藏与暂停的卡片: async ids => {
      if (failure === 'write') throw new Error('restore failed');
      calls.push(['restore', ids]);
    } };
    if (failure === 'lookup') page.笔记服务实例.获取笔记的卡片 = async () => { throw new Error('lookup failed'); };
    if (failure === 'empty') page.选中ID列表 = [];
    await page.执行批量挂起();
    assert.equal(calls.some(call => call[0] === 'restore' || call[0] === 'search'), false);
    assert.equal(page.多选模式值, true);
    assert.equal(page.批量忙碌, false);
    if (failure !== 'empty') {
      assert.deepEqual(page.选中ID列表, [11,12]);
      assert.match(page.批量错误, /suspend_error/);
    }
  }
});

test('unbury expands note siblings, reads every queue and refreshes the actual results after restoring', async () => {
  const { page, calls } = harness('notes');
  page.卡片服务实例.获取卡片 = async id => { calls.push(['queue',id]); return { queue: id === 102 ? -2 : -3 }; };
  page.调度器服务实例 = { 恢复埋藏与暂停的卡片: async ids => calls.push(['restore',ids]) };
  await page.执行批量搁置();
  assert.deepEqual(calls, [['lookup',11],['lookup',12],['queue',101],['queue',102],['queue',103],['restore',[101,102,103]],['search']]);
  assert.equal(page.多选模式值,false);
});
