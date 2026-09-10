// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 卡片信息
//
// @作用
// 浏览页 T11 卡片信息弹层：纯展示层，展示单张卡片的调度信息 + 复习历史。
// 父级（浏览页）拥有全部后端调用，本组件仅负责渲染 CardStatsView。
// 复用 浏览编辑区.ets 的弹层骨架（Stack + 遮罩 + 居中面板）。
//
// @输入
// isDark: 是否深色主题
// stats: CardStatsView（父级加载后下发）
// errorMessage: 父级下发的错误文案
// onClose: 关闭回调
//
// @输出
// 无（纯展示组件，无回调写入）
//
// @Invariants
// - 本组件不直接调后端，所有数据经 @Prop stats 下发
// - 父级用 if 控制组件挂载/卸载，每次打开是新实例
//
// @副作用
// 无
// ========================================================

import { common } from '@kit.AbilityKit';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import type { CardStatsView, StatsRevlogEntry } from '../../proto/messages/StatsMessages';
import { ReviewKind } from '../../proto/messages/StatsMessages';

@Component
export struct 卡片信息 {
  @Prop isDark: boolean = false;
  @Prop stats: CardStatsView | null = null;
  @Prop errorMessage: string = '';
  onClose: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 已按下关闭: boolean = false;

  /** Unix 时间戳（秒）转本地可读日期串。 */
  private 格式化时间(时间戳: number): string {
    if (时间戳 <= 0) {
      return '—';
    }
    const 日期 = new Date(时间戳 * 1000);
    const 年 = 日期.getFullYear();
    const 月 = (日期.getMonth() + 1).toString().padStart(2, '0');
    const 日 = 日期.getDate().toString().padStart(2, '0');
    const 时 = 日期.getHours().toString().padStart(2, '0');
    const 分 = 日期.getMinutes().toString().padStart(2, '0');
    return `${年}-${月}-${日} ${时}:${分}`;
  }

  /** 秒数转可读用时（如 "1.2s" / "12s" / "2m 30s"）。 */
  private 格式化用时(秒: number): string {
    if (秒 < 1) {
      return `${(秒 * 1000).toFixed(0)}ms`;
    }
    if (秒 < 60) {
      return `${秒.toFixed(1)}s`;
    }
    const 分 = Math.floor(秒 / 60);
    const 余秒 = Math.floor(秒 % 60);
    return `${分}m ${余秒}s`;
  }

  /** 天数 + 间隔类型转可读串（如 "12天" / "1.5月"）。 */
  private 格式化间隔(天: number): string {
    if (天 === 0) {
      return '当天';
    }
    if (天 < 30) {
      return `${天}天`;
    }
    if (天 < 365) {
      return `${(天 / 30).toFixed(1)}月`;
    }
    return `${(天 / 365).toFixed(1)}年`;
  }

  /** ease per mill → 百分比（如 2500 → 250%）。 */
  private 格式化难度(perMill: number): string {
    return `${(perMill / 10).toFixed(0)}%`;
  }

