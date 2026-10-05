// SPDX-License-Identifier: AGPL-3.0-or-later
import { LengthMetrics } from '@kit.ArkUI';
import { 应用尺寸 } from '../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';
import { cardViewportWidth } from '../model/CardViewportLayout';
import { StudyWhiteboard, WhiteboardSegment, WhiteboardStroke, whiteboardColor,
  WHITEBOARD_COLORS, WHITEBOARD_WIDTHS, WHITEBOARD_ERASER_WIDTHS } from '../model/StudyWhiteboard';
import { WHITEBOARD_INTERFACE_ITEMS, AppInterfaceItem, AppInterfaceControl } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { interfaceControlText } from '../utils/AppInterfaceText';
import { 按下态按钮 } from './common/按下态按钮';
import { IconActionButton } from './common/IconActionButton';
import { SettingsToggleRow } from './common/SettingsToggleRow';
import { MenuSurface } from './common/MenuSurface';

/** Canvas 随组件释放，当前卡草稿由白板宿主持有；展开工具不改变画布坐标。 */
@Component
export struct StudyLocalWhiteboard {
  @Prop @Watch('visibilityChanged') isVisible: boolean = true;
  @Prop @Watch('redraw') 是否深色: boolean = false;
  @Prop @Watch('inputEnabledChanged') isInputEnabled: boolean = true;
  @Prop @Watch('undoRequested') undoTick: number = 0;
  @Prop @Watch('redoRequested') redoTick: number = 0;
  @Prop @Watch('resetRequested') resetTick: number = 0;
  @Prop @Watch('backRequested') backTick: number = 0;
  @Prop @Watch('publishInterface') reviewPhase: string = '';
  @BuilderParam reviewActions: () => void = this.emptyReviewActions;
  session: StudyWhiteboard = new StudyWhiteboard();
  onClose: () => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @State private toolbarContentWidth: number = 840;
  @State private hasInk: boolean = false;
  @State private hasUndo: boolean = false;
  @State private hasRedo: boolean = false;
  @State private eraserSelected: boolean = false;
  @State private selectedColor: string = 'auto';
  @State private selectedWidth: number = 3;
  @State private selectedEraserWidth: number = 24;
  @State private stylusOnly: boolean = false;
  @State private settingsTool: string = '';
  @State private capacityReached: boolean = false;
  @State private canvasFailed: boolean = false;
  @State private canvasGeneration: number = 0;
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private mounted: boolean = false;
  private ready: boolean = false;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  aboutToAppear(): void {
    this.mounted = true;
    this.eraserSelected = this.session.eraser;
    this.selectedColor = this.session.color;
    this.selectedWidth = this.session.penWidth;
    this.selectedEraserWidth = this.session.eraserWidth;
    this.stylusOnly = this.session.stylusOnly;
    this.syncControls();
    this.publishInterface();
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.ready = false;
    this.settingsTool = '';
    this.session.cancel();
    appInterface.leave('study_whiteboard');
  }

  private syncControls(): void {
    const changed: boolean = this.hasInk !== this.session.hasInk() || this.hasUndo !== this.session.canUndo() ||
      this.hasRedo !== this.session.canRedo() || this.capacityReached !== this.session.isFull();
    this.hasInk = this.session.hasInk();
    this.hasUndo = this.session.canUndo();
    this.hasRedo = this.session.canRedo();
    this.capacityReached = this.session.isFull();
    if (changed) this.publishInterface();
  }

  private label(id: string): string {
    return interfaceControlText(this.getUIContext(), WHITEBOARD_INTERFACE_ITEMS, id, this.uiLanguage);
  }

