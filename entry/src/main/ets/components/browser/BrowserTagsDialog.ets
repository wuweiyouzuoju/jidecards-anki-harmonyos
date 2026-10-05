// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { TagPicker } from '../common/TagPicker';
import { TagSelectionChange } from '../../model/NoteTags';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct BrowserTagsDialog {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @Prop busy: boolean = false;
  @Prop noteTags: string[][] = [];
  @Prop error: string = '';
  onClose: () => void = (): void => {};
  onSubmit: (changes: TagSelectionChange[]) => void = (_changes: TagSelectionChange[]): void => {};
  @State private changes: TagSelectionChange[] = [];
  @State private ready: boolean = false;
  private handleBackRequest(): void { if (!this.busy) this.onClose(); }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.tags_batch_title'), closeLabel: $r('app.string.cancel'),
      actionLabel: $r('app.string.browser_detail_confirm'), closeEnabled: !this.busy,
      actionEnabled: this.ready && !this.busy && this.changes.length > 0,
      onClose: (): void => { if (!this.busy) this.onClose(); },
      onAction: (): void => { this.onSubmit(this.changes.slice()); } })
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.error !== '') { Text(this.error).fontColor($r('app.color.error_text')).width('100%') }
      TagPicker({ noteTags: this.noteTags, isInteractive: !this.busy,
        onReady: (ready: boolean): void => { this.ready = ready; },
        onChanged: (changes: TagSelectionChange[], _tags: string[]): void => { this.changes = changes; } })
    }.width('100%')
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.busy,
      header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { if (!this.busy) this.onClose(); } })
  }
}
