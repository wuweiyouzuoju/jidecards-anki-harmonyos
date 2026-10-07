// SPDX-License-Identifier: AGPL-3.0-or-later
import { ActionIcon } from '../common/ActionIcon';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { curves, window } from '@kit.ArkUI';
import { namedResourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { StudyGripSensor } from '../../backend/StudyGripSensor';
import { StudyGripSession } from '../../model/StudyGripSession';
import { StudyGripAvailability, StudyToolbarSide } from '../../model/StudyLayout';
import { NOTE_EDITOR_GRIP_AVAILABILITY_KEY, NoteEditorWheelState, NoteEditorWheelTool,
  noteEditorWheelTools, noteEditorWheelCommonTools, noteEditorWheelOuterTools, noteWheelToolHighlighted, noteWheelToolIsToggle,
  noteWheelIndex, noteWheelDistance, noteWheelAngleStep, noteWheelViewportHeight,
  noteWheelItemPosition, noteWheelTrackRadius, noteWheelLabel, noteWheelHandleAngle, NOTE_EDITOR_WHEEL_VISIBLE_COUNT,
  NoteWheelMouseRotation,
  noteWheelRadius, noteWheelY, NoteWheelRotation } from '../../model/NoteEditorWheel';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteEditorWheelObservation } from '../../model/AppInterface';
import { NOTE_EDITOR_ACTION_FLASH_MS, noteEditorTool } from '../../model/NoteFieldEditing';
export { NoteEditorFormatDialog } from './NoteEditorFormatDialog';

export class NoteEditorWheelParams {
  state: NoteEditorWheelState;
  onAction: (id: string) => void;
  visible: boolean;
  initialTool: string;
  onSelection: (id: string) => void;
  onResetFormats: () => void;
  onLongAction: (id: string) => void;
  constructor(state: NoteEditorWheelState, onAction: (id: string) => void, visible: boolean = true,
    initialTool: string = '', onSelection: (id: string) => void = (_id: string): void => {},
    onResetFormats: () => void = (): void => {},
    onLongAction: (id: string) => void = (_id: string): void => {}) {
    this.state = state; this.onAction = onAction; this.visible = visible;
    this.initialTool = initialTool; this.onSelection = onSelection;
    this.onResetFormats = onResetFormats;
    this.onLongAction = onLongAction;
  }
}

@Builder
export function buildNoteEditorWheel(params: NoteEditorWheelParams) {
  // WrappedBuilder 的首节点必须是可穿透的原生布局，避免自定义组件代理覆盖整页触摸。
  Column() {
    NoteEditorWheel({ params: params })
  }.width('100%').height('100%').focusable(false).hitTestBehavior(HitTestMode.Transparent)
}

/** 表单当前字段拥有默认展开浮层；浮层只负责选择、布局和单一握姿订阅。 */
@Component
struct NoteEditorWheel {
  private longPressedTool: string = '';
  @Prop @Watch('parametersChanged') params: NoteEditorWheelParams = new NoteEditorWheelParams(
    { cloze: false, source: false, expanded: false, activeIds: [] }, (_id: string): void => {});
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('activityChanged') private foreground: boolean = true;
  @State private side: StudyToolbarSide = 'right';
  @State private selectedId: string = '';
  @State private collapsed: boolean = false;
  @State private viewportWidth: number = 0;
  @State private viewportHeight: number = 0;
  @State private centerY: number = 0;
  @State private arcPosition: number = 0;
  @State private openProgress: number = 0;
  @State private wheelTools: NoteEditorWheelTool[] = [];
  @State private commonTools: NoteEditorWheelTool[] = [];
  @State private keyboardTop: number = 0;
  @State private overlayTop: number = 0;
  private hostWindow: window.Window | null = null;
  private keyboardSubscribed: boolean = false;
  private keyboardListener: (height: number) => void = (height: number): void => { this.readKeyboard(height); };
  private attached: boolean = false;
  private observationVersion: number = 0;
  private revealTimer: number = -1;
  private actionFlashTimer: number = -1;
  private actionFlashVersion: number = 0;
  private mouseRotation: NoteWheelMouseRotation = new NoteWheelMouseRotation();
  private axisMoved: boolean = false;
  private originX: number = 0;
  private originY: number = 0;
  private mounted: boolean = false;
  private initialized: boolean = false;
  private gripAvailability: StudyGripAvailability = 'unchecked';
  private rotation: NoteWheelRotation = new NoteWheelRotation();
  private rotationPosition: number = 0;
  private startX: number = 0;
  private startY: number = 0;
  private dragY: number = 0;
  private touchIds: Set<number> = new Set<number>();
  private grip: StudyGripSession = new StudyGripSession(new StudyGripSensor(NOTE_EDITOR_GRIP_AVAILABILITY_KEY), {
    schedule: (callback: () => void, delay: number): number => setTimeout(callback, delay),
    cancel: (timer: number): void => clearTimeout(timer),
    move: (side: StudyToolbarSide): void => { if (this.mounted) this.moveSide(side); },
    report: (availability: StudyGripAvailability): void => {
      this.gripAvailability = availability; this.publish();
    }
  });

