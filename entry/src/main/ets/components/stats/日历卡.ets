// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

// 日历卡：渲染 GraphsResponse.reviews.count 为年历热力图（对齐 Anki CalendarGraph）。
// 52-53 列（周）× 7 行（星期）小方格；颜色 Blues 按当日复习数开方归一取色（浅色 t∈[0.2,1]），
// 空日固定浅灰/深灰。年份导航 ◄/► 的下限由统计天数决定（与 Anki revlogRange 锁定逻辑一致）。
// 左侧星期标签点击切换周首日（对齐 Anki calendar.ts：仅周日/周一/周五/周六四个标签可点，
// 点击即设为一周首日并回写偏好；周二/三/四标签无响应）。
// Invariants: build 单根 Column；后端键已按日切点（rolloverHour）分桶，前端换算直接加天数，
// 不得再减日切小时（重复扣减会导致所有格子整体偏移一天）。

import type { ReviewKindCounts } from '../../proto/messages/StatsMessages';
import { Weekday } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 取蓝色, 色日历_空日_浅色, 色日历_空日_深色 } from '../../model/统计色板';

/** 单格数据：列（周序号）+ 行（星期）+ 数量（-1 = 未来日期不渲染） */
interface 日历格 {
  列: number;
  行: number;
  数量: number;
  日期: string;
}

/** 周首日（Weekday 枚举）转 JS getDay() 语义（0=周日） */
function 周首日转数字(首日: Weekday): number {
  switch (首日) {
    case Weekday.MONDAY: return 1;
    case Weekday.FRIDAY: return 5;
    case Weekday.SATURDAY: return 6;
    case Weekday.SUNDAY:
    default: return 0;
  }
}

/** 相对天数 → 实际日期。
 *  后端键已按 Anki 日切点（rollover，凌晨 0-日切小时算前一天）分桶，
 *  前端直接加天数即可；再减日切小时会重复扣减，整体偏移一天（2026-08-29 修复）。
 */
function 取日期(距今天数: number): Date {
  const d: Date = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 距今天数);
  return d;
}

