// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserFlagDialog {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (flag: number) => void = (_flag: number): void => {};
  private 标志颜色(flag: number): string {
    const 色表: Record<number, string> = {
      0: 'transparent',
      1: '#D92D20',
      2: '#D97A1C',
      3: '#238463',
      4: '#2F5FD0'
    };
    return 色表[flag] ?? 'transparent';
  }
  private 标志文案(flag: number): string {
    const keys: string[] = ['none', 'red', 'orange', 'green', 'blue'];
    return namedResourceText(this.getUIContext(), 'browser_action_flag_' + keys[flag]);
  }

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
          title: $r('app.string.browser_action_set_flag'),
          showClose: false,
          actionLabel: $r('app.string.browser_detail_cancel'),
          actionEnabled: !this.busy,
          onAction: (): void => { this.onClose(); }
        })

        ForEach([0, 1, 2, 3, 4], (flag: number) => {
          Row({ space: 应用尺寸.间距_12 }) {
            // 标志色块：0=无（透明圆环）/1=红/2=橙/3=绿/4=蓝
            Row()
              .width(16)
              .height(16)
              .borderRadius(8)
              .backgroundColor(this.标志颜色(flag))
              .border({ width: flag === 0 ? 1 : 0, color: $r('app.color.border_input') })
            Text(this.标志文案(flag))
              .fontSize(应用尺寸.字号_按钮)
              .fontColor($r('app.color.text_primary'))
              .layoutWeight(1)
          }
          .width('100%')
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
          .borderRadius(应用尺寸.圆角_胶囊)
          .backgroundColor($r('app.color.surface_page'))
          .enabled(!this.busy)
          .onClick((): void => { this.onSubmit(flag); })
        }, (flag: number): string => `${flag}`)

      }
      .width('78%')
      .constraintSize({ maxWidth: 420 })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
    }
  }
}
