// SPDX-License-Identifier: AGPL-3.0-or-later
import { curves } from '@kit.ArkUI';
import { OliveOilSession, OliveState, OliveScheduler } from '../../core/OliveOilSession';

class HarmonyOliveScheduler implements OliveScheduler {
  schedule(delayMs: number, work: () => void): number { return setTimeout(work, delayMs); }
  cancel(handle: number): void { clearTimeout(handle); }
}
/** 回调在主UI线程；宿主用返回的AnimationOptions更新progress/文字，而非插值路径字符串。 */
export function createOliveOilSession(changed: (state: OliveState) => void): OliveOilSession {
  return new OliveOilSession(new HarmonyOliveScheduler(), changed);
}
export function oliveOilAnimation(state: OliveState): AnimateParam {
  return { duration: state.durationMs, curve: state.phase === 'shape'
    ? curves.cubicBezierCurve(0.12, 0.24, 0.82, 0.62) : Curve.EaseOut };
}
