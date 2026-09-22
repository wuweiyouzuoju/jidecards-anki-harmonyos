// SPDX-License-Identifier: AGPL-3.0-or-later

import { 应用尺寸 } from '../../utils/应用尺寸';
import {
  取小时柱色, 取难度柱色, 取间隔柱色, 取预测柱色,
  色卡片_新卡, 色卡片_学习中, 色卡片_重学中, 色卡片_年轻,
  色卡片_成熟, 色卡片_已暂停, 色卡片_已埋藏
} from '../../model/统计色板';

// ========================================================
// @块ID UI-WIDGET-STATS-001
// @名称 统计桌面卡片（2×4）
//
// @作用
// 桌面服务卡片 UI：Swiper 8 页
//   1. 今日进度 / 2. 记忆率 / 3. 今日计数 / 4. 卡片状态
//   5. 小时分布 / 6. 难度分布 / 7. 间隔分布 / 8. 未来到期预测
// 月历页已移除（用户决策 2026-08-15）；今日进度页新增（用户决策 2026-08-15）。
// 点击卡片通过 postCardAction router 拉起 App 并跳转统计页（jidecards://stats）。
//
// @约束
// - 卡片运行在独立沙箱进程，不能访问 AppStorage / 主进程内存
// - 数据通过 LocalStorageProp 从 FormExtensionAbility 的 updateForm 注入
// - 不能用 Web 组件、Grid/GridItem
// - 卡片 UI 限制：不能用 @StorageLink / @StorageProp，只能用 @LocalStorageProp / @Prop
// - @Builder 内不能用 let/const，复杂数据预处理移到 private 方法
//
// @数据流
// FormExtensionAbility.onUpdateForm → formProvider.updateForm({ statsCardData: JSON字符串 })
// → 卡片 @LocalStorageProp('statsCardData') 接字符串 → aboutToAppear/@Watch 解析到 @State 数据
// → 渲染 7 页 Swiper
//
// @根因修复
// 1. 数据传递：HarmonyOS 卡片 LocalStorage 注入按字段平铺，不支持嵌套对象。
//    FormAbility 整对象 JSON.stringify 塞到单键 'statsCardData'，卡片接字符串后解析。
// 2. @Watch 初始不触发：@Watch 只在值变化时回调，初始挂载不触发。
//    在 aboutToAppear 中手动调 数据更新() 解析初始数据。
// 3. preferences 跨进程不共享：改用 filesDir 文件系统存储（见 桌面卡片数据存储.ets）。
// ========================================================

let 存储键: string = 'statsCardData';

interface 卡片状态数据 {
  新卡: number;
  学习中: number;
  重学中: number;
  年轻: number;
  成熟: number;
  暂停: number;
  埋藏: number;
}

interface 难度分布数据 {
  桶: [number, number][];
  平均: number;
}

interface 主题色 {
  主色按钮背景: string;
  主色容器: string;
  主色文字: string;
  文字主: string;
  文字次: string;
  页面底色: string;
  卡片底色: string;
  是否深色: boolean;
}

interface 卡片数据 {
  hasData: boolean;
  // 页1：今日进度
  今日完成数: number;
  待学数: number;
  牌组数: number;
  今日答对率: number; // 0-1，-1 表示今日无答题
  // 页2：记忆率
  记忆率: number;
  fsrs已启用: boolean;
  // 页3：今日计数
  今日答题数: number;
  今日正确数: number;
  今日新学数: number;
  今日复习数: number;
  今日重学数: number;
  卡片状态: 卡片状态数据;
  小时分布: [number, number][];
  // 小时分布窗口：0=近1月 1=近3月 2=近1年 3=全部（与统计页小时分布卡切换档一致）
  小时分布窗口: number;
  难度分布: 难度分布数据;
  间隔分布: [number, number][];
  未来到期: [number, number][];
  更新时间: number;
  主题色: 主题色;
  语言: string; // 'zh-Hans' 或 'en'
}

function 空卡片状态(): 卡片状态数据 {
  return { 新卡: 0, 学习中: 0, 重学中: 0, 年轻: 0, 成熟: 0, 暂停: 0, 埋藏: 0 };
}

function 空难度分布(): 难度分布数据 {
  return { 桶: [], 平均: 0 };
}

