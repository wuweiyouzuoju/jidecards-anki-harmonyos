// SPDX-License-Identifier: AGPL-3.0-or-later
import { 颜色键 } from '../model/颜色主题';
import { 应用尺寸 } from '../utils/应用尺寸';
import { SeriesVisual } from '../utils/SeriesVisual';
import { PressFeedback } from '../utils/PressFeedback';
import { resourceText } from '../utils/UiFeedback';

/** 详情主操作与显示答案共用高度、字体和圆角，轮廓与上方模块同源。 */
@Component
export struct 开始学习按钮 {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop 文案: Resource = $r('app.string.start_study');
  @Prop isAvailable: boolean = true;
  开始学习回调: () => void = (): void => {};

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.文案).fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium)
        .fontColor(this.actionColor).textAlign(TextAlign.Center).width('100%')
    }
    .width('100%').height(应用尺寸.行动按钮高度).padding({ left: 4, right: 4 })
    .attributeModifier(SeriesVisual.control(this.surfaceMaterial,
      SeriesVisual.isDark(this.themeMode, this.systemDark), this.actionColor, 应用尺寸.圆角_面板, true))
    .attributeModifier(new PressFeedback()).stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板).enabled(this.isAvailable)
    .accessibilityText(resourceText(this.getUIContext(), this.文案))
    .onClick((): void => { if (this.isAvailable) this.开始学习回调(); })
  }
}
