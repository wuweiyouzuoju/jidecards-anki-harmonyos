// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { AccountProfileService, HuaweiProfileImport } from '../../backend/AccountProfileService';
import { appInterface } from '../../backend/AppInterfaceService';
import { AccountProfile, NICKNAME_LIMIT, DEFAULT_PROFILE_AVATAR } from '../../model/AccountProfile';
import { AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ProfileAvatarImage } from '../account/ProfileAvatarImage';
import { PressFeedback } from '../../utils/PressFeedback';
import { chooseProfileAvatar } from '../../backend/ProfileAvatarPicker';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 设置分组卡片 } from './设置分组卡片';

@Component
export struct HuaweiAccountSettings {
  @Prop isDark: boolean = false;
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @State private profile: AccountProfile | null = null;
  @State private loaded: boolean = false;
  @State private busy: boolean = false;
  @State private nickname: string = '';
  @State private avatar: string = DEFAULT_PROFILE_AVATAR;
  @State private statusKey: string = '';
  @State private saving: boolean = false;
  @State private profileWidth: number = 0;
  @State private actionsHeight: number = 0;
  private saveTimer: number = -1;
  private pendingSave: Promise<void> | null = null;
  private active: boolean = false;
  private readonly service: AccountProfileService = new AccountProfileService();
  onExternalUiChange: (active: boolean) => void = (_active: boolean): void => {};
  onOpenSync: () => void = (): void => {};

  aboutToAppear(): void {
    this.active = true;
    this.refresh();
  }

  aboutToDisappear(): void {
    this.flushSave();
    this.active = false;
    this.onExternalUiChange(false);
    appInterface.leave('huawei_account');
  }

  private dirty(): boolean {
    return this.profile !== null &&
      (this.profile.nickname !== this.nickname.trim() || this.profile.avatar !== this.avatar);
  }

  private canShow(id: string): boolean {
    if (id === 'account_profile_sync') return true;
    if (id === 'account_profile_login') return this.loaded && this.profile === null;
    return this.profile !== null;
  }

