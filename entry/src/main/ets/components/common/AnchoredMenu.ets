// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { MenuSurface } from './MenuSurface';
import { safeMenuGeometry, SafeMenuGeometry, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 顶部菜单共用表面、锚点留白、承接层、滚动边界和动效。 */
@Component
export struct AnchoredMenu {
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  /** 调用方传入最终窗口坐标；公共表面不得再次扣除密度偏移。 */
  @Prop topOffset: number = 0;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  @Prop surfaceVisible: boolean = true;
  @State private viewportHeight: number = 600;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  private menuGeometry(): SafeMenuGeometry {
    return safeMenuGeometry(this.viewportHeight, this.topOffset, this.safeTop, this.safeBottom,
      应用尺寸.页面底部间距(this.narrowDeckLayout));
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      Column()
        .width('100%').height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => { this.onClose(); })
      // 定位容器与宿主工具栏同宽；外部点击承接层仍覆盖整个窗口。
      Stack({ alignContent: this.alignEnd ? Alignment.TopEnd : Alignment.TopStart }) {
        Scroll() {
          Column() {
            this.content()
          }.width('100%')
        }
        .constraintSize({ maxHeight: this.menuGeometry().maxHeight })
        .scrollBar(BarState.Auto)
        .width(this.menuWidth)
        .attributeModifier(new MenuSurface(this.surfaceVisible))
        .margin({ top: this.menuGeometry().top, left: this.alignEnd ? this.safeLeft : this.safeLeft + 应用尺寸.页面内边距_水平,
          right: this.alignEnd ? this.safeRight + 应用尺寸.页面内边距_水平 : this.safeRight })
        .onClick((): void => {})
        .transition(MenuSurface.popupTransition())
      }
      .width('100%')
      .constraintSize({ maxWidth: this.contentMaxWidth })
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%').height('100%')
    .onAreaChange((_old: Area, area: Area): void => { this.viewportHeight = Number(area.height); })
  }
}
