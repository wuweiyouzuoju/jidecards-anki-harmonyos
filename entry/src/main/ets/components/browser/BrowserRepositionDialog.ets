// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 调度器服务 } from '../../backend/调度器服务';
export interface BrowserRepositionInput { start: number; step: number; random: boolean; shift: boolean; }
@Component
export struct BrowserRepositionDialog {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @State private loading: boolean = true;
  @State private 重新定位起始: number = 1;
  @State private 重新定位步长: number = 1;
  @State private 重新定位随机: boolean = false;
  @State private 重新定位顺移: boolean = false;
  private disposed: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (input: BrowserRepositionInput) => void = (_input: BrowserRepositionInput): void => {};
  async aboutToAppear(): Promise<void> {
    try {
      const defaults = await new 调度器服务().获取重新定位默认值();
      if (this.disposed) return;
      this.重新定位随机 = defaults.random;
      this.重新定位顺移 = defaults.shift;
    } catch (error) {
      console.info('BrowserReposition: defaults unavailable, using false');
    } finally { if (!this.disposed) this.loading = false; }
  }
  aboutToDisappear(): void { this.disposed = true; }
  private submit(): void {
    if (this.busy || this.loading) return;
    this.onSubmit({ start: this.重新定位起始, step: this.重新定位步长,
      random: this.重新定位随机, shift: this.重新定位顺移 });
  }
  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .onClick((): void => {
          if (!(this.busy || this.loading)) { this.onClose(); }
        })

      Column({ space: 应用尺寸.间距_14 }) {
        DialogHeader({
          title: $r('app.string.browser_action_reposition'),
          closeLabel: $r('app.string.browser_detail_cancel'),
          closeEnabled: !(this.busy || this.loading),
          onClose: (): void => { this.onClose(); },
          actionLabel: $r('app.string.browser_detail_confirm'),
          actionEnabled: !(this.busy || this.loading),
          onAction: (): void => { this.submit(); }
        })

        Row({ space: 应用尺寸.间距_12 }) {
          Text($r('app.string.browser_action_reposition_start'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
          TextInput({ text: this.重新定位起始.toString() })
            .width(80)
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_page'))
            .borderRadius(应用尺寸.圆角_面板)
            .enabled(!(this.busy || this.loading))
            .type(InputType.Number)
            .onChange((值: string): void => {
              const n: number = Number.parseInt(值, 10);
              if (Number.isFinite(n) && n >= 0) { this.重新定位起始 = n; }
            })
        }
        .width('100%')

        Row({ space: 应用尺寸.间距_12 }) {
          Text($r('app.string.browser_action_reposition_step'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
          TextInput({ text: this.重新定位步长.toString() })
            .width(80)
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_page'))
            .borderRadius(应用尺寸.圆角_面板)
            .enabled(!(this.busy || this.loading))
            .type(InputType.Number)
            .onChange((值: string): void => {
              const n: number = Number.parseInt(值, 10);
              if (Number.isFinite(n) && n >= 0) { this.重新定位步长 = n; }
            })
        }
        .width('100%')

        Row({ space: 应用尺寸.间距_12 }) {
          Text($r('app.string.browser_action_reposition_random'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.重新定位随机 })
            .enabled(!(this.busy || this.loading))
            .onChange((开: boolean): void => { this.重新定位随机 = 开; })
        }
        .width('100%')

        Row({ space: 应用尺寸.间距_12 }) {
          Text($r('app.string.browser_action_reposition_shift'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.重新定位顺移 })
            .enabled(!(this.busy || this.loading))
            .onChange((开: boolean): void => { this.重新定位顺移 = 开; })
        }
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
