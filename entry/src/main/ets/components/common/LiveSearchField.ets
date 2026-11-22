// SPDX-License-Identifier: AGPL-3.0-or-later
import { compactLandscapeScale } from '../../model/AppLayoutState';
import { WINDOW_SIZE_KEY, WindowSizeVp } from '../../model/WindowSafeLayout';
import { SearchFieldSurface } from '../../utils/SearchFieldSurface';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { FormInputStyle } from '../../utils/FormInputStyle';

/** 搜索牌组与异步选择器共用输入外观；立即通知输入，延后查询，退出时取消。 */
@Component
export struct LiveSearchField {
  @StorageProp(WINDOW_SIZE_KEY) private densityWindow: WindowSizeVp = { width: 0, height: 0 };
  private densityScale(): number {
    return compactLandscapeScale(this.densityWindow.width, this.densityWindow.height);
  }

  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp('theme_color_action_primary') private glassAccent: string = '';
  @StorageProp('surface_material') private searchMaterial: string = 'flat';
  @StorageProp('themeMode') private searchTheme: string = 'system';
  @StorageProp('systemDarkMode') private searchSystemDark: boolean = false;
  @Prop value: string = '';
  @Prop placeholder: ResourceStr = '';
  @Prop isEnabled: boolean = true;
  @Prop focusOnOpen: boolean = false;
  @Prop debounceMs: number = 200;
  @Prop maximumLength: number | undefined = 200;
  onChange: (value: string) => void = (_value: string): void => {};
  onSearch: (value: string) => void = (_value: string): void => {};
  private timer: number = -1;
  private mounted: boolean = false;
  aboutToAppear(): void { this.mounted = true; }
  aboutToDisappear(): void { this.mounted = false; clearTimeout(this.timer); this.timer = -1; }
  private changed(value: string): void {
    if (!this.mounted || !this.isEnabled) return;
    clearTimeout(this.timer); this.timer = -1;
    this.value = value; this.onChange(value);
    if (value.trim() === '' || this.debounceMs <= 0) this.submit();
    else this.timer = setTimeout((): void => { this.submit(); }, this.debounceMs);
  }
  private submit(): void {
    clearTimeout(this.timer); this.timer = -1;
    if (this.mounted && this.isEnabled) this.onSearch(this.value);
  }
  build() {
    TextInput({ text: this.value, placeholder: this.placeholder })
      .attributeModifier(new FormInputStyle( undefined, this.appearanceElements)).defaultFocus(this.focusOnOpen).maxLength(this.maximumLength)
      .cancelButton({ style: CancelButtonStyle.INPUT }).enabled(this.isEnabled)
      .attributeModifier(new SearchFieldSurface(this.searchMaterial, SeriesVisual.isDark(this.searchTheme, this.searchSystemDark), undefined, this.glassAccent, this.appearanceElements))
      .height(应用尺寸.按钮高度 * this.densityScale()).fontSize(应用尺寸.字号_正文)
      .onChange((value: string): void => { this.changed(value); })
      .onSubmit((): void => { this.submit(); })
  }
}
