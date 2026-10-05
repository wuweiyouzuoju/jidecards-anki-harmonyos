// SPDX-License-Identifier: AGPL-3.0-or-later
export const WINDOW_SAFE_TOP_KEY: string = 'windowSafeTop';
export const WINDOW_SAFE_BOTTOM_KEY: string = 'windowSafeBottom';
export const WINDOW_SAFE_LEFT_KEY: string = 'windowSafeLeft';
export const WINDOW_SAFE_RIGHT_KEY: string = 'windowSafeRight';
export const WINDOW_HEIGHT_KEY: string = 'windowHeightVp';

interface SafeRect { left: number; top: number; width: number; height: number; }
interface SafeRects { topRect: SafeRect; bottomRect: SafeRect; leftRect: SafeRect; rightRect: SafeRect; }
export interface WindowSafeInsets { top: number; bottom: number; left: number; right: number; }

/** 系统栏、挖孔和导航条取并集；挖孔矩形可能有非零起点，不能只取 height。 */
export function windowSafeInsets(system: SafeRects, cutout: SafeRects, navigation: SafeRects,
  width: number, height: number): WindowSafeInsets {
  const areas: SafeRects[] = [system, cutout, navigation];
  let top: number = 0;
  let bottom: number = 0;
  let left: number = 0;
  let right: number = 0;
  areas.forEach((area: SafeRects): void => {
    if (area.topRect.height > 0) top = Math.max(top, area.topRect.top + area.topRect.height);
    if (area.bottomRect.height > 0) bottom = Math.max(bottom, height - area.bottomRect.top);
    if (area.leftRect.width > 0) left = Math.max(left, area.leftRect.left + area.leftRect.width);
    if (area.rightRect.width > 0) right = Math.max(right, width - area.rightRect.left);
  });
  return { top: Math.max(0, top), bottom: Math.max(0, bottom), left: Math.max(0, left), right: Math.max(0, right) };
}

export interface SafeMenuGeometry { top: number; maxHeight: number; }
export function safeMenuGeometry(viewportHeight: number, requestedTop: number, safeTop: number,
  safeBottom: number, gap: number): SafeMenuGeometry {
  const first: number = Math.max(0, safeTop) + Math.max(0, gap);
  const last: number = Math.max(first, viewportHeight - Math.max(0, safeBottom) - Math.max(0, gap));
  const top: number = Math.min(last, Math.max(first, requestedTop));
  return { top: top, maxHeight: Math.max(0, last - top) };
}

/** 宿主提供气泡上缘，正文预留系统气泡内边距，长菜单在正文内滚动。 */
export function safePopupContentHeight(viewportHeight: number, anchorTop: number, safeTop: number,
  safeBottom: number, gap: number): number {
  return Math.min(360, Math.max(0, safeMenuGeometry(viewportHeight, anchorTop, safeTop, safeBottom, gap).maxHeight - 32));
}

export function safeDialogMaxHeight(viewportHeight: number, safeTop: number, safeBottom: number,
  gap: number, ratio: number): number {
  const available: number = safeMenuGeometry(viewportHeight, 0, safeTop, safeBottom, gap).maxHeight;
  return available * Math.min(1, Math.max(0, ratio));
}
