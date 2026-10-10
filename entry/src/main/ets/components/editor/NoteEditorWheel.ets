// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';
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
  noteWheelRadius, noteWheelY, NoteWheelRotation, noteWheelOptionArcPosition, NoteWheelOptionPosition } from '../../model/NoteEditorWheel';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteEditorWheelObservation, noteEditorFormatObservation } from '../../model/AppInterface';
import type { AppInterfaceObservation } from '../../model/AppInterface';
import { NOTE_EDITOR_ACTION_FLASH_MS, NOTE_FIELD_EDITING_SUPPORT, noteEditorTool, noteEditorFormatOptions, NoteEditorFormatOption } from '../../model/NoteFieldEditing';
export { NoteEditorFormatDialog } from './NoteEditorFormatDialog';

export class NoteEditorWheelParams {
  state: NoteEditorWheelState;
  onAction: (id: string) => void;
  visible: boolean;
  initialTool: string;
  onSelection: (id: string) => void;
  onResetFormats: () => void;
  onLongAction: (id: string) => void;
  onOptionSelect: (id: string) => void;
  onCloseOptions: () => void;
  constructor(state: NoteEditorWheelState, onAction: (id: string) => void, visible: boolean = true,
    initialTool: string = '', onSelection: (id: string) => void = (_id: string): void => {},
    onResetFormats: () => void = (): void => {},
    onLongAction: (id: string) => void = (_id: string): void => {},
    onOptionSelect: (id: string) => void = (_id: string): void => {},
    onCloseOptions: () => void = (): void => {}) {
    this.state = state; this.onAction = onAction; this.visible = visible;
    this.initialTool = initialTool; this.onSelection = onSelection;
    this.onResetFormats = onResetFormats;
    this.onLongAction = onLongAction;
    this.onOptionSelect = onOptionSelect; this.onCloseOptions = onCloseOptions;
  }
}

@Builder
export function buildNoteEditorWheel(params: NoteEditorWheelParams) {
  // 原生根布局只穿透空白；局部交互区用 BLOCK_HIERARCHY 阻止点击落到页面控件。
  Column() {
    NoteEditorWheel({ params: params })
  }.width('100%').height('100%').focusable(false).hitTestBehavior(HitTestMode.Transparent)
}

