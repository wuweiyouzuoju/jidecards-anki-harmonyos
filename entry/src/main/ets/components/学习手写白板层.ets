// SPDX-License-Identifier: AGPL-3.0-or-later
import { LengthMetrics } from '@kit.ArkUI';
import { WINDOW_SAFE_TOP_KEY } from '../model/WindowSafeLayout';
import { 应用尺寸 } from '../utils/应用尺寸';
import { cardViewportWidth } from '../model/CardViewportLayout';
import { WHITEBOARD_INTERFACE_ITEMS, AppInterfaceItem, AppInterfaceControl } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { studyPenKitAvailability, StudyPenKitAvailability } from '../backend/StudyPenKitAvailability';
import { interfaceControlText } from '../utils/AppInterfaceText';
import { 按下态按钮 } from './common/按下态按钮';
import { IconActionButton } from './common/IconActionButton';
import { StudyPenCanvasHost } from './StudyPenCanvasHost';
import { StudyLocalWhiteboard } from './StudyLocalWhiteboard';
import { StudyWhiteboard } from '../model/StudyWhiteboard';
import { StudyAnnotationView, AnnotationPoint, AnnotationPose } from '../model/StudyAnnotationView';
import { StudyContentViewport } from './StudyContentViewport';
import { MenuSurface } from './common/MenuSurface';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';
import { loadStudyPaperTransparency, saveStudyPaperTransparency } from '../utils/StudyWhiteboardAppearanceStore';
import { showToastSafely, resourceText } from '../utils/UiFeedback';
import { 颜色键 } from '../model/颜色主题';

/** 官方套件不可用即回退原版；收起保留当前卡画布，换题清空。 */
@Component
export struct 学习手写白板层 {
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop 是否深色: boolean = false;
  @Prop @Watch('inputConditionsChanged') isVisible: boolean = false;
  @Prop @Watch('inputConditionsChanged') isInputEnabled: boolean = true;
  @Prop @Watch('resetRequested') resetTick: number = 0;
  @Prop undoTick: number = 0;
  @Prop redoTick: number = 0;
  @Prop @Watch('backRequested') backTick: number = 0;
  @Prop @Watch('publishInterface') reviewPhase: string = '';
  @BuilderParam reviewActions: () => void = this.emptyReviewActions;
  onClose: () => void = (): void => {};
  onEngineChanged: (official: boolean) => void = (): void => {};
  onViewChanged: (pose: AnnotationPose) => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @State private canvasGeneration: number = 0;
  @State private isSupported: boolean = false;
  @State private canvasReady: boolean = false;
  @State private canvasFailed: boolean = false;
  @State private fallbackReason: string = '';
  @State private paperTransparency: number = 80;
  @State private opacityOpen: boolean = false;
  @State private toolbarContentWidth: number = 840;
  @State private viewScale: number = 1;
  @State private viewX: number = 0;
  @State private viewY: number = 0;
  @State private rootX: number = 0;
  @State private rootY: number = 0;
  @State private penDetected: boolean = false;
  private contentView: StudyAnnotationView = new StudyAnnotationView();
  private drawingArea: Area | null = null;
  private panActive: boolean = false;
  private pinchActive: boolean = false;
  private singlePanActive: boolean = false;
  private penPointers: number[] = [];
  private canvasHost: StudyPenCanvasHost | null = null;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private toolbarSafeTop: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  private localSession: StudyWhiteboard = new StudyWhiteboard();
  private mounted: boolean = false;
  private initTimer: number = -1;
  private initWaitVersion: number = 0;
  private canvasScale: number = 1;
  private sdkInitialized: boolean = false;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private savedPaperTransparency: number = 80;
  private requestedPaperTransparency: number | null = null;
  private transparencySaveRequest: number = 0;

