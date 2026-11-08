// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { SharedMenuTheme } from 'jide_foundation';
import { deviceInfo } from '@kit.BasicServicesKit';
import { MaterialOpacity, dialogOpacityPercent } from '../model/SurfaceMaterial';
import { prefersReducedMotion } from './ReducedMotion';
/** 显式传入实际主题与生命周期；公共基础不读取产品存储或服务。 */
export function productMenuTheme(material: string, mode: string, systemDark: boolean, foreground: boolean,
  opacity: MaterialOpacity | undefined, accent: string, ui: UIContext): SharedMenuTheme {
  return { material, dark: mode === 'dark' || (mode !== 'light' && systemDark), foreground,
    reducedMotion: prefersReducedMotion(ui), supported: deviceInfo.apiAvailable(23),
    panelOpacity: dialogOpacityPercent(opacity, material), lineColor: $r('app.color.surface_border'),
    text: $r('app.color.text_primary'), secondaryText: $r('app.color.text_secondary'), danger: $r('app.color.error_text'),
    iconFill: $r('app.color.menu_icon_fill'), hover: $r('app.color.surface_sidebar'), accent };
}
