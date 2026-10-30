// SPDX-License-Identifier: AGPL-3.0-or-later
export interface PopupAppearance { fill: string; frostedBackdrop: boolean; }

/** 本体始终有限透明；磨砂/通透由背后的页面遮罩拥有。 */
export function popupAppearance(material: string, dark: boolean, role: string = 'dialog'): PopupAppearance {
  if (material === 'glass') return { fill: dark ? (role === 'menu' ? '#E6232730' : '#F0232730') :
    (role === 'menu' ? '#D9E9ECF2' : '#E6F1F3F7'), frostedBackdrop: false };
  return { fill: dark ? '#F018202B' : '#F0FFFFFF', frostedBackdrop: true };
}
