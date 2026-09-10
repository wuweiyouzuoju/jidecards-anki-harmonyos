// SPDX-License-Identifier: AGPL-3.0-or-later

import { 日历单日 } from '../model/日历模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';

// ========================================================
// @块ID UI-MONTH-CALENDAR-001
// @名称 月历卡 组件主体字段与私有方法
//
// @作用
// 本月学习热力月历卡：星期表头 + 5/6 行热力图。
// hasActivity=false（reviewCountsByDate 为空）时在标题行下方加一行"本月还没有学习记录"提示，
// 月历本身仍正常渲染（让用户看到当月日期骨架）。
// 折叠态支持：collapsed=true 时只渲染标题行（含 ▼ 按钮），不渲染周表头/月历网格/空态提示。
//
// @输入
// @Prop 标题：月份资源（含年/月）。
// @Prop 日期列表：日历单日 数组。
// @Prop 周数：5 或 6（动态控制行数）。
// @Prop 有学习记录：false 时显示空态提示。
// @Prop 已折叠：true 时只渲染标题行。
// 切换展开回调：折叠态点击时上抛。
//
// @输出
// 渲染本月学习热力月历卡；折叠态点击通过 切换展开回调 上抛。
//
// @业务规则
// title / 日期列表 / 周数 / 有学习记录 拆成原子 @Prop，不再传整个 月历数据 对象——
// ArkUI @Prop 对引用对象只做浅层赋值，若日后改用原地修改 @Prop 不会触发刷新。
// 拆成原子 prop 后任何一处变化都会可靠刷新。
// 行模板与卡片高度按 周数 动态生成，避免空行 + 控制高度（旧实现固定 6 行会多出空行/裁切）。
//
// @副作用
// 无。仅渲染与上抛回调。
//
// @注意
// 修改行模板/网格高度/卡片高度算法时同步关注 周数 边界（4/5/6）。
// ========================================================
@Component
export struct 月历卡 {
  @Prop 标题: Resource = $r('app.string.calendar_month_title', 0, 0);
  @Prop 日期列表: 日历单日[] = [];
  @Prop 周数: number = 6;
  @Prop 有学习记录: boolean = false;
  // B12-Y2 2026-07-22：折叠态支持（与 今日摘要卡 一致）
  // 已折叠=true 时只渲染标题行（含 ▼ 按钮），不渲染周表头/月历网格/空态提示
  @Prop 已折叠: boolean = false;
  // 折叠态点击回调：Index 收到后切换 summaryCollapsed
  切换展开回调: (() => void) | null = null;

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.热力1) private 热力1色: string = '#DCE8FF';
  @StorageProp(颜色键.热力2) private 热力2色: string = '#B8CEFA';
  @StorageProp(颜色键.热力3) private 热力3色: string = '#7EA3EE';
  @StorageProp(颜色键.热力4) private 热力4色: string = '#2F5FD0';

  private readonly 星期表头: Resource[] = [
    $r('app.string.weekday_1'), $r('app.string.weekday_2'), $r('app.string.weekday_3'),
    $r('app.string.weekday_4'), $r('app.string.weekday_5'), $r('app.string.weekday_6'),
    $r('app.string.weekday_7')
  ];

  // ========================================================
  // @块ID UI-MONTH-CALENDAR-002
  // @名称 取热力色 / 取热力文字色
  //
  // @作用
  // 按 intensity 映射单元格背景色与文字色。
  //
  // @输入
  // intensity：0~4 学习强度档位。
  // 日：用于判定是否当月、是否今日，决定文字色档。
  //
  // @输出
  // 背景色 ResourceColor：0=Transparent（让 surface 透出），1-4 对应 热力1色~热力4色。
  // 文字色 Resource：非当月用 text_tertiary；当月 intensity>=4 用 action_on_primary（白），其余用 text_primary。
  //
  // @业务规则
  // GitHub 风格：无学习量让卡片 surface 透出（浅色=白/深色=深灰），不另上灰蓝底。
  //
  // @副作用
  // 无。
  // ========================================================
  private 取热力色(强度: number): ResourceColor {
    switch (强度) {
      case 1:
        return this.热力1色;
      case 2:
        return this.热力2色;
      case 3:
        return this.热力3色;
      case 4:
        return this.热力4色;
      case 0:
      default:
        // GitHub 风格：无学习量让卡片 surface 透出（浅色=白/深色=深灰），不另上灰蓝底
        return Color.Transparent;
    }
  }

  private 取热力文字色(日: 日历单日): Resource {
    if (!日.是否当月) {
      return $r('app.color.text_tertiary');
    }
    return 日.热力强度 >= 4 ?
      $r('app.color.action_on_primary') : $r('app.color.text_primary');
  }

  // ========================================================
  // @块ID UI-MONTH-CALENDAR-003
  // @名称 行模板 / 网格高度 / 卡片高度
  //
  // @作用
  // 按周数动态生成 Grid 的 rowsTemplate、网格高度、卡片整体高度。
  //
  // @输入
  // this.周数：5 或 6。
  // this.有学习记录：影响空态行是否计入卡片高度。
  // this.网格高度()：供 卡片高度() 调用。
  //
  // @输出
  // 行模板字符串：N 个 '1fr' 用空格拼接。
  // 网格高度 = 周数 * 日历_单元格高度 + (周数-1) * 日历_行间距。
  // 卡片高度 = 标题行 36 + 可选空态行 16 + 周表头 14 + 网格高度 + Column space + padding。
  //
  // @业务规则
  // 旧实现固定 6 行，某些月份（如 2026-02 leading=0+28 天=4 行）会多出 2 行空格，
  // 且卡片高度溢出 204 容器后底部裁切。动态行数解决两个问题：避免空行 + 控制高度。
  // 不再硬用 卡片高度=204，因为月历内容实测 220-261px，固定 204 必然裁切。
  //
  // @副作用
  // 无。
  // ========================================================
  private 行模板(): string {
    const 行数组: string[] = [];
    for (let i: number = 0; i < this.周数; i++) {
      行数组.push('1fr');
    }
    return 行数组.join(' ');
  }

  // Grid 高度按 周数 动态：每行 21 + 行间 gap 4，行数越多越高。
  private 网格高度(): number {
    return this.周数 * 应用尺寸.日历_单元格高度
      + (this.周数 - 1) * 应用尺寸.日历_行间距;
  }

  // 卡片整体高度按内容算：标题行 36 + 可选空态行 16 + 周表头 14 + Grid + Column space + padding。
  // 不再硬用 卡片高度=204，因为月历内容实测 220-261px，固定 204 必然裁切。
  private 卡片高度(): number {
    const 标题行: number = 36;
    const 空态行: number = this.有学习记录 ? 0 : 16;
    const 周表头行: number = 14;
    const 内边距: number = 应用尺寸.间距_14 * 2;
    const 列间距: number = 应用尺寸.间距_7 * 3;
    return 标题行 + 空态行 + 周表头行 + this.网格高度() + 内边距 + 列间距;
  }

  // ========================================================
  // @块ID UI-MONTH-CALENDAR-004
  // @名称 月历单元格构建器
  //
  // @作用
  // 渲染单个日历单元格：日期数字 + 热力背景 + 今日边框 + 当月透明度。
  //
  // @输入
  // 日：日历单日 数据（含 日号 / 热力强度 / 是否今天 / 是否当月）。
  //
  // @输出
  // 单元格视觉：宽度自适应、高度固定 21、文字居中。
  //
  // @业务规则
  // 今日加 边框 + FontWeight.Bold；非当月 opacity=0.45 弱化。
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private 单元格(日: 日历单日) {
    Text(日.日号.toString())
      .width('100%')
      .height(应用尺寸.日历_单元格高度)
      .fontSize(应用尺寸.字号_说明)
      .fontWeight(日.是否今天 ? FontWeight.Bold : FontWeight.Regular)
      .fontColor(this.取热力文字色(日))
      .textAlign(TextAlign.Center)
      .backgroundColor(日.是否当月 ? this.取热力色(日.热力强度) : Color.Transparent)
      .border({
        width: 日.是否今天 ? 应用尺寸.卡片边框 : 0,
        color: this.动作主色
      })
      .borderRadius(应用尺寸.圆角_单元格)
      .opacity(日.是否当月 ? 1 : 0.45)
  }

  // ========================================================
  // @块ID UI-MONTH-CALENDAR-005
  // @名称 月历卡主渲染
  //
  // @作用
  // 渲染整张月历卡：标题行（含 ▼ 折叠按钮）+ 折叠态下方分支（空态提示 / 周表头 / 月历网格）。
  //
  // @输入
  // 全部 @Prop + @StorageProp + 4 个私有方法。
  //
  // @输出
  // 整张月历卡视觉；折叠态高度 82，展开态动态 卡片高度()。
  //
  // @业务规则
  // 折叠态高度与 今日摘要卡 对齐（82）；展开态保持动态 卡片高度()。
  // 整张卡 onClick 触发 切换展开回调（折叠↔展开对称）。
  // 箭头不独立 onClick，事件冒泡到 Column onClick 统一处理。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================
  build() {
    Column({ space: 应用尺寸.间距_7 }) {
      Row() {
        Column({ space: 应用尺寸.间距_2 }) {
          Text($r('app.string.month_learning'))
            .fontSize(应用尺寸.字号_卡片标题)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
          Text(this.标题)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        }
        .alignItems(HorizontalAlign.Start)
        Blank()
        Text($r('app.string.heat_hint'))
          .fontSize(应用尺寸.字号_说明)
          .fontColor($r('app.color.text_tertiary'))
        // B12-Y2 2026-07-22：折叠 ▼ 按钮（与 今日摘要卡 统一）
        // 箭头不独立 onClick，事件冒泡到 Column onClick 统一处理
        Text('▼')
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .margin({ left: 应用尺寸.间距_8 })
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4, top: 应用尺寸.间距_4, bottom: 应用尺寸.间距_4 })
          .rotate({ angle: this.已折叠 ? -90 : 0 })
          .animation({ duration: 150, curve: Curve.EaseOut })
      }
      .width('100%')

      // B12-Y2 2026-07-22：折叠态只渲染标题行（与 今日摘要卡 行为一致）
      if (!this.已折叠) {
        if (!this.有学习记录) {
          Text($r('app.string.month_empty_hint'))
            .fontSize(应用尺寸.字号_说明)
            .fontColor($r('app.color.text_tertiary'))
            .width('100%')
        }

        Row() {
          ForEach(this.星期表头, (星期: Resource, index: number) => {
            Text(星期)
              .fontSize(应用尺寸.字号_说明_小)
              .fontColor($r('app.color.text_tertiary'))
              .textAlign(TextAlign.Center)
              .layoutWeight(1)
          }, (星期: Resource, index: number) => `weekday-${index}`)
        }
        .width('100%')

        Grid() {
          ForEach(this.日期列表, (日: 日历单日) => {
            GridItem() {
              this.单元格(日)
            }
          }, (日: 日历单日) => 日.key)
        }
        .columnsTemplate('1fr 1fr 1fr 1fr 1fr 1fr 1fr')
        .rowsTemplate(this.行模板())
        .columnsGap(应用尺寸.日历_列间距)
        .rowsGap(应用尺寸.日历_行间距)
        .width('100%')
        .height(this.网格高度())
      }
    }
    .width('100%')
    // B12-Y2 2026-07-22：折叠态高度与 今日摘要卡 对齐（82），展开态保持动态 卡片高度
    .height(this.已折叠 ? 82 : this.卡片高度())
    .padding(应用尺寸.间距_14)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
    // B12-Y2 2026-07-22：整张卡 onClick 触发 切换展开回调（折叠↔展开对称）
    .onClick(() => {
      if (this.切换展开回调 !== null) {
        this.切换展开回调();
      }
    })
  }
}
