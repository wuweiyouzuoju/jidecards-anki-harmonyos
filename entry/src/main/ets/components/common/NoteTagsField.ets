// SPDX-License-Identifier: AGPL-3.0-or-later
import { TagPicker } from './TagPicker';
import { TagSelectionChange } from '../../model/NoteTags';
import { parseNoteTags } from '../../model/NoteFieldEditing';
import { AnchoredMenuItem } from './MenuItem';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ExpansionReveal } from '../../utils/ExpansionReveal';

/** 新增、编辑及遮罩笔记共用；输入和标签选择均回写宿主草稿，保存仍归宿主。 */
@Component
export struct NoteTagsField {
  @Prop text: string = '';
  @Prop isInteractive: boolean = true;
  onChange: (text: string) => void = (_text: string): void => {};
  scroller: Scroller = new Scroller();
  @State private expanded: boolean = false;
  private pickerReveal: ExpansionReveal | null = null;

  aboutToAppear(): void { this.pickerReveal = new ExpansionReveal(this.scroller); }
  aboutToDisappear(): void { this.pickerReveal?.cancel(); }

  private togglePicker(): void {
    if (!this.isInteractive) return;
    this.expanded = !this.expanded;
    // 与外层标签区共享滚动容器，各自保留一次展开请求。
    this.pickerReveal?.request(this.expanded);
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      TextInput({ text: this.text, placeholder: $r('app.string.add_note_tags_placeholder') })
        .attributeModifier(new FormInputStyle()).enabled(this.isInteractive)
        .onChange((value: string): void => { if (this.isInteractive) this.onChange(value); })
      AnchoredMenuItem({ label: $r('app.string.tags_choose'), labelAlignment: TextAlign.Start,
        disclosure: true, expanded: this.expanded,
        available: this.isInteractive, onSelect: (): void => { this.togglePicker(); } })
      if (this.expanded) {
        TagPicker({ noteTags: [parseNoteTags(this.text)], isInteractive: this.isInteractive,
          onChanged: (_changes: TagSelectionChange[], tags: string[]): void => { this.onChange(tags.join(' ')); } })
      }
    }.width('100%').onAreaChange((_oldArea: Area, newArea: Area): void => {
      this.pickerReveal?.revealAfterLayout(this.expanded, Number(newArea.height));
    })
  }
}
