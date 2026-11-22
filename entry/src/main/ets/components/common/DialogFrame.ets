// SPDX-License-Identifier: AGPL-3.0-or-later
import { dialogGlassSourceMounted, glassSourceVisibility, setGlassSourceFreeze, currentGlassSource } from '../../utils/GlassBackdrop';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { DelayedLoadingIndicator } from './DelayedLoadingIndicator';
import { GlassPanel } from './GlassPanel';
import { WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight } from '../../model/WindowSafeLayout';
import { motionAnimation } from '../../utils/AppMotion';
import { currentMotionProfile } from '../../utils/AppMotion';
import { DialogBackdrop } from './DialogBackdrop';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { safeDialogMaxHeight, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY, WINDOW_SIZE_KEY, WindowSizeVp, remainingHorizontalInset } from '../../model/WindowSafeLayout';

let nextDialogGlassSource: number = 0;

/** 常规弹窗固定操作栏、正文按内容收缩并限高滚动；不拥有草稿或业务任务。 */
@Component
export struct DialogFrame {
  @Provide('dialogGlassSource') private dialogGlassSource: string = `jide-glass-dialog-source-${++nextDialogGlassSource}`;
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop nativeHost: boolean = false;
  @Prop opaque: boolean = false;
  @Prop materialOverride: string = '';
  @Prop surfaceRole: string = 'dialog';
  @Prop showPreparation: boolean = false;
  onPrepared: () => void = (): void => {};
  @State private prepared: boolean = false;
  @State private waitingVisible: boolean = false;
  private waitingTimer: number = -1;
  private sourceVisible: boolean = false;

  aboutToAppear(): void {
    dialogGlassSourceMounted(this.dialogGlassSource, true, this.refractionSource || currentGlassSource(this.getUIContext()));
    if (this.showPreparation) this.waitingTimer = setTimeout((): void => {
      if (!this.prepared) this.waitingVisible = true;
    }, 150);
  }
  aboutToDisappear(): void {
    dialogGlassSourceMounted(this.dialogGlassSource, false);
    clearTimeout(this.waitingTimer);
    this.sourceVisible = false;
    this.syncGlassSource();
    setGlassSourceFreeze(this.dialogGlassSource, false);
  }

  @Prop refractionSource: string = '';
  @Prop maximumWidth: number = 应用尺寸.dialogMaxWidth;
  // 卡片预览自行拥有滚动；普通表单继续按内容收缩并由外壳滚动。
  @Prop fixedHeight: number = 0;
  @Prop fillBody: boolean = false;
  @Prop bodyLoading: boolean = false;
  // 自动前进保留底部操作栏，卡片几何、滚动和安全区仍由同一外壳拥有。
  @Prop actionsAtBottom: boolean = false;
  @Prop canDismiss: boolean = true;
  @Prop protectPanelGestures: boolean = false;
  private panelArea: Area | undefined = undefined;
  onDismiss: () => void = (): void => {};
  @BuilderParam header: () => void = this.emptyContent;
  @BuilderParam content: () => void = this.emptyContent;
  @Prop showFooter: boolean = false;
  @BuilderParam footer: () => void = this.emptyContent;
  @State private surfaceWidth: string = 应用尺寸.dialogWidth;
  @State private surfaceMaximumWidth: number = 0;
  @State private footerHeight: number = 0;
  @State private viewportTop: number = 0;
  @State private viewportLeft: number = 0;
  @State private viewportWidth: number = 0;
  @StorageProp(WINDOW_SIZE_KEY) private windowSize: WindowSizeVp = { width: 0, height: 0 };
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
  @State private viewportHeight: number = 600;
  @State private headerHeight: number = 56;
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;

  @Builder
  private emptyContent(): void {}

  private dismiss(): void {
    if (this.canDismiss) this.onDismiss();
  }

  private scrollOwnsShadowInsets(): boolean {
    return !this.fillBody && this.surfaceMaterial === 'glass';
  }

  private hasSectionAfterBody(): boolean { return this.actionsAtBottom || this.showFooter; }

  private framePaddingTop(): number {
    return this.scrollOwnsShadowInsets() && this.actionsAtBottom ? 0 : 应用尺寸.卡片内边距;
  }

