// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { DialogHeader } from './common/DialogHeader';
import { DisclosureChevron } from './common/DisclosureChevron';
import { PressFeedback } from '../utils/PressFeedback';
import { resourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 只拥有说明的排版和展开状态；首次已读与学习计时仍由学习页负责。 */
@CustomDialog
export struct StudyGuideDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  controller?: CustomDialogController;
  onConfirm: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @State private shortcutsExpanded: boolean = false;

  aboutToDisappear(): void { this.onClose(); }

  private confirm(): void {
    this.onConfirm();
    this.controller?.close();
    this.onClose();
  }

  private shortcutDescription(_locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), this.shortcutsExpanded ? $r('app.string.study_guide_collapse') :
      $r('app.string.study_guide_expand'));
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.study_guide_title'), showClose: false,
      actionLabel: $r('app.string.study_guide_start'), onAction: (): void => { this.confirm(); } })
  }

  @Builder
  private sectionTitle(label: Resource) {
    Text(label).fontSize(16).fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.text_primary')).width('100%')
  }

  @Builder
  private bodyText(body: Resource) {
    Text(body).fontSize(14).lineHeight(22)
      .fontColor($r('app.color.text_secondary')).width('100%')
  }

  @Builder
  private ratingRow(label: Resource, description: Resource, background: ResourceColor, foreground: ResourceColor) {
    Row({ space: 12 }) {
      Text(label).fontSize(16).fontWeight(FontWeight.Bold).fontColor(foreground)
        .width('24%').flexShrink(0)
      Text(description).fontSize(14).lineHeight(22).fontColor(foreground).layoutWeight(1)
    }.width('100%').constraintSize({ minHeight: 56 }).padding(12)
      .backgroundColor(background).borderRadius(应用尺寸.圆角_面板)
  }

  @Builder
  private explanation(title: Resource, body: Resource) {
    Column({ space: 4 }) {
      Text(title).fontSize(14).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      this.bodyText(body)
    }.width('100%')
  }

  @Builder
  private shortcuts() {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 8 }) {
        Text($r('app.string.study_guide_shortcuts_title')).fontSize(15).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary')).layoutWeight(1).textAlign(TextAlign.Start)
        DisclosureChevron().rotate({ angle: this.shortcutsExpanded ? 90 : 0 }).flexShrink(0)
      }.width('100%')
    }.width('100%').constraintSize({ minHeight: 48 }).padding({ top: 8, bottom: 8 })
      .backgroundColor(Color.Transparent).borderRadius(应用尺寸.圆角_面板)
      .attributeModifier(new PressFeedback()).stateEffect(false)
      .accessibilityDescription(this.shortcutDescription())
      .onClick((): void => { this.shortcutsExpanded = !this.shortcutsExpanded; })
    if (this.shortcutsExpanded) {
      Column({ space: 16 }) {
        this.explanation($r('app.string.glossary_shortcuts_label'), $r('app.string.glossary_shortcuts_help'))
        this.explanation($r('app.string.settings_study_gestures'), $r('app.string.study_gestures_help'))
        this.explanation($r('app.string.settings_tap_zones_label'), $r('app.string.settings_tap_zones_hint'))
      }.width('100%')
    }
  }

  @Builder
  private guideContent() {
    Column({ space: 20 }) {
      Text($r('app.string.study_guide_flow')).fontSize(14).lineHeight(22).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      Column({ space: 8 }) {
        this.sectionTitle($r('app.string.study_guide_ratings_title'))
        this.ratingRow($r('app.string.rating_again'), $r('app.string.study_guide_again'),
          $r('app.color.study_again_background'), $r('app.color.study_again_text'))
        this.ratingRow($r('app.string.rating_hard'), $r('app.string.study_guide_hard'),
          $r('app.color.study_hard_background'), $r('app.color.study_hard_text'))
        this.ratingRow($r('app.string.rating_good'), $r('app.string.study_guide_good'),
          $r('app.color.study_good_background'), $r('app.color.study_good_text'))
        this.ratingRow($r('app.string.rating_easy'), $r('app.string.study_guide_easy'),
          $r('app.color.study_easy_background'), $r('app.color.study_easy_text'))
        this.explanation($r('app.string.study_guide_interval_title'), $r('app.string.study_guide_interval'))
      }.width('100%')
      Column({ space: 12 }) {
        this.sectionTitle($r('app.string.study_guide_actions_title'))
        this.explanation($r('app.string.study_undo'), $r('app.string.study_guide_undo'))
        this.explanation($r('app.string.study_bury'), $r('app.string.study_guide_bury'))
        this.explanation($r('app.string.study_suspend'), $r('app.string.study_guide_suspend'))
      }.width('100%')
      Column({ space: 12 }) {
        this.sectionTitle($r('app.string.study_guide_modes_title'))
        this.explanation($r('app.string.study_auto_advance_title'), $r('app.string.study_guide_auto_advance'))
        this.explanation($r('app.string.study_guide_choice_title'), $r('app.string.study_guide_choice'))
      }.width('100%')
      Column({ space: 8 }) { this.shortcuts() }.width('100%')
        .border(SurfaceBorder.options({ top: 0.5 }))
    }.width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: false,
      header: () => { this.headerContent(); }, content: () => { this.guideContent(); } })
  }
}
