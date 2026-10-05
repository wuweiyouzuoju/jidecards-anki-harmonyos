// SPDX-License-Identifier: AGPL-3.0-or-later
import { reviewPreferences } from '../../backend/ReviewPreferencesService';
import { ReviewPreferences, ReviewPreferenceField, ReviewPreferenceEdit } from '../../proto/messages/PreferencesMessages';
import { preferenceSeconds } from '../../model/ReviewPreferencesStore';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { 设置分组卡片 } from './设置分组卡片';

/** 两个分类复用集合偏好保存入口；草稿只记录用户实际编辑的字段。 */
@Component
export struct ReviewPreferencesSettings {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 是否深色: boolean = false;
  @Prop displayOptions: boolean = false;
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @State private loaded: boolean = false;
  @State private busy: boolean = false;
  @State private failed: boolean = false;
  @State private invalid: boolean = false;
  @State private rollover: string = '';
  @State private learnAhead: string = '';
  @State private timeLimit: string = '';
  @State private remaining: boolean = false;
  @State private intervals: boolean = false;
  private rolloverEdited: boolean = false;
  private learnEdited: boolean = false;
  private timeEdited: boolean = false;
  private alive: boolean = false;
  private generation: number = 0;

  aboutToAppear(): void { this.alive = true; this.reload(); }
  aboutToDisappear(): void { this.alive = false; this.generation++; }

  private apply(value: ReviewPreferences, preserveDraft: boolean = false): void {
    if (!preserveDraft || !this.rolloverEdited) {
      this.rollover = String(value.rollover); this.rolloverEdited = false;
    }
    if (!preserveDraft || !this.learnEdited) {
      this.learnAhead = String(value.learnAheadSecs / 60); this.learnEdited = false;
    }
    if (!preserveDraft || !this.timeEdited) {
      this.timeLimit = String(value.timeLimitSecs / 60); this.timeEdited = false;
    }
    this.remaining = value.showRemaining;
    this.intervals = value.showIntervals;
    this.loaded = true;
  }

  private async reload(): Promise<void> {
    const generation: number = ++this.generation;
    this.busy = true; this.failed = false; this.invalid = false;
    try {
      const value: ReviewPreferences = await reviewPreferences.read();
      if (this.alive && generation === this.generation) this.apply(value, true);
    } catch (error) {
      if (this.alive && generation === this.generation) { this.failed = true; this.loaded = false; }
    } finally {
      if (this.alive && generation === this.generation) this.busy = false;
    }
  }

  private async save(edits: ReviewPreferenceEdit[]): Promise<void> {
    const generation: number = this.generation;
    const remaining: boolean = this.remaining;
    const intervals: boolean = this.intervals;
    for (const edit of edits) {
      if (edit.field === ReviewPreferenceField.ShowRemaining) this.remaining = edit.value !== 0;
      else if (edit.field === ReviewPreferenceField.ShowIntervals) this.intervals = edit.value !== 0;
    }
    this.busy = true; this.failed = false; this.invalid = false;
    try {
      const value: ReviewPreferences = await reviewPreferences.save(edits);
      if (this.alive && generation === this.generation) this.apply(value);
    } catch (error) {
      if (this.alive && generation === this.generation) {
        this.failed = true;
        this.remaining = remaining; this.intervals = intervals;
        // 重新核对真实开关值，但数字草稿仅在保存确认成功后清除，失败/重试不能覆盖输入。
        try {
          const actual: ReviewPreferences = await reviewPreferences.read();
          if (this.alive && generation === this.generation) this.apply(actual, true);
        } catch (readError) {
          if (this.alive && generation === this.generation) this.loaded = false;
        }
      }
    } finally {
      if (this.alive && generation === this.generation) this.busy = false;
    }
  }

  private saveScheduling(): void {
    if (this.busy || !this.loaded) return;
    const edits: ReviewPreferenceEdit[] = [];
    try {
      if (this.rolloverEdited) {
        if (!new RegExp('^\\d{1,2}$').test(this.rollover) || Number(this.rollover) > 23) throw new Error('invalid_rollover');
        edits.push({ field: ReviewPreferenceField.Rollover, value: Number(this.rollover) });
      }
      if (this.learnEdited) edits.push({ field: ReviewPreferenceField.LearnAheadSecs, value: preferenceSeconds(this.learnAhead) });
      if (this.timeEdited) edits.push({ field: ReviewPreferenceField.TimeLimitSecs, value: preferenceSeconds(this.timeLimit) });
      this.save(edits);
    } catch (error) { this.invalid = true; }
  }

