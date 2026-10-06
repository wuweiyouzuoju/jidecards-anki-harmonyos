// SPDX-License-Identifier: AGPL-3.0-or-later
// Pen Kit 官方约定读取此全局键；只在这个 JS 互操作边界写入，不承载应用状态。
export function setStudyPenKitContext(context) {
  globalThis._brushEngineContext = context;
}

export function clearStudyPenKitContext(context) {
  if (globalThis._brushEngineContext === context) globalThis._brushEngineContext = undefined;
}
