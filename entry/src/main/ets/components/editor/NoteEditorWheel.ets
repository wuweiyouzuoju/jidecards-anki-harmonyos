// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedSurface, SharedSurfaceBackground } from 'jide_foundation';
import { WHEEL_GRIP_KEY } from '../../model/EditorWheelPreferences';
import { compactLandscapeScale, isWideLandscapeWindow } from '../../model/AppLayoutState';
import { WINDOW_SIZE_KEY, WindowSizeVp, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY, remainingHorizontalInset } from '../../model/WindowSafeLayout';
import { ShapePaint } from '../common/ShapePaint';
import { ActionStatus } from '../common/ActionStatus';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';
import { ActionIcon } from '../common/ActionIcon';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { PressFeedback } from '../../utils/PressFeedback';
import { EditorWheelSurface } from '../../utils/EditorWheelSurface';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { curves, window } from '@kit.ArkUI';
import { showToastSafely, localizedResourceText, namedResourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { StudyGripSensor } from '../../backend/StudyGripSensor';
import { StudyGripSession } from '../../model/StudyGripSession';
import { StudyGripAvailability, StudyToolbarSide } from '../../model/StudyLayout';
import { NOTE_EDITOR_GRIP_AVAILABILITY_KEY, NoteEditorWheelState, NoteEditorWheelTool,
  compactActionGrid, compactActionPosition, noteEditorWheelTools, noteEditorWheelCommonTools, noteEditorWheelOuterTools, noteWheelToolHighlighted, noteWheelToolIsToggle,
  noteWheelIndex, noteWheelDistance, noteWheelAngleStep, noteWheelViewportHeight,
  noteWheelItemPosition, noteWheelTrackRadius, noteWheelLabel, noteWheelHandleAngle, NOTE_EDITOR_WHEEL_VISIBLE_COUNT,
  NoteWheelMouseRotation,
  noteWheelRadius, noteWheelY, NoteWheelRotation, noteWheelOptionArcPosition, NoteWheelOptionPosition } from '../../model/NoteEditorWheel';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteEditorWheelObservation, noteEditorFormatObservation } from '../../model/AppInterface';
import type { AppInterfaceObservation, AppInterfaceControl } from '../../model/AppInterface';
import { NOTE_EDITOR_ACTION_FLASH_MS, NOTE_FIELD_EDITING_SUPPORT, noteEditorTool, noteEditorFormatOptions, NoteEditorFormatOption } from '../../model/NoteFieldEditing';
export { NoteEditorFormatDialog } from './NoteEditorFormatDialog';

export class NoteEditorWheelParams {
  pageOpacity: number = 1;
  pageOffset: number = 0;
  customTools: NoteEditorWheelTool[] | undefined = undefined;
  fixedSide: StudyToolbarSide | undefined = undefined;
  observationSurface: string = '';
  observationTitleKey: string = 'home_interface_title';
  iconSource: ((id: string) => ResourceStr) | undefined = undefined;
  labelSource: ((id: string) => ResourceStr) | undefined = undefined;
  onActionArea: ((id: string, area: Area | undefined) => void) | undefined = undefined;
  initialCenterFraction: number = 0.6;
  initialCollapsed: boolean = false;
  onExpandedChange: ((expanded: boolean) => Promise<void>) | undefined = undefined;
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
    .visibility(params.pageOpacity <= 0 ? Visibility.Hidden : Visibility.Visible)
    .translate({ x: params.pageOffset })
}

