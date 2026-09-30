// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelHarness, componentMethods, settle } from './sync-panel-harness.mjs';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

for (const required of [0, 1, 2, 3, 4]) {
  test(`media has one start and retains early errors (required=${required})`, async () => {
    const { panel, state } = panelHarness({ required, media: true });
    let starts = 0, result = null;
    const started = () => { starts++; result = new Error('network timeout'); };
    panel.同步服务实例.同步集合 = async (_auth, media) => {
      if (required <= 1 && media) started();
      return state.response;
    };
    panel.同步服务实例.全量上传或下载 = async (_auth, _upload, usn) => { if (usn !== null) started(); };
    panel.同步服务实例.同步媒体 = async () => { started(); };
    panel.同步服务实例.媒体同步状态 = async () => {
      if (result) { const error = result; result = null; throw error; }
      return { active: false, progress: { checked: '', added: '', removed: '' } };
    };
    panel.aboutToAppear(); await settle();
    if (required >= 2) { await panel.冲突确认(required !== 3); await settle(); }
    assert.equal(starts, 1);
    state.timers.get(1)(); await settle();
    assert.match(panel.错误文案, /timeout/);
    assert.equal(state.pending, true);
    assert.equal(state.closed, 0);
    assert.equal(panel.状态文案, 'app.string.sync_collection_complete');
  });
}

test('conflict recheck that already merged data explicitly starts media once', async () => {
  const { panel, state } = panelHarness({ required: 2, media: true });
  panel.aboutToAppear(); await settle();
  state.response.required = 0;
  await panel.冲突确认(true); await settle();
  assert.equal(state.calls.filter(call => call[0] === 'media').length, 1);
});

test('media management observes the lease without consuming the sync result', async () => {
  const { panel, state, gate } = panelHarness({ required: 0, media: true });
  let pendingError = new Error('network timeout'), reads = 0;
  const status = async () => {
    reads++;
    if (pendingError) { const error = pendingError; pendingError = null; throw error; }
    return { active: false, progress: { checked: '', added: '', removed: '' } };
  };
  panel.同步服务实例.媒体同步状态 = status;
  panel.aboutToAppear(); await settle();
  const MediaUi = componentMethods(read('components/settings/媒体管理面板.ets'), ['检查媒体同步状态'], { syncActivity: gate });
  const ui = new MediaUi();
  Object.assign(ui, { visible: true, 同步服务实例: { 媒体同步状态: status } });
  await ui.检查媒体同步状态();
  assert.equal(ui.媒体同步中, true);
  assert.equal(reads, 0);
  state.timers.get(1)(); await settle();
  assert.match(panel.错误文案, /timeout/);
  assert.equal(state.pending, true);
  assert.equal(state.toasts.includes('app.string.sync_success'), false);
});

test('non-owner media guards never call the consuming Core status RPC', () => {
  assert.doesNotMatch(read('pages/首页.ets'), /\.媒体同步状态\(/);
  for (const path of ['components/home/HomeDeckDeletion.ets', 'components/settings/媒体管理面板.ets']) {
    assert.doesNotMatch(read(path), /\.媒体同步状态\(/, path);
    assert.match(read(path), /isSyncing:[^\n]+syncActivity\.isActive\(\)/);
  }
});

test('manual collection completion reports usable cards before media finishes', async () => {
  const { panel, state } = panelHarness({ required: 0, media: true, automatic: false });
  panel.aboutToAppear(); await settle();
  assert.ok(state.toasts.includes('app.string.sync_collection_complete'));
  assert.equal(state.closed, 0);
  assert.equal(state.states.at(-1).busy, false);
  state.timers.get(1)(); await settle();
  assert.deepEqual(state.toasts, ['app.string.sync_collection_complete', 'app.string.sync_media_complete']);
  assert.equal(state.closed, 1);
  panel.notifySyncResult();
  assert.equal(state.toasts.length, 2, 'repeated completion does not repeat the media toast');
});

test('opening media details after a silent collection commit can show one completion toast', async () => {
  const { panel, state } = panelHarness({ required: 0, media: true, automatic: true });
  panel.aboutToAppear(); await settle();
  assert.deepEqual(state.toasts, []);
  panel.showDetails();
  state.timers.get(1)(); await settle();
  assert.deepEqual(state.toasts, ['app.string.sync_media_complete']);
});
