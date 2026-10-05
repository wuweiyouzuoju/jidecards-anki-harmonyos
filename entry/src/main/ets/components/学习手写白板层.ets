// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../utils/应用尺寸';
import { WHITEBOARD_INTERFACE_ITEMS, AppInterfaceItem, AppInterfaceControl } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { isStudyPenKitAvailable } from '../backend/StudyPenKitAvailability';
import { interfaceControlText } from '../utils/AppInterfaceText';
import { 按下态按钮 } from './common/按下态按钮';
import { StudyPenCanvasHost } from './StudyPenCanvasHost';
import { StudyLocalWhiteboard } from './StudyLocalWhiteboard';
import { StudyWhiteboard } from '../model/StudyWhiteboard';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';

/** 官方套件不可用即回退原版；收起保留当前卡画布，换题清空。 */
@Component
export struct 学习手写白板层 {
  @Prop 是否深色: boolean = false;
  @Prop @Watch('publishInterface') isVisible: boolean = false;
  @Prop @Watch('publishInterface') isInputEnabled: boolean = true;
  @Prop @Watch('resetRequested') resetTick: number = 0;
  @Prop undoTick: number = 0;
  @Prop redoTick: number = 0;
  @Prop @Watch('backRequested') backTick: number = 0;
  @Prop @Watch('publishInterface') reviewPhase: string = '';
  @BuilderParam reviewActions: () => void = this.emptyReviewActions;
  onClose: () => void = (): void => {};
  onEngineChanged: (official: boolean) => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @State private canvasGeneration: number = 0;
  @State private isSupported: boolean = false;
  @State private canvasReady: boolean = false;
  @State private canvasFailed: boolean = false;
  @State private canvasHost: StudyPenCanvasHost | null = null;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  private localSession: StudyWhiteboard = new StudyWhiteboard();
  private mounted: boolean = false;
  private initTimer: number = -1;
  private canvasScale: number = 1;

  aboutToAppear(): void {
    this.mounted = true;
    this.isSupported = isStudyPenKitAvailable();
    if (this.isSupported) this.prepareCanvas();
    this.onEngineChanged(this.isSupported);
    this.publishInterface();
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.cancelInitTimer();
    this.canvasHost?.dispose();
    this.canvasHost = null;
    this.localSession.dispose();
    appInterface.leave('study_whiteboard');
  }

  private cancelInitTimer(): void {
    if (this.initTimer >= 0) clearTimeout(this.initTimer);
    this.initTimer = -1;
  }

  private waitForCanvas(): void {
    this.cancelInitTimer();
    const generation: number = this.canvasGeneration;
    this.initTimer = setTimeout((): void => {
      if (!this.mounted || generation !== this.canvasGeneration || this.canvasReady) return;
      this.initTimer = -1;
      this.canvasInitializationFailed(generation);
    }, 15000);
  }

  private prepareCanvas(): void {
    this.canvasHost?.dispose();
    this.canvasHost = new StudyPenCanvasHost({ generation: this.canvasGeneration,
      onReady: (id: number): void => { this.canvasInitialized(id); },
      onScale: (id: number, scale: number): void => { this.scaleChanged(id, scale); } },
      (id: number): void => { this.canvasInitializationFailed(id); });
    this.waitForCanvas();
  }

  private canvasInitializationFailed(generation: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || this.canvasFailed) return;
    this.cancelInitTimer();
    this.canvasReady = false;
    this.canvasFailed = true;
    this.canvasHost?.dispose();
    appInterface.leave('study_whiteboard');
    this.onEngineChanged(false);
    this.publishInterface();
  }

  private canvasInitialized(generation: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || this.canvasFailed) return;
    this.cancelInitTimer();
    this.canvasReady = true;
    this.publishInterface();
  }

  private scaleChanged(generation: number, scale: number): void {
    if (!this.mounted || generation !== this.canvasGeneration || !this.canvasReady ||
      !Number.isFinite(scale) || scale <= 0) return;
    this.canvasScale = scale;
    this.publishInterface();
  }

  private resetRequested(): void {
    if (!this.mounted || !this.isSupported || this.canvasFailed) return;
    this.canvasReady = false;
    this.canvasFailed = false;
    this.canvasScale = 1;
    this.canvasGeneration++;
    this.prepareCanvas();
    this.publishInterface();
  }

  private backRequested(): void {
    if (this.mounted && this.isVisible && this.isSupported && !this.canvasFailed) this.onClose();
  }

  private label(id: string): string {
    return interfaceControlText(this.getUIContext(), WHITEBOARD_INTERFACE_ITEMS, id, this.uiLanguage);
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
        item.id === 'official_tools' || item.condition === this.reviewPhase)
      .map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: this.label(item.id), enabled: item.id !== 'official_tools' || this.canvasReady, selected: false }));
    appInterface.observe({ surface: 'study_whiteboard', sectionId: this.reviewPhase, selectedId: '',
      optionIds: [], optionLabels: [], busy: this.isSupported && !this.canvasReady && !this.canvasFailed,
      controlsComplete: false, items: controls,
      values: [{ id: 'engine', value: 'huawei_pen_kit' }, { id: 'supported', value: String(this.isSupported) },
        { id: 'ready', value: String(this.canvasReady) }, { id: 'failed', value: String(this.canvasFailed) },
        { id: 'scale', value: String(this.canvasScale) }] });
  }

  @Builder
  private emptyReviewActions() {}

  @Builder
  private officialCanvas() {
    Column() {
      Row({ space: 应用尺寸.间距_8 }) {
        Text($r('app.string.study_whiteboard_official_title')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).layoutWeight(1)
        按下态按钮({ 文案: this.label('close'), 是否启用: this.isInputEnabled,
          点击回调: (): void => { this.backRequested(); } })
      }.width('100%')
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.narrowDeckLayout) })

      Stack() {
        if (this.isSupported && this.canvasHost !== null && !this.canvasFailed) {
          ForEach([this.canvasGeneration], (generation: number) => {
            NodeContainer(this.canvasHost)
              .width('100%').height('100%')
              .enabled(this.isVisible && this.isInputEnabled && this.canvasReady && !this.canvasFailed)
          }, (generation: number): string => String(generation))
        }
      }.width('100%').layoutWeight(1)
      Column() { this.reviewActions() }.width('100%').enabled(this.isInputEnabled)
    }.width('100%').height('100%')
    .backgroundColor($r('app.color.surface_page'))
  }

  build() {
    Stack() {
      if (!this.isSupported || this.canvasFailed) {
        StudyLocalWhiteboard({ 是否深色: this.是否深色, session: this.localSession,
          isVisible: this.isVisible, isInputEnabled: this.isInputEnabled,
          undoTick: this.undoTick, redoTick: this.redoTick, resetTick: this.resetTick, backTick: this.backTick,
          reviewPhase: this.reviewPhase, reviewActions: () => { this.reviewActions(); },
          onClose: this.onClose })
      } else {
        this.officialCanvas()
      }
    }.width('100%').height('100%')
    .onTouch((event: TouchEvent): void => { event.stopPropagation(); })
  }
}