  aboutToAppear(): void { this.mounted = true; this.parametersChanged(); this.subscribeKeyboard(); }
  aboutToDisappear(): void {
    this.mounted = false; this.grip.dispose(); this.clearActionFlash();
    if (this.revealTimer >= 0) clearTimeout(this.revealTimer);
    if (this.keyboardSubscribed) {
      try { this.hostWindow?.off('keyboardHeightChange', this.keyboardListener); } catch (_error) { /* 窗口已销毁。 */ }
    }
    this.keyboardSubscribed = false; this.hostWindow = null;
    this.detach();
  }
  private parametersChanged(): void {
    const tools: NoteEditorWheelTool[] = noteEditorWheelOuterTools(this.params.state);
    this.commonTools = noteEditorWheelCommonTools(this.params.state);
    if (!this.initialized) {
      this.initialized = true;
      this.selectedId = this.params.initialTool;
    }
    if (!noteEditorWheelTools(this.params.state).some((tool: NoteEditorWheelTool): boolean => tool.id === this.selectedId)) this.selectedId = '';
    if (this.actionFlashTimer < 0 && !noteWheelToolIsToggle(this.selectedId, this.params.state.source)) this.selectedId = '';
    const selected: number = tools.findIndex((tool: NoteEditorWheelTool): boolean => tool.id === this.selectedId);
    const changed: boolean = tools.length !== this.wheelTools.length ||
      tools.some((tool: NoteEditorWheelTool, index: number): boolean => tool.id !== this.wheelTools[index]?.id);
    this.wheelTools = tools;
    if (changed) this.arcPosition = Math.max(0, selected) + this.alignmentOffset();
    this.activityChanged();
    if (!this.params.visible) this.animateOpen(false);
    else if (this.viewportHeight > 0) this.animateOpen(!this.collapsed);
  }
  private activityChanged(): void {
    const active: boolean = this.mounted && this.foreground && this.params.visible;
    this.grip.setActive(active);
    if (active) this.publish(); else { this.clearActionFlash(); this.mouseRotation.reset(); this.axisMoved = false; this.detach(); }
  }
  private detach(): void {
    if (this.attached) appInterface.leave('note_editor_wheel', this.observationVersion);
    this.attached = false;
  }
  private selectedIndex(): number { return noteWheelIndex(Math.round(this.arcPosition), this.wheelTools.length); }
  private alignmentOffset(): number { return this.wheelTools.length > 0 && this.wheelTools.length < 7 && this.wheelTools.length % 2 === 0 ? -0.5 : 0; }
  private selected(): NoteEditorWheelTool | undefined { return this.wheelTools[this.selectedIndex()]; }
  private usableHeight(): number { return noteWheelViewportHeight(this.viewportHeight, this.overlayTop, this.keyboardTop); }
  private radius(): number {
    const radius: number = noteWheelRadius(this.viewportWidth, this.usableHeight());
    return this.wheelTools.length > 0 ? radius : Math.min(110, radius);
  }
  private trackRadius(common: boolean): number { return noteWheelTrackRadius(this.radius(), common, this.wheelTools.length > 0); }
  private y(): number { return noteWheelY(this.centerY, this.usableHeight(), this.radius(), false); }
  private async subscribeKeyboard(): Promise<void> {
    const context = this.getUIContext().getHostContext();
    if (context === undefined) return;
    try {
      const host: window.Window = await window.getLastWindow(context);
      if (!this.mounted) return;
      this.hostWindow = host;
      host.on('keyboardHeightChange', this.keyboardListener); this.keyboardSubscribed = true;
      this.readKeyboard(-1);
    } catch (_error) { /* 保留可测量的安全区和手动移动，不改变页面键盘策略。 */ }
  }
  private readKeyboard(height: number): void {
    if (!this.mounted || this.hostWindow === null) return;
    let top: number = 0;
    try {
      const rect: window.Rect = this.hostWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_KEYBOARD).bottomRect;
      if (height !== 0 && rect.height > 0) top = this.getUIContext().px2vp(rect.top);
      else if (height > 0) top = this.getUIContext().px2vp(this.hostWindow.getWindowProperties().windowRect.height - height);
    } catch (_error) { /* 键盘区域暂不可读时沿用宿主测量。 */ }
    this.getUIContext().animateTo({ duration: 220, curve: Curve.EaseOut }, (): void => { this.keyboardTop = top; });
  }
  private distance(index: number, common: boolean = false): number {
    return common ? index - (this.commonTools.length - 1) / 2 : noteWheelDistance(index, this.arcPosition, this.wheelTools.length);
  }
  private iconVisible(index: number): boolean { return Math.abs(this.distance(index)) < NOTE_EDITOR_WHEEL_VISIBLE_COUNT / 2; }
  private iconOpacity(index: number): number { return Math.min(1, Math.max(0, (3.5 - Math.abs(this.distance(index))) * 2)); }
  private itemHeight(common: boolean = false): number {
    return this.circleSize(common);
  }
  private itemWidth(common: boolean = false): number {
    return this.circleSize(common);
  }
  private contentScale(): number { return this.radius() / (this.wheelTools.length > 0 ? 158 : 110); }
  private labelWidth(common: boolean): number { return (common ? 25 : 27) * this.contentScale(); }
  private circleSize(common: boolean = false): number { return (common ? 42 : 46) * this.contentScale(); }
  private current(tool: NoteEditorWheelTool): boolean {
    // ForEach 按 id 复用按钮，开启状态必须读取当前字段，不能留在旧条目闭包里。
    return noteWheelToolHighlighted(tool.id, this.params.state.activeIds, this.selectedId, this.params.state.source);
  }
  private x(index: number, common: boolean = false): number {
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.wheelTools.length).x - this.itemWidth(common) / 2;
  }
  private iconY(index: number, common: boolean = false): number {
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.wheelTools.length).y - this.circleSize(common) / 2;
  }
  private publish(): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.commonTools.length === 0) return;
    this.observationVersion = appInterface.observe(noteEditorWheelObservation(this.params.state, this.selectedId, this.side,
      this.collapsed, this.gripAvailability, this.selected()?.id ?? ''));
    this.params.onSelection(this.selectedId);
    this.attached = true;
  }
  private animateOpen(open: boolean): void {
    this.getUIContext().animateTo({ duration: open ? 260 : 220, curve: curves.springCurve(0, 1, 280, 28) },
      (): void => { this.openProgress = open ? 1 : 0; });
  }
  private toggleOpen(): void {
    if (!this.mounted || !this.foreground || !this.params.visible) return;
    this.clearActionFlash();
    this.mouseRotation.reset(); this.axisMoved = false;
    this.collapsed = !this.collapsed;
    if (!this.collapsed) { this.selectedId = ''; this.params.onResetFormats(); }
    this.animateOpen(!this.collapsed); this.publish();
  }
  private select(index: number): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.collapsed) return;
    const tool: NoteEditorWheelTool | undefined = this.wheelTools[index];
    if (tool === undefined) return;
    this.mouseRotation.reset();
    this.execute(tool.id);
  }
  private execute(id: string, longPress: boolean = false): void {
    const available: boolean = noteEditorWheelTools(this.params.state)
      .some((tool: NoteEditorWheelTool): boolean => tool.id === id);
    if (available && this.mounted && this.foreground && this.params.visible && !this.collapsed) {
      if (longPress && noteEditorTool(id).longPressAction === undefined) return;
      this.clearActionFlash(); this.selectedId = id;
      if (!noteWheelToolIsToggle(id, this.params.state.source)) {
        const version: number = this.actionFlashVersion;
        this.actionFlashTimer = setTimeout((): void => {
          if (version !== this.actionFlashVersion || !this.mounted) return;
          this.actionFlashTimer = -1; this.selectedId = ''; this.publish();
        }, NOTE_EDITOR_ACTION_FLASH_MS);
      }
      this.publish();
      if (longPress) this.params.onLongAction(id); else this.params.onAction(id);
    }
  }
  private toolTouch(event: TouchEvent): void {
    if (event.type === TouchType.Down) this.longPressedTool = '';
  }
  private longPressTool(id: string): void {
    if (noteEditorTool(id).longPressAction === undefined) return;
    this.longPressedTool = id;
    this.execute(id, true);
  }
  private clickTool(id: string): void {
    // 长按松手若补发 click，也不能额外插入行内标记；下一次按下恢复普通点击。
    if (this.longPressedTool === id) { this.longPressedTool = ''; return; }
    this.mouseRotation.reset();
    this.execute(id);
  }
  private clearActionFlash(): void {
    this.actionFlashVersion++;
    if (this.actionFlashTimer >= 0) clearTimeout(this.actionFlashTimer);
    this.actionFlashTimer = -1;
    if (!noteWheelToolIsToggle(this.selectedId, this.params.state.source)) this.selectedId = '';
  }
  private axisWheel(event: AxisEvent): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.collapsed) return;
    if (event.action === AxisAction.CANCEL) { this.mouseRotation.reset(); this.axisMoved = false; return; }
    const delta: number = this.mouseRotation.move(event.getVerticalAxisValue(), event.scrollStep ?? 1);
    if (this.wheelTools.length === 0) return;
    if (delta !== 0) { this.axisMoved = true; this.arcPosition += delta; this.publish(); }
    if (event.action === AxisAction.END && this.axisMoved) { this.axisMoved = false; this.settleRotation(); }
  }
  private rotateStart(event: GestureEvent): void {
    this.mouseRotation.reset();
    if (this.wheelTools.length === 0) return;
    const finger: FingerInfo | undefined = event.fingerList[0];
    if (finger === undefined) return;
    this.startX = finger.globalX - this.originX - event.offsetX;
    this.startY = finger.globalY - this.originY - event.offsetY;
    this.rotationPosition = this.arcPosition;
    this.rotation.begin(this.startX, this.startY, this.radius(), this.side === 'right', noteWheelAngleStep(this.radius(), this.wheelTools.length));
  }
  private rotateWheel(event: GestureEvent): void {
    if (this.wheelTools.length === 0) return;
    const delta: number = this.rotation.move(this.startX + event.offsetX, this.startY + event.offsetY);
    const previous: number = this.selectedIndex();
    this.arcPosition = this.rotationPosition + delta;
    // 每帧只更新位置；跨过一个工具时才发布软件认知，避免握姿/观察写入抢占手势。
    if (this.selectedIndex() !== previous) this.publish();
  }
  private settleRotation(): void {
    if (this.wheelTools.length === 0) return;
    this.getUIContext().animateTo({ duration: 180, curve: curves.springCurve(0, 1, 340, 28) },
      (): void => { this.arcPosition = Math.round(this.arcPosition - this.alignmentOffset()) + this.alignmentOffset(); });
    this.publish();
  }
  private moveSide(side: StudyToolbarSide): void {
    this.getUIContext().animateTo({ duration: 240, curve: Curve.EaseInOut }, (): void => { this.side = side; });
    this.publish();
  }
  private switchSide(): void {
    const side: StudyToolbarSide = this.side === 'left' ? 'right' : 'left';
    this.grip.restoreSide(side); this.moveSide(side);
  }
  private touch(event: TouchEvent): void {
    if (event.type === TouchType.Cancel) this.touchIds.clear();
    else for (const touch of event.changedTouches) {
      if (event.type === TouchType.Up) this.touchIds.delete(touch.id);
      else this.touchIds.add(touch.id);
    }
    this.grip.setTouching(this.touchIds.size > 0);
  }
  private title(tool: NoteEditorWheelTool, _locale: string = this.uiLanguage): string {
    return namedResourceText(this.getUIContext(), tool.titleKey);
  }

  @Builder
  private track(common: boolean) {
    Circle().width(this.trackRadius(common) * 2).height(this.trackRadius(common) * 2)
      .fill(Color.Transparent).stroke(SurfaceBorder.color()).strokeWidth(1)
      .position({ x: this.side === 'right' ? this.radius() - this.trackRadius(common) : -this.trackRadius(common),
        y: this.radius() - this.trackRadius(common) }).hitTestBehavior(HitTestMode.None)
  }

  @Builder
  private toolButton(tool: NoteEditorWheelTool, index: number, common: boolean) {
    Button() {
      Stack() {
        Circle().width(this.circleSize(common)).height(this.circleSize(common)).fill(this.current(tool) ?
          this.accent : $r('app.color.surface_sidebar'))
        Column({ space: this.contentScale() }) {
          ActionIcon({ source: $r('app.media.' + tool.iconKey),
            glyphSize: (common ? 16 : 18) * this.contentScale(),
            strokeColor: this.current(tool) ? '#FFFFFF' : this.accent })
          Text(noteWheelLabel(this.title(tool), this.labelWidth(common), (common ? 8 : 9) * this.contentScale()))
            .fontSize((common ? 8 : 9) * this.contentScale()).maxLines(2).wordBreak(WordBreak.BREAK_ALL)
            .fontColor(this.current(tool) ? '#FFFFFF' : $r('app.color.text_secondary'))
            .fontWeight(this.current(tool) ? FontWeight.Medium : FontWeight.Normal)
            .textAlign(TextAlign.Center).width(this.labelWidth(common)).height((common ? 16 : 18) * this.contentScale())
        }.alignItems(HorizontalAlign.Center).hitTestBehavior(HitTestMode.None)
      }.width(this.itemWidth(common)).height(this.itemHeight(common)).hitTestBehavior(HitTestMode.None)
    }.width(this.itemWidth(common)).height(this.itemHeight(common)).padding(0).type(ButtonType.Circle).backgroundColor(Color.Transparent)
      .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
      .position({ x: this.x(index, common), y: this.iconY(index, common) }).opacity(common ? 1 : this.iconOpacity(index))
      .visibility(common || this.iconVisible(index) ? Visibility.Visible : Visibility.Hidden)
      .accessibilityText(this.title(tool))
      .accessibilityDescription(tool.longPressAction !== undefined ? $r('app.string.note_editor_math_press_hint') :
        (this.params.state.activeIds.indexOf(tool.id) >= 0 ?
          $r('app.string.note_editor_format_on') : $r('app.string.note_editor_wheel_select')))
      .onTouch((event: TouchEvent): void => { this.toolTouch(event); })
      .onClick((): void => { this.clickTool(tool.id); })
      .gesture(LongPressGesture().onAction((): void => { this.longPressTool(tool.id); }))
  }

  @Builder
  private handle() {
    Button() {
      DisclosureChevron({ tint: this.accent })
        .rotate({ angle: noteWheelHandleAngle(this.openProgress, this.side === 'right') })
    }.width(28).height(48).padding(0).type(ButtonType.Normal)
      .borderRadius(12).backgroundColor($r('app.color.surface_sidebar'))
      .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
      .accessibilityText(this.collapsed ? $r('app.string.note_editor_wheel_open') : $r('app.string.note_editor_wheel_close'))
      .accessibilityDescription($r('app.string.note_editor_wheel_move_hint'))
      .onClick((): void => { this.toggleOpen(); })
      .gesture(GestureGroup(GestureMode.Exclusive,
        LongPressGesture().onAction((): void => { this.switchSide(); }),
        PanGesture({ direction: PanDirection.Vertical, distance: 6 })
          .onActionStart((): void => { this.dragY = this.y(); })
          .onActionUpdate((event: GestureEvent): void => {
            this.centerY = noteWheelY(this.dragY + event.offsetY, this.usableHeight(), this.radius(), false);
          })))
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.viewportWidth >= 160 && this.usableHeight() >= 176 && this.foreground) {
        Stack({ alignContent: Alignment.TopStart }) {
          Column().width(this.radius()).height(this.radius() * 2)
            .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options())
            .borderRadius(this.side === 'left' ? { topRight: this.radius(), bottomRight: this.radius() } :
              { topLeft: this.radius(), bottomLeft: this.radius() })
            .shadow({ radius: 12, color: '#24000000', offsetX: this.side === 'left' ? 2 : -2, offsetY: 2 })
            .hitTestBehavior(HitTestMode.None)
          if (this.wheelTools.length > 0) { this.track(false) }
          this.track(true)
          ForEach(this.wheelTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, false)
          }, (tool: NoteEditorWheelTool): string => tool.id)
          ForEach(this.commonTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, true)
          }, (tool: NoteEditorWheelTool): string => tool.id)
        }.width(this.radius()).height(this.radius() * 2).clip(true)
          .position({ x: this.side === 'left' ? 0 : this.viewportWidth - this.radius(), y: this.y() - this.radius() })
          .translate({ x: (this.side === 'left' ? -1 : 1) * (this.radius() + 12) * (1 - this.openProgress) })
          .opacity(this.openProgress)
          .hitTestBehavior(this.collapsed || !this.params.visible ? HitTestMode.None : HitTestMode.Default)
          .onTouch((event: TouchEvent): void => { this.touch(event); })
          .onAxisEvent((event: AxisEvent): void => { this.axisWheel(event); })
          .gesture(PanGesture({ distance: 3 }).onActionStart((event: GestureEvent): void => { this.rotateStart(event); })
            .onActionUpdate((event: GestureEvent): void => { this.rotateWheel(event); })
            .onActionEnd((): void => { this.settleRotation(); }).onActionCancel((): void => { this.settleRotation(); }))
          .onAreaChange((_old: Area, area: Area): void => {
            this.originX = Number(area.globalPosition.x); this.originY = Number(area.globalPosition.y);
          })
        Row() {
          this.handle()
        }.alignItems(VerticalAlign.Center)
          .position({ x: this.side === 'left' ? 0 : this.viewportWidth - 28, y: this.y() - 24 })
          .opacity(this.params.visible ? 1 : this.openProgress)
          .hitTestBehavior(this.params.visible ? HitTestMode.Default : HitTestMode.None)
          .onTouch((event: TouchEvent): void => { this.touch(event); })
      }
    }.width('100%').height('100%').focusable(false).hitTestBehavior(HitTestMode.Transparent)
      .onAreaChange((_old: Area, area: Area): void => {
        this.viewportWidth = Number(area.width); this.viewportHeight = Number(area.height);
        this.overlayTop = Number(area.globalPosition.y);
        if (this.centerY === 0) {
          this.centerY = this.viewportHeight * 0.6;
          this.revealTimer = setTimeout((): void => {
            this.revealTimer = -1;
            if (this.mounted && this.params.visible) this.animateOpen(!this.collapsed);
          }, 16);
        }
      })
  }
}
