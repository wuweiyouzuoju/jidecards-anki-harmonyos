// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { AppInterfaceMenuItem, AppInterfaceControl, browserInterfaceMenu } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';

/** 沿用设置模式菜单的居中条目、主题色标记和透明承接层。 */
@Component
export struct BrowserMoreMenu {
  @Prop @Watch('publishInterface') filterActive: boolean = false;
  @Prop @Watch('publishInterface') available: boolean = true;
  @Prop @Watch('publishInterface') subtitleIndex: number = 1;
  @Prop topOffset: number = 68;
  onClose: () => void = (): void => {};
  onFilter: () => void = (): void => {};
  onFindReplace: () => void = (): void => {};
  onSaveSearch: () => void = (): void => {};
  onSubtitle: (index: number) => void = (_index: number): void => {};
  private interfaceMounted: boolean = false;

  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('browser_more'); }

  private menuItems(): AppInterfaceMenuItem[] {
    return browserInterfaceMenu(this.available, this.filterActive, this.subtitleIndex);
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const items: AppInterfaceMenuItem[] = this.menuItems();
    appInterface.observe({ surface: 'browser_more', sectionId: '', selectedId: '', busy: !this.available,
      optionIds: items.map((item: AppInterfaceMenuItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceMenuItem): string => namedResourceText(this.getUIContext(), item.titleKey)),
      items: items.map((item: AppInterfaceMenuItem): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey,
        title: namedResourceText(this.getUIContext(), item.titleKey), enabled: item.enabled, selected: item.selected })) });
  }

  private selectItem(id: string): void {
    const item: AppInterfaceMenuItem | undefined = this.menuItems().find((entry: AppInterfaceMenuItem): boolean => entry.id === id);
    if (item === undefined || !item.enabled) return;
    if (id === 'filter') this.onFilter();
    else if (id === 'find_replace') this.onFindReplace();
    else if (id === 'save_search') this.onSaveSearch();
    else if (id === 'subtitle_deck') this.onSubtitle(1);
    else if (id === 'subtitle_answer') this.onSubtitle(4);
    else if (id === 'subtitle_due') this.onSubtitle(2);
  }

  build() {
    AnchoredMenu({ menuWidth: 应用尺寸.extendedMenuWidth, topOffset: this.topOffset,
      onClose: (): void => { this.onClose(); } }) {
      ForEach(this.menuItems(), (item: AppInterfaceMenuItem, index: number) => {
        AnchoredMenuItem({ label: namedResourceText(this.getUIContext(), item.titleKey), divider: index > 0,
          available: item.enabled, selected: item.selected, onSelect: (): void => { this.selectItem(item.id); } })
      }, (item: AppInterfaceMenuItem): string => item.id)
    }
  }
}
