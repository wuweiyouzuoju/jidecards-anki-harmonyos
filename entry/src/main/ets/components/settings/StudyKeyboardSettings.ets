// SPDX-License-Identifier: AGPL-3.0-or-later
import { LengthMetrics } from '@kit.ArkUI';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { FormSelectRow } from '../common/FormSelectRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { IconActionButton } from '../common/IconActionButton';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { namedResourceText, resourceText } from '../../utils/UiFeedback';
import { studyEventChord, studyKeyName } from '../../utils/StudyKeyAdapter';
import { defaultStudyControls, effectiveStudyKeyboard } from '../../model/StudyControls';
import type { StudyControls } from '../../model/StudyControls';
import { STUDY_KEYBOARD_ACTIONS, STUDY_KEYBOARD_FIELDS, defaultStudyKeyboard, normalizeStudyChord,
  studyChordLabel, studyBindingConflict } from '../../model/StudyKeyboard';
import type { StudyKeyBinding, StudyKeySide, StudyKeyboardAction } from '../../model/StudyKeyboard';
import { readStudyControls, saveStudyControls } from '../../backend/StudyControlsService';
import { appInterface } from '../../backend/AppInterfaceService';
import type { AppInterfaceControl } from '../../model/AppInterface';

/** 完整绑定草稿；保存与 JIDE 共用校验和陈旧配置保护，不直接写 AppStorage。 */
@CustomDialog
export struct StudyKeyboardSettings {
  controller?: CustomDialogController;
  onClose: () => void = (): void => {};
  onBusyChange: (busy: boolean) => void = (_busy: boolean): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @State @Watch('publishInterface') private bindings: StudyKeyBinding[] = [];
  @State @Watch('publishInterface') private commandIndex: number = 0;
  @State @Watch('publishInterface') private sideIndex: number = 0;
  @State @Watch('publishInterface') private keyText: string = '';
  @State @Watch('publishInterface') private capturing: boolean = false;
  @State @Watch('busyChanged') private busy: boolean = false;
  @State @Watch('publishInterface') private loaded: boolean = false;
  @State private errorKey: string = '';
  private before: StudyControls = defaultStudyControls();
  private alive: boolean = false;
  private generation: number = 0;
  private captureId: string = '';
  private busyChanged(): void { this.onBusyChange(this.busy); this.publishInterface(); }

