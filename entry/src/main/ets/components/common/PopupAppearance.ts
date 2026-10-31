// SPDX-License-Identifier: AGPL-3.0-or-later
export interface PopupAppearance { fill: string; frostedBackdrop: boolean; }

/** 普通弹窗有限透明；长文速览可显式采用实底。页面遮罩仍由宿主拥有。 */
export function popupAppearance(material: string, dark: boolean, role: string = 'dialog', opaque: boolean = false): PopupAppearance {
  if (opaque) return { fill: dark ? '#18202B' : '#FFFFFF', frostedBackdrop: false };
  if (material === 'glass') return { fill: dark ? (role === 'menu' ? '#AD232730' : '#F0232730') :
    (role === 'menu' ? '#8CE9ECF2' : '#E6F1F3F7'), frostedBackdrop: false };
  return { fill: dark ? '#F018202B' : '#F0FFFFFF', frostedBackdrop: true };
}