  private framePaddingBottom(): number {
    if (this.surfaceMaterial !== 'glass') return 应用尺寸.卡片内边距;
    if (this.scrollOwnsShadowInsets() && !this.hasSectionAfterBody()) return 0;
    return SeriesVisual.scrollShadowEndInset(this.surfaceMaterial, 应用尺寸.卡片内边距);
  }

  private bodyPaddingTop(): number {
    return this.scrollOwnsShadowInsets() ? SeriesVisual.scrollShadowStartInset(this.surfaceMaterial,
      this.actionsAtBottom ? 应用尺寸.卡片内边距 : 应用尺寸.间距_12) : 0;
  }

  private bodyPaddingBottom(): number {
    return this.scrollOwnsShadowInsets() ? SeriesVisual.scrollShadowEndInset(this.surfaceMaterial,
      this.hasSectionAfterBody() ? 应用尺寸.间距_12 : 应用尺寸.卡片内边距) : 0;
  }

  private footerMarginTop(): number {
    return this.scrollOwnsShadowInsets() && this.actionsAtBottom ? 应用尺寸.间距_12 : 0;
  }

  private sectionGap(): number { return this.scrollOwnsShadowInsets() ? 0 : 应用尺寸.间距_12; }

  private dismissFromClick(event: ClickEvent): void {
    if (this.protectPanelGestures) {
      const area: Area | undefined = this.panelArea;
      if (area === undefined) return;
      const x: number = Number(area.globalPosition.x);
      const y: number = Number(area.globalPosition.y);
      if (event.windowX >= x && event.windowX <= x + Number(area.width) &&
        event.windowY >= y && event.windowY <= y + Number(area.height)) return;
    }
    this.dismiss();
  }

  private bodyHeight(): number {
    return Math.max(0, this.frameMaxHeight() - this.headerHeight - this.framePaddingTop() - this.framePaddingBottom() -
      this.sectionGap() - (this.showFooter ? this.footerHeight + this.sectionGap() + this.footerMarginTop() : 0));
  }

