// SPDX-License-Identifier: AGPL-3.0-or-later
import { ImportSummary, decodeImportResponse } from '../../proto/messages/ImportExportMessages';
import { ImportResultCategory, importResultCategories, importResultBatch } from '../../model/ImportResults';
import { AppInterfaceControl, AppInterfaceValue } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { namedResourceText, resourceText } from '../../utils/UiFeedback';
import { DataActionRow } from '../settings/DataActionRow';
import { 按下态按钮 } from '../common/按下态按钮';

@Component
export struct ImportResult {
  @Prop @Watch('resetResult') summary: ImportSummary = decodeImportResponse(new Uint8Array(0));
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = '';
  @State private selectedCategory: string = '';
  @State private resultPage: number = 0;
  private mounted: boolean = false;
  onBrowse: (category: string, page: number) => void = (_category: string, _page: number): void => {};
  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.mounted = false; appInterface.leave('import_results'); }
  private resetResult(): void { this.selectedCategory = ''; this.resultPage = 0; this.publishInterface(); }
  private text(key: string, _locale: string = this.uiLanguage): string { return namedResourceText(this.getUIContext(), key); }
  private select(category: ImportResultCategory): void {
    if (category.noteIds.length === 0) return;
    if (this.selectedCategory !== category.id) { this.selectedCategory = category.id; this.resultPage = 0; }
    this.publishInterface(); this.onBrowse(category.id, this.resultPage);
  }
  private changePage(delta: number): void {
    if (importResultBatch(this.summary, this.selectedCategory, this.resultPage + delta) === null) return;
    this.resultPage += delta; this.publishInterface();
    this.onBrowse(this.selectedCategory, this.resultPage);
  }
  private batchLabel(): string {
    const batch = importResultBatch(this.summary, this.selectedCategory, this.resultPage);
    return batch === null ? '' : resourceText(this.getUIContext(), $r('app.string.transfer_result_batch'), batch.first, batch.last, batch.total);
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    const categories = importResultCategories(this.summary);
    const items: AppInterfaceControl[] = categories.map((item: ImportResultCategory): AppInterfaceControl => ({
      id: item.id, titleKey: item.titleKey, title: this.text(item.titleKey), enabled: item.noteIds.length > 0,
      selected: item.id === this.selectedCategory }));
    items.push({ id: 'previous', titleKey: 'transfer_result_previous', title: this.text('transfer_result_previous'),
      enabled: this.resultPage > 0, selected: false });
    items.push({ id: 'next', titleKey: 'transfer_result_next', title: this.text('transfer_result_next'),
      enabled: importResultBatch(this.summary, this.selectedCategory, this.resultPage + 1) !== null, selected: false });
    appInterface.observe({ surface: 'import_results', sectionId: this.selectedCategory, selectedId: this.selectedCategory,
      optionIds: [], optionLabels: [], busy: false, items,
      controlsComplete: true, values: categories.map((item: ImportResultCategory): AppInterfaceValue => ({ id: item.id, value: String(item.count) }))
        .concat([{ id: 'batch', value: this.batchLabel() }]) });
  }
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.transfer_result_title')).fontSize(应用尺寸.字号_标题).fontColor($r('app.color.text_primary'))
      Text(resourceText(this.getUIContext(), $r('app.string.transfer_result_found_count'), this.summary.foundNotes))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      ForEach(importResultCategories(this.summary), (category: ImportResultCategory) => {
        DataActionRow({ title: `${this.text(category.titleKey)} · ${category.count}`,
          hint: category.noteIds.length > 0 ? this.text('transfer_result_browse') :
            category.hintKey === '' ? '' : this.text(category.hintKey),
          showDisclosure: category.noteIds.length > 0, isInteractive: category.noteIds.length > 0,
          onAction: (): void => { this.select(category); } })
      }, (category: ImportResultCategory): string => category.id)
      if (this.selectedCategory !== '') {
        Text(this.batchLabel()).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        Row({ space: 应用尺寸.间距_12 }) {
          按下态按钮({ 文案: $r('app.string.transfer_result_previous'), 是否启用: this.resultPage > 0,
            点击回调: (): void => { this.changePage(-1); } })
          按下态按钮({ 文案: $r('app.string.transfer_result_next'),
            是否启用: importResultBatch(this.summary, this.selectedCategory, this.resultPage + 1) !== null,
            点击回调: (): void => { this.changePage(1); } })
        }
      }
      Text($r('app.string.transfer_result_browse_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    }.width('100%')
  }
}
