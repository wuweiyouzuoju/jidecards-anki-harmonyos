// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { iap } from '@kit.IAPKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { OfficialAIService, OfficialWallet } from '../../backend/agent/OfficialAIService';
import { 设置分组卡片 } from './设置分组卡片';
import { FormSelectRow } from '../common/FormSelectRow';
import { resolveAppLocale } from '../../model/AppLocales';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceValue, AppInterfaceControl } from '../../model/AppInterface';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { appearanceElementColor, appearanceElementRadius } from '../../utils/AppearanceElements';
import { insetMaterialFill } from '../../utils/GlassMaterial';
import { OutlinedValue } from '../common/OutlinedValue';
import { SurfaceBorder } from '../../utils/SurfaceBorder';

interface QuantityOption { value: string; }

@Component
export struct OfficialAISettings {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop @Watch('publish') isCovered: boolean = false;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private compact: boolean = false;
  @Prop isDark: boolean = false;
  @Prop tint: ResourceColor = '#2F5FD0';
  onSessionChanged: () => void = (): void => {};
  onBusyChange: (busy: boolean) => void = (_busy: boolean): void => {};
  @State private busy: boolean = false;
  @State private activeAction: string = '';
  @State private quantity: number = 1;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @State private signedIn: boolean = false;
  @State private sandbox: boolean = false;
  @State private environmentKnown: boolean = false;
  @State private wallet: OfficialWallet | null = null;
  @State private product: iap.Product | null = null;
  @State private notice: string = '';
  private disposed: boolean = false;
  private refreshTimer: number = -1;
  private service: OfficialAIService = new OfficialAIService();