  aboutToAppear(): void {
    this.alive = true; this.captureId = 'study-keyboard-capture-' + this.getUniqueId();
    this.reload();
  }
  aboutToDisappear(): void {
    this.alive = false; this.generation++; appInterface.leave('study_keyboard');
  }
  private async reload(): Promise<void> {
    if (this.busy) return;
    const generation: number = ++this.generation;
    this.busy = true; this.loaded = false; this.errorKey = '';
    try {
      const controls: StudyControls = await readStudyControls();
      if (!this.alive || generation !== this.generation) return;
      this.before = controls; this.bindings = effectiveStudyKeyboard(controls).bindings; this.loaded = true;
    } catch (error) {
      if (this.alive && generation === this.generation) this.errorKey = 'study_keyboard_load_failed';
    } finally { if (this.alive && generation === this.generation) this.busy = false; }
  }
  private side(): StudyKeySide { return (['both', 'question', 'answer'] as StudyKeySide[])[this.sideIndex]; }
  private sideLabel(side: string): string { return namedResourceText(this.getUIContext(), 'study_keyboard_' + side); }
  private commandLabel(command: string): string {
    const action: StudyKeyboardAction | undefined = STUDY_KEYBOARD_ACTIONS.find((item: StudyKeyboardAction): boolean => item.id === command);
    return action === undefined ? command : namedResourceText(this.getUIContext(), action.titleKey);
  }
  private commandOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return STUDY_KEYBOARD_ACTIONS.map((item: StudyKeyboardAction): SelectOption => ({ value: this.commandLabel(item.id) }));
  }
  private sideOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return ['both', 'question', 'answer'].map((side: string): SelectOption => ({ value: this.sideLabel(side) }));
  }
  private add(): void {
    if (this.busy || !this.loaded) return;
    try {
      const binding: StudyKeyBinding = { key: normalizeStudyChord(this.keyText),
        command: STUDY_KEYBOARD_ACTIONS[this.commandIndex].id, side: this.side() };
      if (studyBindingConflict(this.bindings, binding)) { this.errorKey = 'study_keyboard_conflict'; return; }
      if (this.bindings.length >= 256) { this.errorKey = 'study_keyboard_limit'; return; }
      this.bindings = this.bindings.concat([binding]); this.keyText = ''; this.errorKey = ''; this.capturing = false;
    } catch (error) { this.errorKey = 'study_keyboard_invalid'; }
  }
  private remove(index: number): void {
    if (this.busy || !this.loaded) return;
    this.bindings = this.bindings.filter((_item: StudyKeyBinding, position: number): boolean => position !== index);
    this.errorKey = '';
  }
  private reset(): void {
    if (this.busy || !this.loaded) return;
    this.bindings = defaultStudyKeyboard().bindings; this.errorKey = ''; this.capturing = false;
  }
  private record(): void {
    if (this.busy || !this.loaded) return;
    this.capturing = !this.capturing;
    if (this.capturing) {
      try { this.getUIContext().getFocusController().requestFocus(this.captureId); }
      catch (error) { this.capturing = false; this.errorKey = 'study_keyboard_record_failed'; }
    }
  }
  private capture(event: KeyEvent): boolean {
    if (!this.capturing || studyKeyName(event.keyCode) === 'back') return false;
    if (event.type !== KeyType.Down) return true;
    const chord: string = studyEventChord(event);
    if (chord !== '') { this.keyText = chord; this.capturing = false; this.errorKey = ''; }
    return true;
  }
  private async save(): Promise<void> {
    if (this.busy || !this.loaded) return;
    const next: StudyControls = { keepScreenOn: this.before.keepScreenOn, gestureMode: this.before.gestureMode,
      keys: [], gestures: this.before.gestures, keyboard: { version: 1, bindings: this.bindings } };
    this.busy = true; this.errorKey = ''; this.capturing = false;
    try {
      await saveStudyControls(next, this.before);
      if (this.alive) this.onClose();
    } catch (error) {
      if (this.alive) this.errorKey = 'study_keyboard_save_failed';
    } finally { if (this.alive) this.busy = false; }
  }
  private publishInterface(): void {
    if (!this.alive) return;
    const items: AppInterfaceControl[] = STUDY_KEYBOARD_FIELDS.map((item): AppInterfaceControl => ({ id: item.id,
      title: '', titleKey: item.titleKey, enabled: !this.busy && (this.loaded || item.id === 'reload' || item.id === 'close'), selected: false }));
    this.bindings.forEach((binding: StudyKeyBinding, index: number): void => {
      items.push({ id: 'binding-' + index, title: studyChordLabel(binding.key) + ' · ' + this.sideLabel(binding.side) +
        ' → ' + this.commandLabel(binding.command), titleKey: 'study_keyboard_remove', enabled: this.loaded && !this.busy, selected: false });
    });
    appInterface.observe({ surface: 'study_keyboard', sectionId: 'scheduler', selectedId: STUDY_KEYBOARD_ACTIONS[this.commandIndex].id,
      optionIds: STUDY_KEYBOARD_ACTIONS.map((item: StudyKeyboardAction): string => item.id),
      optionLabels: STUDY_KEYBOARD_ACTIONS.map((item: StudyKeyboardAction): string => this.commandLabel(item.id)),
      busy: this.busy, controlsComplete: true, items: items,
      values: [{ id: 'bindings', value: JSON.stringify(this.bindings) }, { id: 'key', value: this.keyText },
        { id: 'side', value: this.side() }, { id: 'record', value: String(this.capturing) }] });
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.study_keyboard_title'), actionLabel: $r('app.string.browser_detail_save'),
      actionEnabled: this.loaded && !this.busy, closeEnabled: !this.busy,
      onClose: (): void => { if (!this.busy) this.onClose(); }, onAction: (): void => { this.save(); } })
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.study_keyboard_help')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      FormSelectRow({ label: $r('app.string.study_keyboard_command'), options: this.commandOptions(),
        selectedIndex: this.commandIndex, value: this.commandLabel(STUDY_KEYBOARD_ACTIONS[this.commandIndex].id),
        isInteractive: this.loaded && !this.busy, onSelect: (index: number): void => { this.commandIndex = index; } })
      FormSelectRow({ label: $r('app.string.study_keyboard_side'), options: this.sideOptions(),
        selectedIndex: this.sideIndex, value: this.sideLabel(this.side()), isInteractive: this.loaded && !this.busy,
        onSelect: (index: number): void => { this.sideIndex = index; } })
      TextInput({ text: this.keyText, placeholder: resourceText(this.getUIContext(), $r('app.string.study_keyboard_key_hint')) })
        .attributeModifier(new FormInputStyle()).enabled(this.loaded && !this.busy)
        .onChange((value: string): void => { this.keyText = value; })
      Row() {
        Text(this.capturing ? $r('app.string.study_keyboard_press_key') : $r('app.string.study_keyboard_record_hint'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      }.width('100%').focusable(true).id(this.captureId).onKeyPreIme((event: KeyEvent): boolean => this.capture(event))
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        按下态按钮({ 文案: this.capturing ? $r('app.string.study_keyboard_stop_record') : $r('app.string.study_keyboard_record'),
          是否启用: this.loaded && !this.busy, 点击回调: (): void => { this.record(); } })
        按下态按钮({ 文案: $r('app.string.study_keyboard_add'), 是否启用: this.loaded && !this.busy && this.keyText.trim() !== '',
          点击回调: (): void => { this.add(); } })
        按下态按钮({ 文案: $r('app.string.study_keyboard_reset'), 是否启用: this.loaded && !this.busy,
          点击回调: (): void => { this.reset(); } })
        按下态按钮({ 文案: $r('app.string.study_keyboard_reload'), 是否启用: !this.busy,
          点击回调: (): void => { this.reload(); } })
      }
      if (this.errorKey !== '') {
        Text(namedResourceText(this.getUIContext(), this.errorKey)).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text')).width('100%')
      }
      if (this.loaded && this.bindings.length === 0) {
        Text($r('app.string.study_keyboard_empty')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      }
      ForEach(this.bindings, (binding: StudyKeyBinding, index: number) => {
        Row({ space: 应用尺寸.间距_8 }) {
          Column({ space: 应用尺寸.间距_4 }) {
            Text(studyChordLabel(binding.key) + ' · ' + this.sideLabel(binding.side))
              .fontSize(应用尺寸.字号_按钮).fontColor($r('app.color.text_primary')).width('100%')
            Text(this.commandLabel(binding.command)).fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary')).width('100%')
          }.layoutWeight(1)
          IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_delete'), label: $r('app.string.study_keyboard_remove'),
            isInteractive: !this.busy, onAction: (): void => { this.remove(index); } })
        }.width('100%')
      }, (binding: StudyKeyBinding): string => binding.key + ':' + binding.side)
    }.width('100%')
  }
  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy, header: () => { this.header(); },
      content: () => { this.content(); }, onDismiss: (): void => { if (!this.busy) this.onClose(); } })
  }
}
