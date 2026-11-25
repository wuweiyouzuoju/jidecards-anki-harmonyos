// SPDX-License-Identifier: AGPL-3.0-or-later
export interface SurfaceViewport {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
  // 0 表示没有键盘；其他值为窗口坐标中的键盘上缘。
  keyboardTop: number;
}

export interface SurfaceGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  panelWidth: number;
  panelMaxHeight: number;
}

function nonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) { throw new Error('Invalid viewport geometry'); }
  return value;
}

/** 使用实际安全矩形，不含状态栏文字的光学估计，也不读取平台状态。 */
export function surfaceGeometry(viewport: SurfaceViewport, maxWidth: number = 480,
  ratio: number = 0.88): SurfaceGeometry {
  const width: number = nonnegative(viewport.width);
  const height: number = nonnegative(viewport.height);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error('Invalid surface size');
  }
  const left: number = Math.min(width, nonnegative(viewport.safeLeft));
  const top: number = Math.min(height, nonnegative(viewport.safeTop));
  const right: number = Math.max(left, width - nonnegative(viewport.safeRight));
  let bottom: number = Math.max(top, height - nonnegative(viewport.safeBottom));
  if (nonnegative(viewport.keyboardTop) > 0) {
    bottom = Math.max(top, Math.min(bottom, viewport.keyboardTop));
  }
  const availableWidth: number = right - left;
  const availableHeight: number = bottom - top;
  return { left: left, top: top, width: availableWidth, height: availableHeight,
    panelWidth: Math.min(maxWidth, availableWidth * ratio), panelMaxHeight: availableHeight * ratio };
}

/** 标题、底部操作和内边距只各扣除一次。 */
export function surfaceBodyHeight(panelHeight: number, headerHeight: number,
  footerHeight: number, inset: number = 16, gap: number = 12): number {
  const panel: number = nonnegative(panelHeight);
  const header: number = nonnegative(headerHeight);
  const footer: number = nonnegative(footerHeight);
  return Math.max(0, panel - 2 * nonnegative(inset) - header - footer -
    (header > 0 ? nonnegative(gap) : 0) - (footer > 0 ? nonnegative(gap) : 0));
}
