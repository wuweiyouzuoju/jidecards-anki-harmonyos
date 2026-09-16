// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassSurface } from '../utils/GlassSurface';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';

import { 应用尺寸 } from '../utils/应用尺寸';

/**
 * 学习页专用操作按钮。每个实例独立持有按压状态，避免父级一次状态刷新
 * 让同一行的兄弟按钮同时进入按压视觉态。
 */
@Component
export struct StudyActionButton {
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @Prop label: ResourceStr;
  @Prop subtitle: string = '';
  @Prop buttonHeight: number = 应用尺寸.行动按钮高度;
  @Prop labelFontSize: number = 应用尺寸.字号_按钮;
  @Prop labelColor: ResourceColor = $r('app.color.text_primary');
  onActivate: () => void = (): void => {};
  @State private isPressed: boolean = false;

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
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .width('100%')
    }
      // 按压视觉完全由本组件的局部状态控制，关闭 Button 自带的缩放叠加效果。
      .stateEffect(false)
      .layoutWeight(1)
      .height(this.buttonHeight)
      .padding({ left: 4, right: 4 })
      .fontSize(this.labelFontSize)
      .fontColor(this.labelColor)
      .attributeModifier(new GlassSurface(this.isPressed, this.glassColors))
      .borderRadius(应用尺寸.圆角_面板)
      .animation({ duration: 80, curve: Curve.EaseOut })
      .onTouch((event: TouchEvent): void => {
        if (event.type === TouchType.Down) {
          this.isPressed = true;
        } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.isPressed = false;
        }
      })
      .onClick((): void => {
        this.onActivate();
      })
  }
}
