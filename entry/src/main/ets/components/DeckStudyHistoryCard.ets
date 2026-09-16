// SPDX-License-Identifier: AGPL-3.0-or-later
import { 统计服务 } from '../backend/统计服务';
import { GraphsView } from '../proto/messages/StatsMessages';
import { DeckStudyDay, DeckStudyHistory, buildDeckStudyHistory, historyStudyDayKey } from '../model/DeckStudyHistory';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { 颜色键 } from '../model/颜色主题';
import { 应用尺寸 } from '../utils/应用尺寸';
import { themeGradient } from '../utils/ThemeVisuals';

/** 仅查询当前牌组范围；刷新时隐藏旧值，离开/切换后丢弃在途结果。 */
@Component
export struct DeckStudyHistoryCard {
  @Prop @Watch('reload') search: string = '';
  @Prop @Watch('reload') refreshToken: number = 0;
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @StorageProp(THEME_TEXT_COLORS_KEY) private colors: string[] = [];
  @State private loading: boolean = true;
  @State private failed: boolean = false;
  @State private history: DeckStudyHistory = {
    days: [], activeDays: 0, totalCount: 0, totalMillis: 0, maxCount: 0, rolloverHour: 4
  };
  private service: 统计服务 = new 统计服务();
  private requestId: number = 0;
  private active: boolean = false;
  private dayKey: string = '';
  private timer: number = -1;

  aboutToAppear(): void {
    this.active = true;
    this.reload();
  }

  aboutToDisappear(): void {
    this.active = false;
    this.requestId++;
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== -1) clearInterval(this.timer);
    this.timer = -1;
  }

  private setVisible(visible: boolean): void {
    this.active = visible;
    this.stopTimer();
    if (!visible) {
      this.requestId++;
      return;
    }
    this.reload();
    // 只检查日切，不每分钟查询后端；切回前台还由首页刷新令牌触发。
    this.timer = setInterval((): void => {
      if (!this.loading && !this.failed &&
        this.dayKey !== historyStudyDayKey(new Date(), this.history.rolloverHour)) {
        this.reload();
      }
    }, 60000);
  }

  private async reload(): Promise<void> {
    if (!this.active) return;
    const request: number = ++this.requestId;
    const search: string = this.search;
    this.loading = true;
    this.failed = false;
    const started: Date = new Date();
    try {
      if (search === '') throw new Error('Missing deck scope');
      const graphs: GraphsView = await this.service.获取图表统计(6, search);
      if (!this.active || request !== this.requestId) return;
      this.history = buildDeckStudyHistory(graphs);
      this.dayKey = historyStudyDayKey(started, graphs.rolloverHour);
      this.loading = false;
    } catch (_) {
      if (!this.active || request !== this.requestId) return;
      this.loading = false;
      this.failed = true;
    }
  }

  build() {
    Column({ space: 应用尺寸.pageSectionGap }) {
      Text($r('app.string.deck_history_title'))
        .fontSize(应用尺寸.字号_按钮)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .width('100%')
      if (this.loading) {
        Text($r('app.string.deck_history_loading'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .height(168)
      } else if (this.failed) {
        Text($r('app.string.deck_history_error'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
        Button($r('app.string.deck_history_retry'))
          .fontColor(this.accent)
          .backgroundColor(Color.Transparent)
          .height(应用尺寸.按钮高度)
          .onClick((): void => { this.reload(); })
      } else {
        Row({ space: 8 }) {
          ForEach(this.history.days, (day: DeckStudyDay) => {
            Column({ space: 6 }) {
              Text(day.count.toString())
                .fontSize(12)
                .fontColor($r('app.color.text_secondary'))
                .maxLines(1)
                .minFontSize(9)
                .maxFontSize(12)
              Stack({ alignContent: Alignment.Bottom }) {
                Column() {}
                  .width(16)
                  .height(this.history.maxCount > 0 ? 72 * day.count / this.history.maxCount : 0)
                  .backgroundColor(this.accent)
                  .linearGradient({ angle: 0, colors: themeGradient(this.colors) })
                  .borderRadius(4)
              }
              .height(72)
              .width('100%')
              Text(day.daysAgo === 0 ? $r('app.string.deck_history_today') :
                $r('app.string.deck_history_days_ago', day.daysAgo))
                .fontSize(10)
                .fontColor($r('app.color.text_secondary'))
            }
            .layoutWeight(1)
          }, (day: DeckStudyDay): string => `${day.daysAgo}-${day.count}-${this.history.maxCount}`)
        }
        .width('100%')
        Row({ space: 12 }) {
          Column({ space: 4 }) {
            Text($r('app.string.deck_history_active_days', this.history.activeDays))
              .fontSize(应用尺寸.字号_卡片标题)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.text_primary'))
            Text($r('app.string.deck_history_days_label'))
              .fontSize(12)
              .fontColor($r('app.color.text_secondary'))
          }.layoutWeight(1)
          Column({ space: 4 }) {
            Text(this.history.totalMillis > 0 && this.history.totalMillis < 1000 ?
              $r('app.string.deck_history_under_second') :
              $r('app.string.deck_history_duration', Math.floor(this.history.totalMillis / 60000),
                Math.floor(this.history.totalMillis / 1000) % 60))
              .fontSize(应用尺寸.字号_卡片标题)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.text_primary'))
            Text($r('app.string.deck_history_time_label'))
              .fontSize(12)
              .fontColor($r('app.color.text_secondary'))
          }.layoutWeight(1)
        }
        .width('100%')
        if (this.history.totalCount > 0) {
          Text($r('app.string.deck_history_scope'))
            .fontSize(12)
            .fontColor($r('app.color.text_tertiary'))
            .width('100%')
        }
      }
    }
    .width('100%')
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_指标卡)
    .onVisibleAreaChange([0], (visible: boolean): void => { this.setVisible(visible); })
  }
}
