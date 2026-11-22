// SPDX-License-Identifier: AGPL-3.0-or-later

/** 全应用页面密度；沿用旧键，由牌组样式存储派生并发布，页面只订阅。 */
export const PAGE_COMPACT_LAYOUT_KEY: string = 'deckListNarrow';
/** 简洁版/实验版的 UI 广播键；持久化由简洁模式存储拥有。 */
export const SIMPLE_MODE_KEY: string = 'simpleMode';

/** 与主页分栏的首个断点一致；阔直板和折叠屏均按窗口 vp 判断。 */
export const LANDSCAPE_MIN_WIDTH_VP: number = 600;
export function isWideLandscapeWindow(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && height > 0 &&
    width >= LANDSCAPE_MIN_WIDTH_VP && width > height;
}

/** 阔直板横屏的短高窗口采用紧凑尺寸；折叠内屏和平板保持常规尺寸。 */
export function compactLandscapeScale(width: number, height: number): number {
  return isWideLandscapeWindow(width, height) && width < 840 && height <= 540 ? 0.82 : 1;
}
