// SPDX-License-Identifier: AGPL-3.0-or-later
// AppLog 的 hilog 输出：全应用统一日志域，tag 由调用方提供。
import { hilog } from '@kit.PerformanceAnalysisKit';
import { installLogSink } from '../model/AppLog';
import type { LogLevel } from '../model/AppLog';

/** 记得闪卡全应用 hilog 日志域；新增日志不要另起 domain。 */
export const APP_LOG_DOMAIN: number = 0x4342;

export function hilogLogSink(level: LogLevel, tag: string, message: string): void {
  if (level === 'error') hilog.error(APP_LOG_DOMAIN, tag, '%{public}s', message);
  else if (level === 'warn') hilog.warn(APP_LOG_DOMAIN, tag, '%{public}s', message);
  else if (level === 'debug') hilog.debug(APP_LOG_DOMAIN, tag, '%{public}s', message);
  else hilog.info(APP_LOG_DOMAIN, tag, '%{public}s', message);
}

/** 每个 Ability 进程启动时调用一次。 */
export function installHilogLogSink(): void {
  installLogSink(hilogLogSink);
}
