// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassPanel } from './PopupPanel';
import { SharedGlassBubblePanel } from './MenuBubble';
import { SharedMenuTheme, sharedMenuTheme, SharedMenuTokens, SharedMenuScope, sharedMenuScope, SharedMenuRouter, SharedToolbarMenuBounds } from './MenuTypes';
import { GlassFusionRect } from '../../core/GlassFusion';
import { ActionMenuBubble, ActionMenuPointerSide, safeMenuGeometry, keyboardViewportHeight, SafeMenuGeometry } from '../../core/MenuLayout';

/** 顶部菜单共用表面、锚点留白、承接层、滚动边界和动效。 */
@Component
export struct SharedAnchoredMenu {
  @Prop theme: SharedMenuTheme = sharedMenuTheme();
  @Prop backgroundSource: string = '';
  @Prop trigger: GlassFusionRect | undefined = undefined;
  @Prop bottomGap: number = 0;
  @Prop pageInset: number = 12;
  @Prop keyboardTop: number = 0;
  @Prop safeTop: number = 0;
  @Prop safeBottom: number = 0;
  @Prop safeLeft: number = 0;
  @Prop safeRight: number = 0;
  @Prop enterScale: number = 1;
  @Prop enterAnimation: AnimateParam = { duration: 160, curve: Curve.EaseOut };
  @Prop exitTransition: TransitionEffect = TransitionEffect.IDENTITY;
  @Prop flatTransition: TransitionEffect = TransitionEffect.IDENTITY;
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => false;
  menuRouter: SharedMenuRouter | undefined = undefined;

