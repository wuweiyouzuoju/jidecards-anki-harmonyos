// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 图表轴
//
// @作用
// 统计柱状图共享坐标轴：
//   纵轴刻度 —— 左侧 Y 轴 nice 刻度列（0 在底、上限在顶，d3 axisLeft 风格）。
//   横轴日期条 —— 底部 X 轴日期刻度（左端/中点/右端，相对今天的偏移天）。
// 柱高归一化基准必须与 纵轴刻度.上限 一致（各卡用 取美观域 取 nice 上限）。
//
// @Invariants
// - 纵轴刻度在 [0, 上限] 内等距分布（上限为 nice 值时刻度必覆盖且均匀），
//   用 SpaceBetween 布局：首个刻度贴顶、0 贴底，与柱区同高。
// - 轴左宽统一 30vp：横轴标签行/日期条用它对齐柱区左缘。
//
// @ExtensionPoints
// - 新柱状图接入：柱区外包 Row { 纵轴刻度; 柱区.layoutWeight(1) }，
//   底部轴标签行加 .padding({ left: 纵轴宽 })。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { localeMonthDay, localeNumber, localeCompact } from '../../utils/LocaleFormatting';
import type { 轴域 } from '../../model/统计分箱';

/** 纵轴宽度：柱区左侧让出的刻度列宽度 */
export const 纵轴宽: number = 30;

/** 右轴宽度：柱区右侧让出的百分比刻度列宽度（与纵轴对称） */
export const 右轴宽: number = 30;

@Component
export struct 纵轴刻度 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  /** 绑定刻度（取轴域 产出，等差、端点 0 与上限）：与柱高归一化的上限必须同源，
   *  否则刻度位置与柱高错位 */
  @Prop 刻度: number[] = [1, 0];
  /** 与柱区同高 */
  @Prop 高度: number = 108;
  /** 时间模式：值单位为分钟（显示 30m / 1.5h），否则为次数（显示 1.2k / 3M） */
  @Prop 是否时长: boolean = false;

  /** 刻度值列表（自上而下：上限 → 0） */
  private 取倒序刻度(): number[] {
    return this.刻度.slice().reverse();
  }

  /** 次数缩写（对齐 d3 ~s SI 格式：1200→1.2k、15000→15k、2e6→2M）。
   *  小数据的小数刻度（步长 0.2/0.5，如新用户第一天）保留 1 位小数——
   *  四舍五入会把 0.2/0.4 都显示成 "0"，刻度值失真。 */
  private 缩写次数(值: number): string {
    if (值 % 1 !== 0 && 值 < 10) {
      return localeNumber(值, this.uiLanguage, 1);
    }
    return localeCompact(值, this.uiLanguage);
  }

  /** 分钟缩写：<60 → Xm；≥60 → Xh（1 位小数） */
  private 缩写分钟(值: number): string {
    if (值 < 60) {
      return `${localeNumber(值, this.uiLanguage)}m`;
    }
    const 时: number = 值 / 60;
    return `${localeNumber(时, this.uiLanguage, 时 % 1 === 0 ? 0 : 1)}h`;
  }

  build() {
    Column() {
      ForEach(this.取倒序刻度(), (值: number) => {
        Text(this.是否时长 ? this.缩写分钟(值) : this.缩写次数(值))
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .maxLines(1)
      }, (值: number) => `${值}`)
    }
    .width(纵轴宽)
    .height(this.高度)
    .justifyContent(FlexAlign.SpaceBetween)
    .alignItems(HorizontalAlign.End)
  }
}

/** 右轴百分比（Anki HourGraph 的 y2-ticks：axisRight(yArea).ticks(height/50)
 *  → [0,25,50,75,100]%，0% 底、100% 顶）。正确率叠加面积对着本轴读数。 */
@Component
export struct 右轴百分比 {
  /** 与柱区同高 */
  @Prop 高度: number = 108;

  build() {
    Column() {
      ForEach([100, 75, 50, 25, 0], (值: number) => {
        Text(`${值}%`)
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .maxLines(1)
      }, (值: number) => `${值}`)
    }
    .width(右轴宽)
    .height(this.高度)
    .justifyContent(FlexAlign.SpaceBetween)
    .alignItems(HorizontalAlign.Start)
  }
}

@Component
export struct 横轴日期条 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  /** 左端刻度相对今天的天数（过去为负，未来为正） */
  @Prop 左端偏移天: number = -30;
  /** 右端刻度相对今天的天数 */
  @Prop 右端偏移天: number = 0;
  /** 左侧让位宽度（与纵轴同宽，保证刻度与柱区对齐） */
  @Prop 轴左宽: number = 纵轴宽;

  /** 偏移天 → 本地月/日（Anki 日期刻度用本地化短格式） */
  private 取日期(偏移天: number): string {
    const 日期: Date = new Date();
    日期.setDate(日期.getDate() + 偏移天);
    return localeMonthDay(日期, this.uiLanguage);
  }

  build() {
    Row() {
      Column().width(this.轴左宽)
      Text(this.取日期(this.左端偏移天))
        .fontSize(应用尺寸.字号_说明_小)
        .fontColor($r('app.color.text_tertiary'))
        .layoutWeight(1)
        .textAlign(TextAlign.Start)
      Text(this.取日期(Math.round((this.左端偏移天 + this.右端偏移天) / 2)))
        .fontSize(应用尺寸.字号_说明_小)
        .fontColor($r('app.color.text_tertiary'))
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
      Text(this.取日期(this.右端偏移天))
        .fontSize(应用尺寸.字号_说明_小)
        .fontColor($r('app.color.text_tertiary'))
        .layoutWeight(1)
        .textAlign(TextAlign.End)
    }
    .width('100%')
  }
}
