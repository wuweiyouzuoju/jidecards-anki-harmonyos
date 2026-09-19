// SPDX-License-Identifier: AGPL-3.0-or-later
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';
import { STUDY_HAPTICS_KEY, saveStudyHaptics } from '../../utils/StudyHaptics';
import { TapZones开关AppStorage键, 保存TapZones开关 } from '../../model/实验性功能存储';

/** 控制设置只移动既有操作偏好；完整手势配置见 SETTINGS_PARITY.md。 */
@Component
export struct ReviewControlsSettings {
  @Prop 是否深色: boolean = false;
  @Prop 简洁模式: boolean = true;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  @StorageLink(TapZones开关AppStorage键) private TapZones开关: boolean = false;
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};
  @StorageProp(STUDY_HAPTICS_KEY) @Watch('syncHapticsToggle') private hapticsEnabled: boolean = true;
  @State private hapticsToggle: boolean = true;
  @State private hapticsSaving: boolean = false;
  @State private hapticsSaveFailed: boolean = false;


  aboutToAppear(): void { this.hapticsToggle = this.hapticsEnabled; }
  /** 设置广播和保存失败都让开关显示实际生效值。 */
  private syncHapticsToggle(): void {
    this.hapticsToggle = this.hapticsEnabled;
  }

  /** 保存期间防止重复写入，失败恢复开关并显示可重试的提示。 */
  private async changeStudyHaptics(enabled: boolean): Promise<void> {
    if (this.hapticsSaving || enabled === this.hapticsEnabled) { return; }
    this.hapticsSaving = true;
    this.hapticsSaveFailed = false;
    this.hapticsToggle = enabled;
    try {
      await saveStudyHaptics(enabled);
    } catch (error) {
      this.hapticsSaveFailed = true;
    } finally {
      this.hapticsToggle = this.hapticsEnabled;
      this.hapticsSaving = false;
    }
  }


  build() {
    设置分组卡片({ 标题: $r('app.string.settings_controls_review'), 是否深色: this.是否深色 }) {
      Column({ space: 4 }) {
          Row() {
            Text($r('app.string.settings_study_haptics'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.hapticsToggle })
              .selectedColor(this.actionColor)
              .enabled(!this.hapticsSaving)
              .onChange((enabled: boolean): void => { this.changeStudyHaptics(enabled); })
          }
          .width('100%')
          .height(48)
          if (this.hapticsSaveFailed) {
            Text($r('app.string.settings_study_haptics_save_failed'))
              .fontSize(12)
              .fontColor($r('app.color.error_text'))
          }


        if (!this.简洁模式) {
          Row() {
            Column({ space: 3 }) {
              Text($r('app.string.settings_tap_zones_label')).fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.settings_controls_tap_hint')).fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).次文字)
            }.layoutWeight(1).alignItems(HorizontalAlign.Start)
            Button($r('app.string.field_help_button')).width(28).height(40).padding(0)
              .type(ButtonType.Normal).backgroundColor(Color.Transparent)
              .fontColor(设置面板色板_取(this.是否深色).次文字)
              .onClick((): void => {
                this.打开说明回调($r('app.string.settings_tap_zones_label'), $r('app.string.settings_tap_zones_hint'));
              })
            Toggle({ type: ToggleType.Switch, isOn: this.TapZones开关 })
              .selectedColor(this.actionColor)
              .onChange((enabled: boolean): void => { 保存TapZones开关(enabled); })
          }.width('100%').padding({ top: 8, bottom: 8 })
        }
      }.width('100%')
    }
  }
}
