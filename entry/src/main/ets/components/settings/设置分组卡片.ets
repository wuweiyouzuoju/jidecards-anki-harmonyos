import { MODULE_OPACITY_KEY, MaterialOpacity, DEFAULT_MODULE_OPACITY } from '../../model/SurfaceMaterial';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpLabel } from '../common/HelpLabel';

// 二级设置页的静态分区：选项直接呈现，帮助按钮仍打开页面级说明。
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { 颜色键 } from '../../model/颜色主题';
import { settingsGroupText } from '../../utils/SettingsStructureText';

@Component
export struct 设置分组卡片 {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(MODULE_OPACITY_KEY) private moduleOpacity: MaterialOpacity = DEFAULT_MODULE_OPACITY;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 标题: Resource = $r('app.string.settings_about');
  @Prop groupId: string = '';
  @Prop 是否深色: boolean = false;
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @StorageProp(颜色键.页面底色微染) private pageTint: string = '';
  @Prop showHeader: boolean = true;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  打开说明回调: (标题: Resource, 正文: Resource) => void =
    (_标题: Resource, _正文: Resource): void => {};
  @BuilderParam 内容: () => void = this.默认内容;

  @Builder
  private 默认内容(): void {}

  build() {
    Column() {
      if (this.showHeader) {
        Row({ space: 应用尺寸.间距_12 }) {
          HelpLabel({ title: this.groupId === '' ? this.标题 : settingsGroupText(this.getUIContext(), this.groupId, this.uiLanguage), textSize: 14, textWeight: FontWeight.Medium, minRowHeight: 44,
          textColor: 设置面板色板_取(this.是否深色).次文字,
          showHelp: this.帮助标题 !== null && this.帮助正文 !== null,
          onHelp: (): void => { this.打开说明回调(this.帮助标题 as Resource, this.帮助正文 as Resource); }
          }).layoutWeight(1)
        }.width('100%').alignItems(VerticalAlign.Center)
      }

      this.内容()
    }
    .width('100%')
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距, top: 8, bottom: 8 })
    .attributeModifier(SeriesVisual.settingsSurface(this.surfaceMaterial, this.是否深色, this.actionColor, this.pageTint, 应用尺寸.圆角_卡片, this.moduleOpacity))
  }
}
