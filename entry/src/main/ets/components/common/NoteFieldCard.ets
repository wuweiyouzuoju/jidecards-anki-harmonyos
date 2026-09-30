// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { NoteFieldEditor } from './NoteFieldEditor';
import { SettingsToggleRow } from './SettingsToggleRow';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 字段标题、图片入口、输入区和附件的唯一布局；草稿与 IO 仍由宿主持有。 */
@Component
export struct NoteFieldCard {
  @Prop fieldName: string = '';
  @Prop value: string = '';
  @Prop disabled: boolean = false;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  @Prop images: NoteFieldImage[] = [];
  @Prop reverseToggle: boolean = false;
  @Prop editing: boolean = false;
  @Prop isDark: boolean = false;
  @Prop accent: string = '#2F5FD0';
  onChange: (value: string) => void = (_value: string): void => {};
  onAddImage: () => void = (): void => {};
  onRemoveImage: (id: number) => void = (_id: number): void => {};

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.reverseToggle) {
        SettingsToggleRow({ title: $r('app.string.note_reverse_toggle'),
          hint: this.editing ? $r('app.string.note_reverse_edit_hint') : $r('app.string.note_reverse_toggle_hint'),
          isOn: this.value !== '', isDark: this.isDark, tint: this.accent, isInteractive: !this.disabled,
          onChange: (isOn: boolean): void => { this.onChange(isOn ? '1' : ''); } })
      } else {
        Row() {
          Text(this.fieldName).fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary')).layoutWeight(1)
          Button($r('app.string.add_note_image_add')).height(应用尺寸.紧凑控件高度)
            .fontSize(应用尺寸.字号_正文_小).fontColor(this.accent).backgroundColor(Color.Transparent)
            .borderRadius(应用尺寸.圆角_面板).padding({ left: 10, right: 10 })
            .enabled(!this.disabled).attributeModifier(new PressFeedback())
            .stateEffect(false)
            .onClick(this.onAddImage)
        }.width('100%')
        NoteFieldEditor({ value: this.value, fieldName: this.fieldName, disabled: this.disabled,
          clozeEnabled: this.clozeEnabled, allFields: this.allFields, onChange: this.onChange })
        ForEach(this.images, (attachment: NoteFieldImage) => {
          Stack({ alignContent: Alignment.TopEnd }) {
            Image(attachment.uri).width('100%').height(应用尺寸.卡片高度).objectFit(ImageFit.Contain)
              .borderRadius(应用尺寸.圆角_面板).backgroundColor($r('app.color.surface_page'))
              .accessibilityText($r('app.string.add_note_image_preview'))
            Button($r('app.string.add_note_image_remove')).height(应用尺寸.紧凑控件高度)
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
              .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_面板)
              .margin(应用尺寸.间距_5).enabled(!this.disabled)
              .attributeModifier(new PressFeedback())
              .stateEffect(false)
              .onClick((): void => { this.onRemoveImage(attachment.id); })
          }.width('100%')
        }, (attachment: NoteFieldImage): string => attachment.id.toString())
      }
    }.width('100%').padding(应用尺寸.间距_12)
      .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片)
  }
}
