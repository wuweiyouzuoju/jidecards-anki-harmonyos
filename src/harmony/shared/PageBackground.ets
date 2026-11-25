// SPDX-License-Identifier: AGPL-3.0-or-later
import { VisualPalette, visualPalette, visualAlpha } from '../../core/VisualStyle';

/** 只绘制静态氛围层，不拦截手势，不拥有安全区、计时器或内容布局。 */
@Component
export struct SharedPageBackground {
  @Prop isDark: boolean = false;
  @Prop reduceTransparency: boolean = false;
  @Prop palette: VisualPalette | undefined = undefined;

  private colors(): VisualPalette { return this.palette ?? visualPalette(this.isDark); }

  build() {
    Stack() {
      Column().width('100%').height('100%').backgroundColor(this.colors().page)
      if (!this.reduceTransparency) {
        Column().width('100%').height('100%')
          .linearGradient({ angle: 135, colors: [[this.colors().page, 0], [this.colors().pageTint, 0.5], [this.colors().page, 1]] })
        Column().width('100%').height('100%')
          .radialGradient({ center: ['95%', '5%'], radius: '80%',
            colors: [[visualAlpha(this.colors().action, this.isDark ? 0.14 : 0.10), 0], [visualAlpha(this.colors().action, 0), 1]] })
        Column().width('100%').height('100%')
          .radialGradient({ center: ['5%', '95%'], radius: '75%',
            colors: [[this.colors().ambient, 0], [visualAlpha(this.colors().ambient, 0), 1]] })
      }
    }.width('100%').height('100%').hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
