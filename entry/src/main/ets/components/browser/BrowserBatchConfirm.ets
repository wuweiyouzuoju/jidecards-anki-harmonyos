// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserBatchConfirm {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  @Prop title: Resource = $r('app.string.browser_action_suspend');
  @Prop message: Resource = $r('app.string.browser_action_suspend_confirm');
  @Prop destructive: boolean = false;
  onSubmit: () => void = (): void => {};

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .onClick((): void => {
          if (!this.busy) { this.onClose(); }
        })

      Column({ space: 应用尺寸.间距_14 }) {
        DialogHeader({
          title: this.title,
          closeLabel: $r('app.string.browser_detail_cancel'),
          closeEnabled: !this.busy,
          onClose: (): void => { this.onClose(); },
          actionLabel: $r('app.string.browser_detail_confirm'),
          actionEnabled: !this.busy,
          onAction: (): void => { this.onSubmit(); },
          destructive: this.destructive
        })
        Text(this.message)
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')

      }
      .width('78%')
      .constraintSize({ maxWidth: 420 })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
    }
  }
}
