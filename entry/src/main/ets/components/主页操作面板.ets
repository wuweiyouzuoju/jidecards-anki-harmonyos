// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppInterfaceItem, visibleInterfaceItems } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { namedResourceText } from '../utils/UiFeedback';
import { ActionMenuList, ActionMenuListItem } from './common/ActionMenuList';

import { 应用尺寸 } from '../utils/应用尺寸';
import { 简洁模式AppStorage键 } from '../model/简洁模式存储';

// 原生尖角弹窗的菜单正文；锚点、表面和关闭由 HomeSummaryHeader 拥有。

@Component
export struct 主页操作面板 {
  @Prop menuMaxHeight: number = 360;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  创建牌组回调: () => void = (): void => {};
  onCreateFilteredDeck: () => void = (): void => {};
  导入牌组回调: () => void = (): void => {};
  /** 由父级按渠道开关和下载配额决定是否显示。 */
  @Prop @Watch('publishInterface') 显示获取直链牌组: boolean = false;
  获取直链牌组回调: () => void = (): void => {};
  @StorageLink(简洁模式AppStorage键) @Watch('publishInterface') private 简洁模式: boolean = true;

  private menuItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('home_create', { simple: this.简洁模式, agent: false, cloudDeck: this.显示获取直链牌组, themeHasTextures: false });
  }

  private menuEntries(_locale: string = this.uiLanguage): ActionMenuListItem[] {
    return this.menuItems().map((item: AppInterfaceItem): ActionMenuListItem => ({
      id: item.id, label: namedResourceText(this.getUIContext(), item.titleKey), icon: this.menuIcon(item.id)
    }));
  }

  private menuIcon(id: string): Resource | undefined {
    switch (id) {
      case 'create_deck': return $r('app.media.ic_home_create_deck');
      case 'import': return $r('app.media.ic_home_import');
      case 'cloud_deck': return $r('app.media.ic_home_cloud_deck');
      case 'filtered_deck': return $r('app.media.ic_home_filtered_deck');
      default: return undefined;
    }
  }

  private selectItem(id: string): void {
    switch (id) {
      case 'create_deck': this.创建牌组回调(); break;
      case 'filtered_deck': this.onCreateFilteredDeck(); break;
      case 'import': this.导入牌组回调(); break;
      case 'cloud_deck': this.获取直链牌组回调(); break;
    }
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    const items: AppInterfaceItem[] = this.menuItems();
    appInterface.observe({ surface: 'home_create', sectionId: '', selectedId: '',
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => namedResourceText(this.getUIContext(), item.titleKey)), busy: false });
  }
  aboutToAppear(): void { this.publishInterface(); }
  aboutToDisappear(): void { appInterface.leave('home_create'); }

  build() {
    Scroll() {
      ActionMenuList({ items: this.menuEntries(), onSelect: (id: string): void => { this.selectItem(id); } })
    }.width(!this.简洁模式 || this.显示获取直链牌组 ? 应用尺寸.extendedMenuWidth : 应用尺寸.compactMenuWidth).constraintSize({ maxHeight: this.menuMaxHeight }).scrollBar(BarState.Auto)
  }
}
