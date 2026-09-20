// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';

// ========================================================
// @块ID UI-BROWSER-SEARCH-001
// @名称 搜索框
//
// @作用
// 浏览页搜索输入区：TextInput + Cards/Notes 模式选择框。
// 从 浏览页.搜索框区域() 与 顶部条() 模式切换部分提取为独立组件，
// 供浏览页复用，统一搜索输入与模式切换的视觉与交互。
//
// @输入
// 搜索文本：当前搜索串（@Prop，父→子单向；变化时同步到本地输入态）
// 浏览模式值：'cards' | 'notes'，当前选中模式
// onSearch：提交搜索回调，传入当前输入文本
// onModeChange：模式切换回调，传入目标模式 'cards'/'notes'
//
// @输出
// 渲染 TextInput 与 Cards/Notes 选择框。
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 搜索框 {
  @Prop @Watch('同步搜索文本') 搜索文本: string;
  @Prop 浏览模式值: string;
  onSearch: (text: string) => void = (text: string): void => {};
  onModeChange: (mode: string) => void = (mode: string): void => {};

  // 本地输入态：TextInput 受控值。用户输入写入本地态，提交时随 onSearch 回传父组件。
  // 父组件外部更新 搜索文本 时通过 @Watch 同步到本地态（如清空搜索串）。
  @State private 当前输入: string = '';

  aboutToAppear(): void {
    this.当前输入 = this.搜索文本;
  }

  // @Prop 搜索文本 变化时同步到本地输入态（支持父组件外部更新搜索串）。
  同步搜索文本(): void {
    this.当前输入 = this.搜索文本;
  }

  build() {
    Row({ space: 应用尺寸.间距_8 }) {
      Select([
        { value: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.browser_mode_cards').id) },
        { value: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.browser_mode_notes').id) }
      ])
        .selected(this.浏览模式值 === 'cards' ? 0 : 1)
        .value(this.getUIContext().getHostContext()!.resourceManager.getStringSync(
          (this.浏览模式值 === 'cards' ? $r('app.string.browser_mode_cards') : $r('app.string.browser_mode_notes')).id))
        .attributeModifier(new SelectStyle($r('app.color.surface_card')))
        .font(SelectStyle.controlFont)
        .borderRadius(SelectStyle.controlRadius)
        .onSelect((index: number): void => { this.onModeChange(index === 0 ? 'cards' : 'notes'); })

      TextInput({
        text: this.当前输入,
        placeholder: $r('app.string.browser_search_placeholder')
      })
        .layoutWeight(1)
        .height(40)
        .fontSize(应用尺寸.字号_正文)
        .backgroundColor($r('app.color.surface_card'))
        .borderRadius(20)
        .onChange((value: string): void => {
          this.当前输入 = value;
        })
        .onSubmit((): void => {
          this.onSearch(this.当前输入);
        })
    }
    .width('100%')
  }
}
