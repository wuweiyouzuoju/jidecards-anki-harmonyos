// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 调度器服务 } from '../../backend/调度器服务';
import { BrowserRepositionScope } from '../../model/BrowserReposition';
import { PressFeedback } from '../../utils/PressFeedback';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems, AppInterfaceControl } from '../../model/AppInterface';
export interface BrowserRepositionInput { start: number; step: number; random: boolean; shift: boolean; }
@Component
export struct BrowserRepositionDialog {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.disposed && !this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('publishInterface') scope: BrowserRepositionScope = { ids: [], unsupported: 0, minimum: 0, maximum: 0 };
  @State @Watch('publishInterface') private defaultsError: string = '';
  @State @Watch('publishInterface') private loading: boolean = true;
  @State private 重新定位起始: number = 1;
  @State private 重新定位步长: number = 1;
  @State @Watch('publishInterface') private 重新定位随机: boolean = false;
  @State @Watch('publishInterface') private 重新定位顺移: boolean = false;
  private disposed: boolean = false;
  private interfaceMounted: boolean = false;
  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    appInterface.observe({ surface: 'browser_reposition', sectionId: this.defaultsError !== '' ? 'error' : this.loading ? 'loading' : 'form',
      selectedId: '', optionIds: [], optionLabels: [], busy: this.busy || this.loading, controlsComplete: true,
      items: visibleInterfaceItems('browser_reposition', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
        .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
          selected: item.id === 'random' ? this.重新定位随机 : item.id === 'shift' && this.重新定位顺移,
          enabled: item.id === 'cancel' || item.id === 'close' ? !this.busy :
            !(this.busy || this.loading) && (item.id !== 'confirm' || (this.defaultsError === '' && this.scope.ids.length > 0)) })),
      values: [{ id: 'eligible', value: String(this.scope.ids.length) }, { id: 'unsupported', value: String(this.scope.unsupported) },
        { id: 'minimum', value: String(this.scope.minimum) }, { id: 'maximum', value: String(this.scope.maximum) }] });
  }
  onClose: () => void = (): void => {};
  onSubmit: (input: BrowserRepositionInput) => void = (_input: BrowserRepositionInput): void => {};
  async aboutToAppear(): Promise<void> {
    this.interfaceMounted = true;
    this.loading = true; this.defaultsError = '';
    try {
      const defaults = await new 调度器服务().获取重新定位默认值();
      if (this.disposed) return;
      this.重新定位随机 = defaults.random;
      this.重新定位顺移 = defaults.shift;
    } catch (error) {
      if (!this.disposed) this.defaultsError = error instanceof Error ? error.message : `${error}`;
    } finally { if (!this.disposed) { this.loading = false; this.publishInterface(); } }
  }
  aboutToDisappear(): void { this.interfaceMounted = false; this.disposed = true; appInterface.leave('browser_reposition'); }
  private submit(): void {
    if (this.busy || this.loading || this.defaultsError !== '' || this.scope.ids.length === 0) return;
    this.onSubmit({ start: this.重新定位起始, step: this.重新定位步长,
      random: this.重新定位随机, shift: this.重新定位顺移 });
  }
  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_action_reposition'),
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => { this.handleBackRequest(); },
      actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !(this.busy || this.loading) && this.defaultsError === '' && this.scope.ids.length > 0,
      onAction: (): void => { this.submit(); }
    })
  }

  @Builder
  private dialogContent() {
    Text(resourceText(this.getUIContext(), $r('app.string.browser_reposition_scope'), this.scope.ids.length,
      this.scope.unsupported, this.scope.minimum, this.scope.maximum)).fontColor($r('app.color.text_secondary')).width('100%')
    if (this.defaultsError !== '') {
      Text(this.defaultsError).fontColor($r('app.color.error_text')).width('100%')
      Button($r('app.string.common_retry')).attributeModifier(new PressFeedback()).stateEffect(false)
        .enabled(!this.busy).onClick((): void => { this.aboutToAppear(); })
    }
    Row({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.browser_action_reposition_start'))
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
      TextInput({ text: this.重新定位起始.toString() })
        .border(SurfaceBorder.options())
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
        .border(SurfaceBorder.options())
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

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.handleBackRequest(); } })
  }
}
