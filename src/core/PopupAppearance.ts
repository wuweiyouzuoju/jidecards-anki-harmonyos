// SPDX-License-Identifier: AGPL-3.0-or-later
export const DEFAULT_DIALOG_BACKDROP_BLUR: number = 8;
export const FOCUSED_DIALOG_BACKDROP_BLUR: number = 64;

export interface PopupAppearance { fill: string; frostedBackdrop: boolean; }

/** 玻璃默认不叠底色，扁平默认保留轻微透明；页面遮罩独立绘制。 */
export function popupAppearance(material: string, dark: boolean, role: string = 'dialog', opaque: boolean = false): PopupAppearance {
  if (opaque) return { fill: dark ? '#18202B' : '#FFFFFF', frostedBackdrop: false };
  if (material === 'glass') return { fill: '#00000000', frostedBackdrop: false };
  return { fill: dark ? '#F018202B' : '#F0FFFFFF', frostedBackdrop: false };
}

/** 面板填色 alpha，背景遮罩与采样纹理各自独立。 */
export function dialogPanelFill(dark: boolean, opacity: number): string {
  const alpha: string = Math.round(opacity * 255 / 100).toString(16).padStart(2, '0').toUpperCase();
  return '#' + alpha + (dark ? '18202B' : 'FFFFFF');
}
