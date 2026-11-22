// SPDX-License-Identifier: AGPL-3.0-or-later
// 应用统一日志门面。纯 TS，模型层与 Node 测试可直接引用；
// 运行时由 Ability 启动时安装 hilog 输出（utils/HilogLogSink.ets），未安装时退回 console。

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSink = (level: LogLevel, tag: string, message: string) => void;

function consoleSink(level: LogLevel, tag: string, message: string): void {
  const line: string = `[${tag}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}

let activeSink: LogSink = consoleSink;

/** 替换日志输出；重复安装以最后一次为准。 */
export function installLogSink(sink: LogSink): void {
  activeSink = sink;
}

/** tag 标识来源模块（如 StudyPage、CardAudio）；message 不写入密钥或卡片正文。 */
export class AppLog {
  static debug(tag: string, message: string): void { activeSink('debug', tag, message); }
  static info(tag: string, message: string): void { activeSink('info', tag, message); }
  static warn(tag: string, message: string): void { activeSink('warn', tag, message); }
  static error(tag: string, message: string): void { activeSink('error', tag, message); }
}