function 默认主题色(): 主题色 {
  return {
    主色按钮背景: '#2F5FD0',
    主色容器: '#E8EEFC',
    主色文字: '#2F5FD0',
    文字主: '#182230',
    文字次: '#667085',
    页面底色: '#F5F7FA',
    卡片底色: '#FFFFFF',
    是否深色: false
  };
}

function 空卡片数据(): 卡片数据 {
  return {
    hasData: false,
    今日完成数: 0,
    待学数: 0,
    牌组数: 0,
    今日答对率: -1,
    记忆率: 0,
    fsrs已启用: false,
    今日答题数: 0,
    今日正确数: 0,
    今日新学数: 0,
    今日复习数: 0,
    今日重学数: 0,
    卡片状态: 空卡片状态(),
    小时分布: [],
    小时分布窗口: 0,
    难度分布: 空难度分布(),
    间隔分布: [],
    未来到期: [],
    更新时间: 0,
    主题色: 默认主题色(),
    语言: 'zh-Hans'
  };
}

const statsCardStorage: LocalStorage = new LocalStorage();

@Entry(statsCardStorage)
@Component
struct 统计卡片 {
  // FormExtensionAbility 推送的 statsCardData 是整对象 JSON 字符串
  // 用 @Watch 监听变化后 parse 到 @State 数据
  @LocalStorageProp(存储键) @Watch('数据更新') 数据JSON: string = '';
  @State 数据: 卡片数据 = 空卡片数据();
  @State 当前页索引: number = 0;

  // aboutToAppear：@Watch 初始挂载不触发，需手动解析一次初始数据
  aboutToAppear(): void {
    this.数据更新();
  }

  // 本地化文案：数据中语言为 en 时返回英，否则返回中
  private t(中: string, 英: string): string {
    return this.数据.语言.startsWith('en') ? 英 : 中;
  }

  // ========================================================
  // @名称 数据更新
  // @作用 @Watch 回调：JSON.parse 数据JSON 到 @State 数据
  // ========================================================
  数据更新(): void {
    if (this.数据JSON === '') {
      this.数据 = 空卡片数据();
      return;
    }
    try {
      const 解析: object = JSON.parse(this.数据JSON);
      const obj = 解析 as Record<string, Object>;
      // 区分两种载荷：
      // 1. FormAbility 空态：{ hasData: false }（仅含 hasData 字段）
      // 2. 主进程完整数据：桌面卡片数据接口（含 记忆率/... 等字段，无 hasData 字段）
      const 含hasData字段: boolean = obj.hasData !== undefined;
      if (含hasData字段) {
        const 标志: boolean = obj.hasData as boolean;
        if (!标志) {
          // 空态
          this.数据 = 空卡片数据();
          return;
        }
      }
      // 完整数据：用 更新时间 字段判断是否主进程完整数据（时间戳 > 0）
      const 更新时间值: Object = obj.更新时间;
      if (更新时间值 === undefined || 更新时间值 === null) {
        this.数据 = 空卡片数据();
        return;
      }
      const 卡状: 卡片状态数据 = (obj.卡片状态 as 卡片状态数据) ?? 空卡片状态();
      const 难分: 难度分布数据 = (obj.难度分布 as 难度分布数据) ?? 空难度分布();
      const 主题: 主题色 = (obj.主题色 as 主题色) ?? 默认主题色();
      this.数据 = {
        hasData: true,
        今日完成数: obj.今日完成数 as number ?? 0,
        待学数: obj.待学数 as number ?? 0,
        牌组数: obj.牌组数 as number ?? 0,
        今日答对率: obj.今日答对率 as number ?? -1,
        记忆率: obj.记忆率 as number ?? 0,
        fsrs已启用: obj.fsrs已启用 as boolean ?? false,
        今日答题数: obj.今日答题数 as number ?? 0,
        今日正确数: obj.今日正确数 as number ?? 0,
        今日新学数: obj.今日新学数 as number ?? 0,
        今日复习数: obj.今日复习数 as number ?? 0,
        今日重学数: obj.今日重学数 as number ?? 0,
        卡片状态: 卡状,
        小时分布: obj.小时分布 as [number, number][] ?? [],
        小时分布窗口: obj.小时分布窗口 as number ?? 0,
        难度分布: 难分,
        间隔分布: obj.间隔分布 as [number, number][] ?? [],
        未来到期: obj.未来到期 as [number, number][] ?? [],
        更新时间: obj.更新时间 as number ?? 0,
        主题色: 主题,
        语言: (obj.语言 as string) ?? 'zh-Hans'
      };
    } catch (e) {
      this.数据 = 空卡片数据();
    }
  }