  private publishInterface(): void {
    if (!this.mounted) return;
    if (!this.isVisible || !this.isInputEnabled) { appInterface.leave('study_whiteboard'); return; }
    const controls: AppInterfaceControl[] = WHITEBOARD_INTERFACE_ITEMS
      .filter((item: AppInterfaceItem): boolean => item.condition === undefined || item.condition === 'local_suite' ||
        (item.condition === 'pen_settings' && this.settingsTool === 'pen') ||
        (item.condition === 'eraser_settings' && this.settingsTool === 'eraser') ||
        (item.condition === 'tool_settings' && this.settingsTool !== '') ||
        (item.condition === 'failed' && this.canvasFailed) ||
        item.condition === this.reviewPhase)
      .map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: this.label(item.id), enabled: item.id === 'undo' ? this.hasUndo : item.id === 'redo' ? this.hasRedo :
          item.id === 'clear' ? this.hasInk : item.condition === this.reviewPhase ? this.settingsTool === '' : true,
        selected: item.id === 'pen' ? !this.eraserSelected : item.id === 'eraser' ? this.eraserSelected :
          item.id === 'stylus' ? this.stylusOnly :
          item.id === 'color_' + WHITEBOARD_COLORS.indexOf(this.selectedColor) ||
          item.id === 'width_' + WHITEBOARD_WIDTHS.indexOf(this.selectedWidth) ||
          item.id === 'eraser_width_' + WHITEBOARD_ERASER_WIDTHS.indexOf(this.selectedEraserWidth) }));
    appInterface.observe({ surface: 'study_whiteboard', sectionId: this.reviewPhase, selectedId: '',
      optionIds: [], optionLabels: [], busy: false, controlsComplete: true, items: controls,
      values: [{ id: 'engine', value: 'local_canvas' }, { id: 'ready', value: String(this.ready && !this.canvasFailed) },
        { id: 'tool', value: this.eraserSelected ? 'eraser' : 'pen' },
        { id: 'color', value: this.selectedColor }, { id: 'width', value: String(this.selectedWidth) },
        { id: 'eraser_width', value: String(this.selectedEraserWidth) }, { id: 'settings_tool', value: this.settingsTool },
        { id: 'stylus_only', value: String(this.stylusOnly) }, { id: 'has_ink', value: String(this.hasInk) }] });
  }

  private selectTool(eraser: boolean): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    if (this.session.cancel()) this.redraw();
    this.session.eraser = eraser;
    this.eraserSelected = eraser;
    this.syncControls();
    this.publishInterface();
  }

  private selectColor(index: number): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled || index < 0 || index >= WHITEBOARD_COLORS.length) return;
    this.selectTool(false);
    this.selectedColor = WHITEBOARD_COLORS[index];
    this.session.color = this.selectedColor;
    this.publishInterface();
  }

  private selectWidth(index: number): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled || index < 0 || index >= WHITEBOARD_WIDTHS.length) return;
    this.selectTool(false);
    this.selectedWidth = WHITEBOARD_WIDTHS[index];
    this.session.penWidth = this.selectedWidth;
    this.publishInterface();
  }

  private selectEraserWidth(index: number): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled || index < 0 || index >= WHITEBOARD_ERASER_WIDTHS.length) return;
    this.selectTool(true);
    this.selectedEraserWidth = WHITEBOARD_ERASER_WIDTHS[index];
    this.session.eraserWidth = this.selectedEraserWidth;
    this.publishInterface();
  }

  private setStylusOnly(value: boolean): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    if (this.session.cancel()) this.redraw();
    this.stylusOnly = value;
    this.session.stylusOnly = value;
    this.syncControls();
    this.publishInterface();
  }

  private openToolSettings(eraser: boolean): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    this.selectTool(eraser);
    const tool: string = eraser ? 'eraser' : 'pen';
    this.settingsTool = this.settingsTool === tool ? '' : tool;
    this.publishInterface();
  }

  private closeToolSettings(tool: string = this.settingsTool): void {
    // 旧弹窗迟到的隐藏事件不能关掉刚切换的另一个工具弹窗。
    if (this.settingsTool !== tool) return;
    this.settingsTool = '';
    this.publishInterface();
  }

  private backRequested(): void {
    if (!this.mounted || !this.isVisible) return;
    if (this.settingsTool !== '') this.closeToolSettings();
    else this.close();
  }

  private resetRequested(): void { this.session.reset(); this.closeToolSettings(); this.redraw(); this.syncControls(); }

  private visibilityChanged(): void {
    if (!this.isVisible) {
      if (this.session.cancel()) this.redraw();
      this.closeToolSettings();
    }
    this.publishInterface();
  }

  private canDraw(): boolean {
    return this.mounted && this.ready && !this.canvasFailed && this.canvasWidth > 0 && this.canvasHeight > 0;
  }

  private drawSafely(draw: () => void): void {
    if (!this.canDraw()) return;
    try {
      draw();
    } catch (error) {
      console.error(`Study whiteboard canvas failed: ${error}`);
      this.ready = false;
      this.session.cancel();
      this.canvasFailed = true;
      this.syncControls();
      this.publishInterface();
    }
  }

  private inputEnabledChanged(): void {
    if (!this.isInputEnabled) this.closeToolSettings();
    if (!this.isInputEnabled && this.session.cancel()) this.redraw();
    if (this.mounted) this.syncControls();
    this.publishInterface();
  }

  private canvasReady(): void {
    if (!this.mounted || this.canvasFailed) return;
    this.ready = true;
    this.refreshCanvas();
    this.publishInterface();
  }

  private refreshCanvas(): void {
    if (!this.mounted || !this.ready || this.canvasFailed) return;
    const width: number = this.context.width;
    const height: number = this.context.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      this.canvasWidth = 0;
      this.canvasHeight = 0;
      this.session.cancel();
      this.syncControls();
      return;
    }
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.session.setViewport(width, height);
    this.redraw();
    this.syncControls();
  }

  private paintSegment(segment: WhiteboardSegment): void {
    this.drawSafely((): void => {
      this.context.globalCompositeOperation = segment.eraser ? 'destination-out' : 'source-over';
      this.context.strokeStyle = segment.eraser ? '#000000' : whiteboardColor(segment.color, this.是否深色);
      this.context.fillStyle = this.context.strokeStyle;
      this.context.lineWidth = segment.width;
      this.context.lineCap = 'round';
      this.context.lineJoin = 'round';
      this.context.beginPath();
      if (segment.from.x === segment.to.x && segment.from.y === segment.to.y) {
        this.context.arc(segment.to.x * this.canvasWidth, segment.to.y * this.canvasHeight, segment.width / 2, 0, Math.PI * 2);
        this.context.fill();
      } else {
        this.context.moveTo(segment.from.x * this.canvasWidth, segment.from.y * this.canvasHeight);
        this.context.lineTo(segment.to.x * this.canvasWidth, segment.to.y * this.canvasHeight);
        this.context.stroke();
      }
    });
  }

  private paintStroke(stroke: WhiteboardStroke): void {
    const points = stroke.points;
    this.context.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
    this.context.strokeStyle = stroke.eraser ? '#000000' : whiteboardColor(stroke.color, this.是否深色);
    this.context.fillStyle = this.context.strokeStyle;
    this.context.lineWidth = stroke.width;
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.beginPath();
    if (points.length === 1) {
      this.context.arc(points[0].x * this.canvasWidth, points[0].y * this.canvasHeight, stroke.width / 2, 0, Math.PI * 2);
      this.context.fill();
    } else {
      this.context.moveTo(points[0].x * this.canvasWidth, points[0].y * this.canvasHeight);
      for (let index: number = 1; index < points.length; index++) {
        this.context.lineTo(points[index].x * this.canvasWidth, points[index].y * this.canvasHeight);
      }
      this.context.stroke();
    }
  }

  private redraw(): void {
    this.drawSafely((): void => {
      this.context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.session.visitStrokes((stroke: WhiteboardStroke): void => { this.paintStroke(stroke); });
    });
  }

  private touchPoint(points: TouchObject[], id: number): TouchObject | null {
    for (let index: number = 0; index < points.length; index++) {
      const point: TouchObject | undefined = points[index];
      if (point !== undefined && Number.isFinite(point.id) && point.id >= 0 &&
        Number.isFinite(point.x) && Number.isFinite(point.y) && (id < 0 || point.id === id)) return point;
    }
    return null;
  }

  private handleTouch(event: TouchEvent): void {
    event.stopPropagation();
    if (!this.canDraw() || !this.isVisible || !this.isInputEnabled || this.settingsTool !== '') return;
    // 手掌不能终止正在书写的笔；工具栏始终支持手指操作。
    if (this.stylusOnly && event.sourceTool !== SourceTool.Pen &&
      !(event.type === TouchType.Cancel && event.sourceTool === SourceTool.Unknown)) return;
    if (event.type === TouchType.Cancel) {
      if (this.session.cancel()) this.redraw();
      this.syncControls();
      return;
    }
    const id: number = this.session.currentPointer();
    const point: TouchObject | null = this.touchPoint(event.changedTouches, id);
    if (point === null) return;
    if (id >= 0 && (event.type === TouchType.Move || event.type === TouchType.Up)) {
      // 同一帧内补齐设备采样点，快速书写的转折也能保留；仍按活动 ID 隔离多触点。
      const history: HistoricalPoint[] = event.getHistoricalPoints();
      for (const sample of history) {
        const point: TouchObject = sample.touchObject;
        if (point.id !== id) continue;
        const segment: WhiteboardSegment | null = this.session.append(id, point.x, point.y);
        if (segment !== null) this.paintSegment(segment);
      }
    }
    let segment: WhiteboardSegment | null = null;
    if (event.type === TouchType.Down && id < 0) {
      segment = this.session.begin(point.id, point.x, point.y, this.selectedColor,
        this.eraserSelected ? this.selectedEraserWidth : this.selectedWidth, this.eraserSelected);
    } else if (event.type === TouchType.Move) {
      segment = this.session.append(point.id, point.x, point.y);
    } else if (event.type === TouchType.Up) {
      segment = this.session.append(point.id, point.x, point.y, true);
      this.session.finish(point.id);
    }
    if (segment !== null) this.paintSegment(segment);
    this.syncControls();
  }

  private undoRequested(): void { this.undoInk(); }
  private redoRequested(): void { this.redoInk(); }

  private redoInk(): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    if (this.session.redo()) this.redraw();
    this.syncControls();
  }

  private undoInk(): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    if (this.session.undo()) this.redraw();
    this.syncControls();
  }

  private clearInk(): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled) return;
    this.session.clear();
    this.redraw();
    this.syncControls();
  }

  private close(): void {
    if (!this.mounted || !this.isVisible) return;
    if (this.session.cancel()) this.redraw();
    this.closeToolSettings();
    appInterface.leave('study_whiteboard');
    this.onClose();
  }

  private retryCanvas(): void {
    if (!this.mounted || !this.isVisible || !this.isInputEnabled || !this.canvasFailed) return;
    this.ready = false;
    this.context = new CanvasRenderingContext2D(new RenderingContextSettings(true));
    this.canvasFailed = false;
    this.canvasGeneration++;
    this.publishInterface();
  }

  @Builder
  private emptyReviewActions() {}

  @Builder
  private brushTools() {
    Row({ space: 应用尺寸.间距_8 }) {
      按下态按钮({ 文案: this.label('pen'), selectable: true, selected: !this.eraserSelected,
        markerColor: whiteboardColor(this.selectedColor, this.是否深色), 是否启用: this.isInputEnabled,
        点击回调: (): void => { this.openToolSettings(false); } })
        .bindPopup(this.settingsTool === 'pen', {
          builder: this.penSettings,
          placement: Placement.Bottom,
          popupColor: $r('app.color.menu_surface'),
          enableArrow: true,
          arrowWidth: MenuSurface.pointerSpan,
          arrowHeight: MenuSurface.pointerDepth,
          radius: 应用尺寸.圆角_指标卡,
          transition: MenuSurface.popupTransition(),
          onStateChange: (event: PopupStateChangeParam): void => {
            if (!event.isVisible) this.closeToolSettings('pen');
          }
        })
      按下态按钮({ 文案: this.label('eraser'), selectable: true, selected: this.eraserSelected,
        是否启用: this.isInputEnabled, 点击回调: (): void => { this.openToolSettings(true); } })
        .bindPopup(this.settingsTool === 'eraser', {
          builder: this.eraserSettings,
          placement: Placement.Bottom,
          popupColor: $r('app.color.menu_surface'),
          enableArrow: true,
          arrowWidth: MenuSurface.pointerSpan,
          arrowHeight: MenuSurface.pointerDepth,
          radius: 应用尺寸.圆角_指标卡,
          transition: MenuSurface.popupTransition(),
          onStateChange: (event: PopupStateChangeParam): void => {
            if (!event.isVisible) this.closeToolSettings('eraser');
          }
        })
    }.width('100%')
    .onTouch((event: TouchEvent): void => { event.stopPropagation(); })
  }

  @Builder
  private penSettings() { this.toolSettings(false); }

  @Builder
  private eraserSettings() { this.toolSettings(true); }

  @Builder
  private toolSettings(eraser: boolean) {
    Column({ space: 应用尺寸.间距_8 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        Text(this.label(eraser ? 'eraser' : 'pen')).fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary')).layoutWeight(1)
        按下态按钮({ 文案: this.label('settings_close'), 点击回调: (): void => { this.closeToolSettings(); } })
      }.width('100%')
      Scroll() {
        Column({ space: 应用尺寸.间距_8 }) {
          if (eraser) {
            Flex({ wrap: FlexWrap.Wrap,
              space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
              ForEach(WHITEBOARD_ERASER_WIDTHS, (width: number, index: number) => {
                按下态按钮({ 文案: this.label('eraser_width_' + index), selectable: true,
                  selected: this.selectedEraserWidth === width, 是否启用: this.isInputEnabled,
                  点击回调: (): void => { this.selectEraserWidth(index); } })
              }, (width: number): string => String(width))
            }
          } else {
            Flex({ wrap: FlexWrap.Wrap,
              space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
              ForEach(WHITEBOARD_COLORS, (color: string, index: number) => {
                按下态按钮({ 文案: this.label('color_' + index), markerColor: whiteboardColor(color, this.是否深色),
                  selectable: true, selected: this.selectedColor === color, 是否启用: this.isInputEnabled,
                  点击回调: (): void => { this.selectColor(index); } })
              }, (color: string): string => color)
            }
            Flex({ wrap: FlexWrap.Wrap,
              space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
              ForEach(WHITEBOARD_WIDTHS, (width: number, index: number) => {
                按下态按钮({ 文案: this.label('width_' + index), selectable: true,
                  selected: this.selectedWidth === width, 是否启用: this.isInputEnabled,
                  点击回调: (): void => { this.selectWidth(index); } })
              }, (width: number): string => String(width))
            }
          }
          SettingsToggleRow({ title: this.label('stylus'), isOn: this.stylusOnly,
            isInteractive: this.isInputEnabled, isDark: this.是否深色,
            onChange: (value: boolean): void => { this.setStylusOnly(value); } })
        }.width('100%')
      }
      .width('100%').constraintSize({ maxHeight: 240 }).scrollBar(BarState.Auto)
    }.width(Math.min(320, this.toolbarContentWidth - 2 * 应用尺寸.页面内边距_水平))
    .padding(应用尺寸.间距_12)
    .onTouch((event: TouchEvent): void => { event.stopPropagation(); })
  }

  build() {
    Column() {
      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween,
        space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
        按下态按钮({ 文案: this.label('close'), 点击回调: (): void => { this.close(); } })
        Row({ space: 应用尺寸.间距_8 }) {
          IconActionButton({ source: $r('app.media.ic_study_undo'), label: this.label('undo'),
            isInteractive: this.hasUndo && this.isInputEnabled, onAction: (): void => { this.undoInk(); } })
          IconActionButton({ source: $r('app.media.ic_whiteboard_redo'), label: this.label('redo'),
            isInteractive: this.hasRedo && this.isInputEnabled, onAction: (): void => { this.redoInk(); } })
          IconActionButton({ source: $r('app.media.ic_study_delete'), label: this.label('clear'),
            isInteractive: this.hasInk && this.isInputEnabled, onAction: (): void => { this.clearInk(); } })
        }
      }
      .width('100%')
      .constraintSize({ maxWidth: this.toolbarContentWidth })
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout), bottom: 0 })
      .backgroundColor($r('app.color.surface_page'))

      Stack({ alignContent: Alignment.Bottom }) {
        if (this.canvasFailed) {
          Column({ space: 应用尺寸.间距_8 }) {
            Text($r('app.string.study_whiteboard_failed')).fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
            按下态按钮({ 文案: this.label('retry'), 是否启用: this.isInputEnabled,
              点击回调: (): void => { this.retryCanvas(); } })
          }.width('100%').height('100%').justifyContent(FlexAlign.Center)
        } else {
          ForEach([this.canvasGeneration], (_generation: number) => {
            Canvas(this.context).width('100%').height('100%')
              .onReady((): void => { this.canvasReady(); })
              .onAreaChange((): void => { this.refreshCanvas(); })
              .onTouch((event: TouchEvent): void => { this.handleTouch(event); })
          }, (generation: number): string => generation.toString())
        }
        if (this.capacityReached) {
          Text($r('app.string.study_whiteboard_full')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_primary')).padding(应用尺寸.间距_8)
            .backgroundColor($r('app.color.surface_card')).hitTestBehavior(HitTestMode.None)
        }
        Column() {
          this.brushTools()
        }.width('100%').constraintSize({ maxWidth: this.toolbarContentWidth })
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平, top: 应用尺寸.间距_8 })
        .align(Alignment.Top)
      }.width('100%').layoutWeight(1)
      Column() { this.reviewActions() }
        .width('100%').constraintSize({ maxWidth: this.toolbarContentWidth })
        .enabled(this.isInputEnabled && this.settingsTool === '')
    }
    .width('100%').height('100%')
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(this.是否深色 ? 'rgba(16,21,29,0.18)' : 'rgba(245,247,250,0.18)')
    // Default 保留子按钮/画布响应并挡住下层；Block 会连子控件一起排除。
    .hitTestBehavior(HitTestMode.Default)
    .onTouch((event: TouchEvent): void => { event.stopPropagation(); })
    .onAreaChange((_old: Area, area: Area): void => {
      this.toolbarContentWidth = cardViewportWidth(Number(area.width), Number(area.height));
    })
  }
}
