// SPDX-License-Identifier: AGPL-3.0-or-later
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { SyncSession, SyncSessionSnapshot, SyncSessionEnvironment } from '../model/SyncSession';
import { syncActivity } from '../model/SyncSettings';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { 加载FSRS开启状态, notifyFsrsStateChanged } from '../model/FSRS控制器';
import { 加载媒体同步开关, 设置媒体待同步, 保存同步端点, 清除同步凭证 } from '../model/同步凭证存储';
import { SyncAuth } from '../proto/messages/SyncMessages';
import { 同步服务 } from './同步服务';
import { 后端错误 } from './错误类型';

export interface SyncPresentation {
  text: (key: string) => string;
  toast: (message: string) => void;
  changed: (state: SyncSessionSnapshot) => void;
  activityChanged: (busy: boolean, modal: boolean) => void;
  statusChanged: (text: string, indicator: string) => void;
  collectionCompleted: (disabled: boolean) => void;
  close: () => void;
  yielded: (automatic: boolean) => void;
}

/** 平台效果集中在此；纯会话不持有 UIContext、偏好存储或后台 Kit。 */
export function createSyncSession(auth: SyncAuth | null, automatic: boolean, ui: SyncPresentation): SyncSession {
  const environment: SyncSessionEnvironment = {
    text: ui.text, toast: ui.toast, changed: ui.changed, activityChanged: ui.activityChanged,
    statusChanged: ui.statusChanged, collectionCompleted: ui.collectionCompleted, close: ui.close, yielded: ui.yielded,
    加载FSRS开启状态: 加载FSRS开启状态,
    notifyFsrsStateChanged: notifyFsrsStateChanged,
    加载媒体同步开关: 加载媒体同步开关,
    设置媒体待同步: 设置媒体待同步,
    保存同步端点: 保存同步端点,
    清除同步凭证: 清除同步凭证,
    errorKind: (error: Error): number | undefined => error instanceof 后端错误 ? error.kind : undefined,
    requestBackgroundTime: (expired: () => void): number => {
      try {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
          if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
            return backgroundTaskManager.requestSuspendDelay(ui.text('settings_sync_group'), expired).requestId;
          }
        }
      } catch (error) { hilog.warn(0x4342, 'jidecards', 'sync: background extension unavailable'); }
      return -1;
    },
    releaseBackgroundTime: (id: number): void => {
      try {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
          if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
            backgroundTaskManager.cancelSuspendDelay(id);
          }
        }
      } catch (error) { hilog.warn(0x4342, 'jidecards', 'sync: background extension already released'); }
    },
    setInterval: (callback: () => void, delay: number): number => setInterval(callback, delay),
    clearInterval: (id: number): void => { clearInterval(id); },
    setTimeout: (callback: () => void, delay: number): number => setTimeout(callback, delay),
    clearTimeout: (id: number): void => { clearTimeout(id); },
    log: {
      info: (domain: number, tag: string, message: string, ...args: Array<string | number>): void => { hilog.info(domain, tag, message, ...args); },
      warn: (domain: number, tag: string, message: string, ...args: Array<string | number>): void => { hilog.warn(domain, tag, message, ...args); },
      error: (domain: number, tag: string, message: string, ...args: Array<string | number>): void => { hilog.error(domain, tag, message, ...args); }
    }
  };
  return new SyncSession(auth, automatic, new 同步服务(), environment, syncActivity, autoSyncScheduler);
}
