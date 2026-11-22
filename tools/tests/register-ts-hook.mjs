// SPDX-License-Identifier: AGPL-3.0-or-later

// 注册 ts-extension-hook：npm test 启动时经 --import 加载本文件。
import { register } from 'node:module';

register('./ts-extension-hook.mjs', import.meta.url);

// 测试 harness 以 new Function 执行页面源码片段。未显式注入 AppLog 时解析到真实门面，
// 与原先自由引用全局 console 等价；需要断言日志的测试仍应注入 appLogFor(替身)。
const { AppLog } = await import('../../entry/src/main/ets/model/AppLog.ts');
globalThis.AppLog ??= AppLog;
