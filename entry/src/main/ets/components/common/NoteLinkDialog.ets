// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { noteLinkUrl } from '../../model/NoteRichText';
import { localizedResourceText } from '../../utils/UiFeedback';

@Component
export struct NoteLinkDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  selectedText: string = '';
  initialUrl: string = '';
  @State private url: string = '';
  @State private label: string = '';
  onClose: () => void = (): void => {};
  onApply: (url: string, label: string) => void = (_url: string, _label: string): void => {};

  aboutToAppear(): void { this.url = this.initialUrl; this.label = this.selectedText; }

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.note_editor_link'), actionLabel: $r('app.string.browser_detail_confirm'),
      closeLabel: $r('app.string.browser_detail_cancel'), actionEnabled: noteLinkUrl(this.url) !== '',
      onClose: (): void => { this.onClose(); },
      onAction: (): void => {
        const url: string = noteLinkUrl(this.url);
        if (url !== '') this.onApply(url, this.label === '' ? url : this.label);
      } })
  }

  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text($r('app.string.note_editor_link_url')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      TextInput({ text: this.url,
        placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.note_editor_link_url_hint')) })
        .attributeModifier(new FormInputStyle())
        .onChange((value: string): void => { this.url = value; })
      if (this.selectedText === '') {
        Text($r('app.string.note_editor_link_text')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.label,
          placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.note_editor_link_text_hint')) })
          .attributeModifier(new FormInputStyle())
          .onChange((value: string): void => { this.label = value; })
      } else {
        Text(this.selectedText).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      }
    }.width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth,
      header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
