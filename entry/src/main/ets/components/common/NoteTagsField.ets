// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconActionButton } from './IconActionButton';
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
  @Prop @Watch('syncText') text: string = '';
  @State private tags: string[] = [];
  @State private input: string = '';
  private publishedText: string = '';

  private syncText(): void {
    if (this.text === this.publishedText) return;
    this.tags = parseNoteTags(this.text); this.input = ''; this.publishedText = this.text;
  }
  private publish(): void {
    this.publishedText = parseNoteTags(this.tags.concat([this.input]).join(' ')).join(' ');
    this.onChange(this.publishedText);
  }
  private changeInput(value: string): void {
    if (!this.isInteractive) return;
    this.input = value;
    if (/\s/.test(value)) this.commitInput(); else this.publish();
  }
  private commitInput(): void {
    if (!this.isInteractive) return;
    this.tags = parseNoteTags(this.tags.concat([this.input]).join(' ')); this.input = ''; this.publish();
  }
  private removeTag(tag: string): void {
    if (!this.isInteractive) return;
    this.tags = this.tags.filter((value: string): boolean => value !== tag); this.publish();
  }
  private selectTags(tags: string[]): void {
    if (!this.isInteractive) return;
    this.tags = parseNoteTags(tags.join(' ')); this.input = ''; this.publish();
  }
  @Prop @Watch('focusRequested') focusRequest: number = 0;
  private inputId: string = 'note-tags-' + String(Date.now()) + '-' + String(Math.random());
  private laidOut: boolean = false;
  private handledFocus: number = 0;
  private focusRequested(): void {
    if (!this.laidOut || !this.isInteractive || this.focusRequest === this.handledFocus) return;
    this.handledFocus = this.focusRequest;
    try { this.getUIContext().getFocusController().requestFocus(this.inputId); } catch (error) { /* 控件已离开焦点树。 */ }
  }
  @Prop isInteractive: boolean = true;
  onChange: (text: string) => void = (_text: string): void => {};
  scroller: Scroller = new Scroller();
  @State private expanded: boolean = false;
  private pickerReveal: ExpansionReveal | null = null;

  aboutToAppear(): void { this.tags = parseNoteTags(this.text); this.publishedText = this.text; this.pickerReveal = new ExpansionReveal(this.scroller); }
  aboutToDisappear(): void { this.pickerReveal?.cancel(); }

  private togglePicker(): void {
    if (!this.isInteractive) return;
    this.expanded = !this.expanded;
    // 与外层标签区共享滚动容器，各自保留一次展开请求。
    this.pickerReveal?.request(this.expanded);
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.tags.length > 0) {
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(this.tags, (tag: string) => {
            Row({ space: 应用尺寸.间距_4 }) {
              Text(tag).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_primary')).flexShrink(1)
              IconActionButton({ source: $r('app.media.ic_common_close'), label: $r('app.string.note_visual_remove'),
                controlSize: 28, controlGlyphSize: 12, isInteractive: this.isInteractive,
                onAction: (): void => { this.removeTag(tag); } })
            }.padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_4 })
              .margin({ right: 应用尺寸.间距_5, bottom: 应用尺寸.间距_5 })
              .backgroundColor($r('app.color.surface_selected')).borderRadius(8).constraintSize({ maxWidth: '100%' })
          }, (tag: string): string => tag)
        }.width('100%')
      }
      Row({ space: 应用尺寸.间距_8 }) {
      TextInput({ text: this.input, placeholder: $r('app.string.add_note_tags_placeholder') })
        .id(this.inputId).attributeModifier(new FormInputStyle()).enabled(this.isInteractive)
        .onAreaChange((): void => { this.laidOut = true; this.focusRequested(); })
        .layoutWeight(1).onChange((value: string): void => { this.changeInput(value); })
        .onSubmit((): void => { this.commitInput(); })
      IconActionButton({ source: $r('app.media.ic_home_new'), label: $r('app.string.add_note_tags'),
        isInteractive: this.isInteractive && this.input.trim() !== '',
        onAction: (): void => { this.commitInput(); } })
      }.width('100%')
      AnchoredMenuItem({ label: $r('app.string.tags_choose'), labelAlignment: TextAlign.Start,
        disclosure: true, expanded: this.expanded,
        available: this.isInteractive, onSelect: (): void => { this.togglePicker(); } })
      if (this.expanded) {
        TagPicker({ noteTags: [parseNoteTags(this.text)], isInteractive: this.isInteractive,
          onChanged: (_changes: TagSelectionChange[], tags: string[]): void => { this.selectTags(tags); } })
      }
    }.width('100%').onAreaChange((_oldArea: Area, newArea: Area): void => {
      this.pickerReveal?.revealAfterLayout(this.expanded, Number(newArea.height));
    })
  }
}
