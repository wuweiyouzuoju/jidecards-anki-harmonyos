// SPDX-License-Identifier: AGPL-3.0-or-later

export const DEFAULT_BACKGROUND_CYCLE_MS: number = 6000;

export interface ThemeBackgroundPose {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}
/** 初始构图以比例表达，手机和平板都保持覆盖范围。 */
export function initialThemeBackgroundPoses(): ThemeBackgroundPose[] {
  return [
    { x: -0.1, y: -0.12, scale: 1.1, opacity: 0.5 },
    { x: 0.12, y: -0.03, scale: 1.05, opacity: 0.45 },
    { x: -0.03, y: 0.13, scale: 1.15, opacity: 0.35 }
  ];
}

/** 仅每轮生成一次目标；彩色透明贴图叠加自然变色。 */
export function nextThemeBackgroundPoses(): ThemeBackgroundPose[] {
  return initialThemeBackgroundPoses().map((pose: ThemeBackgroundPose): ThemeBackgroundPose => ({
    x: Math.random() * 0.32 - 0.16,
    y: Math.random() * 0.32 - 0.16,
    scale: 1.0 + Math.random() * 0.2,
    opacity: 0.25 + Math.random() * 0.3
  }));
}

/** 与 Curve.EaseInOut 相同的贝塞尔曲线，仅在暂停时采样一次。 */
export function backgroundEase(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low: number = 0;
  let high: number = 1;
  for (let step: number = 0; step < 20; step++) {
    const t: number = (low + high) / 2;
    const x: number = 3 * 0.42 * (1 - t) * (1 - t) * t + 3 * 0.58 * (1 - t) * t * t + t * t * t;
    if (x < progress) low = t;
    else high = t;
  }
  const t: number = (low + high) / 2;
  return 3 * (1 - t) * t * t + t * t * t;
}

/** 暂停保留当前可见位置，旧轮次失效后恢复不会跳回起点。 */
export function sampleThemeBackgroundPoses(from: ThemeBackgroundPose[], to: ThemeBackgroundPose[], elapsed: number): ThemeBackgroundPose[] {
  const amount: number = backgroundEase(elapsed / DEFAULT_BACKGROUND_CYCLE_MS);
  return from.map((pose: ThemeBackgroundPose, index: number): ThemeBackgroundPose => ({
    x: pose.x + (to[index].x - pose.x) * amount,
    y: pose.y + (to[index].y - pose.y) * amount,
    scale: pose.scale + (to[index].scale - pose.scale) * amount,
    opacity: pose.opacity + (to[index].opacity - pose.opacity) * amount
  }));
}
