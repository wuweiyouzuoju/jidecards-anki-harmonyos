// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppInterfaceItem, AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';
import { ActionMenuList, ActionMenuListItem } from '../common/ActionMenuList';

// 原生尖角弹窗的菜单正文；锚点、表面和关闭由 HomeSummaryHeader 拥有。

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 主页更多面板 {
  @Prop @Watch('publishInterface') historyAvailable: boolean = true;
  @Prop menuMaxHeight: number = 360;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  设置回调: () => void = (): void => {};
  onHistory: () => void = (): void => {};
  统计回调: () => void = (): void => {};
  提醒回调: () => void = (): void => {};
  onIntro: () => void = (): void => {};

  private menuItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('home_more', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false });
  }

  private menuEntries(_locale: string = this.uiLanguage): ActionMenuListItem[] {
    return this.menuItems().map((item: AppInterfaceItem): ActionMenuListItem => ({
      id: item.id, label: namedResourceText(this.getUIContext(), item.titleKey), icon: this.menuIcon(item.id),
      available: item.id !== 'history' || this.historyAvailable
    }));
  }

  private menuIcon(id: string): Resource | undefined {
    switch (id) {
      case 'settings': return $r('app.media.ic_home_settings');
      case 'history': return $r('app.media.ic_study_undo');
      case 'stats': return $r('app.media.ic_home_stats');
      case 'reminders': return $r('app.media.ic_home_reminders');
      case 'intro': return $r('app.media.ic_study_guide');
      default: return undefined;
    }
  }

  private selectItem(id: string): void {
    if (id === 'history' && !this.historyAvailable) return;
    switch (id) {
      case 'settings': this.设置回调(); break;
      case 'history': this.onHistory(); break;
      case 'stats': this.统计回调(); break;
      case 'reminders': this.提醒回调(); break;
      case 'intro': this.onIntro(); break;
    }
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    const items: AppInterfaceItem[] = this.menuItems();
    appInterface.observe({ surface: 'home_more', sectionId: '', selectedId: '',
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => namedResourceText(this.getUIContext(), item.titleKey)), busy: false,
      items: items.map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id, title: '', titleKey: item.titleKey,
        enabled: item.id !== 'history' || this.historyAvailable, selected: false })) });
  }
  aboutToAppear(): void { this.publishInterface(); }
  aboutToDisappear(): void { appInterface.leave('home_more'); }

  build() {
    Scroll() {
      ActionMenuList({ items: this.menuEntries(), onSelect: (id: string): void => { this.selectItem(id); } })
    }.width(应用尺寸.compactMenuWidth).constraintSize({ maxHeight: this.menuMaxHeight }).scrollBar(BarState.Auto)
  }
}