/** 表单当前字段拥有默认展开浮层；浮层只负责选择、布局和单一握姿订阅。 */
@Component
struct NoteEditorWheel {
  private longPressedTool: string = '';
  @State private pressedId: string = '';
  @State private rotating: boolean = false;
  @State private moving: boolean = false;
  @State private edgeContact: boolean = false;
  private suppressToolClick: boolean = false;
  private suppressHandleClick: boolean = false;
  private axisStartPosition: number = 0;
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
  private optionsObservationVersion: number = 0;
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
    this.cancelManipulation(); this.mounted = false; this.grip.dispose(); this.clearActionFlash();
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
    if (active) this.publish(); else { this.cancelManipulation(); this.clearActionFlash(); this.mouseRotation.reset(); this.axisMoved = false; this.detach(); }
  }
  private detach(): void {
    if (this.attached) appInterface.leave('note_editor_wheel', this.observationVersion);
    this.attached = false;
    this.detachOptions();
  }
  private detachOptions(): void {
    if (this.optionsObservationVersion > 0) appInterface.leave('note_editor_format_options', this.optionsObservationVersion);
    this.optionsObservationVersion = 0;
  }
  private selectedIndex(): number { return noteWheelIndex(Math.round(this.arcPosition), this.wheelTools.length); }
  private alignmentOffset(): number { return this.wheelTools.length > 0 && this.wheelTools.length < 7 && this.wheelTools.length % 2 === 0 ? -0.5 : 0; }
  private selected(): NoteEditorWheelTool | undefined { return this.wheelTools[this.selectedIndex()]; }
  private usableHeight(): number { return noteWheelViewportHeight(this.viewportHeight, this.overlayTop, this.keyboardTop); }
  private radius(): number {
    const radius: number = noteWheelRadius(this.viewportWidth, this.usableHeight());
    return this.wheelTools.length > 0 ? radius : Math.min(110, radius);
  }
  private frameRadius(): number { return this.radius(); }
  private trackRadius(common: boolean): number { return noteWheelTrackRadius(this.radius(), common, this.wheelTools.length > 0); }
  private y(): number { return noteWheelY(this.centerY, this.usableHeight(), this.frameRadius(), false); }
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
    this.cancelManipulation();
    this.getUIContext().animateTo(motionAnimation(currentMotionProfile().textMs), (): void => { this.keyboardTop = top; });
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
    return tool.id === this.params.state.optionToolId && this.params.state.optionsOpen === true ||
      noteWheelToolHighlighted(tool.id, this.params.state.activeIds, this.selectedId, this.params.state.source);
  }
  private x(index: number, common: boolean = false): number {
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.wheelTools.length).x - this.itemWidth(common) / 2 +
      (this.side === 'right' ? this.frameRadius() - this.radius() : 0);
  }
  private iconY(index: number, common: boolean = false): number {
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.wheelTools.length).y - this.circleSize(common) / 2 + this.frameRadius() - this.radius();
  }
  private publish(): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.commonTools.length === 0) return;
    const observation: AppInterfaceObservation = noteEditorWheelObservation(this.params.state, this.selectedId, this.side,
      this.collapsed, this.gripAvailability, this.selected()?.id ?? '');
    observation.values = (observation.values ?? []).concat([
      { id: 'pressed_tool', value: this.pressedId }, { id: 'rotating', value: String(this.rotating) },
      { id: 'moving', value: String(this.moving) }, { id: 'edge_contact', value: String(this.edgeContact) }]);
    this.observationVersion = appInterface.observe(observation);
    if (this.params.state.optionsOpen === true && !this.collapsed) {
      this.optionsObservationVersion = appInterface.observe(noteEditorFormatObservation(this.params.state.optionToolId ?? '',
        this.params.state.fieldName ?? '', this.params.state.source, this.params.state.optionId ?? '',
        NOTE_FIELD_EDITING_SUPPORT.formatOptionPicker.placement));
    } else this.detachOptions();
    this.params.onSelection(this.selectedId);
    this.attached = true;
  }
  private animateOpen(open: boolean): void {
    this.getUIContext().animateTo(motionAnimation(open ? currentMotionProfile().wheelOpenMs : currentMotionProfile().wheelCloseMs),
      (): void => { this.openProgress = open ? 1 : 0; });
  }
  private toggleOpen(): void {
    if (!this.mounted || !this.foreground || !this.params.visible) return;
    if (this.suppressHandleClick) { this.suppressHandleClick = false; return; }
    this.cancelManipulation(); this.clearActionFlash();
    this.mouseRotation.reset(); this.axisMoved = false;
    this.collapsed = !this.collapsed;
    if (this.collapsed) this.params.onCloseOptions();
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
  private toolTouch(id: string, event: TouchEvent): void {
    if (event.type === TouchType.Down) { this.longPressedTool = ''; this.suppressToolClick = false; this.pressedId = id; }
    if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressedId = '';
    if (event.type === TouchType.Cancel || event.touches.length > 1) { this.suppressToolClick = true; this.cancelManipulation(); }
  }
  private longPressTool(id: string): void {
    if (noteEditorTool(id).longPressAction === undefined) return;
    this.longPressedTool = id;
    this.execute(id, true);
  }
  private clickTool(id: string): void {
    if (this.suppressToolClick || this.rotating) return;
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
    if (event.action === AxisAction.CANCEL) {
      if (this.axisMoved) this.restoreRotation(this.axisStartPosition);
      this.mouseRotation.reset(); this.axisMoved = false; return;
    }
    const delta: number = this.mouseRotation.move(event.getVerticalAxisValue(), event.scrollStep ?? 1);
    if (delta !== 0 && this.params.state.optionsOpen === true) this.params.onCloseOptions();
    if (this.wheelTools.length === 0) return;
    if (delta !== 0) { if (!this.axisMoved) this.axisStartPosition = this.arcPosition; this.axisMoved = true; this.arcPosition += delta; this.publish(); }
    if (event.action === AxisAction.END && this.axisMoved) { this.axisMoved = false; this.settleRotation(); }
  }
  private rotateStart(event: GestureEvent): void {
    this.mouseRotation.reset();
    if (this.wheelTools.length === 0) return;
    const finger: FingerInfo | undefined = event.fingerList[0];
    if (finger === undefined) return;
    if (this.params.state.optionsOpen === true) this.params.onCloseOptions();
    this.startX = finger.globalX - this.originX - event.offsetX;
    this.startY = finger.globalY - this.originY - event.offsetY;
    this.rotating = true; this.pressedId = ''; this.suppressToolClick = true;
    this.rotationPosition = this.arcPosition;
    this.rotation.begin(this.startX, this.startY, this.frameRadius(), this.side === 'right', noteWheelAngleStep(this.radius(), this.wheelTools.length));
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
    this.rotating = false; this.pressedId = '';
    if (this.wheelTools.length === 0) return;
    this.getUIContext().animateTo(motionAnimation(currentMotionProfile().wheelSnapMs),
      (): void => { this.arcPosition = Math.round(this.arcPosition - this.alignmentOffset()) + this.alignmentOffset(); });
    this.publish();
  }
  private restoreRotation(position: number): void {
    this.rotating = false; this.pressedId = '';
    this.getUIContext().animateTo(motionAnimation(currentMotionProfile().wheelSnapMs), (): void => { this.arcPosition = position; });
    this.publish();
  }
  private cancelManipulation(): void {
    if (this.rotating) this.restoreRotation(this.rotationPosition);
    if (this.moving) this.finishMove(true);
    this.pressedId = ''; this.touchIds.clear(); this.grip.setTouching(false);
  }
  private finishMove(cancelled: boolean): void {
    if (!this.moving) return;
    this.moving = false; this.edgeContact = false;
    const target: number = cancelled ? this.dragY : noteWheelY(this.centerY, this.usableHeight(), this.radius(), false);
    this.getUIContext().animateTo(motionAnimation(currentMotionProfile().wheelSnapMs), (): void => { this.centerY = target; });
  }
  private handleTouch(event: TouchEvent): void {
    if (event.type === TouchType.Down) this.suppressHandleClick = false;
    this.touch(event);
  }
  private moveSide(side: StudyToolbarSide): void {
    this.cancelManipulation();
    this.getUIContext().animateTo(motionAnimation(currentMotionProfile().wheelMoveMs), (): void => { this.side = side; });
    this.publish();
  }
  private switchSide(): void {
    this.suppressHandleClick = true;
    const side: StudyToolbarSide = this.side === 'left' ? 'right' : 'left';
    this.grip.restoreSide(side); this.moveSide(side);
  }
  private touch(event: TouchEvent): void {
    if (event.type === TouchType.Cancel || event.touches.length > 1) this.cancelManipulation();
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
      .position({ x: this.side === 'right' ? this.frameRadius() - this.trackRadius(common) : -this.trackRadius(common),
        y: this.frameRadius() - this.trackRadius(common) }).hitTestBehavior(HitTestMode.None)
  }

  private selectFormatOption(id: string): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.collapsed || this.rotating ||
      this.suppressToolClick || this.params.state.optionsOpen !== true) return;
    if (noteEditorFormatOptions(this.params.state.optionToolId ?? '').some((option: NoteEditorFormatOption): boolean => option.id === id)) {
      this.params.onOptionSelect(id);
    }
  }
  private optionTitle(option: NoteEditorFormatOption, short: boolean = false, _locale: string = this.uiLanguage): string {
    return namedResourceText(this.getUIContext(), option.titleKey + (short ? '_short' : ''));
  }
  private optionPosition(index: number): NoteWheelOptionPosition {
    const toolIndex: number = this.wheelTools.findIndex((tool: NoteEditorWheelTool): boolean => tool.id === this.params.state.optionToolId);
    return noteWheelOptionArcPosition(index, noteEditorFormatOptions(this.params.state.optionToolId ?? '').length,
      this.radius(), this.y(), this.distance(Math.max(0, toolIndex)) * noteWheelAngleStep(this.radius(), this.wheelTools.length),
      this.viewportWidth, this.usableHeight(), this.side === 'right');
  }

  @Builder
  private optionArc() {
    ForEach(noteEditorFormatOptions(this.params.state.optionToolId ?? ''), (option: NoteEditorFormatOption, index: number) => {
      Button() {
        Text(this.optionTitle(option, true))
          .fontSize((this.params.state.optionToolId === 'heading' ? 19 - index * 2 : 11 + index) * this.optionPosition(index).size / 42)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.params.state.optionId === option.id ? '#FFFFFF' : this.accent)
          .textAlign(TextAlign.Center).maxLines(2)
      }.width(this.optionPosition(index).size).height(this.optionPosition(index).size).padding(0).type(ButtonType.Circle)
        .backgroundColor(this.params.state.optionId === option.id ? this.accent : $r('app.color.surface_sidebar'))
        .border({ width: 1, color: this.params.state.optionId === option.id ? this.accent : SurfaceBorder.color() })
        .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
        .hitTestBehavior(HitTestMode.BLOCK_HIERARCHY)
        .position({ x: this.optionPosition(index).x - this.optionPosition(index).size / 2,
          y: this.optionPosition(index).y - this.optionPosition(index).size / 2 })
        .accessibilityText(this.optionTitle(option))
        .accessibilityDescription(this.params.state.optionId === option.id ? $r('app.string.note_editor_format_on') :
          $r('app.string.note_editor_wheel_select'))
        .onTouch((event: TouchEvent): void => { this.toolTouch('format_option_' + option.id, event); })
        .onClick((): void => { this.selectFormatOption(option.id); })
    }, (option: NoteEditorFormatOption): string => (this.params.state.optionToolId ?? '') + '_' + option.id)
  }

  @Builder
  private toolButton(tool: NoteEditorWheelTool, index: number, common: boolean) {
    Button() {
      Stack() {
        Circle().width(this.circleSize(common)).height(this.circleSize(common)).fill(this.current(tool) ?
          this.accent : $r('app.color.surface_sidebar'))
          .stroke(this.pressedId === tool.id ? this.accent : Color.Transparent).strokeWidth(2)
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
      .onTouch((event: TouchEvent): void => { this.toolTouch(tool.id, event); })
      .onClick((): void => { this.clickTool(tool.id); })
      .gesture(LongPressGesture().onAction((): void => { this.longPressTool(tool.id); }))
  }

  @Builder
  private handle() {
    Button() {
      DisclosureChevron({ tint: this.accent })
        .rotate({ angle: noteWheelHandleAngle(this.openProgress, this.side === 'right') })
    }.width(28).height(48).padding(0).type(ButtonType.Normal)
      .backgroundColor($r('app.color.surface_sidebar'))
      .border({ width: 1, color: this.moving || this.edgeContact ? this.accent : SurfaceBorder.color() })
      .borderRadius(12)
      .scale({ x: this.moving ? 1.04 : 1, y: this.moving ? 1.04 : 1 })
      .animation(motionAnimation(currentMotionProfile().statusMs))
      .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
      .accessibilityText(this.collapsed ? $r('app.string.note_editor_wheel_open') : $r('app.string.note_editor_wheel_close'))
      .accessibilityDescription($r('app.string.note_editor_wheel_move_hint'))
      .onClick((): void => { this.toggleOpen(); })
      .gesture(GestureGroup(GestureMode.Exclusive,
        LongPressGesture().onAction((): void => { this.switchSide(); }),
        PanGesture({ direction: PanDirection.Vertical, distance: 6 })
          .onActionStart((): void => { this.dragY = this.y(); this.moving = true; this.suppressHandleClick = true; })
          .onActionUpdate((event: GestureEvent): void => {
            const desired: number = this.dragY + event.offsetY;
            this.centerY = noteWheelY(desired, this.usableHeight(), this.frameRadius(), false);
            this.edgeContact = Math.abs(this.centerY - desired) > 0.5;
          }).onActionEnd((): void => { this.finishMove(false); })
          .onActionCancel((): void => { this.finishMove(true); })))
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.viewportWidth >= 160 && this.usableHeight() >= 176 && this.foreground) {
        Stack({ alignContent: Alignment.TopStart }) {
          Column().width(this.frameRadius()).height(this.frameRadius() * 2)
            .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options())
            .borderRadius(this.side === 'left' ? { topRight: this.frameRadius(), bottomRight: this.frameRadius() } :
              { topLeft: this.frameRadius(), bottomLeft: this.frameRadius() })
            .shadow({ radius: 12, color: '#24000000', offsetX: this.side === 'left' ? 2 : -2, offsetY: 2 })
            .hitTestBehavior(HitTestMode.None)
          if (this.wheelTools.length > 0) { this.track(false) }
          ForEach(this.wheelTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, false)
          }, (tool: NoteEditorWheelTool): string => tool.id)
          ForEach(this.commonTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, true)
          }, (tool: NoteEditorWheelTool): string => tool.id)
        }.width(this.frameRadius()).height(this.frameRadius() * 2).clip(true)
          .position({ x: this.side === 'left' ? 0 : this.viewportWidth - this.frameRadius(), y: this.y() - this.frameRadius() })
          .translate({ x: (this.side === 'left' ? -1 : 1) * (this.frameRadius() + 12) * (1 - this.openProgress) })
          .opacity(this.openProgress)
          .hitTestBehavior(this.collapsed || !this.params.visible ? HitTestMode.None : HitTestMode.BLOCK_HIERARCHY)
          .onTouch((event: TouchEvent): void => { this.touch(event); })
          .onAxisEvent((event: AxisEvent): void => { this.axisWheel(event); })
          .gesture(PanGesture({ distance: 3 }).onActionStart((event: GestureEvent): void => { this.rotateStart(event); })
            .onActionUpdate((event: GestureEvent): void => { this.rotateWheel(event); })
            .onActionEnd((): void => { this.settleRotation(); }).onActionCancel((): void => { if (this.rotating) this.restoreRotation(this.rotationPosition); }))
          .onAreaChange((_old: Area, area: Area): void => {
            this.originX = Number(area.globalPosition.x); this.originY = Number(area.globalPosition.y);
          })
        Row() {
          this.handle()
        }.alignItems(VerticalAlign.Center)
          .position({ x: this.side === 'left' ? 0 : this.viewportWidth - 28, y: this.y() - 24 })
          .opacity(this.params.visible ? 1 : this.openProgress)
          .hitTestBehavior(this.params.visible ? HitTestMode.BLOCK_HIERARCHY : HitTestMode.None)
          .onTouch((event: TouchEvent): void => { this.handleTouch(event); })
        if (this.params.visible && !this.collapsed && this.params.state.optionsOpen === true) { this.optionArc() }
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