  /** ReviewKind → 本地化文案。 */
  private 复习类型文案(kind: ReviewKind): string {
    const 上下文 = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    // ArkTS 禁止 computed property name（arkts-identifiers-as-prop-names），改用 if-else
    let key: string = 'browser_info_kind_learning';
    if (kind === ReviewKind.LEARNING) {
      key = 'browser_info_kind_learning';
    } else if (kind === ReviewKind.REVIEW) {
      key = 'browser_info_kind_review';
    } else if (kind === ReviewKind.RELEARNING) {
      key = 'browser_info_kind_relearning';
    } else if (kind === ReviewKind.FILTERED) {
      key = 'browser_info_kind_filtered';
    } else if (kind === ReviewKind.MANUAL) {
      key = 'browser_info_kind_manual';
    } else if (kind === ReviewKind.RESCHEDULED) {
      key = 'browser_info_kind_rescheduled';
    }
    try {
      return 上下文.resourceManager.getStringByNameSync(key);
    } catch (_e) {
      return '';
    }
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  /** 评分按钮文案（1=Again 2=Hard 3=Good 4=Easy）。 */
  private 评分文案(button: number): string {
    const 上下文 = this.取能力上下文();
    if (上下文 === null) {
      return String(button);
    }
    // ArkTS 禁止 computed property name，改用 if-else
    let key: string = '';
    if (button === 1) {
      key = 'browser_info_button_again';
    } else if (button === 2) {
      key = 'browser_info_button_hard';
    } else if (button === 3) {
      key = 'browser_info_button_good';
    } else if (button === 4) {
      key = 'browser_info_button_easy';
    } else {
      return String(button);
    }
    try {
      return 上下文.resourceManager.getStringByNameSync(key);
    } catch (_e) {
      return String(button);
    }
  }

  build() {
    Stack() {
      // 遮罩层：点击关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {
          this.onClose();
        })

      // 主面板
      Column({ space: 应用尺寸.间距_14 }) {
        if (this.stats === null) {
          // 加载/错误态
          Text(this.errorMessage !== '' ? this.errorMessage : '...')
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_secondary'))
            .padding(应用尺寸.间距_16)
        } else {
          Scroll() {
            Column({ space: 应用尺寸.间距_14 }) {
              // 标题
              Text($r('app.string.browser_info_title'))
                .fontSize(应用尺寸.字号_面板标题)
                .fontWeight(FontWeight.Bold)
                .fontColor($r('app.color.text_primary'))
                .width('100%')

              // 调度信息区
              Column({ space: 应用尺寸.间距_8 }) {
                Text($r('app.string.browser_info_section_schedule'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontWeight(FontWeight.Bold)
                  .fontColor($r('app.color.text_primary'))
                  .width('100%')

                this.信息行($r('app.string.browser_info_added'), this.格式化时间(this.stats.added))
                this.信息行($r('app.string.browser_info_first_review'),
                  this.stats.firstReview !== undefined ? this.格式化时间(this.stats.firstReview) : '—')
                this.信息行($r('app.string.browser_info_latest_review'),
                  this.stats.latestReview !== undefined ? this.格式化时间(this.stats.latestReview) : '—')
                this.信息行($r('app.string.browser_info_due'),
                  this.stats.dueDate !== undefined
                    ? this.格式化时间(this.stats.dueDate)
                    : (this.stats.duePosition !== undefined ? `#${this.stats.duePosition}` : '—'))
                this.信息行($r('app.string.browser_info_interval'),
                  this.格式化间隔(this.stats.interval))
                this.信息行($r('app.string.browser_info_ease'),
                  this.格式化难度(this.stats.ease))
                this.信息行($r('app.string.browser_info_reviews'),
                  this.stats.reviews.toString())
                this.信息行($r('app.string.browser_info_lapses'),
                  this.stats.lapses.toString())
                this.信息行($r('app.string.browser_info_avg_time'),
                  this.格式化用时(this.stats.averageSecs))
                this.信息行($r('app.string.browser_info_total_time'),
                  this.格式化用时(this.stats.totalSecs))
                this.信息行($r('app.string.browser_info_card_type'), this.stats.cardType)
                this.信息行($r('app.string.browser_info_notetype'), this.stats.notetype)
                this.信息行($r('app.string.browser_info_deck'), this.stats.deck)
                if (this.stats.fsrsRetrievability !== undefined) {
                  this.信息行($r('app.string.browser_info_retrievability'),
                    `${(this.stats.fsrsRetrievability * 100).toFixed(1)}%`)
                }
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)

              // 复习历史区
              if (this.stats.revlog.length > 0) {
                Column({ space: 应用尺寸.间距_8 }) {
                  Text($r('app.string.browser_info_section_history'))
                    .fontSize(应用尺寸.字号_正文)
                    .fontWeight(FontWeight.Bold)
                    .fontColor($r('app.color.text_primary'))
                    .width('100%')

                  ForEach(this.stats.revlog, (条目: StatsRevlogEntry, index: number) => {
                    Row({ space: 应用尺寸.间距_8 }) {
                      // 时间
                      Text(this.格式化时间(条目.time))
                        .fontSize(应用尺寸.字号_正文_小)
                        .fontColor($r('app.color.text_secondary'))
                        .layoutWeight(1)
                        .maxLines(1)
                        .textOverflow({ overflow: TextOverflow.Ellipsis })

                      // 类型
                      Text(this.复习类型文案(条目.reviewKind))
                        .fontSize(应用尺寸.字号_正文_小)
                        .fontColor($r('app.color.text_secondary'))
                        .maxLines(1)

                      // 评分
                      Text(this.评分文案(条目.buttonChosen))
                        .fontSize(应用尺寸.字号_正文_小)
                        .fontColor($r('app.color.text_primary'))
                        .maxLines(1)

                      // 用时
                      Text(this.格式化用时(条目.takenSecs))
                        .fontSize(应用尺寸.字号_正文_小)
                        .fontColor($r('app.color.text_secondary'))
                        .maxLines(1)
                    }
                    .width('100%')
                    .padding({
                      top: 应用尺寸.间距_4,
                      bottom: 应用尺寸.间距_4
                    })
                    .border(index < this.stats!.revlog.length - 1
                      ? { width: { bottom: 0.5 }, color: { bottom: $r('app.color.divider') } }
                      : { width: 0 })
                  }, (条目: StatsRevlogEntry, index: number): string => `${条目.time}-${index}`)
                }
                .width('100%')
                .alignItems(HorizontalAlign.Start)
              }
            }
            .width('100%')
            .padding({
              left: 应用尺寸.间距_16,
              right: 应用尺寸.间距_16,
              top: 应用尺寸.间距_16,
              bottom: 应用尺寸.间距_16
            })
          }
          .scrollBar(BarState.Auto)
          .edgeEffect(EdgeEffect.Spring)
          .width('100%')
          .align(Alignment.Top)
          .constraintSize({ maxHeight: '60%' })
        }

        // 错误文案
        if (this.errorMessage !== '') {
          Text(this.errorMessage)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
        }

        // 关闭按钮
        Button($r('app.string.browser_info_close'))
          .width('100%')
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.已按下关闭 ? $r('app.color.surface_page') : $r('app.color.surface_card'))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) {
              this.已按下关闭 = true;
            } else if (e.type === TouchType.Up || e.type === TouchType.Cancel) {
              this.已按下关闭 = false;
            }
          })
          .onClick((): void => {
            this.onClose();
          })
      }
      .width('90%')
      .constraintSize({ maxHeight: '85%' })
      .alignItems(HorizontalAlign.Start)
      .padding({
        top: 应用尺寸.间距_16,
        bottom: 应用尺寸.间距_16,
        left: 应用尺寸.间距_4,
        right: 应用尺寸.间距_4
      })
      .backgroundColor($r('app.color.surface_page'))
      .borderRadius(应用尺寸.圆角_面板)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  信息行(标签: Resource, 值: string): void {
    Row({ space: 应用尺寸.间距_8 }) {
      Text(标签)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .width(90)

      Text(值)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
  }
}