/** 表单当前字段拥有默认展开浮层；浮层只负责选择、布局和单一握姿订阅。 */
@Component
export struct NoteEditorWheel {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp('theme_color_action_primary') private glassAccent: string = '';
  @StorageProp('surface_material') private wheelMaterial: string = 'flat';
  @StorageProp('themeMode') private wheelTheme: string = 'system';
  @StorageProp('systemDarkMode') private wheelSystemDark: boolean = false;
  private wheelDark(): boolean { return SeriesVisual.isDark(this.wheelTheme, this.wheelSystemDark); }
  private wheelBorder(): ResourceColor {
    return this.wheelMaterial === 'glass' ? (this.wheelDark() ? '#80AAB6C8' : '#CCFFFFFF') : SurfaceBorder.color();
  }
  private idleFill(): ResourceColor {
    return this.wheelMaterial === 'glass' ? (this.wheelDark() ? '#18000000' : '#20FFFFFF') : $r('app.color.surface_sidebar');
  }
  private toolAreas: Map<string, Area> = new Map<string, Area>();
  private longPressedTool: string = '';
  @StorageLink('page_action_center_fraction') @Watch('sharedPositionChanged') private sharedCenterFraction: number = 0.6;
  @State private pressedId: string = '';
  private expansionVersion: number = 0;
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
  @State private optionsVisible: boolean = false;

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
  private actionFlashTimer: number = -1;
  private actionFlashVersion: number = 0;
  private mouseRotation: NoteWheelMouseRotation = new NoteWheelMouseRotation();
  private axisMoved: boolean = false;
  private originX: number = 0;
  private originY: number = 0;
  private mounted: boolean = false;
  private initialized: boolean = false;
  private previousVisible: boolean = false;
  @StorageProp(WHEEL_GRIP_KEY) @Watch('activityChanged') private gripEnabled: boolean = true;
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

  aboutToAppear(): void {
    this.mounted = true;
    this.parametersChanged(); this.subscribeKeyboard();
  }
  aboutToDisappear(): void {
    this.cancelManipulation(); this.mounted = false; this.grip.dispose(); this.clearActionFlash();
    if (this.keyboardSubscribed) {
      try { this.hostWindow?.off('keyboardHeightChange', this.keyboardListener); } catch (_error) { /* 窗口已销毁。 */ }
    }
    this.keyboardSubscribed = false; this.hostWindow = null;
    this.detach();
  }
  private parametersChanged(): void {
    const initial: boolean = !this.initialized;
    const tools: NoteEditorWheelTool[] = this.params.customTools ?? noteEditorWheelOuterTools(this.params.state);
    this.commonTools = this.params.customTools === undefined ? noteEditorWheelCommonTools(this.params.state) : [];
    if (this.params.fixedSide !== undefined) this.side = this.params.fixedSide;
    if (!this.initialized) {
      this.initialized = true;
      this.collapsed = this.params.initialCollapsed === true;
      this.selectedId = this.params.initialTool;
    }
    if (!this.availableTools().some((tool: NoteEditorWheelTool): boolean => tool.id === this.selectedId)) this.selectedId = '';
    if (this.actionFlashTimer < 0 && !noteWheelToolIsToggle(this.selectedId, this.params.state.source)) this.selectedId = '';
    const selected: number = tools.findIndex((tool: NoteEditorWheelTool): boolean => tool.id === this.selectedId);
    const changed: boolean = tools.length !== this.wheelTools.length ||
      tools.some((tool: NoteEditorWheelTool, index: number): boolean => tool.id !== this.wheelTools[index]?.id);
    this.wheelTools = tools;
    if (changed) this.arcPosition = Math.max(0, selected) + this.alignmentOffset();
    this.activityChanged();
    this.syncFormatArc();
    // 字段和页面参数刷新不能覆盖正在播放的手动开合动画。
    if (initial || this.previousVisible !== this.params.visible) {
      this.openProgress = this.params.visible && !this.collapsed ? 1 : 0;
    }
    this.previousVisible = this.params.visible;
  }
  private syncFormatArc(): void {
    this.optionsVisible = this.params.state.optionsOpen === true && !this.collapsed && this.params.visible;
  }

