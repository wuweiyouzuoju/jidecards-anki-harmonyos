// SPDX-License-Identifier: AGPL-3.0-or-later
import { WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight } from '../../model/WindowSafeLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { MenuSurface } from './MenuSurface';
import { ActionMenuBubble, ActionMenuPointerSide } from './ActionMenuLayout';
import { MenuBubbleSurface } from './MenuBubbleSurface';
import { MenuSlideScope, menuSlideSession } from '../../model/MenuSlideSession';
import { safeMenuGeometry, SafeMenuGeometry, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 顶部菜单共用表面、锚点留白、承接层、滚动边界和动效。 */
@Component
export struct AnchoredMenu {
  slideScope: MenuSlideScope = new MenuSlideScope();
  private readonly scroller: Scroller = new Scroller();
  aboutToAppear(): void {
    this.slideScope.scroll = (delta: number): void => { this.scroller.scrollBy(0, delta); };
    menuSlideSession.attach(this.slideScope);
  }
  aboutToDisappear(): void { menuSlideSession.detach(this.slideScope); }
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  /** 调用方传入菜单宿主内的最终坐标；窗口根宿主与窗口坐标相同。 */
  @Prop topOffset: number = 0;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  /** 实测内容区域在宿主内的左缘；已包含安全区和页面内边距，不能重复叠加。 */
  @Prop contentLeft: number | undefined = undefined;
  @Prop cornerRadius: number = 应用尺寸.radiusLg;
  @Prop surfaceVisible: boolean = true;
  /** 行锚点菜单的主面板轮廓独立于 Scroll；保持尖角固定在所选行边框。 */
  @Prop bubble: ActionMenuBubble | undefined = undefined;
  @Prop maxHeight: number | undefined = undefined;
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
  @State private viewportHeight: number = 600;
  @State private viewportTop: number = 0;
  @State private renderedHeight: number = 0;
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
    return safeMenuGeometry(keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop), this.topOffset, Math.max(0, this.safeTop - this.viewportTop), this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.页面底部间距(this.narrowDeckLayout));
  }

  private scrollMaxHeight(): number {
    return Math.min(this.menuGeometry().maxHeight, this.maxHeight ?? this.menuGeometry().maxHeight);
  }

  build() {
    Stack({ alignContent: this.contentLeft === undefined ? Alignment.Top : Alignment.TopStart }) {
      Column()
        .width('100%').height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => { this.onClose(); })
      // 定位容器与宿主工具栏同宽；外部点击承接层仍覆盖整个窗口。
      Stack({ alignContent: this.alignEnd ? Alignment.TopEnd : Alignment.TopStart }) {
        if (this.bubble !== undefined && this.renderedHeight > 0) {
          MenuBubbleSurface({ panelWidth: this.bubble.width, panelHeight: this.renderedHeight,
            pointerCenter: this.bubble.pointerCenter, pointerSide: this.bubble.pointerSide })
            .position({ x: this.bubble.left, y: this.menuGeometry().top -
              (this.bubble.pointerSide === ActionMenuPointerSide.Top ? MenuSurface.pointerDepth : 0) })
            .transition(MenuSurface.popupTransition(this.bubble.pointerCenter,
              this.bubble.pointerSide === ActionMenuPointerSide.Bottom ? '100%' : '0%'))
        }
        Scroll(this.scroller) {
          Column() {
            this.content()
          }.width('100%')
        }
        .constraintSize({ maxHeight: this.scrollMaxHeight() })
        .scrollBar(BarState.Auto)
        .width(this.menuWidth)
        .onDidScroll((): void => { this.slideScope.offset = this.scroller.currentOffset().yOffset; })
        .onAreaChange((_old: Area, area: Area): void => {
          this.renderedHeight = Number(area.height);
          this.slideScope.clip = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
            width: Number(area.width), height: Number(area.height) };
        })
        .attributeModifier(new MenuSurface(this.surfaceVisible && this.bubble === undefined, this.cornerRadius))
        .clip(this.bubble !== undefined || this.surfaceVisible)
        .margin({ top: this.menuGeometry().top,
          left: this.contentLeft !== undefined ? 0 : this.alignEnd ? this.safeLeft : this.safeLeft + 应用尺寸.页面内边距_水平,
          right: this.contentLeft !== undefined ? 0 : this.alignEnd ? this.safeRight + 应用尺寸.页面内边距_水平 : this.safeRight })
        .onClick((): void => {})
        .transition(MenuSurface.popupTransition(this.bubble === undefined ? this.alignEnd ? '100%' : '0%' :
          this.bubble.left + this.bubble.pointerCenter, this.bubble?.pointerSide === ActionMenuPointerSide.Bottom ? '100%' : '0%'))
      }
      .width('100%')
      .constraintSize({ maxWidth: this.contentMaxWidth })
      .margin({ left: this.contentLeft ?? 0 })
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%').height('100%')
    .onAreaChange((_old: Area, area: Area): void => {
      this.viewportHeight = Number(area.height);
      this.viewportTop = Number(area.globalPosition.y);
    })
  }
}
