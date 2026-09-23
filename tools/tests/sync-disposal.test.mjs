// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { panelHarness, settle } from './sync-panel-harness.mjs';

test('destroyed incremental sync retains its lease through the call and outstanding abort', async () => {
  for (const result of ['commit', 'failure']) {
    const { panel, state, gate } = panelHarness();
    let resolveCollection, rejectCollection, finishAbort, released = false;
    panel.同步服务实例.同步集合 = () => new Promise((resolve, reject) => {
      resolveCollection = resolve; rejectCollection = reject;
    });
    panel.同步服务实例.中止同步 = () => new Promise(resolve => { finishAbort = resolve; });
    panel.aboutToAppear(); await settle();
    gate.requestStudyPriority();
    gate.waitForCollection().then(() => { released = true; });
    panel.aboutToDisappear();
    assert.equal(gate.acquire({}), false, 'destroying UI cannot admit another owner');
    if (result === 'commit') resolveCollection(state.response);
    else rejectCollection(Error('rollback finished'));
    await settle();
    assert.equal(released, false, 'original call ended but cancellation is still in flight');
    finishAbort(); await settle();
    assert.equal(gate.isActive(), false);
    assert.equal(released, true);
    assert.equal(state.refreshed, 0, 'no callback into destroyed UI');
    assert.equal(state.closed, 0);
    assert.equal(state.fsrsNotifications, result === 'commit' ? 1 : 0);
    assert.equal(state.timers.size, 0);
  }
});

test('destroyed full replacement holds readers until the accepted write finishes', async () => {
  const { panel, state, gate } = panelHarness({ required: 2 });
  let finish, released = false;
  panel.同步服务实例.全量上传或下载 = () => new Promise(resolve => { finish = resolve; });
  panel.aboutToAppear(); await settle();
  const operation = panel.冲突确认(true); await settle();
  gate.waitForCollection().then(() => { released = true; });
  panel.aboutToDisappear();
  assert.equal(gate.acquire({}), false);
  await settle();
  assert.equal(released, false);
  finish(); await operation; await settle();
  assert.equal(released, true);
  assert.equal(gate.isActive(), false);
  assert.equal(state.refreshed, 0);
  assert.equal(state.fsrsNotifications, 1);
});

test('destroyed conflict recheck cannot start the unaccepted full replacement', async () => {
  const { panel, state, gate } = panelHarness({ required: 2 });
  panel.aboutToAppear(); await settle();
  let finish;
  panel.同步服务实例.同步集合 = () => new Promise(resolve => { finish = resolve; });
  const confirmation = panel.冲突确认(true); await settle();
  panel.aboutToDisappear();
  assert.equal(gate.isActive(), true);
  finish(state.response); await confirmation; await settle();
  assert.equal(state.calls.some(call => call[0] === 'full'), false);
  assert.equal(gate.isActive(), false);
});

test('a conflict recheck committed while leaving still records redirect and notifies data change', async () => {
  const { panel, state, gate } = panelHarness({ required: 2 });
  panel.aboutToAppear(); await settle();
  let finish;
  panel.同步服务实例.同步集合 = () => new Promise(resolve => { finish = resolve; });
  const confirmation = panel.冲突确认(true); await settle();
  panel.aboutToDisappear();
  finish({ ...state.response, required: 0, newEndpoint: 'https://redirect.example/' });
  await confirmation; await settle();
  assert.equal(state.endpoint, 'https://redirect.example/');
  assert.equal(state.fsrsNotifications, 1);
  assert.equal(state.refreshed, 0);
  assert.equal(state.calls.some(call => call[0] === 'full'), false);
  assert.equal(gate.isActive(), false);
});

test('destroyed media owner waits for start, abort registration and confirmed thread exit', async () => {
  const { panel, state, gate } = panelHarness({ media: true });
  let finishStart, aborts = 0, queries = 0;
  panel.同步服务实例.同步媒体 = () => new Promise(resolve => { finishStart = resolve; });
  panel.同步服务实例.中止媒体同步 = async () => { aborts++; };
  panel.同步服务实例.媒体同步状态 = async () => {
    queries++;
    if (queries === 2) throw Error('media thread ended with interruption');
    return { active: queries === 1, progress: {} };
  };
  panel.aboutToAppear(); await settle();
  panel.aboutToDisappear(); panel.aboutToDisappear();
  await settle();
  assert.equal(aborts, 0, 'cannot abort before the start RPC registers its task');
  assert.equal(gate.isActive(), true);
  finishStart(); await settle();
  assert.equal(aborts, 1);
  assert.equal(gate.isActive(), true, 'abort acknowledgement is not completion');
  state.timers.get(3)(); state.timers.delete(3); await settle();
  assert.equal(gate.isActive(), true, 'one error is not evidence that the thread stopped');
  state.timers.get(3)(); state.timers.delete(3); await settle();
  assert.equal(aborts, 3);
  assert.equal(gate.isActive(), false);
  assert.equal(state.timers.size, 0);
  assert.equal(state.closed, 0);
});

test('committed collection records pending media before a delayed FSRS read can outlive the UI', async () => {
  for (const recheck of [false, true]) {
    for (const media of [false, true]) {
      const { panel, state, gate } = panelHarness({ required: recheck ? 2 : 1, media });
      let finishRead;
      const delayedRead = new Promise(resolve => { finishRead = resolve; });
      let confirmation;
      if (recheck) {
        panel.aboutToAppear(); await settle();
        state.response.required = 0;
        state.fsrsValues[2] = delayedRead;
        state.pending = !media;
        confirmation = panel.冲突确认(true);
      } else {
        state.fsrsValues[1] = delayedRead;
        state.pending = !media;
        panel.aboutToAppear();
      }
      await settle();
      assert.equal(state.pending, media, 'commit must persist media intent before another await');
      panel.aboutToDisappear();
      assert.equal(gate.isActive(), true);
      finishRead(true);
      await confirmation; await settle();
      assert.equal(gate.isActive(), false);
      assert.equal(state.fsrsNotifications, 1);
      assert.equal(state.refreshed, 0);
      assert.equal(state.calls.some(call => call[0] === 'media' || call[0] === 'full'), false);
    }
  }
});

test('a conflict recheck committed after disposal preserves pending media without starting it', async () => {
  const { panel, state, gate } = panelHarness({ required: 2, media: true });
  panel.aboutToAppear(); await settle();
  let finish;
  panel.同步服务实例.同步集合 = () => new Promise(resolve => { finish = resolve; });
  const confirmation = panel.冲突确认(true); await settle();
  panel.aboutToDisappear();
  finish({ ...state.response, required: 0 });
  await confirmation; await settle();
  assert.equal(state.pending, true);
  assert.equal(gate.isActive(), false);
  assert.equal(state.fsrsNotifications, 1);
  assert.equal(state.calls.some(call => call[0] === 'media' || call[0] === 'full'), false);
});
