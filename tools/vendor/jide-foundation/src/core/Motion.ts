// SPDX-License-Identifier: AGPL-3.0-or-later
export interface MotionProfile {
  menuScale: number;
  menuEnterMs: number;
  menuExitMs: number;
  dialogScale: number;
  pressScale: number;
  disclosureMs: number;
}

export interface PressVisual {
  opacity: number;
  scale: number;
}

/** 参数来自当前闪卡；不包含轮盘、翻卡、判题或业务时钟。 */
export function motionProfile(style: string): MotionProfile {
  if (style === 'restrained') {
    return { menuScale: 0.98, menuEnterMs: 150, menuExitMs: 150,
      dialogScale: 0.96, pressScale: 1, disclosureMs: 150 };
  }
  if (style === 'lively') {
    return { menuScale: 0.94, menuEnterMs: 220, menuExitMs: 140,
      dialogScale: 0.92, pressScale: 0.975, disclosureMs: 220 };
  }
  throw new Error('Invalid motion style');
}

export function pressVisual(style: string, state: string,
  restingOpacity: number = 1, disabledOpacity: number = 0.4): PressVisual {
  if (!Number.isFinite(restingOpacity) || restingOpacity < 0 || restingOpacity > 1 ||
    !Number.isFinite(disabledOpacity) || disabledOpacity < 0 || disabledOpacity > 1) {
    throw new Error('Invalid control opacity');
  }
  const profile: MotionProfile = motionProfile(style);
  if (state === 'normal') { return { opacity: restingOpacity, scale: 1 }; }
  if (state === 'pressed') { return { opacity: restingOpacity * 0.72, scale: profile.pressScale }; }
  if (state === 'disabled') { return { opacity: Math.min(restingOpacity, disabledOpacity), scale: 1 }; }
  throw new Error('Invalid press state');
}

/** 按钮自身也检查可用性，防止禁用后的迟到点击。 */
export function activateAction(enabled: boolean, busy: boolean, action: (() => void) | undefined): boolean {
  if (!enabled || busy || action === undefined) { return false; }
  action();
  return true;
}