  aboutToAppear(): void {
    this.disposed = false; this.refresh();
    this.refreshTimer = setInterval((): void => { this.refreshQuietly(); }, 30000);
  }
  aboutToDisappear(): void {
    this.disposed = true;
    if (this.refreshTimer !== -1) { clearInterval(this.refreshTimer); this.refreshTimer = -1; }
    appInterface.leave('official_ai');
  }
  private async refreshQuietly(): Promise<void> {
    if (this.busy || this.disposed || this.isCovered) return;
    this.busy = true;
    try { await this.update(); } catch (error) { /* 自动同步失败保留已知余额，手动购买仍执行服务端校验。 */ }
    finally { this.busy = false; if (!this.disposed) this.publish(); }
  }
  private context(): common.UIAbilityContext { return this.getUIContext().getHostContext() as common.UIAbilityContext; }
  private text(resource: Resource, ...args: Array<string | number>): string { return resourceText(this.getUIContext(), resource, ...args); }
  private publish(): void {
    if (this.disposed) return;
    if (this.isCovered) { appInterface.leave('official_ai'); return; }
    const values: AppInterfaceValue[] = [{ id: 'quantity', value: String(this.quantity) }, { id: 'logged_in', value: String(this.signedIn) },
      { id: 'environment', value: this.environmentKnown ? (this.sandbox ? 'SANDBOX' : 'NORMAL') : 'unknown' },
      { id: 'balance', value: this.wallet === null ? 'unknown' : String(this.wallet.generationBalance) },
      { id: 'sandbox_balance', value: this.wallet === null ? 'unknown' : String(this.wallet.sandboxBalance) },
      { id: 'purchased_credits', value: this.wallet?.purchasedCredits === undefined ? 'unknown' : String(this.wallet.purchasedCredits) },
      { id: 'used_credits', value: this.wallet?.usedCredits === undefined ? 'unknown' : String(this.wallet.usedCredits) }];
    const items: AppInterfaceControl[] = [
      { id: 'quantity', title: '', titleKey: 'official_ai_quantity', enabled: !this.busy, selected: false },
      { id: 'login', title: '', titleKey: 'official_ai_login', enabled: !this.busy && !this.signedIn, selected: false },
      { id: 'billing_help', title: '', titleKey: 'official_ai_billing_help', enabled: true, selected: false },
      { id: 'restore', title: '', titleKey: 'official_ai_restore', enabled: !this.busy && this.signedIn, selected: false },
      { id: 'purchase', title: '', titleKey: 'official_ai_buy', enabled: !this.busy && this.product !== null && this.wallet !== null, selected: false }];
    appInterface.observe({ surface: 'official_ai', sectionId: 'ai', selectedId: '', optionIds: [], optionLabels: [], optionsTotal: 0,
      busy: this.busy, controlsComplete: true, items: items, values: values });
  }
  private fail(error: Error): void {
    const code: number = (error as BusinessError).code;
    const message: string = error.message;
    const resource: Resource = message === 'payment_not_authorized' || code === 1001860002 ? $r('app.string.official_ai_not_authorized') : message === 'payment_environment_unavailable' ? $r('app.string.official_ai_environment_unknown') : code === 1001502001 || message === 'login_required' ? $r('app.string.official_ai_login_required') :
      code === iap.IAPErrorCode.USER_CANCELED || code === 1001502012 ? $r('app.string.official_ai_cancelled') :
      message === 'insufficient_credits' ? $r('app.string.official_ai_insufficient') :
      $r('app.string.official_ai_unavailable');
    this.notice = this.text(resource);
  }
  /** @throws {Error} 由 perform/buy 的交互边界展示失败。 */
  private async detectEnvironment(): Promise<void> {
    try {
      const sandbox: boolean = await iap.isSandboxActivated(this.context());
      if (this.disposed) return;
      this.sandbox = sandbox; this.environmentKnown = true;
    } catch (error) {
      this.environmentKnown = false;
      hilog.warn(0x4342, 'jidecards', 'Official AI payment environment unavailable; code=%{public}s; cause=%{public}s',
        String((error as BusinessError).code), (error as Error).message.slice(0, 160));
      throw new Error((error as BusinessError).code === 1001860002 ? 'payment_not_authorized' : 'payment_environment_unavailable');
    }
  }
  /** @throws {Error} 余额和商品读取失败由 perform/buy 显示。 */
  private async update(): Promise<void> {
    const token: string = await this.service.token();
    if (this.disposed) return;
    this.signedIn = token !== '';
    if (!this.signedIn) { this.notice = this.text($r('app.string.official_ai_login_required')); return; }
    const wallet: OfficialWallet = await this.service.wallet();
    if (this.disposed) return;
    this.wallet = wallet;
    await this.detectEnvironment();
    if (this.disposed) return;
    if (wallet.environment !== (this.sandbox ? 'SANDBOX' : 'NORMAL')) {
      // 旧普通会话仍可用于 AI；支付需要用户重新授权当前沙盒环境。
      this.signedIn = false; this.wallet = null;
      throw new Error('login_required');
    }
    if (wallet.products.length > 0) {
      const products: iap.Product[] = await iap.queryProducts(this.context(), { productType: iap.ProductType.CONSUMABLE,
        productIds: wallet.products.map((entry): string => entry.id) });
      if (this.disposed) return;
      this.product = products.find((entry): boolean => entry.id === wallet.products[0].id) ?? null;
    }
    if (this.product === null) this.notice = this.text($r('app.string.official_ai_product_pending'));
  }
  private async perform(action: string): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true; this.activeAction = action; this.notice = ''; this.product = null; this.wallet = null;
    this.onBusyChange(action !== 'refresh'); this.publish();
    try {
      if (action === 'login') {
        await this.service.loginForPayments(this.context());
        if (!this.disposed) this.onSessionChanged();
      } else if (action === 'logout') {
        await this.service.logout(); this.signedIn = false; this.onSessionChanged();
      } else if (action === 'restore') await this.service.restore(this.context());
      await this.update();
    } catch (error) { if (!this.disposed) this.fail(error as Error); }
    finally { this.busy = false; this.activeAction = ''; if (!this.disposed) { this.onBusyChange(false); this.publish(); } }
  }
  private refresh(): void { this.perform('refresh'); }
  private async buy(): Promise<void> {
    if (this.busy || this.product === null || this.wallet === null) return;
    const product: string = this.product.id;
    this.busy = true; this.activeAction = 'buy'; this.onBusyChange(true); this.publish(); this.notice = '';
    try {
      await this.service.buy(this.context(), product, this.sandbox, this.quantity); await this.update();
      if (!this.disposed) showToastSafely(this.getUIContext(), { message: $r('app.string.official_ai_purchase_success') });
    }
    catch (error) { if (!this.disposed) this.fail(error as Error); }
    finally { this.busy = false; this.activeAction = ''; if (!this.disposed) { this.onBusyChange(false); this.publish(); } }
  }
  private async showBillingHelp(): Promise<void> {
    try {
      const result = await this.getUIContext().getPromptAction().showDialog({ title: this.text($r('app.string.official_ai_billing_help')),
        message: this.text($r('app.string.official_ai_rules')) + '\n\n' + this.text($r('app.string.official_ai_data_flow')),
        buttons: [{ text: this.text($r('app.string.settings_confirm')), color: '#2F5FD0' },
          { text: this.text($r('app.string.official_ai_restore_short')), color: '#2F5FD0' }] });
      if (result.index === 1 && this.signedIn && !this.busy) await this.perform('restore');
    } catch (error) { /* Read-only help has no accepted writes. */ }
  }
  private creditsText(value: number | undefined): string {
    return value === undefined ? this.text($r('app.string.official_ai_balance_unknown')) :
      this.text($r('app.string.official_ai_credits_label'), value);
  }
  private quantityOptions(): string[] { return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']; }
  private selectQuantity(index: number): void {
    if (this.busy || !Number.isInteger(index) || index < 0 || index >= 10) return;
    this.quantity = index + 1; this.publish();
  }
  private totalPrice(): string {
    if (this.product === null) return this.text($r('app.string.official_ai_loading_price'));
    if (this.quantity === 1) return this.product.localPrice ?? '';
    return new Intl.NumberFormat(resolveAppLocale(this.uiLanguage), { style: 'currency', currency: this.product.currency })
      .format(this.product.microPrice * this.quantity / 1000000);
  }
  @Builder
  private creditAmount(secondary: boolean) {
    OutlinedValue() {
      Row({ space: 4 }) {
        Text((secondary ? this.wallet?.usedCredits : this.wallet?.generationBalance) === undefined ?
          this.text($r('app.string.official_ai_balance_unknown')) : String(secondary ? this.wallet?.usedCredits : this.wallet?.generationBalance))
          .fontSize(44).minFontSize(14).maxFontSize(44).maxLines(1)
          .fontWeight(FontWeight.Bold).flexShrink(1)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
        Text($r('app.string.official_ai_unit')).fontSize(14).flexShrink(0)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
      }.alignItems(VerticalAlign.Bottom)
    }
  }
  build() {
    Column({ space: 应用尺寸.页面分组间距(this.compact) }) {
      设置分组卡片({ 是否深色: this.isDark, 标题: $r('app.string.official_ai_available'),
        trailingTitle: $r('app.string.official_ai_used'),
        trailingHelpTitle: $r('app.string.official_ai_billing_help'), trailingHelpBody: $r('app.string.official_ai_rules'),
        打开说明回调: (_title: Resource, _body: Resource): void => { this.showBillingHelp(); } }) {
        Column({ space: 8 }) {
          Row({ space: 12 }) {
            Column() { this.creditAmount(false); }.layoutWeight(1).alignItems(HorizontalAlign.Start)
            Column() { this.creditAmount(true); }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          }.width('100%').alignItems(VerticalAlign.Bottom)
          Text(this.wallet?.generationEnvironment === 'SANDBOX' ? $r('app.string.official_ai_test_balance_hint') : $r('app.string.official_ai_footer'))
            .fontSize(12).width('100%').textAlign(TextAlign.Start)
            .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
        }.width('100%').alignItems(HorizontalAlign.Start).padding({ bottom: 16 })
        Column({ space: 12 }) {
          FormSelectRow({ label: $r('app.string.official_ai_quantity'),
            options: this.quantityOptions().map((value: string): QuantityOption => ({ value: value })),
            value: String(this.quantity), selectedIndex: this.quantity - 1, isInteractive: !this.busy,
            onSelect: (index: number): void => { this.selectQuantity(index); } })
          if (this.wallet !== null && this.wallet.products.length > 0) {
            Row({ space: 16 }) {
              Text(this.text($r('app.string.official_ai_credits_label'), this.wallet.products[0].credits * this.quantity))
                .fontSize(24).fontWeight(FontWeight.Medium).layoutWeight(1)
                .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
              Text(this.totalPrice())
                .fontSize(this.product === null ? 12 : 24).fontWeight(FontWeight.Medium)
                .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
            }.width('100%').alignItems(VerticalAlign.Center)
            Text($r('app.string.official_ai_pack_use')).fontSize(12).width('100%').textAlign(TextAlign.Start)
              .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
          } else {
            Text($r('app.string.official_ai_product_pending')).fontSize(16).width('100%').textAlign(TextAlign.Start)
              .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
          }
          PrimaryActionButton({ label: !this.signedIn ? $r('app.string.official_ai_login') : this.activeAction === 'buy' ? $r('app.string.common_loading') :
            this.product === null ? $r('app.string.official_ai_buy_unavailable') : $r('app.string.official_ai_buy'),
            feedback: this.activeAction === 'buy' ? 'busy' : '',
            isInteractive: !this.busy && (!this.signedIn || (this.product !== null && this.wallet !== null)),
            onAction: (): void => { if (!this.signedIn) this.perform('login'); else this.buy(); } })
          if (this.notice !== '') {
            Text(this.notice).fontSize(12).width('100%').textAlign(TextAlign.Start)
              .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
          }
        }.width('100%').alignItems(HorizontalAlign.Start).padding(应用尺寸.间距_12)
          .backgroundColor(insetMaterialFill(appearanceElementColor(this.appearanceElements, 'surface_page', $r('app.color.surface_page'))))
          .border(SurfaceBorder.options())
          .borderRadius(appearanceElementRadius(this.appearanceElements, 应用尺寸.圆角_面板))
          .margin({ bottom: 应用尺寸.间距_12 })
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
