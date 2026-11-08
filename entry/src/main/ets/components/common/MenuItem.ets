// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedMenuItem } from 'jide_foundation';
import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { productMenuTheme } from '../../utils/MenuTheme';
import { currentMotionProfile, disclosureAnimation } from '../../utils/AppMotion';
import { MenuSlideScope, menuSlideSession } from '../../model/MenuSlideSession';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { themeLabelGlyphs } from './ThemeText';

/** 颜色、资源、主题字形和指针路由属于产品；菜单行绘制只有公共基础一个实现。 */
@Component
export struct AnchoredMenuItem {
  @Prop slideLayer: number = 0;
  @Prop label: ResourceStr = '';
  @Prop labelAlignment: TextAlign = TextAlign.Start;
  @Prop selected: boolean = false;
  @Prop selectionUsesAccent: boolean = true;
  @Prop available: boolean = true;
  @Prop divider: boolean = false;
  @Prop disclosure: boolean = false;
  @Prop expanded: boolean = false;
  @Prop disclosureAngle: number | undefined = undefined;
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop iconTint: ResourceColor | undefined = undefined;
  @Prop destructive: boolean = false;
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(THEME_TEXT_COLORS_KEY) private accentColors: string[] = [];
  slideScope: MenuSlideScope = new MenuSlideScope();
  onSelect: () => void = (): void => {};
  build() {
    SharedMenuItem({
      slideLayer: this.slideLayer,
      label: this.label,
      labelAlignment: this.labelAlignment,
      selected: this.selected,
      selectionUsesAccent: this.selectionUsesAccent,
      available: this.available,
      divider: this.divider,
      disclosure: this.disclosure,
      expanded: this.expanded,
      disclosureAngle: this.disclosureAngle,
      icon: this.icon,
      iconTint: this.iconTint,
      destructive: this.destructive,
      theme: productMenuTheme(this.material, this.mode, this.systemDark, true, undefined, this.accent, this.getUIContext()),
      labelGlyphs: this.selected && this.selectionUsesAccent ? themeLabelGlyphs(this.label, this.accentColors, this.getUIContext(), this.uiLanguage) : [],
      disclosureMotion: disclosureAnimation(), readPressScale: (): number => currentMotionProfile().pressScale,
      slideScope: this.slideScope, menuRouter: menuSlideSession, onTrigger: (area: Area): void => { rememberPopupTrigger(area); },
      onSelect: this.onSelect })
  }
}