  private canAct(id: string): boolean {
    if (this.busy || (id === 'account_profile_logout' && this.saving)) return false;
    return true;
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.active) return;
    const controls: AppInterfaceControl[] = visibleInterfaceItems('huawei_account',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => this.canShow(item.id))
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: settingsItemText(this.getUIContext(), item.id, this.uiLanguage), enabled: this.canAct(item.id), selected: false }));
    appInterface.observe({ surface: 'huawei_account', sectionId: 'general', selectedId: '',
      optionIds: [], optionLabels: [], items: controls, controlsComplete: true, busy: this.busy || this.saving,
      values: [{ id: 'signed_in', value: this.loaded ? String(this.profile !== null) : 'unknown' },
        { id: 'dirty', value: String(this.dirty()) }] });
  }

  private present(profile: AccountProfile | null): void {
    if (!this.active) return;
    this.profile = profile;
    this.nickname = profile?.nickname ?? '';
    this.avatar = profile?.avatar ?? DEFAULT_PROFILE_AVATAR;
    this.loaded = true;
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy || !this.active) return;
    this.busy = true;
    this.publishInterface();
    try {
      await task();
    } catch (error) {
      if (!this.active) return;
      const code: string = (error as Error).message;
      if (code === 'login_required') {
        this.present(null);
        this.statusKey = 'account_session_expired';
      } else if (code === 'profile_changed') {
        this.statusKey = 'account_profile_changed';
      } else {
        this.statusKey = code === 'account_login_failed' ? 'leaderboard_login_failed' : 'account_profile_failed';
      }
    } finally {
      if (this.active) {
        this.busy = false;
        this.publishInterface();
      }
    }
  }

  private refresh(): void {
    this.run(async (): Promise<void> => {
      const profile: AccountProfile | null = await this.service.view();
      this.present(profile);
      if (this.active) this.statusKey = '';
    });
  }

  private login(): void {
    this.run(async (): Promise<void> => {
      this.onExternalUiChange(true);
      try {
        try {
          await this.service.login(this.getUIContext().getHostContext() as common.UIAbilityContext);
        } catch (error) {
          throw new Error('account_login_failed');
        }
        this.present(await this.service.view());
        if (this.active) this.statusKey = '';
      } finally {
        this.onExternalUiChange(false);
      }
    });
  }

  private queueSave(): void {
    if (this.saveTimer !== -1) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout((): void => { this.flushSave(); }, 650);
  }

  private flushSave(): void {
    if (this.saveTimer !== -1) {
      clearTimeout(this.saveTimer);
      this.saveTimer = -1;
    }
    if (this.pendingSave !== null || !this.dirty()) return;
    this.saving = true;
    this.statusKey = '';
    this.publishInterface();
    this.pendingSave = this.saveDrafts().catch((error: Error): void => {
      if (this.active) {
        if (error.message === 'login_required') {
          this.present(null);
          this.statusKey = 'account_session_expired';
        } else {
          this.statusKey = 'account_profile_failed';
        }
      }
    }).finally((): void => {
      this.pendingSave = null;
      this.saving = false;
      this.publishInterface();
    });
  }

  /** @throws {Error} 保存或冲突重读失败时保留草稿，由 flushSave 的 catch 显示失败。 */
  private async saveDrafts(): Promise<void> {
    while (this.profile !== null && this.dirty()) {
      const previous: AccountProfile = this.profile;
      const nickname: string = this.nickname.trim();
      const avatar: string = this.avatar;
      let saved: AccountProfile;
      try {
        saved = await this.service.save({ nickname, avatar, revision: previous.revision });
      } catch (error) {
        if ((error as Error).message !== 'profile_changed') throw error as Error;
        const latest: AccountProfile | null = await this.service.view();
        if (latest === null) throw new Error('login_required');
        saved = await this.service.save({
          nickname: nickname === previous.nickname ? latest.nickname : nickname,
          avatar: avatar === previous.avatar ? latest.avatar : avatar,
          revision: latest.revision
        });
      }
      this.profile = saved;
      if (this.nickname.trim() === nickname && nickname !== saved.nickname) this.nickname = saved.nickname;
      if (this.avatar === avatar && avatar !== saved.avatar) this.avatar = saved.avatar;
    }
    if (this.active) this.statusKey = 'account_profile_saved';
  }

  private confirmLogout(): void {
    if (!this.active || !this.canAct('account_profile_logout') || this.profile === null) return;
    const title: Resource = $r('app.string.account_profile_logout');
    this.getUIContext().showAlertDialog({
      title,
      message: $r('app.string.account_profile_logout_confirm'),
      buttons: [
        { value: $r('app.string.cancel'), action: (): void => {} },
        { value: title, action: (): void => { if (this.active) this.logout(); } }
      ],
      buttonDirection: DialogButtonDirection.AUTO
    });
  }

  private logout(): void {
    this.flushSave();
    this.run(async (): Promise<void> => {
      await this.pendingSave;
      if (this.dirty()) return;
      await this.service.logout();
      this.present(null);
      if (this.active) this.statusKey = '';
    });
  }

  private editNickname(value: string): void {
    if (value === this.nickname) return;
    this.nickname = value;
    this.statusKey = '';
    this.queueSave();
    this.publishInterface();
  }

  private showAvatarOptions(): void {
    if (!this.active || this.busy || this.profile === null) return;
    this.getUIContext().showAlertDialog({
      title: $r('app.string.account_profile_avatar'),
      message: '',
      buttons: [
        { value: $r('app.string.cancel'), action: (): void => {} },
        { value: $r('app.string.deck_customize_background_pick'), action: (): void => { this.pickAvatar(); } },
        { value: $r('app.string.account_profile_use_huawei'), action: (): void => { this.importHuaweiProfile(); } }
      ],
      buttonDirection: DialogButtonDirection.AUTO
    });
  }

  private importHuaweiProfile(): void {
    this.run(async (): Promise<void> => {
      this.onExternalUiChange(true);
      try {
        const imported: HuaweiProfileImport = await this.service.importHuaweiProfile(
          this.getUIContext().getHostContext() as common.UIAbilityContext);
        if (!this.active) return;
        if (imported.nickname !== '') this.nickname = imported.nickname;
        if (imported.avatar !== '') this.avatar = imported.avatar;
        this.flushSave();
      } catch (error) {
        if ((error as Error).message === 'login_required') throw error as Error;
        if (this.active) this.statusKey = 'account_profile_authorization_failed';
      } finally {
        this.onExternalUiChange(false);
      }
    });
  }

  private pickAvatar(): void {
    this.run(async (): Promise<void> => {
      this.onExternalUiChange(true);
      try {
        const selected: string | null = await chooseProfileAvatar(this.getUIContext().getHostContext() as common.UIAbilityContext);
        if (selected !== null && this.active) {
          this.avatar = selected;
          this.flushSave();
        }
      } finally {
        this.onExternalUiChange(false);
      }
    });
  }

  @Builder
  private syncAction() {
    SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'account_profile_sync', this.uiLanguage),
      isInteractive: !this.busy, onAction: (): void => this.onOpenSync() })
  }

  private avatarDiameter(): number {
    const height: number = this.actionsHeight > 0 ? this.actionsHeight : 152;
    return this.profileWidth > 0 ? Math.min(height, Math.floor(this.profileWidth * 0.42)) : 88;
  }

  @Builder
  private profileInput() {
    Row({ space: 应用尺寸.间距_16 }) {
      Column() {
        ProfileAvatarImage({ avatar: this.avatar, diameter: this.avatarDiameter() })
      }.width(this.avatarDiameter())
        .accessibilityGroup(true)
        .accessibilityText(settingsItemText(this.getUIContext(), 'account_profile_avatar', this.uiLanguage))
        .enabled(!this.busy).attributeModifier(new PressFeedback())
        .onClick((): void => this.showAvatarOptions())
      Column({ space: 应用尺寸.间距_8 }) {
        Row({ space: 应用尺寸.间距_8 }) {
          Text(settingsItemText(this.getUIContext(), 'account_profile_nickname', this.uiLanguage))
            .fontSize(应用尺寸.字号_正文).constraintSize({ maxWidth: '40%' })
            .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
          TextInput({ text: this.nickname, placeholder: settingsItemText(this.getUIContext(), 'account_profile_nickname', this.uiLanguage) })
            .layoutWeight(1).maxLength(NICKNAME_LIMIT).enabled(!this.busy)
            .accessibilityText(settingsItemText(this.getUIContext(), 'account_profile_nickname', this.uiLanguage))
            .onChange((value: string): void => this.editNickname(value))
            .onBlur((): void => this.flushSave())
            .onSubmit((): void => this.flushSave())
        }.width('100%').alignItems(VerticalAlign.Center)
        this.syncAction()
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'account_profile_logout', this.uiLanguage),
          isInteractive: this.canAct('account_profile_logout'), onAction: (): void => this.confirmLogout() })
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        .onAreaChange((_old: Area, area: Area): void => { this.actionsHeight = Math.round(Number(area.height)); })
    }.width('100%').alignItems(VerticalAlign.Top)
      .onAreaChange((_old: Area, area: Area): void => { this.profileWidth = Math.round(Number(area.width)); })
      .padding({ top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_12 })
  }

  build() {
    设置分组卡片({ groupId: 'huawei_account', 是否深色: this.isDark }) {
      Column({ space: 应用尺寸.间距_8 }) {
        Text($r('app.string.account_profile_hint')).width('100%').fontSize(应用尺寸.字号_正文_小)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
        if (this.canShow('account_profile_login')) {
          SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'account_profile_login', this.uiLanguage),
            isInteractive: !this.busy, showDisclosure: false, onAction: (): void => this.login() })
        }
        if (this.profile !== null) this.profileInput()
        if (this.busy || this.saving || this.statusKey !== '') {
          Text(this.busy || this.saving ? $r('app.string.common_loading') : namedResourceText(this.getUIContext(), this.statusKey))
            .width('100%').fontSize(应用尺寸.字号_正文_小)
            .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
        }
        if (this.dirty() && !this.busy && !this.saving && this.statusKey === 'account_profile_failed') {
          SettingsActionRow({ title: $r('app.string.common_retry'), showDisclosure: false,
            onAction: (): void => this.flushSave() })
        }
        if (!this.loaded && !this.busy && this.statusKey !== '') {
          SettingsActionRow({ title: $r('app.string.common_retry'), showDisclosure: false,
            onAction: (): void => this.refresh() })
        }
        if (this.profile === null) this.syncAction()
      }.width('100%').alignItems(HorizontalAlign.Start)
    }
  }
}
