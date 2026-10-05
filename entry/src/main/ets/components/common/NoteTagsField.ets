// SPDX-License-Identifier: AGPL-3.0-or-later
import { TagPicker } from './TagPicker';
import { TagSelectionChange } from '../../model/NoteTags';
import { parseNoteTags } from '../../model/NoteFieldEditing';
import { AnchoredMenuItem } from './MenuItem';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 新增、编辑及遮罩笔记共用；输入和标签选择均回写宿主草稿，保存仍归宿主。 */
@Component
export struct NoteTagsField {
  @Prop text: string = '';
  @Prop isInteractive: boolean = true;
  onChange: (text: string) => void = (_text: string): void => {};
  @State private expanded: boolean = false;
  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      TextInput({ text: this.text, placeholder: $r('app.string.add_note_tags_placeholder') })
        .attributeModifier(new FormInputStyle()).enabled(this.isInteractive)
        .onChange((value: string): void => { if (this.isInteractive) this.onChange(value); })
      AnchoredMenuItem({ label: $r('app.string.tags_choose'), disclosure: true, expanded: this.expanded,
        available: this.isInteractive, onSelect: (): void => { this.expanded = !this.expanded; } })
      if (this.expanded) {
        TagPicker({ noteTags: [parseNoteTags(this.text)], isInteractive: this.isInteractive,
          onChanged: (_changes: TagSelectionChange[], tags: string[]): void => { this.onChange(tags.join(' ')); } })
      }
    }.width('100%')
  }
}