  aboutToAppear(): void {
    this.mounted = true;
    this.penDetected = false;
    this.paperTransparency = loadStudyPaperTransparency();
    this.savedPaperTransparency = this.paperTransparency;
    const availability: StudyPenKitAvailability = studyPenKitAvailability();
    this.isSupported = availability.available;
    this.fallbackReason = availability.reason;
    console.info(`Study whiteboard selection: ${this.isSupported ? 'huawei_pen_kit' : 'local_canvas'}, reason=${this.fallbackReason}`);
    if (this.isSupported) this.prepareCanvas();
    this.onEngineChanged(this.isSupported);
    this.publishInterface();
  }

  aboutToDisappear(): void {
    this.savePaperTransparency();
    this.mounted = false;
    this.penDetected = false;
    this.endNavigation();
    this.cancelInitTimer();
    this.canvasHost?.dispose();
    this.canvasHost = null;
    this.localSession.dispose();
    appInterface.leave('study_whiteboard');
  }

  private cancelInitTimer(): void {
    if (this.initTimer >= 0) clearTimeout(this.initTimer);
    this.initTimer = -1;
    this.initWaitVersion++;
  }

  private waitForCanvas(): void {
    this.cancelInitTimer();
    if (!this.mounted || !this.isVisible || !this.isInputEnabled ||
      !this.isSupported || this.canvasFailed || this.canvasReady) return;
    const generation: number = this.canvasGeneration;
    const waitVersion: number = this.initWaitVersion;
    this.initTimer = setTimeout((): void => {
      if (!this.mounted || !this.isVisible || !this.isInputEnabled ||
        generation !== this.canvasGeneration || waitVersion !== this.initWaitVersion || this.canvasReady) return;
      this.initTimer = -1;
      this.canvasInitializationFailed(generation, this.sdkInitialized ? 'layout_timeout' : 'init_timeout');
    }, 15000);
  }

  private inputConditionsChanged(): void {
    if (!this.isVisible) this.penDetected = false;
    if (!this.isVisible || !this.isInputEnabled) {
      this.savePaperTransparency();
      this.endNavigation();
      this.opacityOpen = false;
    }
    // 隐藏或后台可能暂停原生画布初始化，不能将这段时间计成套件失败。
    this.waitForCanvas();
    this.publishInterface();
  }

  private prepareCanvas(): void {
    this.canvasHost?.dispose();
    this.canvasHost = new StudyPenCanvasHost({ generation: this.canvasGeneration,
      onReady: (id: number): void => { this.canvasInitialized(id); },
      onLayout: (id: number, width: number, height: number): void => { this.canvasLayoutChanged(id, width, height); },
      onScale: (id: number, scale: number): void => { this.scaleChanged(id, scale); } },
      (id: number, reason: string): void => { this.canvasInitializationFailed(id, reason); });
    this.waitForCanvas();
  }

  private canvasInitializationFailed(generation: number, reason: string = 'load_failed'): void {
    if (!this.mounted || generation !== this.canvasGeneration || this.canvasFailed) return;
    this.cancelInitTimer();
    this.canvasReady = false;
    this.canvasFailed = true;
    this.endNavigation();
    this.fallbackReason = reason;
    console.warn(`Study whiteboard fallback: ${reason}`);
    this.canvasHost?.dispose();
    appInterface.leave('study_whiteboard');
    this.onEngineChanged(false);
    this.publishInterface();
  }

