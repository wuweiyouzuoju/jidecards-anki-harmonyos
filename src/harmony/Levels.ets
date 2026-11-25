// SPDX-License-Identifier: AGPL-3.0-or-later
import { LevelViewData, LevelAchievementView } from '../core/Levels';
import { UiTokens } from '../core/UiTokens';
import { themePalette } from '../core/Theme';
import { motionProfile } from '../core/Motion';
import { SurfaceViewport } from '../core/SurfaceLayout';
import { ActionButton } from './ActionButton';
import { DialogSurface } from './DialogSurface';
import { StateView } from './StateView';
import { SharedMedalIcon } from './MedalIcon';

/** 紧凑静态徽标；可点击入口由宿主组合，避免无回调的假按钮。 */
@Component
export struct SharedLevelBadge {
  @Prop model: LevelViewData = new LevelViewData();
  @Prop isDark: boolean = false;
  @Prop medalSource: ResourceStr = '';
  @Prop medalLabel: string = '';
  @Prop medalOrdinal: number = 0;

  build() {
    Row({ space: UiTokens.fieldGap }) {
      if (this.medalLabel.length > 0) {
        SharedMedalIcon({ source: this.medalSource, ordinal: this.medalOrdinal, glyphSize: 24, isDark: this.isDark })
          .accessibilityText(this.medalLabel)
      }
      Text(this.model.levelLabel).fontSize(UiTokens.controlSize).fontWeight(FontWeight.Bold)
        .fontColor(themePalette(this.isDark).action)
      if (this.model.title.length > 0) {
        Text(this.model.title).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).text)
      }
    }
    .constraintSize({ maxWidth: '100%' })
    .padding({ left: UiTokens.pageInset, right: UiTokens.pageInset, top: 8, bottom: 8 })
    .backgroundColor(themePalette(this.isDark).surface)
    .border({ width: 1, color: themePalette(this.isDark).border })
    .borderRadius(UiTokens.controlRadius)
  }
}

@Component
export struct SharedLevelCard {
  @Prop model: LevelViewData = new LevelViewData();
  @Prop detailsLabel: string = '';
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  @Prop medalSource: ResourceStr = '';
  @Prop medalLabel: string = '';
  @Prop medalOrdinal: number = 0;
  onOpenDetails: (() => void) | undefined = undefined;

  build() {
    Column({ space: UiTokens.sectionGap }) {
      Row({ space: UiTokens.sectionGap }) {
        if (this.medalLabel.length > 0) {
          SharedMedalIcon({ source: this.medalSource, ordinal: this.medalOrdinal, glyphSize: 52, isDark: this.isDark })
            .accessibilityText(this.medalLabel)
        }
        Text(this.model.levelLabel).fontSize(32).fontWeight(FontWeight.Bold)
          .fontColor(themePalette(this.isDark).action).layoutWeight(1)
      }.width('100%')
      if (this.model.title.length > 0) {
        Text(this.model.title).fontSize(UiTokens.titleSize).fontColor(themePalette(this.isDark).text).width('100%')
      }
      Progress({ value: this.model.progress * 100, total: 100, type: ProgressType.Linear })
        .width('100%').color(themePalette(this.isDark).action)
        .backgroundColor(themePalette(this.isDark).border).accessibilityText(this.model.progressLabel)
      Text(this.model.progressLabel).fontSize(UiTokens.bodySize)
        .fontColor(themePalette(this.isDark).secondaryText).width('100%')
      if (this.model.warningLabel.length > 0) {
        Text(this.model.warningLabel).fontSize(UiTokens.bodySize)
          .fontColor(themePalette(this.isDark).text).width('100%')
      }
      if (this.onOpenDetails !== undefined && this.detailsLabel.length > 0) {
        ActionButton({ label: this.detailsLabel, isDark: this.isDark, motionStyle: this.motionStyle,
          onAction: this.onOpenDetails })
      }
    }
    .alignItems(HorizontalAlign.Start).width('100%').padding(UiTokens.surfaceInset)
    .backgroundColor(themePalette(this.isDark).surface)
    .border({ width: 1, color: themePalette(this.isDark).border })
    .borderRadius(UiTokens.surfaceRadius)
  }
}

