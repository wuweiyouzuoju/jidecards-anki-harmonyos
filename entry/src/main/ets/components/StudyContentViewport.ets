// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnnotationPose, AnnotationPosition, annotationLayerTranslation } from '../model/StudyAnnotationView';

/** 两种白板复用内容变换和手势接线；按钮和评分栏位于此组件外。 */
@Component
export struct StudyContentViewport {
  @BuilderParam content: () => void = this.emptyContent;
  @Prop viewScale: number = 1;
  @Prop viewX: number = 0;
  @Prop viewY: number = 0;
  @Prop rootX: number = 0;
  @Prop rootY: number = 0;
  @Prop isInputEnabled: boolean = true;
  @State private originX: number = 0;
  @State private originY: number = 0;
  onTouchInput: (event: TouchEvent) => void = (): void => {};
  onFingerDrawingBlocked: (event: BaseEvent) => boolean = (): boolean => false;
  onControlTouch: (event: TouchEvent) => boolean = (): boolean => false;
  onNavigationAllowed: (event: BaseEvent) => boolean = (): boolean => false;
  onSinglePanAllowed: (event: BaseEvent) => boolean = (): boolean => false;
  onSinglePanStart: (event: GestureEvent) => void = (): void => {};
  onSinglePanUpdate: (event: GestureEvent) => void = (): void => {};
  onSinglePanFinish: () => void = (): void => {};
  onJudge: (info: GestureInfo, event: BaseGestureEvent) => GestureJudgeResult = (): GestureJudgeResult => GestureJudgeResult.REJECT;
  onStart: (event: GestureEvent, pinch: boolean) => void = (): void => {};
  onUpdate: (event: GestureEvent, pinch: boolean) => void = (): void => {};
  onFinish: (pinch: boolean) => void = (): void => {};
  private cancelledDrawingTouches: TouchRecognizer[] = [];
  private cancellingDrawingTouches: boolean = false;
  private blockedFingerIds: number[] = [];
  private controlFingerIds: number[] = [];

  private judgeRecognizer(event: BaseGestureEvent, current: GestureRecognizer,
    others: GestureRecognizer[], touches?: TouchRecognizer[]): GestureJudgeResult {
    const tag: string = current.getTag();
    if (tag !== 'study_view_pan' && tag !== 'study_global_pan' && tag !== 'study_global_zoom') {
      return GestureJudgeResult.CONTINUE;
    }
    const singlePan: boolean = tag === 'study_view_pan';
    const reportedFingers: FingerInfo[] = event.fingerInfos !== undefined && event.fingerInfos.length > 0 ?
      event.fingerInfos : event.fingerList;
    const fingers: FingerInfo[] = (reportedFingers ?? []).filter((finger: FingerInfo): boolean =>
      finger !== undefined && Number.isFinite(finger.id) && finger.id >= 0);
    if (fingers.some((finger: FingerInfo): boolean => this.controlFingerIds.includes(finger.id))) {
      return GestureJudgeResult.REJECT;
    }
    if (current.getFingerCount() !== (singlePan ? 1 : 2) || event.sourceTool !== SourceTool.Finger ||
      !(singlePan ? this.onSinglePanAllowed(event) : this.onNavigationAllowed(event))) {
      return GestureJudgeResult.REJECT;
    }
    if (others.some((recognizer: GestureRecognizer): boolean => recognizer.isBuiltIn() &&
      recognizer.getType() === GestureControl.GestureType.PAN_GESTURE &&
      !(recognizer.getEventTargetInfo() instanceof ScrollableTargetInfo))) return GestureJudgeResult.REJECT;
    // 笔模式的绘图区从Down就不向SDK分发；此时没有子书写触摸可取消，仍须允许视野手势。
    if (fingers.length === (singlePan ? 1 : 2) &&
      fingers.every((finger: FingerInfo): boolean => this.blockedFingerIds.includes(finger.id))) {
      return GestureJudgeResult.CONTINUE;
    }
    // 优先手势只仲裁手势识别器，SDK的onTouch仍可能书写；先取消本次书写触摸再接管视野。
    if (touches === undefined || touches.length === 0) return GestureJudgeResult.REJECT;
    const drawingTouches: TouchRecognizer[] = touches.filter((touch: TouchRecognizer): boolean =>
      touch.getEventTargetInfo().getId() !== 'study_view_input');
    if (drawingTouches.length === 0) return GestureJudgeResult.REJECT;
    this.cancellingDrawingTouches = true;
    try {
      for (const touch of drawingTouches) {
        if (this.cancelledDrawingTouches.includes(touch)) continue;
        this.cancelledDrawingTouches.push(touch);
        touch.cancelTouch();
      }
    } finally {
      this.cancellingDrawingTouches = false;
    }
    return GestureJudgeResult.CONTINUE;
  }