  // 卡片背景色：跟随主题页面底色（与 App 首页背景一致）
  private 卡片背景色(): string {
    return this.数据.主题色.页面底色;
  }

  // 分割线颜色（浅色 #E4E8EF / 深色 #2C3038）
  private 分割线色(): string {
    return this.数据.主题色.是否深色 ? '#2C3038' : '#E4E8EF';
  }

  // 标题框背景色（浅灰，跟随深浅色）
  private 标题框背景色(): string {
    return this.数据.主题色.是否深色 ? '#2C3038' : '#F0F1F4';
  }

  private 格式化时间(毫秒: number): string {
    if (毫秒 <= 0) return '';
    const 日期: Date = new Date(毫秒);
    const 时: number = 日期.getHours();
    const 分: number = 日期.getMinutes();
    const 补零: (n: number) => string = (n: number): string => n < 10 ? `0${n}` : `${n}`;
    return `${this.t('更新于', 'Updated')} ${补零(时)}:${补零(分)}`;
  }

  // ========================================================
  // 页1：今日进度（与主页今日摘要卡样式一致：标题+小字+牌组数+进度条+三列指标）
  // ========================================================
  @Builder
  今日进度页() {
    Column({ space: 5 }) {
      // 标题行：左 Column(标题 + "X 已完成 · Y 待学") + 右 Text("Z 牌组")
      Row() {
        Column({ space: 2 }) {
          Text(this.t('今日进度', 'Today'))
            .fontSize(应用尺寸.字号_摘要标题)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.数据.主题色.文字主)
          Text(`${this.数据.今日完成数} ${this.t('已完成', 'done')} · ${this.数据.待学数} ${this.t('待学', 'to do')}`)
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor(this.数据.主题色.文字次)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        if (this.数据.牌组数 > 0) {
          Text(`${this.数据.牌组数} ${this.t('牌组', 'decks')}`)
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor(this.数据.主题色.文字次)
        }
      }
      .width('100%')

      if (this.数据.hasData) {
        // 内容区撑满剩余空间，垂直居中紧凑排列（与主页今日摘要卡一致）
        Column({ space: 5 }) {
          // 进度条：完成 / (完成 + 待学)
          Progress({
            value: this.进度百分比(),
            total: 100,
            type: ProgressType.Linear
          })
            .height(4)
            .color(this.数据.主题色.主色按钮背景)
            .backgroundColor(this.数据.主题色.主色容器)
            .borderRadius(2)

          Row({ space: 6 }) {
            this.计数格(this.t('已完成', 'Done'), this.数据.今日完成数, this.数据.主题色.主色按钮背景, 应用尺寸.字号_指标, 应用尺寸.字号_正文_小)
            this.计数格(this.t('待学', 'To Do'), this.数据.待学数, '#B56A22', 应用尺寸.字号_指标, 应用尺寸.字号_正文_小)
            Column({ space: 1 }) {
              Text(this.答对率显示())
                .fontSize(应用尺寸.字号_指标)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.数据.主题色.主色文字)
              Text(this.t('今日答对率', 'Today Accuracy'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor(this.数据.主题色.文字次)
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Center)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(11)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  // 进度百分比：完成 / (完成 + 待学) * 100
  private 进度百分比(): number {
    const 总数: number = this.数据.今日完成数 + this.数据.待学数;
    if (总数 <= 0) {
      return 0;
    }
    return this.数据.今日完成数 / 总数 * 100;
  }

  // 答对率显示：-1 显示"-"，否则显示百分比
  private 答对率显示(): string {
    if (this.数据.今日答对率 < 0) {
      return '-';
    }
    return `${Math.round(this.数据.今日答对率 * 100)}%`;
  }

  // ========================================================
  // 页2：记忆率
  // ========================================================
  @Builder
  记忆率页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('记忆可提取性', 'Card Retrievability'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData && this.数据.fsrs已启用) {
        Column() {
          Stack({ alignContent: Alignment.Center }) {
            Progress({ value: this.数据.记忆率, total: 100, type: ProgressType.Ring })
              .width(75)
              .height(75)
              .color(this.数据.主题色.主色按钮背景)
            Column() {
              Text(`${this.数据.记忆率.toFixed(0)}%`)
                .fontSize(22)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.数据.主题色.文字主)
              Text(this.t('平均可提取性', 'Avg Retrieval'))
                .fontSize(10)
                .fontColor(this.数据.主题色.文字次)
            }
          }
          .width(75)
          .height(75)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (this.数据.hasData && !this.数据.fsrs已启用) {
        Column() {
          Text(this.t('未启用 FSRS', 'FSRS not enabled'))
            .fontSize(15)
            .fontColor(this.数据.主题色.文字主)
          Text(this.t('在设置→调度器中开启 FSRS', 'Enable in Settings→Scheduler'))
            .fontSize(11)
            .fontColor(this.数据.主题色.文字次)
            .margin({ top: 3 })
            .textAlign(TextAlign.Center)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  // ========================================================
  // 页2：今日计数
  // ========================================================
  @Builder
  今日计数页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('今日', 'Today'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData) {
        Column({ space: 4 }) {
          Row({ space: 6 }) {
            this.计数格(this.t('答题', 'Answered'), this.数据.今日答题数, this.数据.主题色.主色按钮背景)
            this.计数格(this.t('正确', 'Correct'), this.数据.今日正确数, '#238463')
          }
          .width('100%')

          Row({ space: 6 }) {
            this.计数格(this.t('学习', 'New'), this.数据.今日新学数, this.数据.主题色.主色文字)
            this.计数格(this.t('复习', 'Review'), this.数据.今日复习数, this.数据.主题色.主色容器)
            this.计数格(this.t('重学', 'Relearn'), this.数据.今日重学数, '#B34C00')
          }
          .width('100%')

          if (this.数据.今日答题数 > 0) {
            Text(`${this.t('正确率', 'Accuracy')} ${Math.round(this.数据.今日正确数 / this.数据.今日答题数 * 100)}%`)
              .fontSize(11)
              .fontColor(this.数据.主题色.文字主)
              .width('100%')
              .textAlign(TextAlign.Center)
          }
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  @Builder
  计数格(标签: string, 数值: number, 颜色: string, 数值字号: number = 17, 标签字号: number = 10) {
    Column({ space: 1 }) {
      Text(`${数值}`)
        .fontSize(数值字号)
        .fontWeight(FontWeight.Bold)
        .fontColor(颜色)
      Text(标签)
        .fontSize(标签字号)
        .fontColor(this.数据.主题色.文字次)
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Center)
  }

  // ========================================================
  // 页3：卡片状态（按状态分桶）
  // ========================================================
  @Builder
  卡片状态页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('卡片数量', 'Card States'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData) {
        Column({ space: 4 }) {
          // 系列色对齐 Anki schemeBlues/Oranges/Reds/Greens（与统计页卡片数量图、首页摘要卡一致）
          Row({ space: 4 }) {
            this.状态格(this.t('未学习', 'New'), this.数据.卡片状态.新卡, 色卡片_新卡)
            this.状态格(this.t('学习中', 'Learn'), this.数据.卡片状态.学习中, 色卡片_学习中)
            this.状态格(this.t('重学中', 'Relearn'), this.数据.卡片状态.重学中, 色卡片_重学中)
            this.状态格(this.t('欠熟练', 'Young'), this.数据.卡片状态.年轻, 色卡片_年轻)
          }
          .width('100%')

          Row({ space: 4 }) {
            this.状态格(this.t('已熟练', 'Mature'), this.数据.卡片状态.成熟, 色卡片_成熟)
            this.状态格(this.t('已暂停', 'Suspended'), this.数据.卡片状态.暂停, 色卡片_已暂停)
            this.状态格(this.t('已搁置', 'Buried'), this.数据.卡片状态.埋藏, 色卡片_已埋藏)
          }
          .width('100%')

          // 总计
          Text(`${this.t('总计', 'Total')} ${this.卡片总数()} ${this.t('张', 'cards')}`)
            .fontSize(11)
            .fontColor(this.数据.主题色.文字主)
            .width('100%')
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  private 卡片总数(): number {
    const s: 卡片状态数据 = this.数据.卡片状态;
    return s.新卡 + s.学习中 + s.重学中 + s.年轻 + s.成熟 + s.暂停 + s.埋藏;
  }

  @Builder
  状态格(标签: string, 数值: number, 颜色: string) {
    Column({ space: 1 }) {
      Text(`${数值}`)
        .fontSize(15)
        .fontWeight(FontWeight.Bold)
        .fontColor(颜色)
      Text(标签)
        .fontSize(10)
        .fontColor(this.数据.主题色.文字次)
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Center)
  }

  // ========================================================
  // 页4：小时分布（24 时柱状图，窗口跟随统计页小时分布卡的档位选择）
  // ========================================================
  private 小时分布窗口标签(): string {
    switch (this.数据.小时分布窗口) {
      case 1: return this.t('逐小时分析（近3月）', 'Hourly (3M)');
    case 2: return this.t('逐小时分析（近1年）', 'Hourly (1Y)');
    case 3: return this.t('逐小时分析（全部）', 'Hourly (All)');
    default: return this.t('逐小时分析（近1月）', 'Hourly (1M)');
    }
  }

  @Builder
  小时分布页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.小时分布窗口标签())
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData) {
        Column() {
          this.小时柱状图()
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.End)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  private 小时最大值(): number {
    let 最大值: number = 1;
    const 数据: [number, number][] = this.数据.小时分布;
    for (let i: number = 0; i < 数据.length; i++) {
      if (数据[i][0] > 最大值) 最大值 = 数据[i][0];
    }
    return 最大值;
  }

  @Builder
  小时柱状图() {
    Column({ space: 2 }) {
      // 柱区独占固定高度一行，所有柱共享同一基线；
      // 刻度数字不再与柱子同列混排，避免遮挡柱子和把柱区顶高
      Row({ space: 1 }) {
        ForEach(this.数据.小时分布, (项: [number, number]) => {
          Stack({ alignContent: Alignment.Bottom }) {
            Column()
              .width('70%')
              .height(Math.max(项[0] / Math.max(1, this.小时最大值()) * 50, 项[0] > 0 ? 3 : 0))
              .backgroundColor(取小时柱色(项[0] / Math.max(1, this.小时最大值())))
              .borderRadius(1)
          }
          .width('100%')
          .height(50)
          .layoutWeight(1)
        }, (项: [number, number], 索引: number) => `${索引}`)
      }
      .width('100%')
      .height(50)

      // 小时刻度：五等分居中，五个数字中心落点 10%/30%/50%/70%/90%，间距严格相等
      //（与统计页、首页摘要卡同款）
      Row() {
        Text('0')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('6')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('12')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('18')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('23')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
      }
      .width('100%')
    }
    .width('100%')
  }

  // ========================================================
  // 页5：难度分布（SM-2 / FSRS 难度直方图）
  // ========================================================
  @Builder
  难度分布页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('卡片难度', 'Difficulty'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData && this.数据.难度分布.桶.length > 0) {
        Column({ space: 2 }) {
          Text(`${this.t('平均难度', 'Avg Difficulty')} ${this.数据.难度分布.平均.toFixed(0)}%`)
            .fontSize(11)
            .fontColor(this.数据.主题色.文字主)
            .width('100%')
            .textAlign(TextAlign.Center)

          this.难度柱状图()
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.End)
      } else if (this.数据.hasData) {
        Column() {
          Text(this.t('暂无难度数据', 'No difficulty data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  private 难度最大值(): number {
    let 最大值: number = 1;
    const 桶: [number, number][] = this.数据.难度分布.桶;
    for (let i: number = 0; i < 桶.length; i++) {
      if (桶[i][1] > 最大值) 最大值 = 桶[i][1];
    }
    return 最大值;
  }

  // 难度刻度标签：桶数 >=5 时取五等分点（0/25%/50%/75%/100% 索引）的难度值；
  // 桶数 <5 时逐桶显示。让难度分布柱图基线与小时分布（刻度行）、间隔分布（文字行）同高
  private 难度刻度标签(): string[] {
    const 桶: [number, number][] = this.数据.难度分布.桶;
    const n: number = 桶.length;
    if (n === 0) {
      return [];
    }
    if (n < 5) {
      const 标签: string[] = [];
      for (let i: number = 0; i < n; i++) {
        标签.push(`${桶[i][0]}%`);
      }
      return 标签;
    }
    return [
      `${桶[0][0]}%`,
      `${桶[Math.round((n - 1) * 0.25)][0]}%`,
      `${桶[Math.round((n - 1) * 0.5)][0]}%`,
      `${桶[Math.round((n - 1) * 0.75)][0]}%`,
      `${桶[n - 1][0]}%`
    ];
  }

  // 间隔刻度标签：同款五等分逻辑，显示间隔天数（与软件内 `${键}天` 标签一致）
  private 间隔刻度标签(): string[] {
    const 桶: [number, number][] = this.数据.间隔分布;
    const n: number = 桶.length;
    if (n === 0) {
      return [];
    }
    if (n < 5) {
      const 标签: string[] = [];
      for (let i: number = 0; i < n; i++) {
        标签.push(`${桶[i][0]}天`);
      }
      return 标签;
    }
    return [
      `${桶[0][0]}天`,
      `${桶[Math.round((n - 1) * 0.25)][0]}天`,
      `${桶[Math.round((n - 1) * 0.5)][0]}天`,
      `${桶[Math.round((n - 1) * 0.75)][0]}天`,
      `${桶[n - 1][0]}天`
    ];
  }

  @Builder
  难度柱状图() {
    // 与小时柱状图同款结构：柱区独占固定高度一行 + 刻度数字独立成行，
    // 柱子基线与其他柱图页对齐
    Column({ space: 2 }) {
      Row({ space: 1 }) {
        ForEach(this.数据.难度分布.桶, (项: [number, number], 索引: number) => {
          Stack({ alignContent: Alignment.Bottom }) {
            Column()
              .width('70%')
              .height(Math.max(项[1] / Math.max(1, this.难度最大值()) * 50, 项[1] > 0 ? 3 : 0))
              .backgroundColor(取难度柱色(项[0] / 100))
              .borderRadius(1)
          }
          .width('100%')
          .height(50)
          .layoutWeight(1)
        }, (项: [number, number], 索引: number) => `${索引}`)
      }
      .width('100%')
      .height(50)

      // 难度刻度：五等分居中（与小时分布刻度行同款）
      Row() {
        ForEach(this.难度刻度标签(), (标签: string) => {
          Text(标签)
            .fontSize(9)
            .fontColor(this.数据.主题色.文字次)
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
        }, (标签: string) => 标签)
      }
      .width('100%')
    }
    .width('100%')
  }

  // ========================================================
  // 页6：间隔分布（卡片间隔天数的直方图）
  // ========================================================
  @Builder
  间隔分布页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('复习间隔', 'Review Intervals'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData && this.数据.间隔分布.length > 0) {
        Column({ space: 2 }) {
          this.间隔柱状图()

          // 间隔刻度：五等分居中显示间隔天数（与小时/难度刻度行同款，格式统一）
          Row() {
            ForEach(this.间隔刻度标签(), (标签: string) => {
              Text(标签)
                .fontSize(9)
                .fontColor(this.数据.主题色.文字次)
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
            }, (标签: string) => 标签)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.End)
      } else if (this.数据.hasData) {
        Column() {
          Text(this.t('暂无间隔数据', 'No interval data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  private 间隔最大值(): number {
    let 最大值: number = 1;
    const 桶: [number, number][] = this.数据.间隔分布;
    for (let i: number = 0; i < 桶.length; i++) {
      if (桶[i][1] > 最大值) 最大值 = 桶[i][1];
    }
    return 最大值;
  }

  @Builder
  间隔柱状图() {
    Row({ space: 1 }) {
      ForEach(this.数据.间隔分布, (项: [number, number], 索引: number) => {
        Column({ space: 1 }) {
          Stack({ alignContent: Alignment.Bottom }) {
            Column()
              .width('70%')
              .height(Math.max(项[1] / Math.max(1, this.间隔最大值()) * 55, 项[1] > 0 ? 3 : 0))
              .backgroundColor(取间隔柱色((索引 + 1) / Math.max(1, this.数据.间隔分布.length)))
              .borderRadius(1)
          }
          .width('100%')
          .height(55)
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Center)
      }, (项: [number, number], 索引: number) => `${索引}`)
    }
    .width('100%')
    .height(65)
    .alignItems(VerticalAlign.Bottom)
  }

  // ========================================================
  // 页7：未来到期预测
  // ========================================================
  @Builder
  预测页() {
    Column({ space: 4 }) {
      Row() {
        Text(this.t('预测', 'Future Due'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.数据.主题色.文字主)
          .layoutWeight(1)
        Text(this.格式化时间(this.数据.更新时间))
          .fontSize(11)
          .fontColor(this.数据.主题色.文字次)
      }
      .width('100%')

      if (this.数据.hasData) {
        Column() {
          this.预测柱状图()
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.End)
      } else {
        Column() {
          Text(this.t('暂无数据', 'No data'))
            .fontSize(13)
            .fontColor(this.数据.主题色.文字次)
        }
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: 8, left: 10, right: 10, bottom: 8 })
  }

  private 预测最大值(): number {
    let 最大值: number = 1;
    const 数据: [number, number][] = this.数据.未来到期;
    for (let i: number = 0; i < 数据.length; i++) {
      if (数据[i][1] > 最大值) 最大值 = 数据[i][1];
    }
    return 最大值;
  }

  @Builder
  预测柱状图() {
    Column({ space: 2 }) {
      // 柱区独占固定高度一行（与小时分布同款细条布局，30 天整月一屏显示）
      Row({ space: 1 }) {
        ForEach(this.数据.未来到期, (项: [number, number], 索引: number) => {
          Stack({ alignContent: Alignment.Bottom }) {
            Column()
              .width('70%')
              .height(Math.max(项[1] / Math.max(1, this.预测最大值()) * 50, 项[1] > 0 ? 3 : 0))
              .backgroundColor(取预测柱色(索引 / Math.max(1, this.数据.未来到期.length - 1)))
              .borderRadius(1)
          }
          .width('100%')
          .height(50)
          .layoutWeight(1)
        }, (项: [number, number], 索引: number) => `${索引}`)
      }
      .width('100%')
      .height(50)

      // 天数刻度：独立成行，今/+15/+29，不与柱子混排
      Row() {
        Text(this.t('今', 'Now'))
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Start)
        Text('+15')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('+29')
          .fontSize(9)
          .fontColor(this.数据.主题色.文字次)
          .layoutWeight(1)
          .textAlign(TextAlign.End)
      }
      .width('100%')
    }
    .width('100%')
  }

  build() {
    Stack() {
      Column() {
        // 顶部翻页指示点
        Row({ space: 4 }) {
          ForEach([0, 1, 2, 3, 4, 5, 6, 7], (i: number) => {
            Circle()
              .width(i === this.当前页索引 ? 5 : 3)
              .height(i === this.当前页索引 ? 5 : 3)
              .fill(i === this.当前页索引 ? this.数据.主题色.主色按钮背景 : this.数据.主题色.文字次)
              .opacity(i === this.当前页索引 ? 1 : 0.4)
          }, (i: number) => `${i}`)
        }
        .width('100%')
        .height(10)
        .justifyContent(FlexAlign.Center)

        Swiper() {
          this.今日进度页()
          this.记忆率页()
          this.今日计数页()
          this.卡片状态页()
          this.小时分布页()
          this.难度分布页()
          this.间隔分布页()
          this.预测页()
        }
        .indicator(false)
        .loop(true)
        .autoPlay(false)
        .onAnimationStart((_index: number, targetIndex: number) => {
          this.当前页索引 = targetIndex;
        })
        .onChange((index: number) => {
          this.当前页索引 = index;
        })
        .layoutWeight(1)
      }
      .width('100%')
      .height('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.卡片背景色())
    .onClick(() => {
      // 点击卡片拉起 App 跳统计页（jidecards://stats DeepLink）
      postCardAction(this, {
        'action': 'router',
        'abilityName': 'EntryAbility',
        'params': {
          'uri': 'jidecards://stats'
        }
      });
    })
  }
}
