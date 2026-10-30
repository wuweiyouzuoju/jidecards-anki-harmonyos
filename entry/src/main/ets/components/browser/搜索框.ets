// SPDX-License-Identifier: AGPL-3.0-or-later
import { SearchFieldSurface } from '../../utils/SearchFieldSurface';
import { SeriesVisual } from '../../utils/SeriesVisual';

/** 搜索输入独占一行；仅持有未提交的本地输入，模式选择由浏览页负责。 */
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 搜索框 {
  @StorageProp('surface_material') private searchMaterial: string = 'flat';
  @StorageProp('themeMode') private searchTheme: string = 'system';
  @StorageProp('systemDarkMode') private searchSystemDark: boolean = false;
  @Prop @Watch('同步搜索文本') 搜索文本: string;
  onSearch: (text: string) => void = (text: string): void => {};
  onFocusChange: (focused: boolean) => void = (_focused: boolean): void => {};

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
    Row() {
      TextInput({
        text: this.当前输入,
        placeholder: $r('app.string.browser_search_placeholder')
      })
        .id('browser-search-input')
        .onFocus((): void => { this.onFocusChange(true); })
        .onBlur((): void => { this.onFocusChange(false); })
        .layoutWeight(1)
        .height(应用尺寸.searchFieldHeight)
        .fontSize(应用尺寸.字号_正文)
        .attributeModifier(new SearchFieldSurface(this.searchMaterial, SeriesVisual.isDark(this.searchTheme, this.searchSystemDark), 应用尺寸.searchFieldRadius))
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
