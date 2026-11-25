// SPDX-License-Identifier: AGPL-3.0-or-later
import { window } from '@kit.ArkUI';
import { SharedPageBackground, SharedSurface, SharedActionButton, SharedIconButton,
  SharedActionIcon, SharedIconResources, visualPalette, VisualTokens } from 'jide_foundation';

/** 独立样例使用合成数据，正式产品的偏好、数据和导航不在这里实现。 */
@Entry
@Component
struct VisualShowcase {
  @State private dark: boolean = false;
  @State private opaque: boolean = false;
  @State private flat: boolean = false;
  @State private count: number = 0;

  aboutToAppear(): void { this.updateBars(); }

  private setDark(value: boolean): void {
    this.dark = value;
    this.updateBars();
  }

  private updateBars(): void {
    const context = this.getUIContext().getHostContext();
    if (context === undefined) { return; }
    const palette = visualPalette(this.dark);
    window.getLastWindow(context).then((host: window.Window): void => {
      host.setWindowSystemBarProperties({ statusBarColor: palette.page, navigationBarColor: palette.page,
        statusBarContentColor: palette.text, navigationBarContentColor: palette.text })
        .catch((): void => { console.warn('VisualShowcase system bar update failed'); });
    }).catch((): void => { console.warn('VisualShowcase host window unavailable'); });
  }

  build() {
    Stack() {
      SharedPageBackground({ isDark: this.dark, reduceTransparency: this.opaque })
      Scroll() {
        Column({ space: VisualTokens.sectionGap }) {
          Row() {
            Column({ space: 4 }) {
              Text('记得').fontSize(32).fontWeight(FontWeight.Bold).fontColor(visualPalette(this.dark).text)
              Text('系列视觉基础 · 样例').fontSize(14).fontColor(visualPalette(this.dark).secondaryText)
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            Stack() {
            SharedIconButton({ label: '切换深浅色', circular: true,
              onAction: (): void => { this.setDark(!this.dark); } }) {
              Text(this.dark ? '☀' : '◐').fontSize(22).fontColor(visualPalette(this.dark).action).accessibilityLevel('no')
            }
            }.attributeModifier(new SharedSurface(this.dark, 'glass', this.opaque))
          }.width('100%').padding({ top: 8, bottom: 12 })
          Column({ space: 16 }) {
            Row() {
              Text('今天，记得一点').fontSize(22).fontWeight(FontWeight.Medium)
                .fontColor(visualPalette(this.dark).text).layoutWeight(1)
              Text('JIDE').fontSize(12).fontWeight(FontWeight.Medium).fontColor(visualPalette(this.dark).secondaryText)
            }.width('100%')
            Text('让每一次专注，都清晰可见。').fontSize(14).fontColor(visualPalette(this.dark).secondaryText)
              .width('100%')
            Row() {
              Column({ space: 6 }) {
                Text('24').fontSize(36).fontWeight(FontWeight.Bold).fontColor(visualPalette(this.dark).action)
                Text('待复习 · 样例').fontSize(12).fontColor(visualPalette(this.dark).secondaryText)
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              Column({ space: 6 }) {
                Text('12').fontSize(36).fontWeight(FontWeight.Bold).fontColor(visualPalette(this.dark).text)
                Text('已掌握 · 样例').fontSize(12).fontColor(visualPalette(this.dark).secondaryText)
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
            }.width('100%').padding({ top: 8, bottom: 8 })
          }.width('100%').padding(20).alignItems(HorizontalAlign.Start)
            .attributeModifier(new SharedSurface(this.dark, this.flat ? 'flat' : 'glass', this.opaque))
          SharedActionButton({ label: '开始学习', subtitle: this.count > 0 ? '已响应 ' + this.count + ' 次' : '每天一点，慢慢记得',
            isDark: this.dark, material: this.flat ? 'flat' : 'glass', reduceTransparency: this.opaque,
            onAction: (): void => { this.count++; } })
          Column({ space: 0 }) {
            Row() {
              Column({ space: 4 }) {
                Text('深色外观').fontSize(15).fontColor(visualPalette(this.dark).text)
                Text('使用相同的视觉层级').fontSize(12).fontColor(visualPalette(this.dark).secondaryText)
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              Toggle({ type: ToggleType.Switch, isOn: this.dark }).onChange((value: boolean): void => { this.setDark(value); })
                .accessibilityText('深色外观')
            }.width('100%').constraintSize({ minHeight: 64 })
            Divider().color(visualPalette(this.dark).border).opacity(0.5)
            Row() {
              Text('减少透明度').fontSize(15).fontColor(visualPalette(this.dark).text).layoutWeight(1)
              Toggle({ type: ToggleType.Switch, isOn: this.opaque }).onChange((value: boolean): void => { this.opaque = value; })
                .accessibilityText('减少透明度')
            }.width('100%').constraintSize({ minHeight: 60 })
            Divider().color(visualPalette(this.dark).border).opacity(0.5)
            Row() {
              Text('扁平表面').fontSize(15).fontColor(visualPalette(this.dark).text).layoutWeight(1)
              Toggle({ type: ToggleType.Switch, isOn: this.flat }).onChange((value: boolean): void => { this.flat = value; })
                .accessibilityText('扁平表面')
            }.width('100%').constraintSize({ minHeight: 60 })
          }.width('100%').padding({ left: 16, right: 16 })
            .attributeModifier(new SharedSurface(this.dark, this.flat ? 'flat' : 'glass', this.opaque))
          SharedActionButton({ label: '暂不可用', isDark: this.dark, isInteractive: false, reduceTransparency: this.opaque })
          Text('背景、卡片和主操作共用语义色与表面。\n本页为公共组件样例，数据不写入产品。')
            .fontSize(12).fontColor(visualPalette(this.dark).secondaryText).textAlign(TextAlign.Center).padding(8)
        }.width('100%').constraintSize({ maxWidth: VisualTokens.contentMaxWidth })
          .padding({ left: VisualTokens.pageInset, right: VisualTokens.pageInset, top: 12, bottom: 24 })
      }.width('100%').height('100%').align(Alignment.Top).scrollBar(BarState.Off)
    }.width('100%').height('100%')
  }
}