  private activityChanged(): void {
    const active: boolean = this.mounted && this.foreground && this.params.visible;
    this.grip.setActive(active && this.gripEnabled && this.params.customTools === undefined && this.params.fixedSide === undefined);
    if (active) this.publish(); else { this.cancelManipulation(); this.clearActionFlash(); this.mouseRotation.reset(); this.axisMoved = false; this.detach(); }
  }
  private detach(): void {
    if (this.attached) appInterface.leave(this.params.observationSurface || 'note_editor_wheel', this.observationVersion);
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
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @State private viewportLeft: number = 0;
  @StorageProp(WINDOW_SIZE_KEY) private densityWindow: WindowSizeVp = { width: 0, height: 0 };
  private densityScale(): number {
    const width: number = this.densityWindow.width;
    const height: number = this.densityWindow.height;
    return isWideLandscapeWindow(width, height) ? Math.min(0.90, compactLandscapeScale(width, height)) : 1;
  }
  private leftInset(): number {
    return remainingHorizontalInset(this.safeLeft, this.viewportLeft);
  }
  private rightInset(): number {
    return remainingHorizontalInset(this.safeRight, this.densityWindow.width - this.viewportLeft - this.viewportWidth);
  }
  private usableWidth(): number {
    return Math.max(0, this.viewportWidth - this.leftInset() - this.rightInset());
  }
  private edgeX(width: number): number {
    return this.side === 'left' ? this.leftInset() : this.viewportWidth - this.rightInset() - width;
  }
  private radius(): number {
    const radius: number = noteWheelRadius(this.usableWidth(), this.usableHeight());
    return (this.wheelTools.length > 0 ? radius : Math.min(110, radius)) * this.densityScale();
  }
  private frameRadius(): number { return this.params.customTools !== undefined ? this.panelHeight() / 2 : this.radius(); }
  private panelWidth(): number { return this.params.customTools !== undefined ? compactActionGrid(this.availableTools().length, this.densityScale()).width : this.radius(); }
  private panelHeight(): number { return this.params.customTools !== undefined ? compactActionGrid(this.availableTools().length, this.densityScale()).height : this.radius() * 2; }
  private trackRadius(common: boolean): number {
    if (this.params.customTools !== undefined) return this.radius() - this.circleSize() / 2 - 4;
    return noteWheelTrackRadius(this.radius(), common, this.wheelTools.length > 0); }
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
  private iconVisible(index: number): boolean { if (this.params.customTools !== undefined) return true; return Math.abs(this.distance(index)) < NOTE_EDITOR_WHEEL_VISIBLE_COUNT / 2; }
  private iconOpacity(index: number): number { return Math.min(1, Math.max(0, (3.5 - Math.abs(this.distance(index))) * 2)); }
  private toolOpacity(index: number, common: boolean): number {
    return common || this.params.customTools !== undefined ? 1 : this.iconOpacity(index);
  }
  private itemHeight(common: boolean = false): number {
    return this.circleSize(common);
  }
  private itemWidth(common: boolean = false): number {
    return this.circleSize(common);
  }
  private contentScale(): number { if (this.params.customTools !== undefined) return this.densityScale(); return this.radius() / (this.wheelTools.length > 0 ? 158 : 110); }
  private labelWidth(common: boolean): number { return (this.params.customTools !== undefined ? (common ? 24 : 32) : common ? 25 : 27) * this.contentScale(); }
  private circleSize(common: boolean = false): number {
    if (this.params.customTools !== undefined) return compactActionGrid(this.availableTools().length, this.densityScale()).size;
    return (common ? 42 : 46) * this.contentScale();
  }
  private current(tool: NoteEditorWheelTool): boolean {
    if (this.params.customTools !== undefined) return tool.active || this.selectedId === tool.id;
    // ForEach 按 id 复用按钮，开启状态必须读取当前字段，不能留在旧条目闭包里。
    return tool.id === this.params.state.optionToolId && this.params.state.optionsOpen === true ||
      noteWheelToolHighlighted(tool.id, this.params.state.activeIds, this.selectedId, this.params.state.source);
  }
  private x(index: number, common: boolean = false): number {
    if (this.params.customTools !== undefined) return compactActionPosition(index, this.wheelTools.length, this.side === 'right', this.densityScale()).x;
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.params.customTools !== undefined ? 6 : this.wheelTools.length).x - this.itemWidth(common) / 2 +
      (this.side === 'right' ? this.frameRadius() - this.radius() : 0);
  }
  private iconY(index: number, common: boolean = false): number {
    if (this.params.customTools !== undefined) return compactActionPosition(index, this.wheelTools.length, this.side === 'right', this.densityScale()).y;
    return noteWheelItemPosition(this.distance(index, common), this.radius(), this.side === 'right', common,
      this.wheelTools.length > 0, this.params.customTools !== undefined ? 6 : this.wheelTools.length).y - this.circleSize(common) / 2 + this.frameRadius() - this.radius();
  }
  private availableTools(): NoteEditorWheelTool[] {
    return this.params.customTools === undefined ? noteEditorWheelTools(this.params.state) :
      this.params.customTools;
  }
  private publish(): void {
    if (this.params.customTools !== undefined) {
      if (!this.mounted || !this.foreground || !this.params.visible) return;
      this.observationVersion = appInterface.observe({ surface: this.params.observationSurface,
        titleKey: this.params.observationTitleKey, sectionId: this.side, selectedId: this.selectedId,
        optionIds: this.collapsed ? [] : this.availableTools().map((tool: NoteEditorWheelTool): string => tool.id),
        optionLabels: this.collapsed ? [] : this.availableTools().map((tool: NoteEditorWheelTool): string => this.title(tool)),
        busy: false, controlsComplete: true,
        items: this.collapsed ? [] : this.availableTools().map((tool: NoteEditorWheelTool): AppInterfaceControl => ({ id: tool.id,
          title: this.title(tool), titleKey: tool.titleKey === '' ? undefined : tool.titleKey, iconKey: tool.iconKey, enabled: tool.enabled !== false,
          selected: this.selectedId === tool.id })),
        values: [{ id: 'side', value: this.side }, { id: 'collapsed', value: String(this.collapsed) },
          { id: 'layout', value: 'compact_grid' }] });
      this.attached = true;
      return;
    }
    if (!this.mounted || !this.foreground || !this.params.visible || this.commonTools.length === 0) return;
    const observation: AppInterfaceObservation = noteEditorWheelObservation(this.params.state, this.selectedId, this.side,
      this.collapsed, this.gripEnabled ? this.gripAvailability : 'unchecked', this.selected()?.id ?? '');
    observation.values = (observation.values ?? []).concat([
      { id: 'grip_enabled', value: String(this.gripEnabled) }, { id: 'pressed_tool', value: this.pressedId }, { id: 'rotating', value: String(this.rotating) },
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
    const previous: boolean = this.collapsed;
    this.collapsed = !this.collapsed;
    if (this.params.onExpandedChange !== undefined) {
      const save = this.params.onExpandedChange;
      const expanded: boolean = !this.collapsed;
      const version: number = ++this.expansionVersion;
      Promise.resolve().then((): Promise<void> => save(expanded)).catch((): void => {
        if (!this.mounted || version !== this.expansionVersion) return;
        this.collapsed = previous; this.animateOpen(!this.collapsed); this.publish();
        showToastSafely(this.getUIContext(), { message: $r('app.string.settings_local_save_failed') });
      });
    }
    if (this.collapsed) this.params.onCloseOptions();
    if (!this.collapsed) { this.selectedId = ''; this.params.onResetFormats(); }
    const open: boolean = !this.collapsed;
    this.animateOpen(open);
    this.publish();
  }
  private select(index: number): void {
    if (!this.mounted || !this.foreground || !this.params.visible || this.collapsed) return;
    const tool: NoteEditorWheelTool | undefined = this.wheelTools[index];
    if (tool === undefined) return;
    this.mouseRotation.reset();
    this.execute(tool.id);
  }
  private execute(id: string, longPress: boolean = false): void {
    const available: boolean = this.availableTools()
      .some((tool: NoteEditorWheelTool): boolean => tool.id === id && tool.enabled !== false);
    if (available && this.mounted && this.foreground && this.params.visible && !this.collapsed) {
      if (longPress && (this.params.customTools !== undefined || noteEditorTool(id).longPressAction === undefined)) return;
      this.clearActionFlash(); this.selectedId = id;
      if (!noteWheelToolIsToggle(id, this.params.state.source)) {
        const version: number = this.actionFlashVersion;
        this.actionFlashTimer = setTimeout((): void => {
          if (version !== this.actionFlashVersion || !this.mounted) return;
          this.actionFlashTimer = -1; this.selectedId = ''; this.publish();
        }, NOTE_EDITOR_ACTION_FLASH_MS);
      }
      this.publish();
      if (longPress) this.params.onLongAction(id);
      else if (this.params.onActionArea !== undefined) this.params.onActionArea(id, this.toolAreas.get(id));
      else this.params.onAction(id);
    }
  }
  private toolTouch(id: string, event: TouchEvent): void {
    if (event.type === TouchType.Down) { this.longPressedTool = ''; this.suppressToolClick = false; this.pressedId = id; }
    if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressedId = '';
    if (event.type === TouchType.Cancel || event.touches.length > 1) { this.suppressToolClick = true; this.cancelManipulation(); }
  }
  private longPressTool(id: string): void {
    if (this.params.customTools !== undefined) {
      if (!this.mounted || !this.foreground || !this.params.visible || this.collapsed) return;
      const tool = this.availableTools().find((item: NoteEditorWheelTool): boolean => item.id === id);
      if (tool === undefined) return;
      this.longPressedTool = id;
      showToastSafely(this.getUIContext(), { message: this.title(tool), duration: 2000 });
      return;
    }
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
    if (this.params.customTools !== undefined) return;
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
    if (this.params.customTools !== undefined) return;
    this.mouseRotation.reset();
    if (this.wheelTools.length === 0) return;
    const finger: FingerInfo | undefined = event.fingerList[0];
    if (finger === undefined) return;
    if (this.params.state.optionsOpen === true) this.params.onCloseOptions();
    this.startX = finger.globalX - this.originX - event.offsetX;
    this.startY = finger.globalY - this.originY - event.offsetY;
    this.rotating = true; this.pressedId = ''; this.suppressToolClick = true;
    this.rotationPosition = this.arcPosition;
    this.rotation.begin(this.startX, this.startY, this.frameRadius(), this.side === 'right', noteWheelAngleStep(this.radius(), this.params.customTools !== undefined ? 6 : this.wheelTools.length));
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
  private sharesPagePosition(): boolean {
    return this.params.customTools !== undefined && this.params.fixedSide === 'left';
  }
  private sharedPositionChanged(): void {
    if (this.sharesPagePosition() && this.viewportHeight > 0 && !this.moving) {
      this.centerY = this.viewportHeight * this.sharedCenterFraction;
    }
  }
  private finishMove(cancelled: boolean): void {
    if (!this.moving) return;
    this.moving = false; this.edgeContact = false;
    const target: number = cancelled ? this.dragY : noteWheelY(this.centerY, this.usableHeight(), this.radius(), false);
    if (!cancelled && this.sharesPagePosition() && this.viewportHeight > 0) {
      this.sharedCenterFraction = target / this.viewportHeight;
    }
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
    if (this.params.fixedSide !== undefined) return;
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
    if (this.params.labelSource !== undefined) {
      const label: ResourceStr = this.params.labelSource(tool.id);
      return typeof label === 'string' ? label : localizedResourceText(this.getUIContext(), _locale, label);
    }
    return namedResourceText(this.getUIContext(), tool.titleKey);
  }

  @Builder
  private track(common: boolean) {
    Circle().width(this.trackRadius(common) * 2).height(this.trackRadius(common) * 2)
      .attributeModifier(new ShapePaint(Color.Transparent, SurfaceBorder.color())).strokeWidth(1)
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
    const point: NoteWheelOptionPosition = noteWheelOptionArcPosition(index, noteEditorFormatOptions(this.params.state.optionToolId ?? '').length,
      this.radius(), this.y(), this.distance(Math.max(0, toolIndex)) * noteWheelAngleStep(this.radius(), this.params.customTools !== undefined ? 6 : this.wheelTools.length),
      this.usableWidth(), this.usableHeight(), this.side === 'right');
    return { x: point.x + this.leftInset(), y: point.y, size: point.size };
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
        .backgroundColor(this.params.state.optionId === option.id ? this.accent : this.idleFill())
        .border({ width: 1,
          color: this.params.state.optionId === option.id ? this.accent : this.wheelBorder() })
        .enabled(this.params.state.optionsOpen === true)
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
        if (this.params.customTools !== undefined) {
          Rect().width(this.circleSize(common)).height(this.circleSize(common)).radius(6).fill(this.current(tool) ? this.accent : this.idleFill())
            .stroke(this.pressedId === tool.id ? this.accent : Color.Transparent).strokeWidth(2)
        } else {
        Circle().width(this.circleSize(common)).height(this.circleSize(common)).attributeModifier(new ShapePaint(this.current(tool) ? this.accent : this.idleFill(), this.pressedId === tool.id ? this.accent : Color.Transparent)).strokeWidth(2)
        }
        Column({ space: this.contentScale() }) {
          if (tool.feedback === 'busy' || tool.feedback === 'success' || tool.feedback === 'failure') {
            ActionStatus({ phase: tool.feedback, tint: this.accent, glyphSize: 20 * this.contentScale() })
          } else {
          ActionIcon({ source: this.params.iconSource?.(tool.id) ?? $r('app.media.' + tool.iconKey),
            glyphSize: (this.params.customTools !== undefined ? 20 : common ? 16 : 18) * this.contentScale(),
            strokeColor: this.current(tool) ? '#FFFFFF' : this.accent })
          }
          if (this.params.customTools === undefined) {
          Text(noteWheelLabel(this.title(tool), this.labelWidth(common), (this.params.customTools !== undefined ? (common ? 7 : 8) : common ? 8 : 9) * this.contentScale()))
            .fontSize((this.params.customTools !== undefined ? (common ? 7 : 8) : common ? 8 : 9) * this.contentScale()).maxLines(2).wordBreak(WordBreak.BREAK_ALL)
            .fontColor(this.current(tool) ? '#FFFFFF' : appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
            .fontWeight(this.current(tool) ? FontWeight.Medium : FontWeight.Normal)
            .textAlign(TextAlign.Center).width(this.labelWidth(common)).height((this.params.customTools !== undefined ? 20 : common ? 16 : 18) * this.contentScale())
          }
        }.alignItems(HorizontalAlign.Center).hitTestBehavior(HitTestMode.None)
        if (tool.badge === 'attention') {
          Text('!').fontSize(10).fontWeight(FontWeight.Bold).fontColor(Color.White)
            .backgroundColor($r('app.color.error_text')).width(12).height(12).textAlign(TextAlign.Center).borderRadius(6)
            .position({ x: this.circleSize(common) - 12, y: 0 }).hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
        } else if (tool.badge === 'pending') {
          Circle().width(6).height(6).attributeModifier(new ShapePaint($r('app.color.warning_text')))
            .position({ x: this.circleSize(common) - 6, y: 0 }).hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
        }
      }.width(this.itemWidth(common)).height(this.itemHeight(common)).hitTestBehavior(HitTestMode.None)
    }.width(this.itemWidth(common)).height(this.itemHeight(common)).padding(0).type(this.params.customTools !== undefined ? ButtonType.Normal : ButtonType.Circle).backgroundColor(Color.Transparent)
      .borderRadius(this.params.customTools !== undefined ? 6 : this.circleSize(common) / 2)
      .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
      .position({ x: this.x(index, common), y: this.iconY(index, common) }).opacity(this.toolOpacity(index, common) * (tool.enabled === false ? 0.4 : 1))
      .visibility(common || this.iconVisible(index) ? Visibility.Visible : Visibility.Hidden)
      .onAreaChange((_old: Area, area: Area): void => { this.toolAreas.set(tool.id, area); })
      .id((this.params.observationSurface || 'note_editor_wheel') + '-' + tool.id)
      .enabled(this.params.customTools !== undefined || tool.enabled !== false)
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
      .attributeModifier(new EditorWheelSurface(this.wheelMaterial, this.wheelDark(), $r('app.color.surface_sidebar'), this.glassAccent))
      .background(this.renderGlassBackground((new EditorWheelSurface(this.wheelMaterial, this.wheelDark(), $r('app.color.surface_sidebar'), this.glassAccent)).backgroundSurface(12)))
      .border({ width: 1, color: this.moving || this.edgeContact ? this.accent : this.wheelBorder() })
      .borderRadius(12)
      .scale({ x: this.moving ? 1.04 : 1, y: this.moving ? 1.04 : 1 })
      .animation(motionAnimation(currentMotionProfile().statusMs))
      .focusOnTouch(false).focusable(false).attributeModifier(new PressFeedback()).stateEffect(false)
      .accessibilityText(this.params.customTools !== undefined ? (this.collapsed ? $r('app.string.home_wheel_open') : $r('app.string.home_wheel_close')) :
        (this.collapsed ? $r('app.string.note_editor_wheel_open') : $r('app.string.note_editor_wheel_close')))
      .accessibilityDescription(this.params.customTools !== undefined ? $r('app.string.home_wheel_move_hint') : $r('app.string.note_editor_wheel_move_hint'))

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

  private contourArc(): string {
    const radius: number = this.getUIContext().vp2px(this.radius());
    const edge: number = this.side === 'left' ? 0 : radius;
    const sweep: number = this.side === 'left' ? 1 : 0;
    return 'M ' + edge + ' 0.5 A ' + (radius - 0.5) + ' ' + (radius - 0.5) +
      ' 0 0 ' + sweep + ' ' + edge + ' ' + (radius * 2 - 0.5);
  }

  private glassContourPath(): string {
    const radius: number = this.getUIContext().vp2px(this.radius());
    const edge: number = this.side === 'left' ? 0 : radius;
    const outer: number = this.side === 'left' ? radius : 0;
    const direction: number = this.side === 'left' ? 1 : -1;
    const control: number = radius * 0.5522847498;
    return 'M ' + edge + ' 0.5 C ' + (edge + direction * control) + ' 0.5 ' +
      outer + ' ' + (radius - control) + ' ' + outer + ' ' + radius +
      ' C ' + outer + ' ' + (radius + control) + ' ' + (edge + direction * control) +
      ' ' + (2 * radius - 0.5) + ' ' + edge + ' ' + (2 * radius - 0.5) + ' Z';
  }

  @Builder
  private renderGlassBackground(surface: SharedSurface) {
    SharedSurfaceBackground({ surface: surface })
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.viewportWidth >= 160 && this.usableHeight() >= 176 && this.foreground) {
        Stack({ alignContent: Alignment.TopStart }) {
          Column().width(this.panelWidth()).height(this.panelHeight())
            .attributeModifier(new EditorWheelSurface(this.wheelMaterial, this.wheelDark(), $r('app.color.surface_card'), this.glassAccent))
      .background(this.renderGlassBackground((new EditorWheelSurface(this.wheelMaterial, this.wheelDark(), $r('app.color.surface_card'), this.glassAccent)).backgroundSurface(this.params.customTools !== undefined ? 8 : this.frameRadius(), this.params.customTools !== undefined ? '' : this.glassContourPath())))
            .border(SurfaceBorder.options(this.params.customTools === undefined ? 0 : 1, this.wheelBorder(), this.appearanceElements))
            .borderRadius(this.params.customTools !== undefined ? 8 : (this.side === 'left' ? { topRight: this.frameRadius(), bottomRight: this.frameRadius() } :
              { topLeft: this.frameRadius(), bottomLeft: this.frameRadius() }))
            .hitTestBehavior(HitTestMode.None)
          if (this.params.customTools === undefined) {
            Path().commands(this.contourArc()).width(this.panelWidth()).height(this.panelHeight())
              .fill(Color.Transparent).stroke(this.wheelBorder()).strokeWidth(1)
              .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
            if (this.wheelTools.length > 0) { this.track(false) }
          }
          ForEach(this.wheelTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, false)
          }, (tool: NoteEditorWheelTool): string => this.params.customTools === undefined ? tool.id :
            JSON.stringify([tool.id, tool.active, tool.enabled, tool.feedback, tool.badge, tool.titleKey, tool.iconKey]))
          ForEach(this.commonTools, (tool: NoteEditorWheelTool, index: number) => {
            this.toolButton(tool, index, true)
          }, (tool: NoteEditorWheelTool): string => tool.id)
        }.width(this.panelWidth()).height(this.panelHeight()).clip(true)
          .position({ x: this.edgeX(this.panelWidth()), y: this.y() - this.panelHeight() / 2 })
          .translate({ x: (this.side === 'left' ? -1 : 1) * (this.panelWidth() + 12) * (1 - this.openProgress) })
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
          .position({ x: this.edgeX(28), y: this.y() - 24 })
          .opacity(this.params.visible ? 1 : this.openProgress)
          .hitTestBehavior(this.params.visible ? HitTestMode.BLOCK_HIERARCHY : HitTestMode.None)
          .onTouch((event: TouchEvent): void => { this.handleTouch(event); })
        if (this.params.visible && !this.collapsed && this.optionsVisible) { this.optionArc() }

      }
    }.width('100%').height('100%').focusable(false).hitTestBehavior(HitTestMode.Transparent)
      .onAreaChange((_old: Area, area: Area): void => {
        const previousHeight: number = this.viewportHeight;
        this.viewportWidth = Number(area.width); this.viewportHeight = Number(area.height);
        if (this.params.customTools !== undefined && previousHeight > 0 && this.centerY > 0) {
          this.centerY = this.centerY * this.viewportHeight / previousHeight;
        }
        this.overlayTop = Number(area.globalPosition.y);
        this.viewportLeft = Number(area.globalPosition.x);
        if (this.centerY === 0) {
          this.centerY = this.viewportHeight * (this.sharesPagePosition() ? this.sharedCenterFraction : (this.params.initialCenterFraction ?? 0.6));

        }
      })
  }
}
