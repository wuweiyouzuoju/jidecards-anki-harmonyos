// SPDX-License-Identifier: AGPL-3.0-or-later
import { UiTokens } from '../core/UiTokens';
import { themePalette } from '../core/Theme';
import { SharedMedalIcon } from './MedalIcon';
import { FoundationPressFeedback } from './PressFeedback';

export interface SharedMedalItem {
  id: string;
  label: string;
  source: ResourceStr;
  ordinal: number;
  earned?: boolean;
}

/** 每个位置仅展示一枚小徽章；未获得位置保留，数量增长时横向滚动。 */
@Component
export struct SharedMedalStrip {
  @Prop items: SharedMedalItem[] = [];
  @Prop wornId: string = '';
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  @Prop wornLabel: string = '';
  @Prop detailsLabel: string = '';
  @Prop lockedLabel: string = '';
  onOpen: (id: string) => void = (): void => {};

  build() {
    Scroll() {
      Row({ space: UiTokens.sectionGap }) {
        ForEach(this.items, (item: SharedMedalItem): void => {
          Button({ type: ButtonType.Normal }) {
            SharedMedalIcon({ source: item.source, ordinal: item.ordinal, glyphSize: 40, isDark: this.isDark })
              .opacity(item.earned === false ? 0.32 : 1)
          }.width(56).height(60).padding(6).backgroundColor(Color.Transparent)
            .stateEffect(false)
            .attributeModifier(new FoundationPressFeedback(this.motionStyle))
            .accessibilityText(item.label + '，' + (item.earned === false ? this.lockedLabel + '，' : '') +
              (this.wornId === item.id ? this.wornLabel + '，' : '') + this.detailsLabel)
            .accessibilityDescription(this.wornId === item.id ? this.wornLabel : item.earned === false ? this.lockedLabel : '')
            .onClick((): void => { this.onOpen(item.id); })
            .id((item.earned === false ? 'locked-medal-' : 'earned-medal-') + item.id)
        }, (item: SharedMedalItem): string => item.id)
      }.padding({ bottom: 4 })
    }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Auto).align(Alignment.TopStart).width('100%').height(68)
  }
}

/** 详情只消费展示事实；宿主提供经过资格确认的内容及佩戴操作。 */
@Component
export struct SharedMedalDetails {
  @Prop source: ResourceStr = '';
  @Prop label: string = '';
  @Prop condition: string = '';
  @Prop reason: string = '';
  @Prop dateLabel: string = '';
  @Prop sourceLabel: string = '';
  @Prop ordinal: number = 0;
  @Prop isWorn: boolean = false;
  @Prop wornLabel: string = '';
  @Prop earnedLabel: string = '';
  @Prop conditionLabel: string = '';
  @Prop isDark: boolean = false;

  build() {
    Column({ space: UiTokens.surfaceInset }) {
      SharedMedalIcon({ source: this.source, ordinal: this.ordinal, glyphSize: 88, isDark: this.isDark })
      Text(this.label).fontSize(22).fontWeight(FontWeight.Bold).fontColor(themePalette(this.isDark).text)
        .textAlign(TextAlign.Center).width('100%')
      Text(this.isWorn ? this.wornLabel : this.earnedLabel).fontSize(UiTokens.bodySize)
        .fontColor(themePalette(this.isDark).action).id('medal-wear-status')
      Column({ space: UiTokens.fieldGap }) {
        Text(this.conditionLabel).fontSize(UiTokens.bodySize).fontWeight(FontWeight.Medium)
          .fontColor(themePalette(this.isDark).text)
        Text(this.condition).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).secondaryText)
        if (this.reason.length > 0) {
          Text(this.reason).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).secondaryText)
        }
        Text(this.dateLabel).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).secondaryText)
        Text(this.sourceLabel).fontSize(UiTokens.bodySize).fontColor(themePalette(this.isDark).secondaryText)
      }.width('100%').alignItems(HorizontalAlign.Start)
    }.width('100%').padding(UiTokens.surfaceInset)
  }
}

/** 只显示宿主确认的数据和图片资源；类别、领取资格、颁发与存储不归展示组件。 */
@Component
export struct SharedMedalTile {
  @Prop source: ResourceStr = '';
  @Prop label: string = '';
  @Prop detail: string = '';
  @Prop statusLabel: string = '';
  @Prop dateLabel: string = '';
  @Prop isEarned: boolean = false;
  @Prop ordinal: number = 0;
  @Prop isDark: boolean = false;

  build() {
    Row({ space: UiTokens.surfaceInset }) {
      SharedMedalIcon({ source: this.source, ordinal: this.ordinal, glyphSize: 64, isDark: this.isDark })
        .opacity(this.isEarned ? 1 : 0.55).accessibilityLevel('no')
      Column({ space: UiTokens.fieldGap }) {
        Text(this.label).fontSize(UiTokens.titleSize).fontWeight(FontWeight.Medium)
          .fontColor(themePalette(this.isDark).text).width('100%')
        Text(this.detail).fontSize(UiTokens.bodySize)
          .fontColor(themePalette(this.isDark).secondaryText).width('100%')
        Text(this.statusLabel).fontSize(UiTokens.bodySize)
          .fontColor(this.isEarned ? themePalette(this.isDark).action : themePalette(this.isDark).secondaryText)
          .width('100%')
        if (this.dateLabel.length > 0) {
          Text(this.dateLabel).fontSize(12).fontColor(themePalette(this.isDark).secondaryText).width('100%')
        }
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
    }.width('100%').padding(UiTokens.surfaceInset)
    .backgroundColor(themePalette(this.isDark).surface)
    .border({ width: 1, color: themePalette(this.isDark).border }).borderRadius(UiTokens.surfaceRadius)
  }
}
