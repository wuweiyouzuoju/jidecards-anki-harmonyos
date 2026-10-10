// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { SelectStyle } from '../../utils/SelectStyle';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems, AppInterfaceControl } from '../../model/AppInterface';
import { 应用尺寸 } from '../../utils/应用尺寸';
export interface BrowserExportOptions { format: string; media: boolean; scheduling: boolean; }
@Component
export struct BrowserSelectionActionsDialog {
  @Prop @Watch('handleBack') backRequest: number = 0;
  @Prop action: string = 'grade';
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop count: number = 0;
  @Prop error: string = '';
  @State @Watch('publishInterface') private rating: number = 2;
  @State @Watch('publishInterface') private format: string = 'apkg';
  @State @Watch('publishInterface') private media: boolean = true;
  @State @Watch('publishInterface') private scheduling: boolean = false;
  onGrade: (rating: number) => void = (_rating: number): void => {};
  onExport: (options: BrowserExportOptions) => void = (_options: BrowserExportOptions): void => {};
  onClose: () => void = (): void => {};
  private mounted: boolean = false;
  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.mounted = false; appInterface.leave(this.surfaceId()); }
  private surfaceId(): string { return this.action === 'grade' ? 'browser_grade' : 'browser_export'; }
  private publishInterface(): void {
    if (!this.mounted) return;
    const surface: string = this.surfaceId();
    appInterface.observe({ surface: surface, sectionId: '', selectedId: this.action === 'grade' ? String(this.rating) : this.format,
      optionIds: this.action === 'grade' ? ['0', '1', '2', '3'] : ['apkg', 'text'],
      optionLabels: this.options().map((option: SelectOption): string =>
        typeof option.value === 'string' ? option.value : resourceText(this.getUIContext(), option.value)), busy: this.busy,
      items: visibleInterfaceItems(surface, { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
        .filter((item): boolean => this.format === 'apkg' || (item.id !== 'media' && item.id !== 'scheduling'))
        .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
          selected: item.id === 'media' ? this.media : item.id === 'scheduling' && this.scheduling, enabled: !this.busy && this.count > 0 })),
      controlsComplete: true, values: [{ id: 'selected_count', value: String(this.count) }] });
  }
  private handleBack(): void { if (!this.busy) this.onClose(); }
  private options(): SelectOption[] {
    if (this.action === 'export') return [{ value: 'APKG' }, { value: resourceText(this.getUIContext(), $r('app.string.browser_export_text')) }];
    return ['rating_again', 'rating_hard', 'rating_good', 'rating_easy'].map((key: string): SelectOption =>
      ({ value: namedResourceText(this.getUIContext(), key) }));
  }
  @Builder
  private headerContent() {
    DialogHeader({ title: this.action === 'grade' ? $r('app.string.browser_grade_now') : $r('app.string.browser_export_selection'),
      closeLabel: $r('app.string.browser_detail_cancel'), closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); }, actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy && this.count > 0,
      onAction: (): void => { if (this.action === 'grade') this.onGrade(this.rating);
        else this.onExport({ format: this.format, media: this.media, scheduling: this.scheduling }); } })
  }
  @Builder
  private bodyContent() {
    Text(resourceText(this.getUIContext(), $r('app.string.browser_selection_scope'), this.count))
      .fontColor($r('app.color.text_secondary')).width('100%')
    if (this.action === 'grade') {
      Text($r('app.string.browser_grade_hint')).fontColor($r('app.color.text_secondary')).width('100%')
      Select(this.options()).selected(this.rating).value(this.options()[this.rating].value)
        .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
      .font(SelectStyle.controlFont).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
      .textModifier(SelectStyle.labelText()).width('100%').attributeModifier(new SelectStyle())
        .enabled(!this.busy).onSelect((index: number): void => { this.rating = index; })
    } else {
      Select(this.options()).selected(this.format === 'apkg' ? 0 : 1).value(this.options()[this.format === 'apkg' ? 0 : 1].value)
        .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
      .font(SelectStyle.controlFont).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
      .textModifier(SelectStyle.labelText()).width('100%').attributeModifier(new SelectStyle())
        .enabled(!this.busy).onSelect((index: number): void => { this.format = index === 0 ? 'apkg' : 'text'; })
      if (this.format === 'apkg') {
        Row() {
          Text($r('app.string.browser_export_media')).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.media }).enabled(!this.busy).onChange((value: boolean): void => { this.media = value; })
        }.width('100%')
        Row() {
          Text($r('app.string.browser_export_scheduling')).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.scheduling }).enabled(!this.busy).onChange((value: boolean): void => { this.scheduling = value; })
        }.width('100%')
      }
    }
    if (this.error !== '') { Text(this.error).fontColor($r('app.color.error_text')).width('100%') }
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); }, onDismiss: (): void => { this.onClose(); } })
  }
}
