// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedActionMenuList, SharedActionMenuListItem } from 'jide_foundation';
import { productMenuTheme } from '../../utils/MenuTheme';
import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { currentMotionProfile } from '../../utils/AppMotion';
import { MenuSlideScope, menuSlideSession } from '../../model/MenuSlideSession';
export interface ActionMenuListItem extends SharedActionMenuListItem {}

/** 完整菜单列表、分隔行、实时可用性及迟到点击守卫由公共基础统一执行。 */
@Component
export struct ActionMenuList {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  slideScope: MenuSlideScope = new MenuSlideScope();
  @Prop items: ActionMenuListItem[] = [];
  @Prop labelAlignment: TextAlign = TextAlign.Center;
  onSelect: (id: string) => void = (_id: string): void => {};
  build() {
    SharedActionMenuList({ theme: productMenuTheme(this.material, this.mode, this.systemDark, true, undefined, this.accent, this.getUIContext()),
      items: this.items, labelAlignment: this.labelAlignment, slideScope: this.slideScope, menuRouter: menuSlideSession,
      readPressScale: (): number => currentMotionProfile().pressScale, onTrigger: (area: Area): void => { rememberPopupTrigger(area); }, onSelect: this.onSelect })
  }
}
