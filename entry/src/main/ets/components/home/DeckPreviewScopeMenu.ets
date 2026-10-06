// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
import { ActionMenuList, ActionMenuListItem } from '../common/ActionMenuList';
import { AppInterfaceItem, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';

/** 手机与宽屏共用公共菜单条目；HomeDeckDetails 独占表面与定位。 */
@Component
export struct DeckPreviewScopeMenu {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  onSelect: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  private options(): AppInterfaceItem[] {
    return visibleInterfaceItems('deck_preview_scope', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false });
  }
  aboutToAppear(): void {
    const items: AppInterfaceItem[] = this.options();
    appInterface.observe({ surface: 'deck_preview_scope', sectionId: '', selectedId: '', busy: false,
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => namedResourceText(this.getUIContext(), item.titleKey)) });
  }
  aboutToDisappear(): void { appInterface.leave('deck_preview_scope'); }

  private menuItems(_locale: string = this.uiLanguage): ActionMenuListItem[] {
    return this.options().map((option: AppInterfaceItem): ActionMenuListItem => ({
      id: option.id, label: namedResourceText(this.getUIContext(), option.titleKey) }));
  }

  private selectOption(id: string): void {
    if (!this.options().some((option: AppInterfaceItem): boolean => option.id === id)) return;
    this.onSelect(Number(id) as DeckPreviewScope);
  }

  build() {
    ActionMenuList({ items: this.menuItems(this.uiLanguage),
      onSelect: (id: string): void => { this.selectOption(id); } })
  }
}