  private canvasInitialized(generation: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || this.canvasFailed) return;
    this.sdkInitialized = true;
    console.info('Study whiteboard: Huawei Pen Kit initialized');
    this.updateCanvasReady();
  }

  private canvasLayoutChanged(generation: number, width: number, height: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || this.canvasFailed) return;
    this.canvasWidth = Number.isFinite(width) && width > 0 ? width : 0;
    this.canvasHeight = Number.isFinite(height) && height > 0 ? height : 0;
    console.info(`Study whiteboard canvas layout: ${this.canvasWidth}x${this.canvasHeight}`);
    this.updateCanvasReady();
  }

  private updateCanvasReady(): void {
    const ready: boolean = this.sdkInitialized && this.canvasWidth > 0 && this.canvasHeight > 0;
    const wasReady: boolean = this.canvasReady;
    this.canvasReady = ready;
    if (ready) this.cancelInitTimer();
    else if (wasReady) this.waitForCanvas();
    this.publishInterface();
  }

  private scaleChanged(generation: number, scale: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || !this.canvasReady ||
      !Number.isFinite(scale) || scale <= 0) return;
    this.canvasScale = scale;
    this.publishInterface();
  }

  private resetRequested(): void {
    if (!this.mounted) return;
    this.resetView();
    if (!this.mounted || !this.isSupported || this.canvasFailed || this.canvasHost === null) return;
    this.canvasReady = false;
    this.canvasFailed = false;
    this.canvasScale = 1;
    this.sdkInitialized = false;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.canvasGeneration++;
    this.prepareCanvas();
    this.publishInterface();
  }

  private backRequested(): void {
    if (!this.mounted || !this.isVisible || !this.isSupported || this.canvasFailed) return;
    if (this.opacityOpen) {
      this.opacityOpen = false;
      this.publishInterface();
    } else this.closeHandwriting();
  }

  private label(id: string): string {
    return interfaceControlText(this.getUIContext(), WHITEBOARD_INTERFACE_ITEMS, id, this.uiLanguage);
  }

  private toggleOpacity(): void {
    if (!this.isInputEnabled) return;
    this.opacityOpen = !this.opacityOpen;
    this.publishInterface();
  }

  private setPaperTransparency(value: number, persist: boolean = true): void {
    if (!this.isInputEnabled || !Number.isFinite(value)) return;
    this.paperTransparency = Math.round(Math.max(0, Math.min(100, value)));
    this.publishInterface();
    if (persist) this.savePaperTransparency();
  }

  private savePaperTransparency(): void {
    const value: number = this.paperTransparency;
    if (value === this.requestedPaperTransparency ||
      (this.requestedPaperTransparency === null && value === this.savedPaperTransparency)) return;
    const request: number = ++this.transparencySaveRequest;
    this.requestedPaperTransparency = value;
    saveStudyPaperTransparency(value).then((): void => {
      this.savedPaperTransparency = value;
      if (this.transparencySaveRequest === request) this.requestedPaperTransparency = null;
      this.publishInterface();
    }).catch((error: Error): void => {
      if (this.transparencySaveRequest === request) this.requestedPaperTransparency = null;
      console.warn(`Study paper transparency save failed: ${error}`);
      if (this.mounted && this.isVisible) {
        showToastSafely(this.getUIContext(), {
          message: resourceText(this.getUIContext(), $r('app.string.study_whiteboard_opacity_save_failed'))
        });
      }
      this.publishInterface();
    });
  }

  private closeHandwriting(): void {
    this.savePaperTransparency();
    this.opacityOpen = false;
    this.onClose();
  }

  private canReceiveInput(): boolean {
    return this.mounted && this.isVisible && this.isInputEnabled &&
      (!this.isSupported || this.canvasFailed || this.canvasReady);
  }

  private canNavigate(event: BaseEvent): boolean {
    return this.canReceiveInput() && event.sourceTool === SourceTool.Finger && this.penPointers.length === 0;
  }

  private canSinglePan(event: BaseEvent): boolean {
    return this.penDetected && this.viewScale > 1 && this.canNavigate(event);
  }

  private shouldBlockFingerDrawing(event: BaseEvent): boolean {
    return this.canReceiveInput() && this.penDetected && event.sourceTool === SourceTool.Finger;
  }

  private judgeNavigation(info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult {
    if (info.tag === 'study_view_pan') {
      return this.canSinglePan(event) ? GestureJudgeResult.CONTINUE : GestureJudgeResult.REJECT;
    }
    if (info.tag !== 'study_global_pan' && info.tag !== 'study_global_zoom') return GestureJudgeResult.CONTINUE;
    return this.canNavigate(event) ? GestureJudgeResult.CONTINUE : GestureJudgeResult.REJECT;
  }

  private trackTouch(event: TouchEvent): void {
    if (!this.canReceiveInput()) return;
    if (event.type === TouchType.Cancel) {
      this.finishNavigation(false); this.finishNavigation(true);
      this.finishSinglePan();
      // 手掌/手指的Cancel不表示仍在书写的笔已抬起。
      if (event.sourceTool !== SourceTool.Finger) this.penPointers = [];
      this.publishInterface();
      return;
    }
    if (event.sourceTool === SourceTool.Finger) {
      // 原生组件可能消费笔Up；新的手指按下时，用真实活动触点清掉已抬起的笔。
      if (event.type === TouchType.Down && event.touches !== undefined && event.touches.length > 0) {
        this.penPointers = this.penPointers.filter((id: number): boolean =>
          event.touches.some((touch: TouchObject): boolean => touch !== undefined && touch.id === id));
      }
      if (event.type === TouchType.Up || (event.touches?.length ?? 0) > 1) this.finishSinglePan();
    }
    if (event.sourceTool !== SourceTool.Pen) return;
    for (const touch of event.changedTouches) {
      if (touch === undefined || !Number.isFinite(touch.id) || touch.id < 0) continue;
      if (event.type === TouchType.Down && !this.penPointers.includes(touch.id)) {
        this.finishNavigation(false); this.finishNavigation(true);
        this.finishSinglePan();
        this.penDetected = true;
        this.penPointers.push(touch.id);
      }
      else if (event.type === TouchType.Up) this.penPointers = this.penPointers.filter((id: number): boolean => id !== touch.id);
    }
    this.publishInterface();
  }

  private syncView(): void {
    const pose: AnnotationPose = this.contentView.snapshot();
    this.viewScale = pose.scale; this.viewX = pose.x; this.viewY = pose.y;
    this.onViewChanged(pose);
    this.publishInterface();
  }

  private navigationPoints(event: GestureEvent): AnnotationPoint[] {
    const points: AnnotationPoint[] = [];
    const fingers: FingerInfo[] = event.fingerInfos !== undefined && event.fingerInfos.length > 0 ?
      event.fingerInfos : event.fingerList;
    for (const finger of fingers) {
      if (finger !== undefined && Number.isFinite(finger.id) && Number.isFinite(finger.globalX) && Number.isFinite(finger.globalY)) {
        // 全局触点减去固定视口原点，卡面与笔迹使用同一个缩放锚点。
        points.push({ id: finger.id, x: finger.globalX - this.rootX, y: finger.globalY - this.rootY });
      }
    }
    return points;
  }

  private navigate(event: GestureEvent, pinch: boolean): void {
    if (!(pinch ? this.pinchActive : this.panActive) || !this.canNavigate(event)) return;
    const points: AnnotationPoint[] = this.navigationPoints(event);
    if (points.length !== 2) { this.finishNavigation(false); this.finishNavigation(true); return; }
    const changed: boolean = this.contentView.navigate(points);
    if (changed) this.syncView();
  }

  private startNavigation(event: GestureEvent, pinch: boolean): void {
    if (!this.canNavigate(event) || this.navigationPoints(event).length !== 2) return;
    this.finishSinglePan();
    if (pinch) this.pinchActive = true;
    else this.panActive = true;
    this.navigate(event, pinch);
  }

  private finishNavigation(pinch: boolean): void {
    if (pinch) this.pinchActive = false;
    else this.panActive = false;
    if (!this.panActive && !this.pinchActive && !this.singlePanActive) this.contentView.endGesture();
  }

  private endNavigation(): void {
    this.panActive = false; this.pinchActive = false;
    this.finishSinglePan();
    this.contentView.endGesture(); this.penPointers = [];
  }

  private resetView(): void {
    this.endNavigation(); this.contentView.reset(); this.syncView();
  }

  private startSinglePan(event: GestureEvent): void {
    if (!this.canSinglePan(event) || this.panActive || this.pinchActive) return;
    const points: AnnotationPoint[] = this.navigationPoints(event);
    this.singlePanActive = points.length === 1 && this.contentView.beginPan(points[0]);
  }

  private updateSinglePan(event: GestureEvent): void {
    const points: AnnotationPoint[] = this.navigationPoints(event);
    if (!this.singlePanActive || !this.canSinglePan(event) || points.length !== 1) {
      this.finishSinglePan(); return;
    }
    if (this.contentView.pan(points[0])) this.syncView();
  }

  private finishSinglePan(): void {
    this.singlePanActive = false; this.contentView.endPan();
  }

  private resetGlobalView(): void {
    if (this.mounted && this.isVisible && this.isInputEnabled) this.resetView();
  }

  private updateViewport(area: Area): void {
    this.toolbarContentWidth = cardViewportWidth(Number(area.width), Number(area.height));
    this.rootX = Number(area.globalPosition.x); this.rootY = Number(area.globalPosition.y);
    this.contentView.setViewport(Number(area.width), Number(area.height));
    this.updateDrawingBounds();
    this.syncView();
  }

  private drawingAreaChanged(area: Area): void {
    this.drawingArea = area;
    this.updateDrawingBounds(); this.syncView();
  }

  private updateDrawingBounds(): void {
    if (this.drawingArea === null) return;
    this.contentView.setContentBounds(Number(this.drawingArea.globalPosition.x) - this.rootX,
      Number(this.drawingArea.globalPosition.y) - this.rootY, Number(this.drawingArea.width), Number(this.drawingArea.height));
  }

  private publishInterface(): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) {
      appInterface.leave('study_whiteboard');
      return;
    }
    // 原版组件发布笔刷与历史的真实状态；父宿主不能覆盖它的观察。
    if (!this.isSupported || this.canvasFailed) return;
    // 官方 HSP 不暴露工具选择/历史可用性；只发布宿主真实拥有的状态。
    const controls: AppInterfaceControl[] = WHITEBOARD_INTERFACE_ITEMS
      .filter((item: AppInterfaceItem): boolean => item.id === 'close' ||
        item.id === 'opacity' || item.id === 'official_tools' || item.condition === 'global_navigation' || item.condition === this.reviewPhase)
      .map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, iconKey: item.iconKey,
        title: this.label(item.id), enabled: item.id === 'official_tools' ? this.canvasReady :
          item.condition === 'global_navigation' ? this.canvasReady : true,
        selected: item.id === 'opacity' && this.opacityOpen }));
    appInterface.observe({ surface: 'study_whiteboard', sectionId: this.reviewPhase, selectedId: '',
      optionIds: [], optionLabels: [], busy: this.isSupported && !this.canvasReady && !this.canvasFailed,
      controlsComplete: false, items: controls,
      values: [{ id: 'engine', value: 'huawei_pen_kit' }, { id: 'supported', value: String(this.isSupported) },
        { id: 'ready', value: String(this.canvasReady) }, { id: 'failed', value: String(this.canvasFailed) },
        { id: 'initialized', value: String(this.sdkInitialized) },
        { id: 'layout_ready', value: String(this.canvasWidth > 0 && this.canvasHeight > 0) },
        { id: 'scale', value: String(this.canvasScale) },
        { id: 'paper_transparency', value: String(this.paperTransparency) },
        { id: 'paper_transparency_saved',
          value: String(this.requestedPaperTransparency === null && this.paperTransparency === this.savedPaperTransparency) },
        { id: 'opacity_open', value: String(this.opacityOpen) },
        { id: 'navigation', value: 'global_pan_zoom' },
        { id: 'navigation_scope', value: 'study_content' },
        { id: 'pen_detected', value: String(this.penDetected) },
        { id: 'single_finger_navigation', value: this.penDetected ? (this.viewScale > 1 ? 'viewport_pan' : 'blocked') : 'native_input' },
        { id: 'view_scale', value: String(this.viewScale) }, { id: 'view_x', value: String(this.viewX) },
        { id: 'view_y', value: String(this.viewY) }, { id: 'toolbar_follows_view', value: 'true' }] });
  }

  @Builder
  private emptyReviewActions() {}

  @Builder
  private opacitySettings() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row() {
        Text(this.label('opacity')).fontSize(应用尺寸.字号_正文).layoutWeight(1)
          .fontColor($r('app.color.text_primary'))
        Text($r('app.string.study_whiteboard_opacity_value', this.paperTransparency))
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary'))
      }.width('100%')
      Slider({ value: this.paperTransparency, min: 0, max: 100, step: 1 })
        .width('100%').selectedColor(this.actionColor).enabled(this.isInputEnabled)
        .onChange((value: number, mode: SliderChangeMode): void => {
          this.setPaperTransparency(value, mode === SliderChangeMode.End || mode === SliderChangeMode.Click);
        })
    }.width(Math.max(0, Math.min(260, this.toolbarContentWidth - 2 * 应用尺寸.页面内边距_水平)))
    .padding(应用尺寸.卡片内边距)
  }

  @Builder
  private officialInk() {
    Stack({ alignContent: Alignment.TopStart }) { ContentSlot(this.canvasHost!.getContent()); }
      .width('100%').height('100%')
  }

  @Builder
  private officialHeader() {
      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween,
        space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
        IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_close'), label: this.label('close'),
          isInteractive: this.isInputEnabled, onAction: (): void => { this.closeHandwriting(); } })
        Row({ space: 应用尺寸.间距_8 }) {
        按下态按钮({ 文案: this.label('reset_view'), singleLine: true, 是否启用: this.isInputEnabled && this.canvasReady,
          点击回调: (): void => { this.resetGlobalView(); } })
        按下态按钮({ 文案: this.label('opacity'), singleLine: true, 是否启用: this.isInputEnabled,
          点击回调: (): void => { this.toggleOpacity(); } })
          .bindPopup(this.opacityOpen, {
            builder: this.opacitySettings, placement: Placement.Bottom,
            popupColor: $r('app.color.menu_surface'), enableArrow: true,
            arrowWidth: MenuSurface.pointerSpan, arrowHeight: MenuSurface.pointerDepth,
            radius: 应用尺寸.圆角_指标卡, transition: MenuSurface.popupTransition(),
            onStateChange: (event: PopupStateChangeParam): void => {
              if (!event.isVisible) { this.opacityOpen = false; this.publishInterface(); }
            }
          })
        }
      }.width('100%').constraintSize({ maxWidth: this.toolbarContentWidth })
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.narrowDeckLayout, this.toolbarSafeTop) })
      .backgroundColor(Color.Transparent)
  }

  @Builder
  private officialCanvas() {
    Column() {
      this.officialHeader()
      if (this.isSupported && this.canvasHost !== null && !this.canvasFailed) {
        ForEach([this.canvasGeneration], (generation: number) => {
          Stack({ alignContent: Alignment.TopStart }) {
            Column().width('100%').height('100%').backgroundColor($r('app.color.surface_page'))
              .opacity(1 - this.paperTransparency / 100).hitTestBehavior(HitTestMode.None)
            StudyContentViewport({ viewScale: this.viewScale, viewX: this.viewX, viewY: this.viewY,
              rootX: this.rootX, rootY: this.rootY,
              isInputEnabled: this.isVisible && this.isInputEnabled && this.canvasReady,
              content: () => { this.officialInk(); },
              onTouchInput: (event: TouchEvent): void => { this.trackTouch(event); },
              onNavigationAllowed: (event: BaseEvent): boolean => this.canNavigate(event),
              onFingerDrawingBlocked: (event: BaseEvent): boolean => this.shouldBlockFingerDrawing(event),
              onControlTouch: (event: TouchEvent): boolean => this.canvasHost?.isControlTouch(this.getUIContext(), event, this.viewScale) ?? false,
              onSinglePanAllowed: (event: BaseEvent): boolean => this.canSinglePan(event),
              onSinglePanStart: (event: GestureEvent): void => { this.startSinglePan(event); },
              onSinglePanUpdate: (event: GestureEvent): void => { this.updateSinglePan(event); },
              onSinglePanFinish: (): void => { this.finishSinglePan(); },
              onJudge: (info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult => this.judgeNavigation(info, event),
              onStart: (event: GestureEvent, pinch: boolean): void => { this.startNavigation(event, pinch); },
              onUpdate: (event: GestureEvent, pinch: boolean): void => { this.navigate(event, pinch); },
              onFinish: (pinch: boolean): void => { this.finishNavigation(pinch); } })
          }.width('100%').layoutWeight(1).clip(true)
          .enabled(this.isVisible && this.isInputEnabled && this.canvasReady && !this.canvasFailed)
          .onAreaChange((_oldArea: Area, area: Area): void => {
            if (generation === this.canvasGeneration && !this.canvasFailed) {
              this.drawingAreaChanged(area);
              this.canvasHost?.setViewport(this.getUIContext(), Number(area.width), Number(area.height));
            }
          })
        }, (generation: number): string => String(generation))
      }
      Column() { this.reviewActions() }
        .width('100%').constraintSize({ maxWidth: this.toolbarContentWidth }).enabled(this.isInputEnabled)
    }.width('100%').height('100%')
    .backgroundColor(Color.Transparent)
  }

  build() {
    Stack() {
        StudyLocalWhiteboard({ 是否深色: this.是否深色, session: this.localSession,
          isVisible: this.isVisible && (!this.isSupported || this.canvasFailed),
          isInputEnabled: this.isInputEnabled,
          onInactive: (): void => { this.publishInterface(); },
          fallbackReason: this.fallbackReason,
          undoTick: this.undoTick, redoTick: this.redoTick, resetTick: this.resetTick, backTick: this.backTick,
          reviewPhase: this.reviewPhase, reviewActions: () => { this.reviewActions(); },
          globalNavigation: true,
          globalPenDetected: this.penDetected,
          onDrawingAreaChanged: (area: Area): void => { this.drawingAreaChanged(area); },
          globalScale: this.viewScale, globalX: this.viewX, globalY: this.viewY, rootX: this.rootX, rootY: this.rootY,
          onResetGlobalView: (): void => { this.resetGlobalView(); },
          onGlobalTouch: (event: TouchEvent): void => { this.trackTouch(event); },
          onGlobalNavigationAllowed: (event: BaseEvent): boolean => this.canNavigate(event),
          onSinglePanAllowed: (event: BaseEvent): boolean => this.canSinglePan(event),
          onSinglePanStart: (event: GestureEvent): void => { this.startSinglePan(event); },
          onSinglePanUpdate: (event: GestureEvent): void => { this.updateSinglePan(event); },
          onSinglePanFinish: (): void => { this.finishSinglePan(); },
          onGlobalJudge: (info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult => this.judgeNavigation(info, event),
          onGlobalStart: (event: GestureEvent, pinch: boolean): void => { this.startNavigation(event, pinch); },
          onGlobalUpdate: (event: GestureEvent, pinch: boolean): void => { this.navigate(event, pinch); },
          onGlobalFinish: (pinch: boolean): void => { this.finishNavigation(pinch); },
          onClose: this.onClose })
          .width('100%').height('100%')
          .visibility(!this.isSupported || this.canvasFailed ? Visibility.Visible : Visibility.None)
      if (this.canvasHost !== null && this.isSupported && !this.canvasFailed) {
        this.officialCanvas()
      }
    }.width('100%').height('100%')
    .onTouch((event: TouchEvent): void => { event.stopPropagation(); })
    .onAreaChange((_oldArea: Area, area: Area): void => {
      // 宿主按钮跟随卡片限宽，SDK 画布继续使用完整可用宽度。
      this.updateViewport(area);
    })
  }
}