  private trackInput(event: TouchEvent): void {
    // 子节点的人工Cancel可能冒泡；不能把它当作整个双指手势结束。
    if (this.cancellingDrawingTouches && event.type === TouchType.Cancel) return;
    if (event.type === TouchType.Down || event.type === TouchType.Up || event.type === TouchType.Cancel) {
      this.cancelledDrawingTouches = [];
    }
    if (event.type === TouchType.Cancel) { this.blockedFingerIds = []; this.controlFingerIds = []; }
    else if (event.type === TouchType.Up) {
      this.blockedFingerIds = this.blockedFingerIds.filter((id: number): boolean =>
        !event.changedTouches.some((touch: TouchObject): boolean => touch.id === id));
      this.controlFingerIds = this.controlFingerIds.filter((id: number): boolean =>
        !event.changedTouches.some((touch: TouchObject): boolean => touch.id === id));
    }
    this.onTouchInput(event);
  }

  private observeTouchTest(event: TouchEvent): HitTestMode {
    // 先记录真实笔落下；仅笔模式的手指绘图区由本层独占，笔和原生工具仍默认分发。
    if (event.type === TouchType.Down) {
      this.blockedFingerIds = this.blockedFingerIds.filter((id: number): boolean =>
        !event.changedTouches.some((touch: TouchObject): boolean => touch.id === id) &&
        event.touches.some((touch: TouchObject): boolean => touch.id === id));
      this.controlFingerIds = this.controlFingerIds.filter((id: number): boolean =>
        !event.changedTouches.some((touch: TouchObject): boolean => touch.id === id) &&
        event.touches.some((touch: TouchObject): boolean => touch.id === id));
      this.trackInput(event);
    }
    if (event.sourceTool === SourceTool.Finger && this.onFingerDrawingBlocked(event)) {
      const control: boolean = this.onControlTouch(event);
      const ids: number[] = control ? this.controlFingerIds : this.blockedFingerIds;
      for (const touch of event.changedTouches) {
        if (Number.isFinite(touch.id) && touch.id >= 0 && !ids.includes(touch.id)) {
          ids.push(touch.id);
        }
      }
      return control ? HitTestMode.Default : HitTestMode.Block;
    }
    return HitTestMode.Default;
  }

  private translation(): AnnotationPosition {
    const pose: AnnotationPose = { scale: this.viewScale, x: this.viewX, y: this.viewY };
    return annotationLayerTranslation(pose, this.originX - this.rootX, this.originY - this.rootY);
  }

  @Builder
  private emptyContent() {}

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Stack({ alignContent: Alignment.TopStart }) { this.content(); }
        .width('100%').height('100%')
        .scale({ x: this.viewScale, y: this.viewScale, centerX: 0, centerY: 0 })
        .translate({ x: this.translation().x, y: this.translation().y })
    }.width('100%').height('100%').clip(true).enabled(this.isInputEnabled).id('study_view_input')
    .onTouch((event: TouchEvent): void => { this.trackInput(event); })
    .onTouchIntercept((event: TouchEvent): HitTestMode => this.observeTouchTest(event))
    .onGestureJudgeBegin((info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult => this.onJudge(info, event))
    .onGestureRecognizerJudgeBegin((event: BaseGestureEvent, current: GestureRecognizer,
      others: GestureRecognizer[], touches?: TouchRecognizer[]): GestureJudgeResult => this.judgeRecognizer(event, current, others, touches))
    .priorityGesture(
      GestureGroup(GestureMode.Parallel,
        PanGesture({ fingers: 1, direction: PanDirection.All, distance: 1 }).tag('study_view_pan')
          .onActionStart((event: GestureEvent): void => { this.onSinglePanStart(event); })
          .onActionUpdate((event: GestureEvent): void => { this.onSinglePanUpdate(event); })
          .onActionEnd((): void => { this.onSinglePanFinish(); }).onActionCancel((): void => { this.onSinglePanFinish(); }),
        PanGesture({ fingers: 2, direction: PanDirection.All, distance: 1 }).tag('study_global_pan')
          .onActionStart((event: GestureEvent): void => { this.onStart(event, false); })
          .onActionUpdate((event: GestureEvent): void => { this.onUpdate(event, false); })
          .onActionEnd((): void => { this.onFinish(false); }).onActionCancel((): void => { this.onFinish(false); }),
        PinchGesture({ fingers: 2, distance: 1 }).tag('study_global_zoom')
          .onActionStart((event: GestureEvent): void => { this.onStart(event, true); })
          .onActionUpdate((event: GestureEvent): void => { this.onUpdate(event, true); })
          .onActionEnd((): void => { this.onFinish(true); }).onActionCancel((): void => { this.onFinish(true); })
      )
    )
    .onAreaChange((_old: Area, area: Area): void => {
      this.originX = Number(area.globalPosition.x); this.originY = Number(area.globalPosition.y);
    })
  }
}
