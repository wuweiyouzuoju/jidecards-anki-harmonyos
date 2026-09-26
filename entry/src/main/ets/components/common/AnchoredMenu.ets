// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 首页、设置及浏览共用同一菜单表面、锚点留白、承接层和动效。 */
@Component
export struct AnchoredMenu {
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  @Prop topOffset: number = 68;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    Stack({ alignContent: Alignment.Top }) {
      Column()
        .width('100%').height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => { this.onClose(); })
      // 定位容器与宿主工具栏同宽；外部点击承接层仍覆盖整个窗口。
      Stack({ alignContent: this.alignEnd ? Alignment.TopEnd : Alignment.TopStart }) {
        Column() {
          this.content()
        }
        .width(this.menuWidth)
        .backgroundColor($r('app.color.surface_card'))
        .borderRadius(应用尺寸.圆角_指标卡)
        .border({ width: 0.5, color: $r('app.color.border_subtle') })
        .shadow({ radius: 12, color: 'rgba(0,0,0,0.10)', offsetX: 0, offsetY: 4 })
        .clip(true)
        .margin({ top: this.topOffset, left: this.alignEnd ? 0 : 应用尺寸.页面内边距_水平,
          right: this.alignEnd ? 应用尺寸.页面内边距_水平 : 0 })
        .onClick((): void => {})
        .transition(TransitionEffect.asymmetric(
          TransitionEffect.opacity(0)
            .combine(TransitionEffect.scale({ x: 0.98, y: 0.98 }))
            .animation({ curve: Curve.EaseOut, duration: 150 }),
          TransitionEffect.opacity(0).animation({ curve: Curve.EaseOut, duration: 150 })
        ))
      }
      .width('100%')
      .constraintSize({ maxWidth: this.contentMaxWidth })
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%').height('100%')
  }
}
