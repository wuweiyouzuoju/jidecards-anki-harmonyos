// SPDX-License-Identifier: AGPL-3.0-or-later
import { LengthMetrics } from '@kit.ArkUI';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { FormSelectRow } from '../common/FormSelectRow';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { IconActionButton } from '../common/IconActionButton';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { namedResourceText } from '../../utils/UiFeedback';
import { defaultStudyControls } from '../../model/StudyControls';
import type { StudyControls } from '../../model/StudyControls';
import { SIMPLE_MODE_KEY } from '../../model/AppLayoutState';
import { STUDY_GESTURE_INPUTS, STUDY_GESTURE_ACTIONS, STUDY_GESTURE_FIELDS,
  studyGestureInputs, defaultStudyGestureConfig } from '../../model/StudyGestureConfig';
import type { StudyGestureInput, StudyGestureBinding, StudyGestureConfig } from '../../model/StudyGestureConfig';
import type { StudyKeySide, StudyKeyboardAction } from '../../model/StudyKeyboard';
import { readStudyControls, saveStudyControls } from '../../backend/StudyControlsService';
import { appInterface } from '../../backend/AppInterfaceService';
import type { AppInterfaceControl } from '../../model/AppInterface';

/** 实验版完整草稿；与键盘/JIDE 共用保存队列、校验及陈旧快照保护。 */
@CustomDialog
export struct StudyGestureSettings {
  controller?: CustomDialogController;
  onClose: () => void = (): void => {};
  onBusyChange: (busy: boolean) => void = (_busy: boolean): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(SIMPLE_MODE_KEY) @Watch('modeChanged') private simple: boolean = true;
  @State @Watch('publishInterface') private gesturesEnabled: boolean = false;
  @State @Watch('publishInterface') private tapLayout: string = 'four';
  @State @Watch('publishInterface') private bindings: StudyGestureBinding[] = [];
  @State @Watch('publishInterface') private inputIndex: number = 0;
  @State @Watch('publishInterface') private commandIndex: number = 0;
  @State @Watch('publishInterface') private sideIndex: number = 0;
  @State @Watch('busyChanged') private busy: boolean = false;
  @State @Watch('publishInterface') private loaded: boolean = false;
  @State private errorKey: string = '';
  private before: StudyControls = defaultStudyControls();
  private alive: boolean = false;
  private generation: number = 0;
  private interactive(): boolean { return this.loaded && !this.busy && !this.simple; }
  private busyChanged(): void { this.onBusyChange(this.busy); this.publishInterface(); }
  private modeChanged(): void {
    this.publishInterface();
    if (this.alive && this.simple && !this.busy) this.onClose();
  }
  aboutToAppear(): void { this.alive = true; this.reload(); }
  aboutToDisappear(): void { this.alive = false; this.generation++; appInterface.leave('study_gestures'); }
  private async reload(): Promise<void> {
    if (this.busy || this.simple) return;
    const generation: number = ++this.generation;
    this.busy = true; this.loaded = false; this.errorKey = '';
    try {
      const controls: StudyControls = await readStudyControls();
      if (!this.alive || generation !== this.generation) return;
      this.before = controls;
      const config: StudyGestureConfig = controls.gestureConfig ?? defaultStudyGestureConfig();
      this.gesturesEnabled = config.enabled; this.tapLayout = config.tapLayout; this.bindings = config.bindings;
      this.inputIndex = 0; this.loaded = true;
    } catch (error) {
      if (this.alive && generation === this.generation) this.errorKey = 'study_keyboard_load_failed';
    } finally { if (this.alive && generation === this.generation) this.busy = false; }
  }
  private inputs(): StudyGestureInput[] { return studyGestureInputs(this.tapLayout); }
  private side(): StudyKeySide { return (['both', 'question', 'answer'] as StudyKeySide[])[this.sideIndex]; }
  private sideLabel(side: string): string { return namedResourceText(this.getUIContext(), 'study_keyboard_' + side); }
  private inputLabel(input: string): string {
    const item: StudyGestureInput | undefined = STUDY_GESTURE_INPUTS.find((item: StudyGestureInput): boolean => item.id === input);
    return item === undefined ? input : namedResourceText(this.getUIContext(), item.titleKey);
  }
  private commandLabel(command: string): string {
    const item: StudyKeyboardAction | undefined = STUDY_GESTURE_ACTIONS.find((item: StudyKeyboardAction): boolean => item.id === command);
    return item === undefined ? command : namedResourceText(this.getUIContext(), item.titleKey);
  }
  private inputOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return this.inputs().map((item: StudyGestureInput): SelectOption => ({ value: this.inputLabel(item.id) }));
  }
  private commandOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return STUDY_GESTURE_ACTIONS.map((item: StudyKeyboardAction): SelectOption => ({ value: this.commandLabel(item.id) }));
  }
  private sideOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return ['both', 'question', 'answer'].map((side: string): SelectOption => ({ value: this.sideLabel(side) }));
  }
  private layoutOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return ['four', 'nine'].map((layout: string): SelectOption => ({ value: namedResourceText(this.getUIContext(), 'study_gesture_' + layout) }));
  }
  private setLayout(index: number): void {
    if (!this.interactive() || (index !== 0 && index !== 1)) return;
    this.inputIndex = 0; this.tapLayout = index === 0 ? 'four' : 'nine';
  }
  private visibleBindings(): StudyGestureBinding[] {
    const inputs: string[] = this.inputs().map((input: StudyGestureInput): string => input.id);
    return this.bindings.filter((binding: StudyGestureBinding): boolean => inputs.includes(binding.input));
  }
  private add(): void {
    if (!this.interactive()) return;
    const input: StudyGestureInput | undefined = this.inputs()[this.inputIndex];
    const command: StudyKeyboardAction | undefined = STUDY_GESTURE_ACTIONS[this.commandIndex];
    if (input === undefined || command === undefined || !['both', 'question', 'answer'].includes(this.side())) return;
    const binding: StudyGestureBinding = { input: input.id, command: command.id, side: this.side() };
    this.bindings = this.bindings.filter((item: StudyGestureBinding): boolean => item.input !== binding.input ||
      (item.side !== binding.side && item.side !== 'both' && binding.side !== 'both')).concat([binding]);
    this.errorKey = '';
  }
  private remove(binding: StudyGestureBinding): void {
    if (!this.interactive()) return;
    this.bindings = this.bindings.filter((item: StudyGestureBinding): boolean => item.input !== binding.input || item.side !== binding.side);
  }
  private reset(): void {
    if (!this.interactive()) return;
    const config: StudyGestureConfig = defaultStudyGestureConfig();
    this.gesturesEnabled = config.enabled; this.inputIndex = 0; this.tapLayout = config.tapLayout; this.bindings = config.bindings; this.errorKey = '';
  }
  private async save(): Promise<void> {
    if (!this.interactive()) return;
    const next: StudyControls = { keepScreenOn: this.before.keepScreenOn, gestureMode: this.before.gestureMode,
      keys: this.before.keys, gestures: this.before.gestures,
      gestureConfig: { version: 1, enabled: this.gesturesEnabled, tapLayout: this.tapLayout, bindings: this.bindings } };
    if (this.before.keyboard !== undefined) next.keyboard = this.before.keyboard;
    this.busy = true; this.errorKey = '';
    try { await saveStudyControls(next, this.before); if (this.alive) this.onClose(); }
    catch (error) { if (this.alive) this.errorKey = 'study_keyboard_save_failed'; }
    finally { if (this.alive) this.busy = false; }
  }
  private publishInterface(): void {
    if (!this.alive) return;
    if (this.simple) { appInterface.leave('study_gestures'); return; }
    const items: AppInterfaceControl[] = STUDY_GESTURE_FIELDS.map((item: StudyGestureInput): AppInterfaceControl => ({ id: item.id,
      title: '', titleKey: item.titleKey, enabled: !this.busy && (this.loaded || item.id === 'reload' || item.id === 'close'), selected: false }));
    this.visibleBindings().forEach((binding: StudyGestureBinding): void => {
      items.push({ id: 'binding-' + binding.input + '-' + binding.side, title: this.inputLabel(binding.input) + ' · ' +
        this.sideLabel(binding.side) + ' → ' + this.commandLabel(binding.command), titleKey: 'study_keyboard_remove', enabled: this.interactive(), selected: false });
    });
    appInterface.observe({ surface: 'study_gestures', sectionId: 'scheduler', selectedId: this.inputs()[this.inputIndex].id,
      optionIds: this.inputs().map((item: StudyGestureInput): string => item.id),
      optionLabels: this.inputs().map((item: StudyGestureInput): string => this.inputLabel(item.id)),
      busy: this.busy, controlsComplete: true, items: items,
      values: [{ id: 'enabled', value: String(this.gesturesEnabled) }, { id: 'tapLayout', value: this.tapLayout },
        { id: 'bindings', value: JSON.stringify(this.bindings) }, { id: 'side', value: this.side() },
        { id: 'command', value: STUDY_GESTURE_ACTIONS[this.commandIndex].id }] });
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.study_gesture_title'), actionLabel: $r('app.string.browser_detail_save'),
      actionEnabled: this.interactive(), closeEnabled: !this.busy,
      onClose: (): void => { if (!this.busy) this.onClose(); }, onAction: (): void => { this.save(); } })
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.study_gesture_help')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      SettingsToggleRow({ title: $r('app.string.study_gesture_enabled'), isOn: this.gesturesEnabled, isInteractive: this.interactive(),
        onChange: (value: boolean): void => { if (this.interactive()) this.gesturesEnabled = value; } })
      FormSelectRow({ label: $r('app.string.study_gesture_layout'), options: this.layoutOptions(),
        selectedIndex: this.tapLayout === 'nine' ? 1 : 0, value: namedResourceText(this.getUIContext(), 'study_gesture_' + this.tapLayout),
        isInteractive: this.interactive(), onSelect: (index: number): void => { this.setLayout(index); } })
      FormSelectRow({ label: $r('app.string.study_gesture_input'), options: this.inputOptions(), selectedIndex: this.inputIndex,
        value: this.inputLabel(this.inputs()[this.inputIndex].id), isInteractive: this.interactive(), onSelect: (index: number): void => { this.inputIndex = index; } })
      FormSelectRow({ label: $r('app.string.study_keyboard_side'), options: this.sideOptions(), selectedIndex: this.sideIndex,
        value: this.sideLabel(this.side()), isInteractive: this.interactive(), onSelect: (index: number): void => { this.sideIndex = index; } })
      FormSelectRow({ label: $r('app.string.study_keyboard_command'), options: this.commandOptions(), selectedIndex: this.commandIndex,
        value: this.commandLabel(STUDY_GESTURE_ACTIONS[this.commandIndex].id), isInteractive: this.interactive(),
        onSelect: (index: number): void => { this.commandIndex = index; } })
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        按下态按钮({ 文案: $r('app.string.study_gesture_add'), 是否启用: this.interactive(), 点击回调: (): void => { this.add(); } })
        按下态按钮({ 文案: $r('app.string.study_keyboard_reset'), 是否启用: this.interactive(), 点击回调: (): void => { this.reset(); } })
        按下态按钮({ 文案: $r('app.string.study_keyboard_reload'), 是否启用: !this.busy && !this.simple, 点击回调: (): void => { this.reload(); } })
      }
      if (this.errorKey !== '') {
        Text(namedResourceText(this.getUIContext(), this.errorKey)).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      }
      ForEach(this.visibleBindings(), (binding: StudyGestureBinding) => {
        Row({ space: 应用尺寸.间距_8 }) {
          Column({ space: 应用尺寸.间距_4 }) {
            Text(this.inputLabel(binding.input) + ' · ' + this.sideLabel(binding.side)).fontSize(应用尺寸.字号_按钮)
              .fontColor($r('app.color.text_primary')).width('100%')
            Text(this.commandLabel(binding.command)).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          }.layoutWeight(1)
          IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_delete'), label: $r('app.string.study_keyboard_remove'),
            isInteractive: this.interactive(), onAction: (): void => { this.remove(binding); } })
        }.width('100%')
      }, (binding: StudyGestureBinding): string => binding.input + ':' + binding.side)
    }.width('100%')
  }
  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy, header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { if (!this.busy) this.onClose(); } })
  }
}