@Component
export struct 日历卡 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop @Watch('重算格子') 复习计数: Map<number, ReviewKindCounts> | null = null;
  @Prop @Watch('重算格子') 周首日: Weekday = Weekday.SUNDAY;
  /** 星期标签点击回调：父组件负责写 GraphPreferences（Anki 点标签即存，autoSavingPrefs 行为） */
  on首日变更: (首日: Weekday) => void = (_首日: Weekday): void => {};
  @Prop 统计天数: number = 365;
  @Prop 是否深色: boolean = false;
  @State private 目标年份: number = 1970;
  @State private 格子缓存: Map<number, 日历格> = new Map<number, 日历格>();
  @State private 最大计数: number = 0;
  @State private selectedDay: string = '';
  private readonly calendarScroller: Scroller = new Scroller();
  private readonly calendarWidth: number = 768;
  private calendarViewportWidth: number = 0;
  private calendarAlignmentKey: string = '';
  private readonly 总列数: number = 54;
  private readonly 星期标签: Resource[] = [
    $r('app.string.stats_weekday_0'),
    $r('app.string.stats_weekday_1'),
    $r('app.string.stats_weekday_2'),
    $r('app.string.stats_weekday_3'),
    $r('app.string.stats_weekday_4'),
    $r('app.string.stats_weekday_5'),
    $r('app.string.stats_weekday_6')
  ];
  @StorageProp(颜色键.动作主色) private 主色: string = '#2F5FD0';

  aboutToAppear(): void {
    this.目标年份 = new Date().getFullYear();
    this.重算格子();
  }

  onDidBuild(): void {
    this.alignCalendarToLatestDay();
  }

  /** 初次布局及年份/周首日/尺寸改变时对齐最新日期；数据刷新不覆盖用户拖动的位置。 */
  private alignCalendarToLatestDay(): void {
    if (this.calendarViewportWidth <= 0 || this.数据为空()) return;
    let lastColumn: number = 0;
    this.格子缓存.forEach((day: 日历格): void => {
      lastColumn = Math.max(lastColumn, day.列);
    });
    const key: string = `${this.目标年份}_${this.周首日}_${lastColumn}_${this.calendarViewportWidth}`;
    if (key === this.calendarAlignmentKey) return;
    // 左标签 10vp，格间距 2vp；最后一列的右边缘恰好落在 768vp。
    const stride: number = (this.calendarWidth - 10) / this.总列数;
    const rightEdge: number = 10 + (lastColumn + 1) * stride;
    const offset: number = Math.min(Math.max(0, this.calendarWidth - this.calendarViewportWidth),
      Math.max(0, rightEdge - this.calendarViewportWidth));
    this.calendarScroller.scrollTo({ xOffset: offset, yOffset: 0, animation: false });
    this.calendarAlignmentKey = key;
  }

  /** 年份下限：全部=2000；≥365 天允许看上一年；否则锁定当年（与 Anki revlogRange 逻辑一致） */
  private 取最小年份(): number {
    const 当年: number = new Date().getFullYear();
    if (this.统计天数 === 0) {
      return 2000;
    }
    if (this.统计天数 >= 365) {
      return 当年 - 1;
    }
    return 当年;
  }

  private 重算格子(): void {
    this.selectedDay = '';
    const 格子: Map<number, 日历格> = new Map<number, 日历格>();
    let 最大: number = 0;
    const 首日数字: number = 周首日转数字(this.周首日);
    const 现在: Date = new Date();
    // 按日聚合复习数（Anki：learn+relearn+young+mature+filtered）
    const 计数映射: Map<string, number> = new Map<string, number>();
    if (this.复习计数 !== null) {
      this.复习计数.forEach((计数: ReviewKindCounts, 天: number) => {
        const 总: number = 计数.learn + 计数.relearn + 计数.young + 计数.mature + 计数.filtered;
        if (总 > 0) {
          const 日期: Date = 取日期(天);
          计数映射.set(`${日期.getFullYear()}-${日期.getMonth()}-${日期.getDate()}`, 总);
        }
      });
    }
    // 遍历目标年份每一天：未来日期跳过，其余落格
    const 年首: Date = new Date(this.目标年份, 0, 1);
    const 年末: Date = new Date(this.目标年份, 11, 31);
    for (let 游标: Date = new Date(年首); 游标 <= 年末; 游标.setDate(游标.getDate() + 1)) {
      if (游标 > 现在) {
        continue;
      }
      const 键: string = `${游标.getFullYear()}-${游标.getMonth()}-${游标.getDate()}`;
      const 数量: number = 计数映射.get(键) ?? 0;
      if (数量 > 最大) {
        最大 = 数量;
      }
      const 星期: number = (游标.getDay() - 首日数字 + 7) % 7;
      const 年内天数: number = Math.floor((游标.getTime() - 年首.getTime()) / 86400000);
      const 周: number = Math.floor((年内天数 + (年首.getDay() - 首日数字 + 7) % 7) / 7);
      if (周 >= 0 && 周 < this.总列数) {
        格子.set(周 * 7 + 星期, { 列: 周, 行: 星期, 数量: 数量, 日期: `${游标.getFullYear()}-${String(游标.getMonth() + 1).padStart(2, '0')}-${String(游标.getDate()).padStart(2, '0')}` });
      }
    }
    this.格子缓存 = 格子;
    this.最大计数 = 最大;
  }

  /** 格子颜色：空日固定灰；有数据按 sqrt(count/max) 归一取 Blues（浅色 [0.2,1] / 深色 [0.2,0.8]） */
  private 取格色(数量: number): string {
    if (数量 <= 0) {
      return this.是否深色 ? 色日历_空日_深色 : 色日历_空日_浅色;
    }
    const 归一: number = Math.sqrt(数量 / (this.最大计数 > 0 ? this.最大计数 : 1));
    const 系数: number = 0.2 + 归一 * (this.是否深色 ? 0.6 : 0.8);
    return 取蓝色(系数);
  }

  private 数据为空(): boolean {
    return this.最大计数 === 0;
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 年份导航：◄ 2026 ►（居中）
      Row({ space: 应用尺寸.间距_12 }) {
        Text() { ThemeTextSpans('◄', (this.目标年份 > this.取最小年份()) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor(this.目标年份 > this.取最小年份() ? this.主色 : $r('app.color.text_tertiary'))
          .onClick((): void => {
            if (this.目标年份 > this.取最小年份()) {
              this.目标年份 -= 1;
              this.重算格子();
            }
          })
        Text(`${this.目标年份}`)
          .fontSize(应用尺寸.字号_正文)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
        Text() { ThemeTextSpans('►', (this.目标年份 < new Date().getFullYear()) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor(this.目标年份 < new Date().getFullYear() ? this.主色 : $r('app.color.text_tertiary'))
          .onClick((): void => {
            if (this.目标年份 < new Date().getFullYear()) {
              this.目标年份 += 1;
              this.重算格子();
            }
          })
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)

      if (this.数据为空()) {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      } else {
        // 热力图内联（原 @Builder 渲染的格子颜色被固化，牌组切换后不更新，2026-08-29 修复）
        // 保留可横滑的大格年历，底部预留滚动条空间，常驻提示右侧还有月份。
        Scroll(this.calendarScroller) {
        Column({ space: 2 }) {
          Row() {
            Blank().width(12)
            ForEach([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (month: number) => {
              Text(`${month + 1}`).fontSize(11).fontColor($r('app.color.text_secondary'))
                .layoutWeight(new Date(this.目标年份, month + 1, 0).getDate())
            })
          }.width('100%').height(20)
          ForEach([0, 1, 2, 3, 4, 5, 6], (行: number) => {
            Row({ space: 2 }) {
              // 星期窄标签（按周首日排序；文字色对齐 Anki calendar.ts：深色 #ddd / 浅色 black）。
              // 点击切换周首日（对齐官方：仅周日/周一/周五/周六标签可点，其余无响应）
              Text(this.星期标签[(周首日转数字(this.周首日) + 行) % 7])
                .fontSize(应用尺寸.字号_说明_小)
                .fontColor(this.是否深色 ? '#dddddd' : '#000000')
                .width(10)
                .textAlign(TextAlign.End)
                .onClick((): void => {
                  const 数字: number = (周首日转数字(this.周首日) + 行) % 7;
                  if (数字 !== 2 && 数字 !== 3 && 数字 !== 4) {
                    this.on首日变更(数字 as Weekday);
                  }
                })
              // key 含格子数量：数据变 → key 变 → 格子重建（key 仅列号时数据变化颜色冻结）
              ForEach([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
                21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
                41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53], (列: number) => {
                if (this.取格数据(列, 行) === null) {
                  // 未来/越界日期：透明占位保持列对齐
                  Column()
                    .aspectRatio(1)
                    .layoutWeight(1)
                } else {
                  Column()
                    .aspectRatio(1)
                    .layoutWeight(1)
                    .backgroundColor(this.取格色((this.取格数据(列, 行) as 日历格).数量))
                    .borderRadius(2)
                    .accessibilityText($r('app.string.stats_calendar_day',
                      (this.取格数据(列, 行) as 日历格).日期, (this.取格数据(列, 行) as 日历格).数量))
                    .onClick((): void => {
                      const day: 日历格 | null = this.取格数据(列, 行);
                      if (day !== null) {
                        this.selectedDay = this.getUIContext().getHostContext()!.resourceManager.getStringSync(
                          $r('app.string.stats_calendar_day').id, day.日期, day.数量);
                      }
                    })
                }
              }, (列: number) => `${列}_${this.取格数据(列, 行)?.日期 ?? ''}_${this.取格数据(列, 行)?.数量 ?? -1}`)
            }
            .width('100%')
          }, (行: number) => `${行}_${周首日转数字(this.周首日)}`)
        }
        .width(this.calendarWidth)
        .padding({ bottom: 12 })
        }.width('100%').scrollable(ScrollDirection.Horizontal).scrollBar(BarState.On)
          .scrollBarWidth(4)
          .onAppear((): void => { this.calendarAlignmentKey = ''; })
          .onDisAppear((): void => { this.calendarViewportWidth = 0; })
          .onAreaChange((_oldArea: Area, newArea: Area): void => {
            this.calendarViewportWidth = Number(newArea.width);
            this.alignCalendarToLatestDay();
          })
        Row({ space: 6 }) {
          Text($r('app.string.stats_calendar_less')).fontSize(11).fontColor($r('app.color.text_secondary'))
          ForEach([0, 0.1, 0.3, 0.6, 1], (amount: number) => {
            Column().width(10).height(10).borderRadius(2)
              .backgroundColor(this.取格色(amount * this.最大计数))
          })
          Text($r('app.string.stats_calendar_more')).fontSize(11).fontColor($r('app.color.text_secondary'))
        }.width('100%').justifyContent(FlexAlign.End)
        Text(this.selectedDay === '' ? $r('app.string.stats_calendar_select') : this.selectedDay)
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      }
    }
    .width('100%')
  }

  /** 取某列某行的格数据（缺失返回 null，渲染为透明占位） */
  private 取格数据(列: number, 行: number): 日历格 | null {
    return this.格子缓存.get(列 * 7 + 行) ?? null;
  }
}
