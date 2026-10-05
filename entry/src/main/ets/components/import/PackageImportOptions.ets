// SPDX-License-Identifier: AGPL-3.0-or-later
import { ImportAnkiPackageOptions, ImportAnkiPackageUpdateCondition,
  DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS } from '../../proto/messages/ImportExportMessages';
import { ImportSelect } from './ImportSelect';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct PackageImportOptions {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('loadOptions') options: ImportAnkiPackageOptions = DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS;
  @Prop isInteractive: boolean = true;
  @Prop isDark: boolean = false;
  @State private scheduling: boolean = false;
  @State private configs: boolean = false;
  @State private merge: boolean = false;
  @State private notes: number = 0;
  @State private notetypes: number = 0;
  onChange: (options: ImportAnkiPackageOptions) => void = (_options: ImportAnkiPackageOptions): void => {};
  aboutToAppear(): void { this.loadOptions(); }
  private loadOptions(): void {
    this.scheduling = this.options.withScheduling; this.configs = this.options.withDeckConfigs;
    this.merge = this.options.mergeNotetypes; this.notes = this.options.updateNotes; this.notetypes = this.options.updateNotetypes;
  }
  private changed(): void {
    this.onChange({ withScheduling: this.scheduling, withDeckConfigs: this.configs,
      mergeNotetypes: this.merge, updateNotes: this.notes, updateNotetypes: this.notetypes });
  }
  private text(value: Resource, _locale: string = this.uiLanguage): string { return resourceText(this.getUIContext(), value); }
  private updateLabels(): string[] {
    return [this.text($r('app.string.transfer_update_newer')), this.text($r('app.string.transfer_update_always')),
      this.text($r('app.string.transfer_update_never'))];
  }
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      ImportSelect({ label: this.text($r('app.string.transfer_update_notes')), labels: this.updateLabels(),
        selectedIndex: this.notes, isInteractive: this.isInteractive,
        onSelect: (value: number): void => { this.notes = value; this.changed(); } })
      ImportSelect({ label: this.text($r('app.string.transfer_update_notetypes')), labels: this.updateLabels(),
        selectedIndex: this.notetypes, isInteractive: this.isInteractive,
        onSelect: (value: number): void => { this.notetypes = value; this.changed(); } })
      if (this.notes === ImportAnkiPackageUpdateCondition.ALWAYS || this.notetypes === ImportAnkiPackageUpdateCondition.ALWAYS) {
        Text($r('app.string.transfer_update_warning')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      }
      SettingsToggleRow({ title: $r('app.string.transfer_include_scheduling'), hint: $r('app.string.transfer_import_scheduling_hint'),
        isOn: this.scheduling, isInteractive: this.isInteractive, isDark: this.isDark,
        onChange: (value: boolean): void => { this.scheduling = value; this.changed(); } })
      SettingsToggleRow({ title: $r('app.string.transfer_include_deck_configs'), hint: $r('app.string.transfer_import_configs_hint'),
        isOn: this.configs, isInteractive: this.isInteractive, isDark: this.isDark,
        onChange: (value: boolean): void => { this.configs = value; this.changed(); } })
      SettingsToggleRow({ title: $r('app.string.transfer_merge_notetypes'), hint: $r('app.string.transfer_merge_hint'),
        isOn: this.merge, isInteractive: this.isInteractive, isDark: this.isDark,
        onChange: (value: boolean): void => { this.merge = value; this.changed(); } })
    }.width('100%')
  }
}
