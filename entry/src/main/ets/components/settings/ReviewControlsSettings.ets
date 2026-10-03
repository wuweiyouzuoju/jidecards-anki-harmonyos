// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { HelpLabel } from '../common/HelpLabel';
import { SelectStyle } from '../../utils/SelectStyle';
import { resourceText } from '../../utils/UiFeedback';
import { StudyQuickAnswerMode } from '../../model/StudyGestures';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';
import { STUDY_HAPTICS_KEY, saveStudyHaptics } from '../../utils/StudyHaptics';
import { STUDY_QUICK_ANSWER_KEY, loadStudyQuickAnswerMode,
  saveStudyQuickAnswerMode } from '../../model/实验性功能存储';

/** 快捷答题模式互斥；评分触感使用独立本机偏好。 */
@Component
export struct ReviewControlsSettings {
  @Prop 是否深色: boolean = false;
  @Prop 简洁模式: boolean = true;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  @StorageLink(STUDY_QUICK_ANSWER_KEY) @Watch('syncControls')
  private quickAnswerMode: StudyQuickAnswerMode = StudyQuickAnswerMode.Off;
  @State private selectedMode: StudyQuickAnswerMode = StudyQuickAnswerMode.Off;
  @State private controlsSaving: boolean = false;
  @State private controlsFailed: boolean = false;
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};
  @StorageProp(STUDY_HAPTICS_KEY) @Watch('syncHapticsToggle') private hapticsEnabled: boolean = true;
  @State private hapticsToggle: boolean = true;
  @State private hapticsSaving: boolean = false;
  @State private hapticsSaveFailed: boolean = false;


  aboutToAppear(): void {
    this.hapticsToggle = this.hapticsEnabled;
    this.loadControls();
  }

  private async loadControls(): Promise<void> {
    this.controlsSaving = true;
    this.controlsFailed = false;
    try {
      await loadStudyQuickAnswerMode();
    } catch (error) {
      this.controlsFailed = true;
    } finally {
      this.syncControls();
      this.controlsSaving = false;
    }
  }

  private syncControls(): void {
    this.selectedMode = this.quickAnswerMode;
  }

  private modeOptions(): SelectOption[] {
    return [
      { value: resourceText(this.getUIContext(), $r('app.string.settings_quick_answer_off')) },
      { value: resourceText(this.getUIContext(), $r('app.string.settings_tap_zones_label')) },
      { value: resourceText(this.getUIContext(), $r('app.string.settings_study_gestures')) }
    ];
  }

  private modeLabel(): Resource {
    if (this.selectedMode === StudyQuickAnswerMode.TapZones) return $r('app.string.settings_tap_zones_label');
    if (this.selectedMode === StudyQuickAnswerMode.Gestures) return $r('app.string.settings_study_gestures');
    return $r('app.string.settings_quick_answer_off');
  }

  private async changeControl(index: number): Promise<void> {
    if (this.controlsSaving || index < 0 || index > 2 || !Number.isInteger(index)) return;
    if (index === this.quickAnswerMode) return;
    const mode: StudyQuickAnswerMode = index;
    this.controlsSaving = true;
    this.controlsFailed = false;
    this.selectedMode = mode;
    try {
      await saveStudyQuickAnswerMode(mode);
    } catch (error) {
      this.controlsFailed = true;
    } finally {
      this.syncControls();
      this.controlsSaving = false;
    }
  }
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
    设置分组卡片({ groupId: 'review_controls', 是否深色: this.是否深色 }) {
      Column({ space: 4 }) {
          SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'study_haptics'),
            isOn: this.hapticsToggle, tint: this.actionColor, isDark: this.是否深色,
            isInteractive: !this.hapticsSaving,
            onChange: (enabled: boolean): void => { this.changeStudyHaptics(enabled); } })
          if (this.hapticsSaveFailed) {
            Text($r('app.string.settings_study_haptics_save_failed'))
              .fontSize(12)
              .fontColor($r('app.color.error_text'))
          }


        Row() {
          HelpLabel({ title: settingsItemText(this.getUIContext(), 'study_quick_answer'), onHelp: (): void => {
            this.打开说明回调($r('app.string.settings_quick_answer'), $r('app.string.settings_quick_answer_help'));
          } }).layoutWeight(1)
          Select(this.modeOptions())
            .selected(this.selectedMode)
            .value(resourceText(this.getUIContext(), this.modeLabel()))
            .attributeModifier(new SelectStyle())
            .height(SelectStyle.controlHeight)
            .padding(SelectStyle.controlPadding)
            .space(SelectStyle.controlSpace)
            .width(SelectStyle.fieldWidth)
            .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
            .font(SelectStyle.controlFont)
            .optionFont(SelectStyle.optionFont)
            .selectedOptionFont(SelectStyle.selectedOptionFont)
            .textModifier(SelectStyle.labelText())
            .borderRadius(SelectStyle.controlRadius)
            .enabled(!this.controlsSaving)
            .onSelect((index: number): void => { this.changeControl(index); })
        }.width('100%').constraintSize({ minHeight: 48 })
        Text(this.selectedMode === StudyQuickAnswerMode.TapZones ? $r('app.string.settings_controls_tap_hint') :
          (this.selectedMode === StudyQuickAnswerMode.Gestures ? $r('app.string.settings_study_gestures_hint') :
            $r('app.string.settings_quick_answer_off_hint')))
          .fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        if (this.controlsFailed) {
          Text($r('app.string.settings_study_controls_failed')).fontSize(12)
            .fontColor($r('app.color.error_text'))
        }
      }.width('100%')
    }
  }
}
