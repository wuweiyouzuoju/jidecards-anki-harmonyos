// SPDX-License-Identifier: AGPL-3.0-or-later
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';

// 牌组排序模式的退出/完成栏；常规首页动作由 HomeSummaryHeader 拥有。

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 按下态按钮 } from '../common/按下态按钮';

@Component
export struct 主页顶部工具栏 {
  @Prop 排序模式中: boolean = false;
  @Prop reorderBusy: boolean = false;
  on排序退出: () => void = (): void => {};
  on排序完成: () => void = (): void => {};
  @Prop 主色容器色: ResourceColor;
  @Prop 页面底色微染值: ResourceColor;
  @Prop 动作主色: ResourceColor;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  build() {
    Row() {
      // 等权侧栏保证状态组中心始终等于屏幕中心，不受两侧标签宽度影响。
      Row() {
        按下态按钮({
          文案: $r('app.string.deck_reorder_exit'),
          字色: $r('app.color.text_primary'),
          singleLine: true,
          是否启用: !this.reorderBusy,
          点击回调: (): void => {
            this.on排序退出();
          }
        })
      }
      .layoutWeight(1)
      .justifyContent(FlexAlign.Start)

      Row() {
        按下态按钮({
          文案: $r('app.string.deck_reorder_done'),
          字色: this.动作主色,
          themeText: true,
          singleLine: true,
          是否启用: !this.reorderBusy,
          点击回调: (): void => {
            this.on排序完成();
          }
        })
      }
      .layoutWeight(1)
      .justifyContent(FlexAlign.End)
    }
    .width('100%')
    .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
      bottom: 0
    })
    .backgroundColor(this.页面底色微染值)
  }
}
