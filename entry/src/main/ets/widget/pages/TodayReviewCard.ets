// SPDX-License-Identifier: AGPL-3.0-or-later

import type { 主题色载体 } from '../../model/桌面卡片数据存储';

interface ReviewSnapshot {
  今日完成数?: number;
  待学数?: number;
  待复习数?: number;
  主题色?: 主题色载体;
}

const reviewStorage: LocalStorage = new LocalStorage();

@Entry(reviewStorage)
@Component
struct TodayReviewCard {
  @LocalStorageProp('statsCardData') @Watch('refresh') snapshotJson: string = '';
  @State snapshot: ReviewSnapshot = {};

  aboutToAppear(): void {
    this.refresh();
  }

  private refresh(): void {
    try {
      this.snapshot = (JSON.parse(this.snapshotJson) as ReviewSnapshot | null) ?? {};
    } catch {
      this.snapshot = {};
    }
  }

  private countText(count?: number): string {
    return count === undefined ? '—' : count.toString();
  }

  private pendingStudy(): number | undefined {
    const total = this.snapshot.待学数;
    const review = this.snapshot.待复习数;
    return total === undefined || review === undefined ? undefined : total - review;
  }

  @Builder
  private metric(isReview: boolean) {
    Column({ space: 3 }) {
      Text(this.countText(isReview ? this.snapshot.待复习数 : this.pendingStudy()))
        .fontSize(23)
        .minFontSize(12)
        .maxFontSize(23)
        .maxLines(1)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.snapshot.主题色?.文字主 ?? $r('app.color.text_primary'))
      Text(isReview ? $r('app.string.review_cards') : $r('app.string.pending_today'))
        .fontSize(12)
        .minFontSize(10)
        .maxFontSize(12)
        .maxLines(2)
        .fontColor(this.snapshot.主题色?.文字次 ?? $r('app.color.text_secondary'))
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Column() {
      Text($r('app.string.today_review_widget_name'))
        .fontSize(14)
        .minFontSize(11)
        .maxFontSize(14)
        .maxLines(1)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.snapshot.主题色?.文字主 ?? $r('app.color.text_primary'))

      Column({ space: 1 }) {
        Text(this.countText(this.snapshot.今日完成数))
          .fontSize(39)
          .minFontSize(18)
          .maxFontSize(39)
          .maxLines(1)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.snapshot.主题色?.主色文字 ?? $r('app.color.action_primary'))
        Text($r('app.string.summary_done'))
          .fontSize(12)
          .fontColor(this.snapshot.主题色?.文字次 ?? $r('app.color.text_secondary'))
          .maxLines(1)
      }
      .alignItems(HorizontalAlign.Start)

      Column({ space: 8 }) {
        Divider().color(this.snapshot.主题色?.主色容器 ?? $r('app.color.surface_border')).strokeWidth(1)
        Row({ space: 6 }) {
          this.metric(false)
          this.metric(true)
        }
        .width('100%')
        .alignItems(VerticalAlign.Top)
      }
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding(12)
    .alignItems(HorizontalAlign.Start)
    .justifyContent(FlexAlign.SpaceBetween)
    .backgroundColor(this.snapshot.主题色?.页面底色 ?? $r('app.color.surface_page'))
  }
}
