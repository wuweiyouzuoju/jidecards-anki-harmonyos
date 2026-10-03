// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 字段与管理弹层共用缩略图；文件缺失和解码失败有明确反馈。 */
@Component
export struct NoteImagePreview {
  @Prop @Watch('reset') source: string = '';
  @State private failed: boolean = false;

  private reset(): void { this.failed = false; }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.source === '' || this.failed) {
        Text($r('app.string.note_image_preview_failed')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text')).padding(应用尺寸.卡片内边距)
      } else {
        Image(this.source).width('100%').height(应用尺寸.卡片高度).objectFit(ImageFit.Contain)
          .accessibilityText($r('app.string.add_note_image_preview'))
          .onError((): void => { this.failed = true; })
      }
    }.width('100%').backgroundColor($r('app.color.surface_page')).borderRadius(应用尺寸.圆角_面板)
  }
}
