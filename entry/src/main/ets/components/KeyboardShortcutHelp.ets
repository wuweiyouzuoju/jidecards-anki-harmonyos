// SPDX-License-Identifier: AGPL-3.0-or-later
import { keyboardHelpSections, KeyboardHelpSection } from '../model/KeyboardShortcuts';
import { defaultStudyControls, STUDY_CONTROLS_KEY } from '../model/StudyControls';
import { readStudyControls } from '../backend/StudyControlsService';
import { StudyControls } from '../model/StudyControls';
import { 字段帮助面板 } from './字段帮助面板';
import { KeyboardShortcutList } from './KeyboardShortcutList';
import { appInterface } from '../backend/AppInterfaceService';
import { AppInterfaceControl, AppInterfaceValue } from '../model/AppInterface';
import { KeyCode } from '@kit.InputKit';
import { SettingsActionRow } from './common/SettingsActionRow';
import { localizedNamedResourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

@Component
export struct KeyboardShortcutHelp {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(STUDY_CONTROLS_KEY) @Watch('publishInterface') private controlsJson: string = JSON.stringify(defaultStudyControls());
  @State private expandedIds: string[] = [];
  @State private studyReady: boolean = false;
  @State private studyLoading: boolean = false;
  @State private studyFailed: boolean = false;
  private mounted: boolean = false;
  private generation: number = 0;
  onClose: () => void = (): void => {};
  aboutToAppear(): void { this.mounted = true; this.reloadStudyControls(); }
  aboutToDisappear(): void { this.mounted = false; this.generation++; this.studyLoading = false; appInterface.leave('keyboard_shortcuts'); }
  private async reloadStudyControls(): Promise<void> {
    if (!this.mounted || this.studyLoading) return;
    const generation: number = ++this.generation;
    const before: string = this.controlsJson;
    this.studyLoading = true; this.studyReady = false; this.studyFailed = false; this.publishInterface();
    try {
      const controls: StudyControls = await readStudyControls();
      if (!this.mounted || generation !== this.generation) return;
      if (this.controlsJson === before) this.controlsJson = JSON.stringify(controls);
      this.studyReady = true;
    } catch (_) {
      if (this.mounted && generation === this.generation) this.studyFailed = true;
    } finally {
      if (this.mounted && generation === this.generation) { this.studyLoading = false; this.publishInterface(); }
    }
  }
  private sections(): KeyboardHelpSection[] {
    return keyboardHelpSections(this.controlsJson).map((section: KeyboardHelpSection): KeyboardHelpSection =>
      ({ id: section.id, titleKey: section.titleKey, hintKey: section.hintKey,
        shortcuts: section.id === 'study' && !this.studyReady ? [] : section.shortcuts }));
  }
  private toggleSection(id: string): void {
    if (!this.mounted || !this.sections().some((section: KeyboardHelpSection): boolean => section.id === id)) return;
    this.expandedIds = this.expandedIds.includes(id) ? this.expandedIds.filter((item: string): boolean => item !== id) : this.expandedIds.concat([id]);
    this.publishInterface();
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    const sections: KeyboardHelpSection[] = this.sections();
    const items: AppInterfaceControl[] = sections.map((section: KeyboardHelpSection): AppInterfaceControl => ({
      id: section.id, title: '', titleKey: section.titleKey, enabled: true, selected: this.expandedIds.includes(section.id) }));
    if (this.studyFailed && this.expandedIds.includes('study')) {
      items.push({ id: 'retry', title: '', titleKey: 'common_retry', enabled: true, selected: false });
    }
    items.push({ id: 'close', title: '', titleKey: 'done', enabled: true, selected: false });
    const values: AppInterfaceValue[] = sections.map((section: KeyboardHelpSection): AppInterfaceValue =>
      ({ id: section.id + '_bindings', value: JSON.stringify(section.shortcuts) }));
    values.push({ id: 'study_bindings_status', value: this.studyLoading ? 'loading' : this.studyFailed ? 'failed' : 'ready' });
    appInterface.observe({ surface: 'keyboard_shortcuts', sectionId: 'help', selectedId: '',
      optionIds: sections.map((section: KeyboardHelpSection): string => section.id),
      optionLabels: sections.map((section: KeyboardHelpSection): string => localizedNamedResourceText(this.getUIContext(), this.uiLanguage, section.titleKey)),
      busy: this.studyLoading, controlsComplete: true, items: items, values: values });
  }
  @Builder
  private body() {
    Column({ space: 应用尺寸.间距_12 }) {
      ForEach(this.sections(), (section: KeyboardHelpSection): void => {
        SettingsActionRow({ title: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, section.titleKey),
          expanded: this.expandedIds.includes(section.id), onAction: (): void => { this.toggleSection(section.id); } })
        if (this.expandedIds.includes(section.id)) {
          if (section.id === 'study' && this.studyLoading) {
            Text($r('app.string.common_loading')).fontColor($r('app.color.text_secondary')).width('100%')
          } else if (section.id === 'study' && this.studyFailed) {
            Text($r('app.string.study_keyboard_load_failed')).fontColor($r('app.color.error_text')).width('100%')
            SettingsActionRow({ title: $r('app.string.common_retry'), onAction: (): void => { this.reloadStudyControls(); } })
          } else {
            KeyboardShortcutList({ shortcuts: section.shortcuts, hint: $r('app.string.' + section.hintKey) })
          }
        }
      }, (section: KeyboardHelpSection): string => section.id)
    }.width('100%')
  }
  build() {
    字段帮助面板({ 标题: $r('app.string.glossary_shortcuts_label'), 正文: $r('app.string.glossary_shortcuts_help'),
      内容: (): void => { this.body(); }, onClose: this.onClose })
      .onKeyPreIme((event: KeyEvent): boolean => {
        if (event.keyCode === KeyCode.KEYCODE_ESCAPE && event.type === KeyType.Down) { this.onClose(); return true; }
        return false;
      })
  }
}
