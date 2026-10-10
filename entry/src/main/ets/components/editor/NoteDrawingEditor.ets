// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { image } from '@kit.ImageKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { LengthMetrics, LengthMetricsUnit } from '@kit.ArkUI';
import { StudyPenCanvasHost } from '../StudyPenCanvasHost';
import { studyPenKitAvailability } from '../../backend/StudyPenKitAvailability';
import { loadNoteDrawing, drawingBaseImage, createDrawingWorkspace, restoreDrawingInk, snapshotDrawingInk,
  saveNoteDrawing, disposeDrawingWorkspace, discardNoteDrawingImages } from '../../backend/NoteDrawingStore';
import { NoteDrawingDocument, DrawingText, DrawingTextBounds, DrawingTextHandle, emptyNoteDrawing, DRAWING_COLORS,
  DRAWING_COLOR_KEYS, DRAWING_TEXT_HANDLES, drawingTextResizeScale, scaledDrawingTextSize, noteDrawingImageActionKey } from '../../model/NoteDrawing';
import { StudyWhiteboard, WhiteboardStroke } from '../../model/StudyWhiteboard';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { noteDrawingInterfaceObservation } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { paintNoteDrawingStroke, paintNoteDrawingText, measureNoteDrawingText, renderNoteDrawing } from '../../utils/NoteDrawingRendering';
import { resourceText, localizedNamedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { IconActionButton } from '../common/IconActionButton';
import { FormSelectRow } from '../common/FormSelectRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { ImageSurfaceStyle } from '../../utils/ImageSurfaceStyle';
import { PressFeedback } from '../../utils/PressFeedback';
import { SelectStyle } from '../../utils/SelectStyle';

/** 制卡草稿独占底图、文字和笔迹；完成生成新图片，不覆盖图库或共享媒体。 */
@Component
export struct NoteDrawingEditor {
  source: string = '';
  onApply: (uri: string) => void = (_uri: string): void => {};
  onCancel: () => void = (): void => {};
  onReady: (dismiss: () => void) => void = (_dismiss: () => void): void => {};
  @StorageProp('系统语言') @Watch('publish') private uiLanguage: string = 'zh-Hans';
  @State private working: boolean = true;
  @State private ready: boolean = false;
  @State private failed: boolean = false;
  @State private official: boolean = false;
  @State private errorMessage: string = '';
  @State private baseImage: image.PixelMap | null = null;
  @State private texts: DrawingText[] = [];
  @State private textMode: boolean = false;
  @State private textValue: string = '';
  @State private textSize: number = 36;
  @State private color: string = DRAWING_COLORS[0];
  @State private eraser: boolean = false;
  @State private undoAvailable: boolean = false;
  @State private redoAvailable: boolean = false;
  @State private canvasWidth: number = 400;
  @State private canvasHeight: number = 300;
  @State private frameWidth: number = 400;
  @State private frameHeight: number = 300;
  @State private bodyViewportHeight: number = 400;
  @State private textDragX: number = 0;
  @State private textDragY: number = 0;
  @State private textScale: number = 1;
  @State private textDragging: boolean = false;
  private document: NoteDrawingDocument = emptyNoteDrawing();
  private local: StudyWhiteboard = new StudyWhiteboard();
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private textCanvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private textMeasure: OffscreenCanvasRenderingContext2D = new OffscreenCanvasRenderingContext2D(1, 1,
    new RenderingContextSettings(true), LengthMetricsUnit.PX);
  private textMeasurements: Map<string, DrawingTextBounds> = new Map<string, DrawingTextBounds>();
  private textCanvasMounted: boolean = false;
  private host: StudyPenCanvasHost | null = null;
  private workspace: string = '';
  private disposed: boolean = false;
  private generation: number = 0;
  private initTimer: number = -1;
  @State private selectedText: number = -1;
  private dragX: number = 0;
  private dragY: number = 0;
  private textTransform: string = '';
  private resizeWidth: number = 1;
  private resizeHeight: number = 1;
  private resizeSize: number = 36;
  private resizeHandle: DrawingTextHandle = DRAWING_TEXT_HANDLES[7];
  private resizeAnchorX: number = 0;
  private resizeAnchorY: number = 0;
  private canvasMounted: boolean = false;
  private observationVersion: number = 0;
  private pendingOperations: number = 0;
  private cleanupCacheDir: string = '';
  private officialInitialized: boolean = false;
  private officialLayoutReady: boolean = false;
  private officialLoading: boolean = false;
  private activePen: boolean = false;

  aboutToAppear(): void {
    this.onReady((): void => { this.cancel(); });
    this.initialize();
  }

  aboutToDisappear(): void {
    this.disposed = true; this.generation++; clearTimeout(this.initTimer); this.host?.dispose(); this.local.dispose();
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.cleanupCacheDir = context.cacheDir; this.releaseResources();
    appInterface.leave('note_drawing_editor', this.observationVersion);
  }

  private releaseResources(): void {
    if (!this.disposed || this.pendingOperations > 0) return;
    this.baseImage?.release(); this.baseImage = null;
    if (this.workspace !== '') {
      const workspace: string = this.workspace; this.workspace = '';
      disposeDrawingWorkspace(workspace, this.cleanupCacheDir).catch((): void => {});
    }
  }

  private endOperation(): void { this.pendingOperations--; this.releaseResources(); }

  private publish(): void {
    if (this.disposed) return;
    this.redrawTexts();
    this.observationVersion = appInterface.observe(noteDrawingInterfaceObservation({ working: this.working,
      ready: this.ready, official: this.official, textMode: this.textMode, textCount: this.texts.length,
      selectedText: this.selectedText >= 0, hasError: this.errorMessage !== '', failed: this.failed,
      canUndo: this.undoAvailable, canRedo: this.redoAvailable,
      newCanvas: this.source === '' && this.document.base === '', eraser: this.eraser, color: this.color, size: this.textSize,
      width: this.document.width, height: this.document.height, textTransforming: this.textDragging, colorLabels: this.colorLabels(),
      hasBackground: this.document.base !== '',
      canAddText: this.textValue.trim() !== '' && this.texts.length < 100 }));
  }

  private async initialize(): Promise<void> {
    this.working = true; this.pendingOperations++;
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const document: NoteDrawingDocument = await loadNoteDrawing(this.source);
      const pixels: image.PixelMap | null = await drawingBaseImage(document);
      if (this.disposed) { pixels?.release(); return; }
      this.document = document; this.texts = document.texts.slice(); this.baseImage = pixels;
      this.local.restoreStrokes(document.strokes); this.fitCanvas();
      const workspace: string = await createDrawingWorkspace(context.cacheDir);
      if (this.disposed) { await disposeDrawingWorkspace(workspace, context.cacheDir); return; }
      this.workspace = workspace;
      if (document.ink.length > 0) await restoreDrawingInk(workspace, document.ink);
      if (this.disposed) return;
      this.official = studyPenKitAvailability().available && document.engine !== 'local_canvas';
      if (document.ink.length > 0 && !this.official) {
        this.failed = true; this.errorMessage = resourceText(this.getUIContext(), $r('app.string.note_drawing_requires_penkit'));
      } else if (this.official) this.startOfficial();
      else { this.ready = true; this.working = false; this.redraw(); }
    } catch (error) { this.showFailure(); }
    finally { if (!this.official || this.failed) this.working = false; this.publish(); this.endOperation(); }
  }

  private startOfficial(): void {
    const generation: number = ++this.generation;
    this.officialInitialized = false; this.officialLayoutReady = false; this.officialLoading = false;
    this.host = new StudyPenCanvasHost({ generation: generation, fixedCanvas: true,
      onReady: (id: number): void => { this.officialReady(id); },
      onLayout: (id: number, width: number, height: number): void => {
        if (this.disposed || id !== this.generation) return;
        this.officialLayoutReady = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        this.enableOfficial();
      },
      onScale: (_id: number, _scale: number): void => {} },
      (id: number, _reason: string): void => { this.officialFailed(id); });
    this.initTimer = setTimeout((): void => { this.officialFailed(generation); }, 10000);
    this.host.setViewport(this.getUIContext(), this.canvasWidth, this.canvasHeight);
  }

  private async officialReady(generation: number): Promise<void> {
    if (this.disposed || generation !== this.generation || this.officialLoading || this.officialInitialized) return;
    this.officialLoading = true;
    this.pendingOperations++;
    // SDK onInit 可先于宿主保存 mount；让加载在同一渲染回调结束后执行。
    await new Promise<void>((resolve): void => { setTimeout(resolve, 0); });
    try {
      if (this.disposed || generation !== this.generation) return;
      if (this.document.ink.length > 0) await this.host?.loadDocument(this.workspace + '/ink');
      if (this.disposed || generation !== this.generation) return;
      this.officialInitialized = true; this.enableOfficial();
    } catch (error) {
      if (!this.disposed && generation === this.generation) { this.showFailure(); this.working = false; }
    }
    finally { this.publish(); this.endOperation(); }
  }

  private enableOfficial(): void {
    if (this.disposed || !this.official || !this.officialInitialized || !this.officialLayoutReady) return;
    clearTimeout(this.initTimer); this.ready = true; this.working = false; this.publish();
  }

  private officialFailed(generation: number): void {
    if (this.disposed || generation !== this.generation) return;
    clearTimeout(this.initTimer); this.generation++; this.host?.dispose(); this.host = null; this.official = false;
    this.working = false;
    if (this.document.ink.length > 0 || this.ready) {
      this.failed = true; this.errorMessage = resourceText(this.getUIContext(), this.document.ink.length > 0 ?
        $r('app.string.note_drawing_requires_penkit') : $r('app.string.note_drawing_failed'));
    } else { this.ready = true; this.redraw(); }
    this.publish();
  }

  private showFailure(): void {
    if (this.disposed) return;
    this.errorMessage = resourceText(this.getUIContext(), $r('app.string.note_drawing_failed'));
    if (!this.ready) this.failed = true;
  }

  private fitCanvas(): void {
    if (!Number.isFinite(this.frameWidth) || !Number.isFinite(this.frameHeight) || this.frameWidth <= 0 || this.frameHeight <= 0) return;
    // 窗口或画布尺寸变化时取消显示预览，避免用旧视图偏移提交新坐标。
    if (this.textDragging) { this.resetTextTransform(); this.publish(); }
    const scale: number = Math.min(this.frameWidth / this.document.width, this.frameHeight / this.document.height);
    this.canvasWidth = Math.max(1, this.document.width * scale);
    this.canvasHeight = Math.max(1, this.document.height * scale);
    this.local.setViewport(this.canvasWidth, this.canvasHeight);
    this.host?.setViewport(this.getUIContext(), this.canvasWidth, this.canvasHeight); this.redraw(); this.redrawTexts();
  }

  private redrawTexts(): void {
    if (this.disposed || !this.textCanvasMounted) return;
    try {
      this.textCanvas.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      for (const entry of this.texts) {
        const selected: boolean = this.selectedText === entry.id;
        paintNoteDrawingText(this.textCanvas, entry,
          entry.x * this.canvasWidth + (selected ? this.textDragX : 0),
          entry.y * this.canvasHeight + (selected ? this.textDragY : 0), this.textFontSize(entry), 'vp');
      }
    } catch (error) { this.showFailure(); }
  }

  private redraw(): void {
    if (this.official || this.disposed || !this.canvasMounted) return;
    try {
      this.canvas.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.local.visitStrokes((stroke: WhiteboardStroke): void => {
        paintNoteDrawingStroke(this.canvas, stroke, this.canvasWidth, this.canvasHeight, this.document.width);
      });
      this.undoAvailable = this.local.canUndo(); this.redoAvailable = this.local.canRedo();
    } catch (error) { this.showFailure(); }
  }

  private touch(event: TouchEvent): void {
    if (this.disposed || this.working || !this.ready || this.textMode || this.official || this.failed) return;
    if (this.activePen && event.sourceTool !== SourceTool.Pen && event.sourceTool !== SourceTool.Unknown) return;
    const id: number = this.local.currentPointer();
    const point: TouchObject | undefined = event.changedTouches.find((touch: TouchObject): boolean =>
      touch !== undefined && Number.isFinite(touch.id) && Number.isFinite(touch.x) && Number.isFinite(touch.y) &&
        (id < 0 || touch.id === id));
    if (event.type === TouchType.Cancel) {
      if (event.changedTouches.length > 0 && point === undefined) return;
      this.local.cancel(); this.activePen = false;
    }
    else {
      if (point === undefined) return;
      if (event.type === TouchType.Down) {
        this.local.begin(point.id, point.x, point.y, this.color, this.eraser ? 36 : 4, this.eraser);
        this.activePen = this.local.currentPointer() >= 0 && event.sourceTool === SourceTool.Pen;
      }
      else if (event.type === TouchType.Move) this.local.append(point.id, point.x, point.y);
      else if (event.type === TouchType.Up) {
        this.local.append(point.id, point.x, point.y, true); this.local.finish(point.id); this.activePen = false;
      }
    }
    this.redraw(); this.publish();
  }

  private textChanged(value: string): void {
    if (this.disposed || this.working || !this.ready || this.failed || this.textDragging) return;
    this.textValue = value;
    const entry: DrawingText | undefined = this.texts.find((item: DrawingText): boolean => item.id === this.selectedText);
    if (entry !== undefined) { entry.text = value; entry.size = this.textSize; entry.color = this.color; this.texts = this.texts.slice(); }
    this.publish();
  }

  private placeText(x: number, y: number): void {
    if (!this.canEditText() || this.textDragging || !Number.isFinite(x) || !Number.isFinite(y) || this.textValue.trim() === '' || this.texts.length >= 100) return;
    const id: number = this.texts.reduce((max: number, item: DrawingText): number => Math.max(max, item.id), 0) + 1;
    const entry: DrawingText = { id: id, text: this.textValue, x: 0, y: 0, size: this.textSize, color: this.color };
    entry.x = this.textOriginX(entry, x / this.canvasWidth);
    entry.y = this.textOriginY(entry, y / this.canvasHeight);
    this.texts = this.texts.concat([entry]);
    this.selectedText = id; this.publish();
  }

  private selectText(entry: DrawingText): void {
    if (!this.canEditText() || this.textDragging || !this.texts.includes(entry)) return;
    this.selectedText = entry.id; this.textValue = entry.text; this.textSize = entry.size; this.color = entry.color; this.publish();
  }

  private canEditText(): boolean { return !this.disposed && !this.working && this.ready && !this.failed && this.textMode; }

  private textFontSize(entry: DrawingText): number {
    return entry.size * (this.selectedText === entry.id ? this.textScale : 1) * this.canvasWidth / this.document.width;
  }

  private textBounds(entry: DrawingText): DrawingTextBounds {
    const key: string = `${entry.id}-${entry.size}-${entry.text}`;
    let measured: DrawingTextBounds | undefined = this.textMeasurements.get(key);
    if (measured === undefined) {
      if (this.textMeasurements.size >= 100) this.textMeasurements.clear();
      measured = measureNoteDrawingText(this.textMeasure, entry); this.textMeasurements.set(key, measured);
    }
    const scale: number = this.textFontSize(entry) / entry.size;
    // 选框只增加每侧2vp；点击热区另算，不把44vp最小点击尺寸混进可见边框。
    return { x: measured.x * scale - 2, y: measured.y * scale - 2,
      width: measured.width * scale + 4, height: measured.height * scale + 4 };
  }

  private textBoxWidth(entry: DrawingText): number { return this.textBounds(entry).width; }
  private textBoxHeight(entry: DrawingText): number { return this.textBounds(entry).height; }
  private textBoxX(entry: DrawingText): number {
    return entry.x * this.canvasWidth + (this.selectedText === entry.id ? this.textDragX : 0) + this.textBounds(entry).x;
  }
  private textBoxY(entry: DrawingText): number {
    return entry.y * this.canvasHeight + (this.selectedText === entry.id ? this.textDragY : 0) + this.textBounds(entry).y;
  }

  private textHandleX(entry: DrawingText, handle: DrawingTextHandle): number {
    return this.textHandleAxis(this.textBoxX(entry), this.textBoxWidth(entry), this.canvasWidth, handle.x);
  }

  private textHandleY(entry: DrawingText, handle: DrawingTextHandle): number {
    return this.textHandleAxis(this.textBoxY(entry), this.textBoxHeight(entry), this.canvasHeight, handle.y);
  }

  private textHandleAxis(start: number, length: number, available: number, ratio: number): number {
    // 小字也为八个手柄留出不重叠的热区；靠边时移动整组，不能逐个夹紧到同一点。
    const radius: number = Math.min(Math.max(24, length / 2 + 12), Math.max(0, (available - 24) / 2));
    const center: number = Math.max(radius + 12, Math.min(available - radius - 12, start + length / 2));
    return Math.max(0, center + (ratio - 0.5) * radius * 2 - 12);
  }
  private textOriginX(entry: DrawingText, x: number): number {
    const bounds: DrawingTextBounds = this.textBounds(entry);
    const minimum: number = Math.max(0, -bounds.x / this.canvasWidth);
    return Math.max(minimum, Math.min(1 - (bounds.x + bounds.width) / this.canvasWidth, x));
  }
  private textOriginY(entry: DrawingText, y: number): number {
    const bounds: DrawingTextBounds = this.textBounds(entry);
    const minimum: number = Math.max(0, -bounds.y / this.canvasHeight);
    return Math.max(minimum, Math.min(1 - (bounds.y + bounds.height) / this.canvasHeight, y));
  }

  private tapTextCanvas(event: GestureEvent): void {
    if (!this.canEditText() || this.textDragging) return;
    const reported: FingerInfo[] = event.fingerInfos !== undefined && event.fingerInfos.length > 0 ? event.fingerInfos : event.fingerList;
    const points: FingerInfo[] = (reported ?? []).filter((point: FingerInfo): boolean =>
      point !== undefined && Number.isFinite(point.id) && point.id >= 0 && Number.isFinite(point.localX) && Number.isFinite(point.localY));
    if (points.length !== 1) return;
    if (this.selectedText >= 0) { this.selectedText = -1; this.publish(); }
    else this.placeText(points[0].localX, points[0].localY);
  }

  private selectColor(index: number): void {
    if (this.disposed || this.working || !this.ready || this.failed || this.textDragging ||
      !Number.isInteger(index) || index < 0 || index >= DRAWING_COLORS.length || (this.official && !this.textMode)) return;
    this.color = DRAWING_COLORS[index]; this.textChanged(this.textValue);
  }

  private colorName(): string {
    const index: number = DRAWING_COLORS.indexOf(this.color);
    return index < 0 ? this.color : localizedNamedResourceText(this.getUIContext(), this.uiLanguage, DRAWING_COLOR_KEYS[index]);
  }

  private colorLabels(): string[] {
    return DRAWING_COLOR_KEYS.map((key: string): string => localizedNamedResourceText(this.getUIContext(), this.uiLanguage, key));
  }

  private startTextMove(entry: DrawingText): void {
    if (!this.canEditText() || this.textDragging || !this.texts.includes(entry)) return;
    this.selectText(entry); this.dragX = entry.x; this.dragY = entry.y;
    this.textTransform = 'move'; this.textDragging = true; this.publish();
  }

  private moveText(entry: DrawingText, x: number, y: number): void {
    if (!this.canEditText() || this.textTransform !== 'move' || this.selectedText !== entry.id ||
      !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.textDragX = (this.textOriginX(entry, this.dragX + x / this.canvasWidth) - this.dragX) * this.canvasWidth;
    this.textDragY = (this.textOriginY(entry, this.dragY + y / this.canvasHeight) - this.dragY) * this.canvasHeight;
    this.redrawTexts();
  }

  private finishTextMove(entry: DrawingText, commit: boolean): void {
    if (this.textTransform !== 'move' || this.selectedText !== entry.id) return;
    if (commit && this.canEditText() && this.texts.includes(entry)) {
      entry.x = this.dragX + this.textDragX / this.canvasWidth;
      entry.y = this.dragY + this.textDragY / this.canvasHeight;
      this.texts = this.texts.slice();
    }
    this.resetTextTransform(); this.publish();
  }

  private startTextResize(entry: DrawingText, pinch: boolean, handle: DrawingTextHandle = DRAWING_TEXT_HANDLES[7]): void {
    if (!this.canEditText() || !this.texts.includes(entry) || (this.textDragging && this.selectedText !== entry.id)) return;
    this.resetTextTransform(); this.selectText(entry);
    this.resizeWidth = Math.max(1, this.textBoxWidth(entry));
    this.resizeHeight = Math.max(1, this.textBoxHeight(entry));
    this.resizeHandle = handle;
    this.resizeAnchorX = this.textBoxX(entry) + this.resizeWidth * (1 - handle.x);
    this.resizeAnchorY = this.textBoxY(entry) + this.resizeHeight * (1 - handle.y);
    this.resizeSize = entry.size; this.textTransform = pinch ? 'pinch' : 'resize'; this.textDragging = true; this.publish();
  }

  private resizeText(entry: DrawingText, x: number, y: number): void {
    if (this.textTransform !== 'resize' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.scaleText(entry, drawingTextResizeScale(this.resizeWidth, this.resizeHeight, this.resizeHandle, x, y));
  }

  private scaleText(entry: DrawingText, scale: number): void {
    if (!this.canEditText() || !this.textDragging || this.textTransform === 'move' || this.selectedText !== entry.id ||
      !Number.isFinite(scale) || scale <= 0) return;
    this.textScale = scaledDrawingTextSize(this.resizeSize, scale) / this.resizeSize;
    const bounds: DrawingTextBounds = this.textBounds(entry);
    const x: number = this.textTransform === 'pinch' ? entry.x :
      (this.resizeAnchorX - bounds.x - bounds.width * (1 - this.resizeHandle.x)) / this.canvasWidth;
    const y: number = this.textTransform === 'pinch' ? entry.y :
      (this.resizeAnchorY - bounds.y - bounds.height * (1 - this.resizeHandle.y)) / this.canvasHeight;
    this.textDragX = (this.textOriginX(entry, x) - entry.x) * this.canvasWidth;
    this.textDragY = (this.textOriginY(entry, y) - entry.y) * this.canvasHeight;
    this.redrawTexts();
  }

  private finishTextResize(entry: DrawingText, commit: boolean): void {
    if ((this.textTransform !== 'resize' && this.textTransform !== 'pinch') || this.selectedText !== entry.id) return;
    if (commit && this.canEditText() && this.texts.includes(entry)) {
      // 先以预览尺寸约束原点，再提交字号；选择框不进入 PNG。
      entry.x += this.textDragX / this.canvasWidth; entry.y += this.textDragY / this.canvasHeight;
      entry.size = this.textSize = scaledDrawingTextSize(this.resizeSize, this.textScale);
      this.texts = this.texts.slice();
    }
    this.resetTextTransform(); this.publish();
  }

  private resetTextTransform(): void {
    this.textDragX = 0; this.textDragY = 0; this.textScale = 1; this.textDragging = false; this.textTransform = '';
  }

  private cancel(): void { if (!this.working && !this.disposed) this.onCancel(); }

  private async importImage(): Promise<void> {
    if (this.working || this.disposed || !this.ready || this.failed || this.textDragging) return;
    this.working = true; this.pendingOperations++; this.publish();
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions();
      options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE; options.maxSelectNumber = 1;
      const result = await new photoAccessHelper.PhotoViewPicker().select(options);
      if (this.disposed || result.photoUris.length === 0) return;
      const document: NoteDrawingDocument = await loadNoteDrawing(result.photoUris[0], false);
      const pixels: image.PixelMap | null = await drawingBaseImage(document);
      if (this.disposed) { pixels?.release(); return; }
      this.baseImage?.release(); this.baseImage = pixels; this.document.base = document.base;
      if (!this.official && this.document.engine === '' && !this.local.hasInk() && this.texts.length === 0 && this.source === '') {
        this.document.width = document.width; this.document.height = document.height; this.fitCanvas();
      }
    } catch (error) { this.showFailure(); }
    finally { if (!this.disposed) { this.working = false; this.publish(); } this.endOperation(); }
  }

  private async save(): Promise<void> {
    if (this.working || !this.ready || this.failed || this.disposed || this.textDragging) return;
    this.working = true; this.pendingOperations++; this.errorMessage = ''; this.local.cancel(); this.publish();
    let ink: image.PixelMap | null = null;
    let output: image.PixelMap | null = null;
    try {
      this.document.texts = this.texts.slice(); this.document.strokes = [];
      this.local.visitStrokes((stroke: WhiteboardStroke): void => { this.document.strokes.push(stroke); });
      if (this.official && this.host !== null) {
        await this.host.save(this.workspace + '/ink');
        if (this.disposed) return;
        this.document.ink = await snapshotDrawingInk(this.workspace);
        if (this.disposed) return;
        ink = await this.host.thumbnail(this.document.height / this.document.width);
        this.document.engine = 'huawei_pen_kit';
      } else this.document.engine = 'local_canvas';
      if (this.disposed) return;
      output = renderNoteDrawing(this.document, this.baseImage, ink);
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const uri: string = await saveNoteDrawing(context.cacheDir, output, this.document);
      if (this.disposed) {
        const item: NoteFieldImage = { id: 0, fieldIndex: 0, uri: uri, filename: '' };
        await discardNoteDrawingImages([item], context.cacheDir); return;
      }
      this.onApply(uri);
    } catch (error) { this.showFailure(); }
    finally { ink?.release(); output?.release(); if (!this.disposed) { this.working = false; this.publish(); } this.endOperation(); }
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.note_drawing_title'), closeEnabled: !this.working,
      actionEnabled: this.ready && !this.working && !this.failed && !this.textDragging,
      onClose: (): void => { this.cancel(); }, onAction: (): void => { this.save(); } })
  }

  @Builder
  private colorPreview() {
    Circle().width(12).height(12).fill(this.color).hitTestBehavior(HitTestMode.None)
  }

  @Builder
  private tools() {
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      按下态按钮({ 文案: $r('app.string.note_drawing_ink'), selectable: true, selected: !this.textMode,
        是否启用: this.ready && !this.working && !this.failed && !this.textDragging,
        点击回调: (): void => { this.textMode = false; this.selectedText = -1; this.publish(); } })
      按下态按钮({ 文案: $r('app.string.note_drawing_text'), selectable: true, selected: this.textMode,
        是否启用: this.ready && !this.working && !this.failed && !this.textDragging,
        点击回调: (): void => { this.textMode = true; this.selectedText = -1; this.publish(); } })
      按下态按钮({ 文案: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, noteDrawingImageActionKey(this.document.base !== '')),
        是否启用: this.ready && !this.working && !this.failed && !this.textDragging,
        点击回调: (): void => { this.importImage(); } })
      if (!this.official && !this.textMode) {
        按下态按钮({ 文案: $r('app.string.study_whiteboard_eraser'), selectable: true, selected: this.eraser, 是否启用: !this.working && this.ready && !this.failed,
          点击回调: (): void => { this.eraser = !this.eraser; this.publish(); } })
        按下态按钮({ 文案: $r('app.string.note_drawing_undo'), 是否启用: this.ready && !this.working && !this.failed && this.undoAvailable,
          点击回调: (): void => { this.local.undo(); this.redraw(); this.publish(); } })
        按下态按钮({ 文案: $r('app.string.note_drawing_redo'), 是否启用: this.ready && !this.working && !this.failed && this.redoAvailable,
          点击回调: (): void => { this.local.redo(); this.redraw(); this.publish(); } })
      }
    }.width('100%')
    if (this.textMode) {
      TextArea({ text: this.textValue, placeholder: resourceText(this.getUIContext(), $r('app.string.note_drawing_text_hint')) })
        .height(64).maxLength(2000).enabled(this.canEditText() && !this.textDragging).onChange((value: string): void => { this.textChanged(value); })
      Row({ space: 8 }) {
        按下态按钮({ 文案: $r('app.string.note_drawing_add_text'), 是否启用: this.canEditText() && !this.textDragging && this.textValue.trim() !== '' && this.texts.length < 100,
          点击回调: (): void => { this.placeText(this.canvasWidth * 0.1, this.canvasHeight * 0.1); } })
        IconActionButton({ source: $r('app.media.ic_common_close'), label: $r('app.string.note_drawing_delete_text'),
          toolbarStyle: true, isInteractive: this.canEditText() && !this.textDragging && this.selectedText >= 0,
          onAction: (): void => { this.texts = this.texts.filter((text: DrawingText): boolean => text.id !== this.selectedText);
            this.selectedText = -1; this.publish(); } })
      }.width('100%')
      Text($r('app.string.note_drawing_transform_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
    }
    if (this.textMode || !this.official) {
      FormSelectRow({ label: $r('app.string.note_drawing_color'),
        options: this.colorLabels().map((label: string): SelectOption => ({ value: label })),
        selectedIndex: DRAWING_COLORS.indexOf(this.color), value: this.colorName(), showValuePreview: true,
        valuePreview: () => { this.colorPreview(); },
        isInteractive: this.ready && !this.working && !this.failed && !this.textDragging,
        onSelect: (index: number): void => { this.selectColor(index); } })
    }
    if (this.source === '' && this.document.base === '') {
      Select([{ value: '1200 × 900' }, { value: '900 × 1200' }, { value: '1200 × 1200' }])
        .width(200).height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding)
        .space(SelectStyle.controlSpace).font(SelectStyle.controlFont).optionFont(SelectStyle.optionFont)
        .selectedOptionFont(SelectStyle.selectedOptionFont)
        .border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius).textModifier(SelectStyle.labelText()).attributeModifier(new SelectStyle())
        .selected(this.document.width === 900 ? 1 : this.document.height === 1200 ? 2 : 0)
        .value(`${this.document.width} × ${this.document.height}`).enabled(this.ready && !this.working && !this.failed && !this.textDragging)
        .accessibilityText($r('app.string.note_drawing_canvas_size'))
        .onSelect((index: number): void => {
          this.document.width = index === 1 ? 900 : 1200; this.document.height = index === 0 ? 900 : 1200; this.fitCanvas();
        })
    }
  }

  @Builder
  private bodyContent() {
    Column({ space: 8 }) {
      Scroll() {
        Column({ space: 8 }) {
          this.tools()
          if (this.errorMessage !== '') {
            Text(this.errorMessage).fontColor($r('app.color.error_text')).fontSize(应用尺寸.字号_正文_小)
          }
          if (this.working) { LoadingProgress().width(32).height(32) }
          Text($r('app.string.note_drawing_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        }.width('100%')
      }.width('100%').constraintSize({ maxHeight: this.toolScrollHeight() }).flexShrink(0).scrollBar(BarState.Auto)
      Stack({ alignContent: Alignment.Center }) {
        Stack({ alignContent: Alignment.TopStart }) {
          if (this.baseImage !== null) { Image(this.baseImage).width('100%').height('100%').objectFit(ImageFit.Fill) }
          if (this.official && this.host !== null) {
            Stack() { ContentSlot(this.host.getContent()) }.width('100%').height('100%')
              .hitTestBehavior(this.textMode || this.working ? HitTestMode.None : HitTestMode.Default)
          } else {
            Canvas(this.canvas).width('100%').height('100%').onReady((): void => { this.canvasMounted = true; this.redraw(); })
              .onTouch((event: TouchEvent): void => { this.touch(event); })
          }
          Canvas(this.textCanvas).width('100%').height('100%').hitTestBehavior(HitTestMode.None)
            .onReady((): void => { this.textCanvasMounted = true; this.redrawTexts(); })
            .onAreaChange((): void => { this.redrawTexts(); })
          if (this.textMode) {
            Stack().width('100%').height('100%').backgroundColor(Color.Transparent)
              .gesture(TapGesture().onAction((event: GestureEvent): void => { this.tapTextCanvas(event); }))
          }
          ForEach(this.texts, (entry: DrawingText) => {
            Stack({ alignContent: Alignment.TopStart }) {
              if (this.textMode && this.selectedText === entry.id) {
                Stack().width('100%').height('100%').border({ width: 1, color: $r('app.color.action_primary') })
                  .hitTestBehavior(HitTestMode.None)
              }
            }.width(this.textBoxWidth(entry)).height(this.textBoxHeight(entry))
              .position({ x: this.textBoxX(entry), y: this.textBoxY(entry) })
              .responseRegion({ x: -Math.max(0, 44 - this.textBoxWidth(entry)) / 2,
                y: -Math.max(0, 44 - this.textBoxHeight(entry)) / 2,
                width: Math.max(44, this.textBoxWidth(entry)), height: Math.max(44, this.textBoxHeight(entry)) })
              .zIndex(this.selectedText === entry.id ? 1 : 0)
              .hitTestBehavior(this.canEditText() ? HitTestMode.Default : HitTestMode.None)
              .attributeModifier(new PressFeedback())
              .onClick((): void => { this.selectText(entry); })
              .gesture(GestureGroup(GestureMode.Parallel,
                PanGesture({ fingers: 1, direction: PanDirection.All }).onActionStart((): void => { this.startTextMove(entry); })
                  .onActionUpdate((event: GestureEvent): void => { this.moveText(entry, event.offsetX, event.offsetY); })
                  .onActionEnd((event: GestureEvent): void => { this.moveText(entry, event.offsetX, event.offsetY); this.finishTextMove(entry, true); })
                  .onActionCancel((): void => { this.finishTextMove(entry, false); }),
                PinchGesture({ fingers: 2 }).onActionStart((): void => { this.startTextResize(entry, true); })
                  .onActionUpdate((event: GestureEvent): void => { this.scaleText(entry, event.scale); })
                  .onActionEnd((event: GestureEvent): void => { this.scaleText(entry, event.scale); this.finishTextResize(entry, true); })
                  .onActionCancel((): void => { this.finishTextResize(entry, false); })
              ))
            if (this.textMode && this.selectedText === entry.id) {
              // 手柄在框外独立命中，不用最小触摸尺寸撑大文字框。
              ForEach(DRAWING_TEXT_HANDLES, (handle: DrawingTextHandle) => {
                Stack() {
                  Circle().width(12).height(12).fill($r('app.color.action_primary'))
                    .stroke($r('app.color.action_on_primary')).strokeWidth(1)
                }.width(24).height(24).zIndex(2)
                  .position({ x: this.textHandleX(entry, handle), y: this.textHandleY(entry, handle) })
                  .accessibilityText($r('app.string.note_drawing_resize_text'))
                  .hitTestBehavior(this.canEditText() ? HitTestMode.Default : HitTestMode.None)
                  .gesture(PanGesture({ fingers: 1, direction: PanDirection.All, distance: 1 })
                    .onActionStart((): void => { this.startTextResize(entry, false, handle); })
                    .onActionUpdate((event: GestureEvent): void => { this.resizeText(entry, event.offsetX, event.offsetY); })
                    .onActionEnd((event: GestureEvent): void => {
                      this.resizeText(entry, event.offsetX, event.offsetY); this.finishTextResize(entry, true);
                    })
                    .onActionCancel((): void => { this.finishTextResize(entry, false); }))
              }, (handle: DrawingTextHandle): string => handle.id)
            }
          }, (entry: DrawingText): string => `${entry.id}-${entry.text}-${entry.x}-${entry.y}-${entry.color}-${entry.size}`)
        }.width(this.canvasWidth).height(this.canvasHeight).backgroundColor(this.document.background).clip(true)
      }.width('100%').layoutWeight(1).attributeModifier(new ImageSurfaceStyle())
        .onAreaChange((_old: Area, area: Area): void => { this.frameWidth = Number(area.width); this.frameHeight = Number(area.height); this.fitCanvas(); })
    }.width('100%').height('100%')
      .onAreaChange((_old: Area, area: Area): void => { this.bodyViewportHeight = Number(area.height); })
  }

  private toolScrollHeight(): number {
    // 工具区限高滚动，画布至少保留正文剩余空间的四成；画布本身不进入 Scroll。
    return Math.max(0, this.bodyViewportHeight - 8) * 0.6;
  }

  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 1100, fillBody: true, canDismiss: !this.working,
      onDismiss: (): void => { this.cancel(); }, header: () => { this.headerContent(); }, content: () => { this.bodyContent(); } })
  }
}