/** 正文而非第二个滚动/弹窗宿主；可放入页面、侧栏或既有 DialogSurface。 */
@Component
export struct SharedLevelDetails {
  @Prop model: LevelViewData = new LevelViewData();
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  @Prop medalSource: ResourceStr = '';
  @Prop medalLabel: string = '';
  @Prop medalOrdinal: number = 0;

  build() {
    Column({ space: UiTokens.sectionGap }) {
      SharedLevelCard({ model: this.model, isDark: this.isDark, motionStyle: this.motionStyle,
        medalSource: this.medalSource, medalLabel: this.medalLabel, medalOrdinal: this.medalOrdinal })
      Text(this.model.highestLabel).fontSize(UiTokens.bodySize)
        .fontColor(themePalette(this.isDark).secondaryText).width('100%')
      if (this.model.achievements.length > 0) {
        Text(this.model.achievementsLabel).fontSize(UiTokens.titleSize)
          .fontColor(themePalette(this.isDark).text).width('100%')
        ForEach(this.model.achievements, (item: LevelAchievementView) => {
          Text(item.label).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).text).width('100%')
            .padding(UiTokens.pageInset)
            .backgroundColor(themePalette(this.isDark).surface).borderRadius(UiTokens.controlRadius)
        }, (item: LevelAchievementView): string => item.id)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}

/** 晋级弹层可随时跳过；其余变化为轻提示。显隐、预警已读与反馈确认由宿主原子保存。 */
@Component
export struct SharedLevelFeedback {
  @Prop model: LevelViewData = new LevelViewData();
  @Prop kind: string = 'advanced';
  @Prop title: string = '';
  @Prop description: string = '';
  @Prop dismissLabel: string = '';
  @Prop statusText: string = '';
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  @Prop reduceMotion: boolean = false;
  @Prop busy: boolean = false;
  @Prop medalSource: ResourceStr = '';
  @Prop medalLabel: string = '';
  @Prop medalOrdinal: number = 0;
  @Prop viewport: SurfaceViewport = { width: 0, height: 0, safeTop: 0, safeBottom: 0,
    safeLeft: 0, safeRight: 0, keyboardTop: 0 };
  @State private heroScale: number = 1;
  onAcknowledge: (() => void) | undefined = undefined;

  private acknowledge(): void {
    if (!this.busy) { this.onAcknowledge?.(); }
  }

  private celebrate(): void {
    if (this.reduceMotion) { return; }
    this.heroScale = motionProfile(this.motionStyle).dialogScale;
    this.getUIContext().animateTo({ duration: motionProfile(this.motionStyle).menuEnterMs,
      curve: Curve.EaseOut }, (): void => { this.heroScale = 1; });
  }

  build() {
    if (this.kind === 'advanced') {
      DialogSurface({ title: this.title, closeLabel: this.dismissLabel, isDark: this.isDark,
        motionStyle: this.motionStyle, viewport: this.viewport, canClose: !this.busy,
        onRequestClose: this.onAcknowledge === undefined ? undefined : (): void => { this.acknowledge(); } }) {
        Column({ space: UiTokens.sectionGap }) {
          if (this.medalLabel.length > 0) {
            SharedMedalIcon({ source: this.medalSource, ordinal: this.medalOrdinal, glyphSize: 96, isDark: this.isDark })
              .accessibilityText(this.medalLabel)
            Text(this.medalLabel).fontSize(UiTokens.titleSize).fontColor(themePalette(this.isDark).text)
          }
          Text(this.model.levelLabel).fontSize(40).fontWeight(FontWeight.Bold)
            .fontColor(themePalette(this.isDark).action)
            .scale({ x: this.heroScale, y: this.heroScale }).onAppear((): void => { this.celebrate(); })
          Text(this.model.title).fontSize(UiTokens.titleSize).fontColor(themePalette(this.isDark).text)
          Text(this.description).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).secondaryText)
          if (this.statusText.length > 0) {
            Text(this.statusText).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).text)
          }
        }.width('100%')
      }
    } else {
      StateView({ title: this.title, description: this.statusText.length > 0 ? this.statusText : this.description,
        actionLabel: this.busy ? '' : this.dismissLabel, isDark: this.isDark, motionStyle: this.motionStyle,
        onAction: this.onAcknowledge === undefined ? undefined : (): void => { this.acknowledge(); } })
        .backgroundColor(themePalette(this.isDark).surface)
        .border({ width: 1, color: themePalette(this.isDark).border }).borderRadius(UiTokens.surfaceRadius)
    }
  }
}
