// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassSurface } from '../utils/GlassSurface';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';

import { 应用尺寸 } from '../utils/应用尺寸';

/**
 * 学习页专用操作按钮。按压由各按钮的 GlassSurface 多态属性处理，
 * 不写父层或组件状态，避免触摸导致文字和兄弟按钮重建。
 */
@Component
export struct StudyActionButton {
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @Prop label: ResourceStr;
  @Prop subtitle: string = '';
  @Prop buttonHeight: number = 应用尺寸.行动按钮高度;
  @Prop labelFontSize: number = 应用尺寸.字号_按钮;
  @Prop labelColor: ResourceColor = $r('app.color.text_primary');
  @Prop fillColor: ResourceColor = $r('app.color.surface_card');
  onActivate: () => void = (): void => {};

  build() {
    Button({ type: ButtonType.Normal }) {
      Column({ space: 2 }) {
        Text(this.label)
          .fontSize(this.labelFontSize)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.labelColor)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        if (this.subtitle.length > 0) {
          Text(this.subtitle)
            .fontSize(12)
            .fontColor(this.labelColor)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .width('100%')
    }
      .layoutWeight(1)
      .height(this.buttonHeight)
      .padding({ left: 4, right: 4 })
      .fontSize(this.labelFontSize)
      .fontColor(this.labelColor)
      // 公共多态表面拥有按压反馈，不叠加 Button 默认效果。
      .attributeModifier(new GlassSurface(this.glassColors, this.fillColor))
      .stateEffect(false)
      .borderRadius(应用尺寸.圆角_面板)
      .onClick((): void => {
        this.onActivate();
      })
  }
}
