// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../../model/ThemeCatalog';

// ========================================================
// @名称 主页顶部工具栏
//
// @作用
// 渲染主页顶部工具栏。常规模式：左侧"更多"按钮、右侧创建牌组按钮；
// 设置/浏览/统计 三项收纳进"更多"下拉菜单（由 主页更多面板 渲染）。
// 排序模式（拖动排序）：切换为左侧"退出"、右侧"完成"双按钮，
// 视觉上等同进入独立排序页；拖动落盘为即时保存，两键均退出排序模式。
//
// @输入
// 排序模式中: boolean  是否处于牌组拖动排序模式
// on更多点击: () => void  更多按钮点击回调（触发下拉菜单）
// on创建牌组点击: () => void  创建牌组按钮点击回调
// on排序退出: () => void  排序模式"退出"按钮回调
// on排序完成: () => void  排序模式"完成"按钮回调
// 主色容器色: ResourceColor  按下态背景色
// 页面底色微染值: ResourceColor  工具栏背景色
// 动作主色: ResourceColor  动作类按钮字色
//
// @输出
// 常规模式渲染 Row(更多按钮 + Blank + 创建牌组按钮)；
// 排序模式渲染 Row(退出按钮 + Blank + 完成按钮)
//
// @业务规则
// 更多按钮字色用 text_primary（查看类操作）；创建牌组/完成按钮字色用 动作主色（动作类操作）
// 两按钮均使用 按下态按钮 积木自带 pressed 视觉反馈
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 按下态按钮 } from '../common/按下态按钮';

@Component
export struct 主页顶部工具栏 {
  @StorageProp(THEME_VISUALS_KEY) private visual: ThemeDefinition = themeDefinition('aurora');
  @Prop 排序模式中: boolean = false;
  on更多点击: () => void = (): void => {};
  on创建牌组点击: () => void = (): void => {};
  on排序退出: () => void = (): void => {};
  on排序完成: () => void = (): void => {};
  @Prop 主色容器色: ResourceColor;
  @Prop 页面底色微染值: ResourceColor;
  @Prop 动作主色: ResourceColor;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  build() {
    Row() {
      if (this.排序模式中) {
        按下态按钮({
          文案: $r('app.string.deck_reorder_exit'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.on排序退出(); }
        })

        Blank()

        按下态按钮({
          文案: $r('app.string.deck_reorder_done'),
          字色: this.动作主色,
          themeText: true,
          点击回调: (): void => { this.on排序完成(); }
        })
      } else {
        按下态按钮({
          文案: $r('app.string.study_more'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.on更多点击(); }
        })

        Blank()

        按下态按钮({
          文案: $r('app.string.create_deck'),
          字色: this.动作主色,
          themeText: true,
          点击回调: (): void => { this.on创建牌组点击(); }
        })
      }
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
    })
    .backgroundColor(this.页面底色微染值)
  }
}
