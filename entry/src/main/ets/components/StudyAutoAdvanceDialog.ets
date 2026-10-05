// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../utils/PressFeedback';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { DisclosureChevron } from './common/DisclosureChevron';
import { StudyAutoAdvanceDraft, StudyAdvanceField } from '../model/StudyAutoAdvanceDraft';
import { StudyOptions } from '../model/StudyTiming';
import { DialogHeader } from './common/DialogHeader';
import { 应用尺寸 } from '../utils/应用尺寸';
import { showToastSafely, resourceText } from '../utils/UiFeedback';

@CustomDialog
export struct StudyAutoAdvanceDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  controller?: CustomDialogController;
  draft: StudyAutoAdvanceDraft = new StudyAutoAdvanceDraft(new StudyOptions(), false, 0);
  choice: boolean = false;
  onConfirm: (draft: StudyAutoAdvanceDraft) => void = (_draft: StudyAutoAdvanceDraft): void => {};
  onClose: () => void = (): void => {};
  registerBack: (back: () => void) => void = (_back: () => void): void => {};
  @State private field: StudyAdvanceField = StudyAdvanceField.Main;
  @State private selected: number = 0;
  @State private isAdvanceEnabled: boolean = false;
  @State private toggleVersion: number = 0;

  aboutToAppear(): void {
    this.isAdvanceEnabled = this.draft.enabled;
    this.registerBack((): void => { this.back(); });
  }
  aboutToDisappear(): void { this.onClose(); }

  private title(field: StudyAdvanceField): Resource {
    switch (field) {
      case StudyAdvanceField.QuestionTime: return $r('app.string.study_auto_advance_question');
      case StudyAdvanceField.AnswerTime: return $r('app.string.study_auto_advance_answer');
      case StudyAdvanceField.QuestionAction: return $r('app.string.deck_questionAction_label');
      case StudyAdvanceField.AnswerAction: return $r('app.string.deck_answerAction_label');
      case StudyAdvanceField.FeedbackTime: return $r('app.string.study_auto_advance_feedback');
      default: return $r('app.string.study_auto_advance_title');
    }
  }

  private label(field: StudyAdvanceField, value: number, _locale: string = this.uiLanguage): string {
    if (field === StudyAdvanceField.QuestionAction) {
      return resourceText(this.getUIContext(), value === 1 ?
        $r('app.string.deck_opt_show_reminder') : $r('app.string.deck_opt_show_answer'));
    }
    if (field === StudyAdvanceField.AnswerAction) {
      const labels: Resource[] = [$r('app.string.deck_opt_bury_card'), $r('app.string.deck_opt_answer_again'),
        $r('app.string.deck_opt_answer_good'), $r('app.string.deck_opt_answer_hard'), $r('app.string.deck_opt_show_reminder')];
      return resourceText(this.getUIContext(), labels[value]);
    }
    return value > 0 ? resourceText(this.getUIContext(), $r('app.string.study_auto_advance_seconds'), value.toString()) :
      resourceText(this.getUIContext(), $r('app.string.study_auto_advance_off'));
  }

  private open(field: StudyAdvanceField): void {
    this.draft.open(field);
    this.selected = this.draft.selected;
    this.field = field;
  }

  private back(): void {
    if (this.draft.back()) this.controller?.close();
    else this.field = StudyAdvanceField.Main;
  }

  private changeAdvance(value: boolean, _locale: string = this.uiLanguage): void {
    if (value && !this.draft.canEnable()) {
      this.isAdvanceEnabled = false;
      this.draft.enabled = false;
      // 拒绝开启时重建原生开关，避免原生内部选中态与未变的 false 状态脱节。
      this.toggleVersion += 1;
      showToastSafely(this.getUIContext(), {
        message: resourceText(this.getUIContext(), $r('app.string.study_auto_advance_set_time')),
        textColor: $r('app.color.text_primary'), backgroundColor: $r('app.color.surface_card')
      });
      return;
    }
    this.isAdvanceEnabled = value;
    this.draft.enabled = value;
  }

  private confirm(): void {
    if (this.field !== StudyAdvanceField.Main) {
      this.draft.selected = this.selected;
      this.draft.confirmField();
      this.isAdvanceEnabled = this.draft.enabled;
      this.field = StudyAdvanceField.Main;
      return;
    }
    this.draft.enabled = this.isAdvanceEnabled;
    this.onConfirm(this.draft);
    this.controller?.close();
  }

  @Builder
  setting(field: StudyAdvanceField) {
    Row({ space: 应用尺寸.间距_12 }) {
      Column({ space: 4 }) {
        Text(this.title(field)).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
        Text(this.label(field, this.draft.value(field)))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      DisclosureChevron({ tint: $r('app.color.text_secondary') })
    }
    .width('100%').constraintSize({ minHeight: 64 }).padding({ left: 8, right: 8, top: 8, bottom: 8 })
    .attributeModifier(new PressFeedback())
    .onClick((): void => { this.open(field); })
    Divider().color(SurfaceBorder.color()).strokeWidth(0.5)
  }

  build() {
    Column() {
      Column({ space: 应用尺寸.间距_12 }) {
        Text(this.title(this.field)).fontSize(18).fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary')).width('100%').textAlign(TextAlign.Center)
        Text($r('app.string.study_auto_advance_session_only'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        Scroll() {
          Column() {
            if (this.field === StudyAdvanceField.Main) {
              if (this.choice) {
                this.setting(StudyAdvanceField.FeedbackTime)
              } else {
                Row({ space: 应用尺寸.间距_12 }) {
                  Text($r('app.string.study_auto_advance_start')).fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary')).layoutWeight(1)
                  ForEach([this.toggleVersion], (_version: number) => {
                    Toggle({ type: ToggleType.Switch, isOn: this.isAdvanceEnabled })
                      .onChange((value: boolean): void => { this.changeAdvance(value); })
                  }, (version: number): string => version.toString())
                }.width('100%').constraintSize({ minHeight: 52 }).padding({ left: 8, right: 8 })
                this.setting(StudyAdvanceField.QuestionTime)
                this.setting(StudyAdvanceField.AnswerTime)
                this.setting(StudyAdvanceField.QuestionAction)
                this.setting(StudyAdvanceField.AnswerAction)
              }
            } else {
              ForEach(this.draft.choices(), (value: number) => {
                Row({ space: 应用尺寸.间距_12 }) {
                  Text(this.label(this.field, value)).fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary')).layoutWeight(1)
                }
                .width('100%').constraintSize({ minHeight: 48 }).padding({ left: 8, right: 8 })
                .borderRadius(应用尺寸.圆角_面板)
                .backgroundColor(this.selected === value ? $r('app.color.surface_page') : Color.Transparent)
                .accessibilitySelected(this.selected === value)
                .attributeModifier(new PressFeedback())
                .onClick((): void => { this.selected = value; })
              }, (value: number): string => `${this.field}-${value}`)
            }
          }.width('100%')
        }.width('100%').constraintSize({ maxHeight: '55%' }).scrollBar(BarState.Auto)
        DialogHeader({ title: '', closeLabel: $r('app.string.study_back'),
          actionLabel: $r('app.string.custom_study_confirm'), showDivider: false,
          onClose: (): void => { this.back(); }, onAction: (): void => { this.confirm(); } })
      }
      .width('88%').constraintSize({ maxWidth: 480, maxHeight: '85%' })
      .padding(应用尺寸.卡片内边距).backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片).border(SurfaceBorder.options())
    }.width('100%').alignItems(HorizontalAlign.Center)
  }
}
