// SPDX-License-Identifier: AGPL-3.0-or-later

// 范围切换条：Anki 统计图表卡内的范围单选（如 1月/3月/1年/全部）。
// 原生选择框；当前索引由父组件持有（@Prop），
// 切换时回调 onRangeChange 供父组件按需持久化。
// Invariants: 纯展示层；标签集由父组件传入（@Prop Resource 数组），不持有业务语义。

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 范围切换条 {
  @Prop 当前索引: number = 0;
  @Prop 标签集: Resource[] = [];
  onRangeChange: (索引: number) => void = (): void => {};

  /** Select 的 value 使用本地化文字，与选项索引保持一致。 */
  private options(): SelectOption[] {
    return this.标签集.map((label: Resource): SelectOption => ({
      value: this.getUIContext().getHostContext()!.resourceManager.getStringSync(label.id)
    }));
  }

  build() {
    Select(this.options())
      .selected(this.当前索引)
      .value(this.options()[this.当前索引]?.value ?? '')
      .controlSize(ControlSize.SMALL)
      .font({ size: 应用尺寸.字号_正文 })
      .height(40)
      .menuAlign(MenuAlignType.END)
      .onSelect((index: number): void => { this.onRangeChange(index); })
  }
}
