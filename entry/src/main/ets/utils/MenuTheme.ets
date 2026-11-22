// SPDX-License-Identifier: AGPL-3.0-or-later
import { alignedOutlineWidth, parseElementStyle } from '../model/AppearanceElements';
import { activeElementStyle } from './AppearanceElements';
import { UIContext } from '@kit.ArkUI';
import { SharedMenuTheme } from 'jide_foundation';
import { deviceInfo } from '@kit.BasicServicesKit';
import { MaterialOpacity, dialogOpacityPercent } from '../model/SurfaceMaterial';
import { prefersReducedMotion } from './ReducedMotion';
/** 显式传入实际主题与生命周期；公共基础不读取产品存储或服务。 */
export function productMenuTheme(material: string, mode: string, systemDark: boolean, foreground: boolean,
  opacity: MaterialOpacity | undefined, accent: string, ui: UIContext, appearance: string = ''): SharedMenuTheme {
  const style = appearance === '' ? activeElementStyle() : parseElementStyle(appearance);
  return { material, dark: mode === 'dark' || (mode !== 'light' && systemDark), foreground,
    reducedMotion: prefersReducedMotion(ui), supported: deviceInfo.apiAvailable(23),
    outlineWidth: style.width < 0 ? undefined : alignedOutlineWidth(style.width, ui.vp2px(1)), outlineColor: style.outline || undefined,
    cornerRadius: style.radius < 0 ? undefined : style.radius, panelOpacity: dialogOpacityPercent(opacity, material), lineColor: style.outline || $r('app.color.surface_border'),
    text: style.text || $r('app.color.text_primary'), secondaryText: style.text === '' ? $r('app.color.text_secondary') : '#B8' + style.text.slice(1), danger: $r('app.color.error_text'),
    iconFill: $r('app.color.menu_icon_fill'), hover: $r('app.color.surface_sidebar'), accent };
}
