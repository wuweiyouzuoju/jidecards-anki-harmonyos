// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogBackdrop } from './DialogBackdrop';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import { safeDialogMaxHeight, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 常规弹窗固定操作栏、正文按内容收缩并限高滚动；不拥有草稿或业务任务。 */
@Component
export struct DialogFrame {
  @Prop maximumWidth: number = 应用尺寸.dialogMaxWidth;
  // 卡片预览自行拥有滚动；普通表单继续按内容收缩并由外壳滚动。
  @Prop fillBody: boolean = false;
  @Prop canDismiss: boolean = true;
  onDismiss: () => void = (): void => {};
  @BuilderParam header: () => void = this.emptyContent;
  @BuilderParam content: () => void = this.emptyContent;
  @State private viewportHeight: number = 600;
  @State private headerHeight: number = 56;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;

  @Builder
  private emptyContent(): void {}

  private dismiss(): void {
    if (this.canDismiss) this.onDismiss();
  }

  private bodyHeight(): number {
    return Math.max(0, this.frameMaxHeight() -
      this.headerHeight - 应用尺寸.卡片内边距 * 2 - 应用尺寸.间距_12);
  }

  private frameMaxHeight(): number {
    return safeDialogMaxHeight(this.viewportHeight, this.safeTop, this.safeBottom,
      应用尺寸.间距_8, 应用尺寸.dialogHeightRatio);
  }

  build() {
    Stack() {
      DialogBackdrop().onClick((): void => { this.dismiss(); })
      Stack() {
        Column({ space: 应用尺寸.间距_12 }) {
          Column() { this.header() }
            .width('100%').flexShrink(0)
            .onAreaChange((_old: Area, area: Area): void => { this.headerHeight = Number(area.height); })
          if (this.fillBody) {
            Column() { this.content() }.width('100%').height(this.bodyHeight())
          } else {
            Scroll() {
              Column({ space: 应用尺寸.间距_12 }) { this.content() }.width('100%')
            }
            .width('100%')
            .constraintSize({ maxHeight: this.bodyHeight() })
            .scrollBar(BarState.Auto)
          }
        }
        .width(应用尺寸.dialogWidth)
        .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.frameMaxHeight() })
        .padding(应用尺寸.卡片内边距)
        .backgroundColor($r('app.color.surface_card'))
        .border(SurfaceBorder.options())
        .borderRadius(应用尺寸.圆角_卡片)
        .onClick((): void => {})
        .transition(TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }.width('100%').height('100%').alignContent(Alignment.Center)
        .padding({ top: this.safeTop + 应用尺寸.间距_8, bottom: this.safeBottom + 应用尺寸.间距_8,
          left: this.safeLeft + 应用尺寸.间距_8, right: this.safeRight + 应用尺寸.间距_8 })
        .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%').height('100%')
    .alignContent(Alignment.Center)
    .onAreaChange((_old: Area, area: Area): void => { this.viewportHeight = Number(area.height); })
  }
}
