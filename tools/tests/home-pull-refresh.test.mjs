// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentMethods } from './sync-panel-harness.mjs';

const source = readFileSync(new URL('../../entry/src/main/ets/components/home/主页牌组列表.ets', import.meta.url), 'utf8');
const List = componentMethods(source, ['refreshDecks'], {});

test('pull refresh waits for completion and closes without a parent Prop notification', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const list = Object.assign(new List(), { 刷新指示器开关: true, onRefresh: () => pending });
  const refresh = list.refreshDecks();
  assert.equal(list.刷新指示器开关, true);
  finish();
  await refresh;
  assert.equal(list.刷新指示器开关, false);
});

test('immediate skip, failure, and repeated pulls always close the indicator', async () => {
  const list = new List();
  for (const callback of [() => Promise.resolve(), () => Promise.reject(new Error('load failed')),
    () => { throw new Error('context failed'); }, () => Promise.resolve()]) {
    list.onRefresh = callback;
    list.刷新指示器开关 = true;
    await list.refreshDecks().catch(() => {});
    assert.equal(list.刷新指示器开关, false);
  }
});
