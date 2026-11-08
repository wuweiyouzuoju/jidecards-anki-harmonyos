// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedActionIcon } from 'jide_foundation';

/** 产品只选择材质与状态语义；图标的几何、填色和描边由系列基础统一绘制。 */
@Component
export struct ActionIcon {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @Prop source: ResourceStr = '';
  @Prop tint: ResourceColor = $r('app.color.menu_icon_fill');
  @Prop glyphSize: number = 18;
  @Prop strokeColor: string = '';
  @Prop semanticStrokeColor: ResourceColor | undefined = undefined;
  @Prop preserveFill: boolean = false;
  private outlineOnly(): boolean { return this.surfaceMaterial === 'glass' && !this.preserveFill; }

  build() {
    SharedActionIcon({ source: this.source, tint: this.tint, glyphSize: this.glyphSize,
      strokeColor: this.strokeColor, semanticStrokeColor: this.semanticStrokeColor, outlineOnly: this.outlineOnly() })
  }
}