  private usableHeight(): number { return keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop); }

  private frameMaxHeight(): number {
    const safeHeight: number = safeDialogMaxHeight(this.usableHeight(), this.safeTop, this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.间距_8, 应用尺寸.dialogHeightRatio);
    return this.fixedHeight > 0 ? Math.min(this.fixedHeight, safeHeight) : safeHeight;
  }

  private syncGlassSource(): void {
    // 子菜单的底图预热会截图、合成及模糊；父弹窗形变完成后才启动。
    glassSourceVisibility(this.getUIContext(), this.dialogGlassSource, this.sourceVisible && this.prepared);
  }

  private finishPreparation(): void {
    this.prepared = true;
    this.waitingVisible = false;
    clearTimeout(this.waitingTimer);
    this.syncGlassSource();
    this.onPrepared();
  }

  onPanelArea: (area: Area) => void = (_area: Area): void => {};

  build() {
    Stack() {
      DialogBackdrop({ maximumWidth: this.maximumWidth,
        onSize: (width: string, maximumWidth: number): void => {
          this.surfaceWidth = width; this.surfaceMaximumWidth = maximumWidth;
        } }).onClick((event: ClickEvent): void => { this.dismissFromClick(event); }, this.protectPanelGestures ? 8 : 0)
        .transition(this.nativeHost ? TransitionEffect.IDENTITY : SurfaceTransition.backdrop())
      Stack() {
        GlassPanel({
          onPrepared: (): void => { this.finishPreparation(); }, role: this.surfaceRole, source: this.refractionSource,
          materialOverride: this.materialOverride, opaque: this.opaque,
          radius: 应用尺寸.圆角_卡片, panelWidth: this.surfaceWidth,
          maximumWidth: this.surfaceMaximumWidth || this.maximumWidth, maximumHeight: this.frameMaxHeight() }) {
        Column({ space: this.sectionGap() }) {
          if (!this.actionsAtBottom) {
            this.actionBar()
          }
          if (this.fillBody) {
            Column() { this.content() }.width('100%').height(this.bodyHeight())
          } else {
            Stack({ alignContent: Alignment.Center }) {
              Scroll() {
                Column({ space: 应用尺寸.间距_12 }) { this.content() }.width('100%')
                  .constraintSize({ minHeight: this.fixedHeight > 0 ?
                    Math.max(0, this.bodyHeight() - this.bodyPaddingTop() - this.bodyPaddingBottom()) : 0 })
              }
              .width('100%')
              // 玻璃投影可以画进滚动内边距，越过实际视口的正文仍裁切。
              .padding({ left: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0,
                right: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0,
                top: this.bodyPaddingTop(), bottom: this.bodyPaddingBottom() })
              .clipContent(this.scrollOwnsShadowInsets() ? ContentClipMode.BOUNDARY : ContentClipMode.CONTENT_ONLY)
              .constraintSize({ minHeight: this.fixedHeight > 0 ? this.bodyHeight() : 0, maxHeight: this.bodyHeight() })
              .scrollBar(BarState.Auto)
              if (this.bodyLoading) {
                DelayedLoadingIndicator().hitTestBehavior(HitTestMode.None)
              }
            }.width('100%')
          }
          if (this.actionsAtBottom) {
            this.actionBar()
          }
          if (this.showFooter) {
            Column() { this.footer() }.width('100%').flexShrink(0)
              .padding({ left: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0,
                right: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0 })
              .margin({ top: this.footerMarginTop() })
              .onAreaChange((_old: Area, area: Area): void => { this.footerHeight = Number(area.height); })
          }
        }
        .onAreaChange((_old: Area, area: Area): void => {
          if (this.protectPanelGestures) this.panelArea = area;
          this.onPanelArea(area);
        })
        .padding({ left: this.scrollOwnsShadowInsets() ? 0 : 应用尺寸.卡片内边距,
          right: this.scrollOwnsShadowInsets() ? 0 : 应用尺寸.卡片内边距,
          top: this.framePaddingTop(), bottom: this.framePaddingBottom() })
        .width('100%')
        .onClick((): void => {})
        }
        
      }.width('100%').height(this.usableHeight()).id(this.dialogGlassSource).alignContent(Alignment.Center)
        .padding({ top: this.safeTop + 应用尺寸.间距_8, bottom: (this.keyboardTop > 0 ? 0 : this.safeBottom) + 应用尺寸.间距_8,
          left: remainingHorizontalInset(this.safeLeft, this.viewportLeft) + 应用尺寸.间距_8,
          right: remainingHorizontalInset(this.safeRight, this.viewportWidth > 0 ? this.windowSize.width - this.viewportLeft - this.viewportWidth : 0) + 应用尺寸.间距_8 })
        .hitTestBehavior(HitTestMode.Transparent)
      if (this.showPreparation && this.waitingVisible) {
        Column({ space: 12 }) {
          LoadingProgress().width(32).height(32).color(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
          Text($r('app.string.common_loading')).fontSize(14).fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
        }.width('100%').height('100%').justifyContent(FlexAlign.Center)
          .hitTestBehavior(HitTestMode.None).accessibilityText($r('app.string.common_loading'))
      }
    }
    .width('100%').height('100%')
    .onVisibleAreaChange([0, 1], (visible: boolean): void => {
      setGlassSourceFreeze(this.dialogGlassSource, true);
      this.sourceVisible = visible;
      this.syncGlassSource();
    })
    .onClick((event: ClickEvent): void => { this.dismissFromClick(event); }, this.protectPanelGestures ? 8 : 0)
    .alignContent(Alignment.Top)
    .onAreaChange((_old: Area, area: Area): void => { this.viewportHeight = Number(area.height); this.viewportTop = Number(area.globalPosition.y);
      this.viewportLeft = Number(area.globalPosition.x); this.viewportWidth = Number(area.width); })
  }

  @Builder
  private actionBar() {
    Column() { this.header() }
      .width('100%').flexShrink(0)
      .padding({ left: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0,
        right: this.scrollOwnsShadowInsets() ? 应用尺寸.卡片内边距 : 0 })
      .onAreaChange((_old: Area, area: Area): void => { this.headerHeight = Number(area.height); })
  }
}
