import { WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight } from '../../model/WindowSafeLayout';
import { motionAnimation } from '../../utils/AppMotion';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile } from '../../utils/AppMotion';
import { DialogBackdrop } from './DialogBackdrop';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { safeDialogMaxHeight, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 常规弹窗固定操作栏、正文按内容收缩并限高滚动；不拥有草稿或业务任务。 */
@Component
export struct DialogFrame {
  @Prop nativeHost: boolean = false;
  @Prop maximumWidth: number = 应用尺寸.dialogMaxWidth;
  // 卡片预览自行拥有滚动；普通表单继续按内容收缩并由外壳滚动。
  @Prop fillBody: boolean = false;
  // 自动前进保留底部操作栏，卡片几何、滚动和安全区仍由同一外壳拥有。
  @Prop actionsAtBottom: boolean = false;
  @Prop canDismiss: boolean = true;
  onDismiss: () => void = (): void => {};
  @BuilderParam header: () => void = this.emptyContent;
  @BuilderParam content: () => void = this.emptyContent;
  @State private viewportTop: number = 0;
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
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

  private usableHeight(): number { return keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop); }

  private frameMaxHeight(): number {
    return safeDialogMaxHeight(this.usableHeight(), this.safeTop, this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.间距_8, 应用尺寸.dialogHeightRatio);
  }

  build() {
    Stack() {
      DialogBackdrop().onClick((): void => { this.dismiss(); })
        .transition(this.nativeHost ? TransitionEffect.IDENTITY : SurfaceTransition.backdrop())
      Stack() {
        Column({ space: 应用尺寸.间距_12 }) {
          if (!this.actionsAtBottom) {
            this.actionBar()
          }
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
          if (this.actionsAtBottom) {
            this.actionBar()
          }
        }
        .width(应用尺寸.dialogWidth)
        .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.frameMaxHeight() })
        .padding(应用尺寸.卡片内边距)
        .backgroundColor($r('app.color.surface_card'))
        .border(SurfaceBorder.options())
        .borderRadius(应用尺寸.圆角_卡片)
        .onClick((): void => {})
        .transition(this.nativeHost ? TransitionEffect.IDENTITY : SurfaceTransition.dialog())
      }.width('100%').height(this.usableHeight()).alignContent(Alignment.Center)
        .animation(motionAnimation(currentMotionProfile().textMs))
        .padding({ top: this.safeTop + 应用尺寸.间距_8, bottom: (this.keyboardTop > 0 ? 0 : this.safeBottom) + 应用尺寸.间距_8,
          left: this.safeLeft + 应用尺寸.间距_8, right: this.safeRight + 应用尺寸.间距_8 })
        .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%').height('100%')
    .alignContent(Alignment.Top)
    .onAreaChange((_old: Area, area: Area): void => { this.viewportHeight = Number(area.height); this.viewportTop = Number(area.globalPosition.y); })
  }

  @Builder
  private actionBar() {
    Column() { this.header() }
      .width('100%').flexShrink(0)
      .onAreaChange((_old: Area, area: Area): void => { this.headerHeight = Number(area.height); })
  }
}
