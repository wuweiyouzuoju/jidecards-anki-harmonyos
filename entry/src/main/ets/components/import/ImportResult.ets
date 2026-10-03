// SPDX-License-Identifier: AGPL-3.0-or-later
import { ImportSummary, decodeImportResponse } from '../../proto/messages/ImportExportMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
@Component
export struct ImportResult {
  @Prop summary: ImportSummary = decodeImportResponse(new Uint8Array(0));
  @Builder
  private count(label: Resource, value: number) {
    Row() {
      Text(label).layoutWeight(1).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
      Text(value.toString()).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
    }.width('100%')
  }
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.transfer_result_title')).fontSize(应用尺寸.字号_标题).fontColor($r('app.color.text_primary'))
      this.count($r('app.string.transfer_result_found'), this.summary.foundNotes)
      this.count($r('app.string.transfer_result_new'), this.summary.newNotes)
      this.count($r('app.string.transfer_result_updated'), this.summary.updatedNotes)
      this.count($r('app.string.transfer_result_duplicate'), this.summary.duplicateNotes)
      if (this.summary.conflictingNotes > 0) this.count($r('app.string.transfer_result_conflict'), this.summary.conflictingNotes)
      if (this.summary.firstFieldMatches > 0) this.count($r('app.string.transfer_result_match'), this.summary.firstFieldMatches)
      if (this.summary.missingNotetypeNotes > 0) this.count($r('app.string.transfer_result_notetype'), this.summary.missingNotetypeNotes)
      if (this.summary.missingDeckNotes > 0) this.count($r('app.string.transfer_result_deck'), this.summary.missingDeckNotes)
      if (this.summary.emptyFirstFieldNotes > 0) this.count($r('app.string.transfer_result_empty'), this.summary.emptyFirstFieldNotes)
      Text($r('app.string.transfer_result_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
    }.width('100%')
  }
}
