// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncSession } from '../../entry/src/main/ets/model/SyncSession.ts';

export function componentMethods(source, names, dependencies) {
  const methods = names.map(name => {
    const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n  }', start);
    return source.slice(start, end + 4);
  });
  const js = stripTypeScriptTypes(`class Component { ${methods.join('\n')} }`, { mode: 'transform' });
  return compileWithUiFeedback(...Object.keys(dependencies), js + '\nreturn Component;')(...Object.values(dependencies));
}

export async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }

export function panelHarness({ required = 1, media = false, automatic = true, fsrsBefore = true, fsrsAfter = true, capability = true } = {}) {
  const state = { closed: 0, refreshed: 0, toasts: [], media, pending: false, cleared: false, endpoint: '', calls: [], timers: new Map(),
    fsrsValues: required >= 2 ? [fsrsBefore, fsrsBefore, fsrsAfter] : [fsrsBefore, fsrsAfter], fsrsReads: 0, fsrsNotifications: 0, fsrsResults: [], states: [], delays: [], cancellations: [],
    response: { required, newEndpoint: '', hostNumber: 0, serverMediaUsn: 3, serverMessage: '' } };
  class BackendError extends Error {}
  const gate = new SyncActivity();
  const dependencies = {
    autoSyncScheduler: new AutoSyncScheduler(), 后端错误: BackendError,
    加载FSRS开启状态: async () => state.fsrsValues[state.fsrsReads++],
    notifyFsrsStateChanged: () => { state.fsrsNotifications++; },
    加载媒体同步开关: () => state.media, 加载媒体待同步: () => state.pending,
    设置媒体待同步: value => { state.pending = value; }, 保存同步端点: value => { state.endpoint = value; },
    清除同步凭证: () => { state.cleared = true; },
    canIUse: () => capability,
    backgroundTaskManager: { requestSuspendDelay: (_reason, expire) => { state.delays.push(expire); return { requestId: state.delays.length }; }, cancelSuspendDelay: id => { state.cancellations.push(id); } },
    hilog: { info() {}, error() {}, warn() {} }, 同步日志域: 0, 同步日志标签: 'test', $r: key => key,
    setInterval: (fn, delay) => { const id = delay === 50 ? 2 : 1; state.timers.set(id, fn); return id; }, clearInterval: id => state.timers.delete(id),
    setTimeout: fn => { state.timers.set(3, fn); return 3; }, clearTimeout: id => state.timers.delete(id)
  };
  const environment = {
    ...dependencies, log: dependencies.hilog,
    text: key => 'app.string.' + key,
    toast: message => state.toasts.push(message),
    changed: snapshot => { state.snapshot = snapshot; },
    activityChanged: (busy, modal) => state.states.push({busy, modal}),
    statusChanged: (text, indicator) => { state.status = text; state.indicator = indicator; },
    collectionCompleted: value => { state.refreshed++; state.fsrsResults.push(value); },
    close: () => { state.closed++; },
    yielded: value => { state.yielded = value ? 'auto' : 'manual'; },
    errorKind: error => error instanceof BackendError ? error.kind : undefined,
    requestBackgroundTime: expire => capability ? dependencies.backgroundTaskManager.requestSuspendDelay('', expire).requestId : -1,
    releaseBackgroundTime: id => dependencies.backgroundTaskManager.cancelSuspendDelay(id)
  };
  const auth = { hkey: 'test-key', endpoint: 'https://custom.example/anki/', ioTimeoutSecs: 0 };
  const backend = {
      中止同步: async () => {}, 中止媒体同步: async () => {},
      同步状态检查: async a => { state.calls.push(['status', a]); return { required: required === 0 ? 0 : 1, newEndpoint: '' }; },
      同步集合: async (a, m) => { state.calls.push(['collection', a, m]); return state.response; },
      全量上传或下载: async (a, upload, usn) => { state.calls.push(['full', a, upload, usn]); },
      同步媒体: async a => { state.calls.push(['media', a]); },
      媒体同步状态: async () => ({ active: false, progress: { checked: '', added: '', removed: '' } })
    };
  const panel = new SyncSession(auth, automatic, backend, environment, gate, dependencies.autoSyncScheduler);
  return { panel, state, gate };
}
