// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { StudyRatingSurface } from '../utils/StudyRatingSurface';
import { GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
import { resourceText } from '../utils/UiFeedback';
import { RATING_AGAIN, RATING_EASY, RATING_GOOD, RATING_HARD } from '../proto/messages/SchedulerMessages';
/** 学习动作只跟随原阶段显示，不拥有评分或显示答案时序。 */
@Component
export struct StudyAnswerActionBar {
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop stage: string = 'question';
  @Prop busy: boolean = false;
  @Prop subtitles: string[] = [];
  显示答案回调: () => void = (): void => {};
  评分回调: (rating: number) => void = (_rating: number): void => {};
  private subtitle(index: number): string {
    return index < this.subtitles.length ? this.subtitles[index] : '';
  }

  private rate(rating: number): void { if (!this.busy && this.stage === 'answer') this.评分回调(rating); }
  private showAnswer(): void { if (this.showAnswerEnabled()) this.显示答案回调(); }
  private showAnswerEnabled(): boolean { return this.stage === 'question' && !this.busy; }
  private actionEnabled(wide: boolean): boolean {
    return wide ? this.showAnswerEnabled() : this.stage === 'answer' && !this.busy;
  }

  @Builder
  private actionButton(label: ResourceStr, subtitle: string, textColor: ResourceColor,
    fill: ResourceColor, wide: boolean, action: () => void) {
    Button({ type: ButtonType.Normal, stateEffect: false }) {
      Column({ space: 2 }) {
        Text(label).fontSize(应用尺寸.字号_按钮).fontWeight(wide ? 600 : FontWeight.Medium)
          .fontColor(textColor).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        if (subtitle.length > 0) {
          Text(subtitle).fontSize(12).fontColor(textColor).maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .width('100%')
    }
    .width(wide ? '100%' : undefined)
    .layoutWeight(wide ? 0 : 1)
    .height('100%')
    .padding(0)
    .backgroundColor(fill)
    .border(SurfaceBorder.options(应用尺寸.卡片边框))
    // 读取宿主的实时阶段；按值Builder参数会固定首次loading时的禁用值。
    .enabled(this.actionEnabled(wide))
    .attributeModifier(new StudyRatingSurface(this.surfaceMaterial, GLASS_HIGHLIGHT_COLORS, fill, !wide, this.actionColor,
      this.themeMode === 'dark' || (this.themeMode !== 'light' && this.systemDark)))
    // 原生Button的材质边框更新后恢复既有轮廓，与其他学习按钮顺序一致。
    .borderRadius(应用尺寸.圆角_面板)
    .clip(true)
    .accessibilityText(typeof label === 'string' ? label : resourceText(this.getUIContext(), label))
    .onClick((): void => {
      if (this.actionEnabled(wide)) action();
    })
  }

  build() {
    Row({ space: 应用尺寸.间距_8 }) {
      if (this.stage === 'answer') {
        this.actionButton($r('app.string.rating_again'), this.subtitle(0), $r('app.color.study_again_text'),
          $r('app.color.study_again_background'), false, (): void => { this.rate(RATING_AGAIN); })
        this.actionButton($r('app.string.rating_hard'), this.subtitle(1), $r('app.color.study_hard_text'),
          $r('app.color.study_hard_background'), false, (): void => { this.rate(RATING_HARD); })
        this.actionButton($r('app.string.rating_good'), this.subtitle(2), $r('app.color.study_good_text'),
          $r('app.color.study_good_background'), false, (): void => { this.rate(RATING_GOOD); })
        this.actionButton($r('app.string.rating_easy'), this.subtitle(3), $r('app.color.study_easy_text'),
          $r('app.color.study_easy_background'), false, (): void => { this.rate(RATING_EASY); })
      } else {
        this.actionButton($r('app.string.study_show_answer'), '', this.actionColor,
          $r('app.color.surface_card'), true, (): void => { this.showAnswer(); })
      }
    }.width('100%').height(应用尺寸.行动按钮高度)
  }
}
