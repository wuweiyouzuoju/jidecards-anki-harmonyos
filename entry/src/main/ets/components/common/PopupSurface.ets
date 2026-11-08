// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedPopupSurface } from 'jide_foundation';

/** 保留产品构造契约；中性弹窗材质与描边统一由系列基础渲染。 */
export class PopupSurface extends SharedPopupSurface {
  constructor(material: string, dark: boolean, radius: number, role: string = 'dialog', visible: boolean = true,
    accent: string = '', opaque: boolean = false, panelOpacity?: number) {
    super(material, dark, radius, role, visible, opaque, panelOpacity, $r('app.color.surface_border'));
  }
}
