import { insetMaterialFill } from '../utils/GlassMaterial';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { 颜色键 } from '../model/颜色主题';
import { 应用尺寸 } from '../utils/应用尺寸';
import { StudyRatingSurface } from '../utils/StudyRatingSurface';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
import { resourceText } from '../utils/UiFeedback';

/** 详情主操作与显示答案共用高度、字体和圆角，表面复用公共玻璃操作按钮。 */
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
      Text(this.文案).fontSize(应用尺寸.字号_按钮).fontWeight(600)
        .fontColor(this.actionColor).textAlign(TextAlign.Center).width('100%')
    }
    .width('100%').height(应用尺寸.行动按钮高度).padding(0)
    .backgroundColor(insetMaterialFill($r('app.color.surface_card')))
    .border(SurfaceBorder.options(应用尺寸.卡片边框))
    .attributeModifier(new StudyRatingSurface(this.surfaceMaterial, GLASS_HIGHLIGHT_COLORS,
      $r('app.color.surface_card'), false, this.actionColor,
      this.themeMode === 'dark' || (this.themeMode !== 'light' && this.systemDark))).stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板).clip(true).enabled(this.isAvailable)
    .accessibilityText(resourceText(this.getUIContext(), this.文案))
    .onClick((): void => { if (this.isAvailable) this.开始学习回调(); })
  }
}
