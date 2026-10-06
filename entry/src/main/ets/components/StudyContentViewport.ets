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
  onJudge: (info: GestureInfo, event: BaseGestureEvent) => GestureJudgeResult = (): GestureJudgeResult => GestureJudgeResult.REJECT;
  onStart: (event: GestureEvent, pinch: boolean) => void = (): void => {};
  onUpdate: (event: GestureEvent, pinch: boolean) => void = (): void => {};
  onFinish: (pinch: boolean) => void = (): void => {};

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
    }.width('100%').height('100%').clip(true).enabled(this.isInputEnabled)
    .onTouch((event: TouchEvent): void => { this.onTouchInput(event); })
    .onGestureJudgeBegin((info: GestureInfo, event: BaseGestureEvent): GestureJudgeResult => this.onJudge(info, event))
    .priorityGesture(
      GestureGroup(GestureMode.Parallel,
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
