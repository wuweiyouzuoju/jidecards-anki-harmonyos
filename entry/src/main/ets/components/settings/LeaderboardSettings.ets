// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { appInterface } from '../../backend/AppInterfaceService';
import { LEADERBOARD_HIDDEN_KEY, saveLeaderboardHidden } from '../../model/LeaderboardVisibility';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { showToastSafely } from '../../utils/UiFeedback';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { 设置分组卡片 } from './设置分组卡片';

@Component
export struct LeaderboardSettings {
  @Prop isDark: boolean = false;
  @Prop fromBoard: boolean = false;
  @Prop anonymous: boolean = true;
  @Prop anonymousHint: ResourceStr = '';
  @Prop canChangeAnonymous: boolean = false;
  onAnonymousChange: (anonymous: boolean) => void = (_anonymous: boolean): void => {};
  @StorageProp(LEADERBOARD_HIDDEN_KEY) @Watch('publish') private hidden: boolean = false;
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @State private saving: boolean = false;
  private active: boolean = false;

  aboutToAppear(): void { this.active = true; this.publish(); }
  aboutToDisappear(): void { this.active = false; appInterface.leave('leaderboard_settings'); }

  private publish(): void {
    if (!this.active) return;
    appInterface.observe({ surface: 'leaderboard_settings', sectionId: 'advanced', selectedId: '',
      optionIds: [], optionLabels: [], controlsComplete: true, busy: this.saving,
      items: [{ id: 'leaderboard_show_home', title: '', titleKey: 'leaderboard_show_home',
        enabled: !this.saving, selected: !this.hidden }],
      values: [{ id: 'visible', value: String(!this.hidden) }] });
  }

  private async setVisible(visible: boolean): Promise<void> {
    if (this.saving || visible === !this.hidden) return;
    this.saving = true;
    this.publish();
    try {
      await saveLeaderboardHidden(this.getUIContext().getHostContext() as common.UIAbilityContext, !visible);
    } catch (error) {
      if (this.active) showToastSafely(this.getUIContext(), { message: $r('app.string.settings_local_save_failed') });
    } finally {
      this.saving = false;
      this.publish();
    }
  }

  @Builder
  private rows() {
    if (this.fromBoard) {
      SettingsToggleRow({ title: $r('app.string.leaderboard_publish_anonymous'), hint: this.anonymousHint,
        isOn: this.anonymous, isInteractive: this.canChangeAnonymous, isDark: this.isDark,
        onChange: (anonymous: boolean): void => { this.onAnonymousChange(anonymous); } })
    }
    SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'leaderboard_show_home', this.language),
      isOn: !this.hidden, isInteractive: !this.saving, isDark: this.isDark,
      onChange: (visible: boolean): void => { this.setVisible(visible); } })
  }

  build() {
    if (this.fromBoard) {
      Column() { this.rows() }.width('100%')
    } else {
      设置分组卡片({ groupId: 'leaderboard_settings', 是否深色: this.isDark }) {
        this.rows()
      }
    }
  }
}
