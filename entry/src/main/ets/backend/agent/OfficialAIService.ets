// SPDX-License-Identifier: AGPL-3.0-or-later
import { authentication } from '@kit.AccountKit';
import { iap } from '@kit.IAPKit';
import { common } from '@kit.AbilityKit';
import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { loadAgentSecret, saveAgentSecret } from './AgentSecretStore';

export const OFFICIAL_AI_BASE: string = 'https://8.145.41.24/v1/official-ai';
export interface OfficialProduct { id: string; credits: number; }
export interface OfficialWallet {
  account: string; environment: string; balance: number; sandboxBalance: number; generationEnvironment: string; generationBalance: number; purchasedCredits?: number; usedCredits?: number; products: OfficialProduct[];

}
interface LoginReply { token: string; account: string; environment: string; }
interface LoginBody { code: string; environment: string; }
interface PurchaseBody { jwsPurchaseOrder: string; }
interface IntentBody { productId: string; quantity: number; }
interface IntentReply { intentId: string; }
interface PurchaseData { jwsPurchaseOrder?: string; }
interface ErrorDetail { code?: string; }
interface ErrorBody { error?: ErrorDetail; }
interface Headers { 'Content-Type': string; Authorization?: string; }

export class OfficialAIService {
  /** @throws {Error} 网络和身份失败由手动入口显示，不缓存余额。 */
  async request(path: string, body: string, token: string): Promise<string> {
    const session: http.HttpRequest = http.createHttp();
    try {
      const headers: Headers = { 'Content-Type': 'application/json' };
      if (token !== '') headers.Authorization = 'Bearer ' + token;
      const response: http.HttpResponse = await session.request(OFFICIAL_AI_BASE + path, {
        method: http.RequestMethod.POST, header: headers, extraData: body,
        connectTimeout: 15000, readTimeout: 70000, expectDataType: http.HttpDataType.STRING });
      const result: string = response.result as string;
      if (response.responseCode !== 200) {
        let code: string = 'official_service_unavailable';
        try { code = (JSON.parse(result) as ErrorBody).error?.code ?? code; } catch (error) {}
        throw new Error(code);
      }
      return result;
    } finally { session.destroy(); }
  }
  /** @throws {Error} 服务端确认登录后才保存账户会话。 */
  async login(context: common.UIAbilityContext, sandbox: boolean): Promise<void> {
    const request = new authentication.HuaweiIDProvider().createLoginWithHuaweiIDRequest();
    request.forceLogin = true;
    request.state = util.generateRandomUUID();
    const controller = new authentication.AuthenticationController(context);
    const response = await controller.executeRequest(request) as authentication.LoginWithHuaweiIDResponse;
    if (response.state !== request.state || !response.data?.authorizationCode) throw new Error('login_required');
    await this.completeLogin(response.data.authorizationCode, sandbox);
  }

  /** @throws {Error} 华为授权码经服务器验证后才写入本机会话。 */
  async completeLogin(code: string, sandbox: boolean): Promise<void> {
    const body: LoginBody = { code, environment: sandbox ? 'SANDBOX' : 'NORMAL' };
    const reply: LoginReply = JSON.parse(await this.request('/login', JSON.stringify(body), '')) as LoginReply;
    if (!reply.token || reply.environment !== body.environment) throw new Error('invalid_session');
    await saveAgentSecret('official', reply.token);
  }
  /** @throws {Error} 支付登录绑定当前 IAP 环境；无支付能力时仍允许普通账号登录。 */
  async loginForPayments(context: common.UIAbilityContext): Promise<void> {
    let sandbox: boolean = false;
    try { sandbox = await iap.isSandboxActivated(context); } catch (error) {}
    await this.login(context, sandbox);
  }
  /** @throws {Error} 退出仅删除本机会话，服务端余额保留。 */
  async logout(): Promise<void> { await saveAgentSecret('official', ''); }
  async token(): Promise<string> { return loadAgentSecret('official'); }
  /** @throws {Error} 未登录、离线不返回虚构余额。 */
  async wallet(): Promise<OfficialWallet> {
    const token: string = await this.token();
    if (!token) throw new Error('login_required');
    return JSON.parse(await this.request('/wallet', '{}', token)) as OfficialWallet;
  }
  /** @throws {Error} 先绑定服务器购买意图，再拉起系统收银台。 */
  async buy(context: common.UIAbilityContext, product: string, sandbox: boolean, quantity: number = 1): Promise<void> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('unsupported_order_quantity');
    if (await iap.isSandboxActivated(context) !== sandbox) throw new Error('order_environment_mismatch');
    const token: string = await this.token();
    const body: IntentBody = { productId: product, quantity: quantity };
    const intent: IntentReply = JSON.parse(await this.request('/intents', JSON.stringify(body), token)) as IntentReply;
    const parameter: iap.PurchaseParameter = { productType: iap.ProductType.CONSUMABLE, productId: product,
      developerPayload: intent.intentId, quantity: quantity };
    const result: iap.CreatePurchaseResult = await iap.createPurchase(context, parameter);
    await this.deliver(result.purchaseData, token);
  }
  /** @throws {Error} 发货失败保留华为未完成订单，后续补单重试。 */
  private async deliver(raw: string, token: string): Promise<void> {
    const data: PurchaseData = JSON.parse(raw) as PurchaseData;
    if (!data.jwsPurchaseOrder) throw new Error('invalid_purchase');
    const body: PurchaseBody = { jwsPurchaseOrder: data.jwsPurchaseOrder };
    // Server verifies and commits once before it confirms delivery with Huawei. Client never grants balance.
    await this.request('/purchases', JSON.stringify(body), token);
  }
  /** @throws {Error} 全部分页补单，由前台账户入口调用。 */
  async restore(context: common.UIAbilityContext): Promise<void> {
    const token: string = await this.token();
    if (!token) throw new Error('login_required');
    let cursor: string = '';
    do {
      const parameter: iap.QueryPurchasesParameter = { productType: iap.ProductType.CONSUMABLE,
        queryType: iap.PurchaseQueryType.UNFINISHED, continuationToken: cursor };
      const result: iap.QueryPurchaseResult = await iap.queryPurchases(context, parameter);
      for (const raw of result.purchaseDataList) await this.deliver(raw, token);
      cursor = result.continuationToken ?? '';
    } while (cursor !== '');
  }
}
