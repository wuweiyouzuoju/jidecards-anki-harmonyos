// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import * as flow from '../../entry/src/main/ets/model/同步流程.ts';
const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

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
  const state = { closed: 0, refreshed: 0, media, pending: false, cleared: false, endpoint: '', calls: [], timers: new Map(),
    fsrsValues: required >= 2 ? [fsrsBefore, fsrsBefore, fsrsAfter] : [fsrsBefore, fsrsAfter], fsrsReads: 0, fsrsNotifications: 0, fsrsResults: [], states: [], delays: [], cancellations: [],
    response: { required, newEndpoint: '', hostNumber: 0, serverMediaUsn: 3, serverMessage: '' } };
  class BackendError extends Error {}
  const gate = new SyncActivity();
  const Panel = componentMethods(read('components/同步面板.ets'), ['aboutToAppear', 'aboutToDisappear', '启动同步', 'runSync', 'runFullSync', 'finishDisposedSync',
    'notifySyncResult', 'notifyCollectionResult', 'captureFsrsAfterSync', '处理同步错误', '完成中止', '冲突确认', '启动媒体阶段', '开始媒体轮询', '清理轮询定时器', '是否允许关闭', 'publishSyncState', 'setSyncPhase', 'dismissPresentation', 'syncForegroundChanged', 'requestBackgroundTime', 'releaseSuspendDelay', 'publishStatus', 'showDetails', 'requestStudyYield', 'sendAbort', 'stopAbortTimer', 'syncCollectionWithPriority'], {
    ...flow, syncActivity: gate, autoSyncScheduler: new AutoSyncScheduler(), 后端错误: BackendError,
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
  });
  const panel = new Panel();
  const auth = { hkey: 'test-key', endpoint: 'https://custom.example/anki/', ioTimeoutSecs: 0 };
  Object.assign(panel, { syncOwner: {}, syncTask: null, mediaStart: null, mediaMayBeRunning: false, disposalStarted: false, automatic, yieldingForStudy: false, fullSyncInFlight: false, abortTimer: -1, abortCall: null, successTimer: -1, collectionCallInFlight: false, 初始鉴权: auth, 当前阶段: 'syncing', 错误文案: '', 是否请求中止: false,
    轮询定时器: -1, 集合已同步: false, 是否在媒体阶段: false, detailsVisible: false, suspendDelayId: -1, syncForeground: true,
    状态变化回调: (busy, modal) => { state.states.push({ busy, modal }); },
    statusChanged: (text, indicator) => { state.status = text; state.indicator = indicator; }, onYield: automatic => { state.yielded = automatic ? 'auto' : 'manual'; },
    取本地化文案: key => key, 关闭回调: () => { state.closed++; },
    同步完成回调: value => { state.refreshed++; state.fsrsResults.push(value); },
    同步服务实例: {
      中止同步: async () => {}, 中止媒体同步: async () => {},
      同步状态检查: async a => { state.calls.push(['status', a]); return { required: required === 0 ? 0 : 1, newEndpoint: '' }; },
      同步集合: async (a, m) => { state.calls.push(['collection', a, m]); return state.response; },
      全量上传或下载: async (a, upload, usn) => { state.calls.push(['full', a, upload, usn]); },
      同步媒体: async a => { state.calls.push(['media', a]); },
      媒体同步状态: async () => ({ active: false, progress: { checked: '', added: '', removed: '' } })
    }
  });
  return { panel, state, gate };
}