  slideScope: SharedMenuScope = sharedMenuScope();
  private readonly scroller: Scroller = new Scroller();
  aboutToAppear(): void {
    this.slideScope.scroll = (delta: number): void => { this.scroller.scrollBy(0, delta); };
    this.menuRouter?.attach(this.slideScope);
  }
  aboutToDisappear(): void { this.menuRouter?.detach(this.slideScope); }
  @Prop @Watch('closeRequested') closeRequest: number = 0;
  private closeRequested(): void { this.onClose(); }
  /** 工具栏提供窗口坐标下的内容边界；按钮动效起点由 PopupTrigger 独立交接。 */
  @Prop toolbarBounds: SharedToolbarMenuBounds | undefined = undefined;
  @Prop menuWidth: number = 180;
  /** 调用方传入菜单宿主内的最终坐标；窗口根宿主与窗口坐标相同。 */
  @Prop topOffset: number = 0;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  /** 实测内容区域在宿主内的左缘；已包含安全区和页面内边距，不能重复叠加。 */
  @Prop contentLeft: number | undefined = undefined;
  /** 触发按钮实测窗口右缘；存在时只转换一次宿主坐标，不再扣安全区。 */
  @Prop anchorRight: number | undefined = undefined;
  @Prop anchorBottom: number | undefined = undefined;
  @State private viewportLeft: number = 0;
  @State private viewportWidth: number = 0;
  @Prop cornerRadius: number = SharedMenuTokens.radius;
  @Prop surfaceVisible: boolean = true;
  @Prop refractionSource: string = '';
  @Prop materialRole: string = 'menu';
  onPanelArea: (area: Area) => void = (_area: Area): void => {};
  onPrepared: () => void = (): void => {};
  /** 行锚点菜单的主面板轮廓独立于 Scroll；保持尖角固定在所选行边框。 */
  @Prop bubble: ActionMenuBubble | undefined = undefined;
  @Prop maxHeight: number | undefined = undefined;
  @State private viewportHeight: number = 600;
  @State private viewportTop: number = 0;
  @State private renderedHeight: number = 0;
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  private menuGeometry(): SafeMenuGeometry {
    const top: number = this.toolbarBounds !== undefined ? this.toolbarBounds.top - this.viewportTop :
      this.anchorBottom === undefined ? this.topOffset : this.anchorBottom - this.viewportTop + SharedMenuTokens.gap;
    return safeMenuGeometry(keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop), top, Math.max(0, this.safeTop - this.viewportTop), this.keyboardTop > 0 ? 0 : this.safeBottom,
      this.bottomGap);
  }

  private scrollMaxHeight(): number {
    return Math.min(this.menuGeometry().maxHeight, this.maxHeight ?? this.menuGeometry().maxHeight);
  }

  private panelLeft(): number | undefined {
    if (this.toolbarBounds !== undefined) {
      const left: number = this.toolbarBounds.left - this.viewportLeft;
      const aligned: number = this.alignEnd ? left + this.toolbarBounds.width - this.menuWidth : left;
      return Math.max(0, Math.min(this.viewportWidth - this.menuWidth, aligned));
    }
    if (this.contentLeft !== undefined || this.anchorRight === undefined) return this.contentLeft;
    return Math.max(0, Math.min(this.viewportWidth - this.menuWidth, this.anchorRight - this.viewportLeft - this.menuWidth));
  }

  @Builder
  private menuContent() {
        Scroll(this.scroller) {
          Column() {
            this.content()
          }.width('100%')
        }
        .constraintSize({ maxHeight: this.scrollMaxHeight() })
        // 复合菜单的各列自行滚动。外壳不能把从工具栏飞入的玻璃裁在最终菜单矩形内。
        .clip(this.surfaceVisible)
        .scrollBar(BarState.Auto)
        .onClick((event: ClickEvent): void => { })
        .width(this.menuWidth)
        .onDidScroll((): void => { this.slideScope.offset = this.scroller.currentOffset().yOffset; })
        .onAreaChange((_old: Area, area: Area): void => {
          this.renderedHeight = Number(area.height); this.onPanelArea(area);
          this.slideScope.clip = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
            width: Number(area.width), height: Number(area.height) };
        })

  }

  build() {
    Stack({ alignContent: this.panelLeft() === undefined ? Alignment.Top : Alignment.TopStart }) {
      Column()
        .width('100%').height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((event: ClickEvent): void => { this.onClose(); })
      // 定位容器与宿主工具栏同宽；外部点击承接层仍覆盖整个窗口。
      Stack({ alignContent: this.alignEnd ? Alignment.TopEnd : Alignment.TopStart }) {
        Stack({ alignContent: Alignment.TopStart }) {
          if (this.bubble !== undefined && this.surfaceVisible) {
            SharedGlassBubblePanel({ trigger: this.trigger, enterScale: this.enterScale, enterAnimation: this.enterAnimation, exitTransition: this.exitTransition, flatTransition: this.flatTransition, theme: this.theme, backgroundSource: this.backgroundSource, captureAllowed: this.captureAllowed, source: this.refractionSource, showContourStroke: false, panelWidth: this.bubble.width,
              pointerCenter: this.bubble.pointerCenter, pointerSide: this.bubble.pointerSide,
              onPrepared: this.onPrepared, content: (): void => { this.menuContent(); } })
          } else {
            SharedGlassPanel({ theme: this.theme, backgroundSource: this.backgroundSource, captureAllowed: this.captureAllowed, trigger: this.trigger, enterAnimation: this.enterAnimation, enterScale: this.enterScale, exitTransition: this.exitTransition, flatTransition: this.flatTransition, source: this.refractionSource, role: this.materialRole, radius: this.toolbarBounds === undefined ? this.cornerRadius : SharedMenuTokens.toolbarRadius,
              panelWidth: this.menuWidth, menuMotion: true, centerX: this.alignEnd ? '100%' : '0%', centerY: '0%',
              surfaceVisible: this.surfaceVisible, onPrepared: this.onPrepared,
              content: (): void => { this.menuContent(); } })
          }
        }
        .margin({ top: this.menuGeometry().top - (this.bubble?.pointerSide === ActionMenuPointerSide.Top ? SharedMenuTokens.pointerDepth : 0),
          left: this.panelLeft() !== undefined ? 0 : this.alignEnd ? this.safeLeft : this.safeLeft + this.pageInset,
          right: this.panelLeft() !== undefined ? 0 : this.alignEnd ? this.safeRight + this.pageInset : this.safeRight })

      }
      .width(this.contentLeft !== undefined ? this.contentMaxWidth : this.panelLeft() !== undefined ? this.menuWidth : '100%')
      .constraintSize({ maxWidth: this.contentMaxWidth })
      .margin({ left: this.panelLeft() ?? 0 })
      .transition(!this.surfaceVisible && this.theme.material === 'glass' ?
        TransitionEffect.asymmetric(TransitionEffect.IDENTITY, this.exitTransition) : TransitionEffect.IDENTITY)
      .hitTestBehavior(HitTestMode.Transparent).zIndex(2)
    }
    .width('100%').height('100%')
    .onClick((event: ClickEvent): void => { this.onClose(); })
    .onAreaChange((_old: Area, area: Area): void => {
      this.viewportLeft = Number(area.globalPosition.x);
      this.viewportWidth = Number(area.width);
      this.viewportHeight = Number(area.height);
      this.viewportTop = Number(area.globalPosition.y);
    })
  }
}