  private changeDisplay(field: ReviewPreferenceField, value: boolean): void {
    if (this.busy || !this.loaded) return;
    if ((field === ReviewPreferenceField.ShowRemaining && value === this.remaining) ||
      (field === ReviewPreferenceField.ShowIntervals && value === this.intervals)) return;
    this.save([{ field: field, value: value ? 1 : 0 }]);
  }

  private fieldTitle(field: ReviewPreferenceField): string {
    if (field === ReviewPreferenceField.Rollover) return settingsItemText(this.getUIContext(), 'rollover', this.uiLanguage);
    if (field === ReviewPreferenceField.LearnAheadSecs) return settingsItemText(this.getUIContext(), 'learn_ahead', this.uiLanguage);
    return settingsItemText(this.getUIContext(), 'timebox', this.uiLanguage);
  }

  @Builder
  private numberField(field: ReviewPreferenceField) {
    Row({ space: 应用尺寸.间距_16 }) {
      Text(this.fieldTitle(field)).fontSize(应用尺寸.字号_按钮)
        .fontColor($r('app.color.text_primary')).textAlign(TextAlign.Start).layoutWeight(1)
      TextInput({ text: field === ReviewPreferenceField.Rollover ? this.rollover :
        (field === ReviewPreferenceField.LearnAheadSecs ? this.learnAhead : this.timeLimit) })
        .attributeModifier(new FormInputStyle()).width(96)
        .type(InputType.NUMBER_DECIMAL).enabled(this.loaded && !this.busy)
        .onChange((value: string): void => {
          if (field === ReviewPreferenceField.Rollover) { this.rollover = value; this.rolloverEdited = true; }
          else if (field === ReviewPreferenceField.LearnAheadSecs) { this.learnAhead = value; this.learnEdited = true; }
          else { this.timeLimit = value; this.timeEdited = true; }
        })
    }.width('100%').constraintSize({ minHeight: 48 })
  }

  build() {
    设置分组卡片({ groupId: this.displayOptions ? 'study_display' : 'global_review', 是否深色: this.是否深色,
      帮助标题: this.displayOptions ? null : $r('app.string.settings_core_review'),
      帮助正文: this.displayOptions ? null : $r('app.string.settings_core_review_help'), 打开说明回调: this.打开说明回调 }) {
      Column({ space: 应用尺寸.间距_8 }) {
        Text($r('app.string.settings_core_review_scope')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
        if (this.displayOptions) {
          SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'show_remaining', this.uiLanguage), isOn: this.remaining, tint: this.actionColor, isDark: this.是否深色,
            isInteractive: this.loaded && !this.busy,
            onChange: (value: boolean): void => { this.changeDisplay(ReviewPreferenceField.ShowRemaining, value); } })
          SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'show_intervals', this.uiLanguage), isOn: this.intervals, tint: this.actionColor, isDark: this.是否深色,
            isInteractive: this.loaded && !this.busy,
            onChange: (value: boolean): void => { this.changeDisplay(ReviewPreferenceField.ShowIntervals, value); } })
        } else {
          this.numberField(ReviewPreferenceField.Rollover)
          this.numberField(ReviewPreferenceField.LearnAheadSecs)
          this.numberField(ReviewPreferenceField.TimeLimitSecs)
          Text($r('app.string.settings_core_review_hint')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).width('100%')
          按下态按钮({ 文案: $r('app.string.deck_options_save'), 字色: this.actionColor,
            是否启用: this.loaded && !this.busy,
            点击回调: (): void => { this.saveScheduling(); } })
        }
        if (this.busy) { LoadingProgress().width(24).height(24).color(this.actionColor) }
        if (this.invalid) {
          Text($r('app.string.settings_core_review_invalid')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
        }
        if (this.failed) {
          Text($r('app.string.settings_core_review_failed')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
          按下态按钮({ 文案: $r('app.string.home_retry'), 字色: this.actionColor, 是否启用: !this.busy,
            点击回调: (): void => { if (!this.busy) this.reload(); } })
        }
      }.width('100%')
    }
  }
}
