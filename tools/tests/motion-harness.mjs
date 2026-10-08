// SPDX-License-Identifier: AGPL-3.0-or-later
import * as model from '../../entry/src/main/ets/model/MotionStyle.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

/** 平台曲线只记录参数；动效选择始终运行实际公共实现。 */
export function motionApi(initial = 'restrained') {
  let style = initial;
  const AppStorage = { get: () => style };
  const curves = { springCurve: (...args) => ({ spring: args }) };
  const Curve = { EaseOut: 'ease-out' };
  const api = loadPlatformModule('utils/AppMotion.ets',
    '({currentMotionProfile, motionAnimation, disclosureAnimation, navigationEnterOffset})',
    { ...model, AppStorage, curves, Curve });
  return { ...api, curves, Curve, ...model, setStyle: value => { style = value; } };
}

/** 执行公共转场与实际屏幕时长；平台效果只记录合成和动画参数。 */
export function surfaceMotionApi(initial = 'restrained') {
  const api = motionApi(initial);
  const timing = loadPlatformModule('utils/转场时长.ets', '({取全屏转场时长,取全屏转场曲线})', {
    ...api, display: { getDefaultDisplaySync: () => ({ width: 1920, height: 2560, densityDPI: 320 }) }
  });
  const effect = (kind, value) => ({ kind, value,
    combine(other) { this.combined = other; return this; },
    animation(options) { this.options = options; return this; }
  });
  const TransitionEffect = { IDENTITY: { kind: 'identity' },
    opacity: value => effect('opacity', value), translate: value => effect('translate', value),
    scale: value => effect('scale', value), asymmetric: (enter, exit) => ({ enter, exit }) };
  const SurfaceTransition = loadPlatformModule('utils/SurfaceTransition.ets', 'SurfaceTransition',
    { ...api, ...timing, TransitionEffect });
  return { ...api, ...timing, TransitionEffect, SurfaceTransition };
}
