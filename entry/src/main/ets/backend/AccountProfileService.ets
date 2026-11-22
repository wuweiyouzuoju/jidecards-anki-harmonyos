// SPDX-License-Identifier: AGPL-3.0-or-later
import { authentication } from '@kit.AccountKit';
import { util } from '@kit.ArkTS';
import { downloadProfileAvatar } from './ProfileAvatarPicker';
import { common } from '@kit.AbilityKit';
import { OfficialAIService } from './agent/OfficialAIService';
import { AccountProfile, NICKNAME_LIMIT, isProfileAvatar } from '../model/AccountProfile';

interface ProfileSession { account: string; environment: string; }
interface ProfileAuthorizationCode { code: string; environment: string; }
export interface HuaweiProfileImport { nickname: string; avatar: string; }

export class AccountProfileService {
  private loadedToken: string = '';
  private readonly account: OfficialAIService = new OfficialAIService();

  /** @throws {Error} 用户取消授权或会话保存失败时交给界面处理。 */
  async login(context: common.UIAbilityContext): Promise<void> {
    const data = await this.authorizeHuaweiProfile(context);
    await this.account.completeLogin(data.authorizationCode ?? '', false);
    const profile: AccountProfile | null = await this.view();
    if (profile === null || profile.revision !== 0) return;
    const defaults: HuaweiProfileImport = await this.readHuaweiProfile(data);
    if (defaults.nickname || defaults.avatar) {
      try {
        await this.save({ nickname: defaults.nickname, avatar: defaults.avatar || profile.avatar, revision: profile.revision });
      } catch (error) {
        if ((error as Error).message !== 'profile_changed') throw error as Error;
        // 另一台设备已建立自己的资料；本次登录保留那份资料。
      }
    }
  }

  /** @throws {Error} 本机会话删除失败时保留登录状态。 */
  logout(): Promise<void> { return this.account.logout(); }

  async view(): Promise<AccountProfile | null> {
    this.loadedToken = '';
    const token: string = await this.account.token();
    if (!token) return null;
    try {
      const profile: AccountProfile = await this.request('view', '{}', token);
      this.loadedToken = token;
      return profile;
    } catch (error) {
      if ((error as Error).message === 'login_required') return null;
      throw error as Error;
    }
  }

  /** @throws {Error} 用户取消、账号不一致或资料获取失败时保留原资料。 */
  async importHuaweiProfile(context: common.UIAbilityContext): Promise<HuaweiProfileImport> {
    const token: string = await this.account.token();
    if (!token || token !== this.loadedToken) throw new Error('login_required');
    const current: ProfileSession = JSON.parse(await this.account.request('/session', '{}', token)) as ProfileSession;
    const data = await this.authorizeHuaweiProfile(context);
    const body: ProfileAuthorizationCode = { code: data.authorizationCode ?? '', environment: current.environment };
    const verified: ProfileSession = JSON.parse(await this.account.request('/login', JSON.stringify(body), '')) as ProfileSession;
    if (!current.account || verified.account !== current.account || token !== await this.account.token()) {
      throw new Error('account_profile_authorization_failed');
    }
    const imported: HuaweiProfileImport = await this.readHuaweiProfile(data);
    if (!imported.nickname && !imported.avatar) throw new Error('account_profile_authorization_failed');
    return imported;
  }

  /** @throws {Error} 用户取消、授权状态不一致或未授予 profile 时由 importHuaweiProfile 交给界面。 */
  private async authorizeHuaweiProfile(context: common.UIAbilityContext): Promise<authentication.AuthorizationWithHuaweiIDCredential> {
    const request = new authentication.HuaweiIDProvider().createAuthorizationWithHuaweiIDRequest();
    request.scopes = ['profile'];
    request.permissions = ['serviceauthcode'];
    request.forceAuthorization = true;
    request.state = util.generateRandomUUID();
    const controller = new authentication.AuthenticationController(context);
    const result = await controller.executeRequest(request) as authentication.AuthorizationWithHuaweiIDResponse;
    const data = result.data;
    if (result.state !== request.state || !data?.authorizationCode || !data.authorizedScopes?.includes('profile')) {
      throw new Error('account_profile_authorization_failed');
    }
    return data;
  }

  private async readHuaweiProfile(data: authentication.AuthorizationWithHuaweiIDCredential): Promise<HuaweiProfileImport> {
    const nickname: string = Array.from(data.nickName?.trim() ?? '').slice(0, NICKNAME_LIMIT).join('');
    let avatar: string = '';
    if (data.avatarUri) {
      try { avatar = await downloadProfileAvatar(data.avatarUri); }
      catch (error) { /* 头像地址过期时仍可使用华为昵称登录。 */ }
    }
    return { nickname, avatar };
  }

  /** @throws {Error} 会话变更、版本冲突或网络失败时不改写草稿。 */
  async save(profile: AccountProfile): Promise<AccountProfile> {
    const token: string = await this.account.token();
    if (!token || token !== this.loadedToken) throw new Error('login_required');
    return this.request('save', JSON.stringify(profile), token);
  }

  /** @throws {Error} 请求或响应无效时保留可重试的失败。 */
  private async request(action: string, body: string, token: string): Promise<AccountProfile> {
    const raw: string = await this.account.request('/profile/' + action, body, token);
    try {
      const profile: AccountProfile = JSON.parse(raw) as AccountProfile;
      if (typeof profile.nickname !== 'string' || !isProfileAvatar(profile.avatar) ||
        !Number.isSafeInteger(profile.revision) || profile.revision < 0) throw new Error('invalid_profile_reply');
      return profile;
    } catch (error) {
      throw new Error('invalid_profile_reply');
    }
  }
}
