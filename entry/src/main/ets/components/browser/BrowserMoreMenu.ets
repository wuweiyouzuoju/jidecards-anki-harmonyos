// SPDX-License-Identifier: AGPL-3.0-or-later
import { CardActionMenu, CardActionMenuEntry } from '../common/CardActionMenu';
import { visibleActionMenuRows, toggleActionMenuBranch, ActionMenuRow } from '../common/ActionMenuTree';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { actionIcon } from '../../utils/ActionIcons';
import { AppInterfaceMenuItem, AppInterfaceControl, browserInterfaceMenu } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { localizedNamedResourceText, namedResourceText } from '../../utils/UiFeedback';

/** 浏览动作与搜索、显示分组复用卡片菜单；共同声明同时提供 JIDE 目录。 */
@Component
export struct BrowserMoreMenu {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('publishInterface') filterActive: boolean = false;
  @Prop @Watch('publishInterface') available: boolean = true;
  @Prop @Watch('publishInterface') subtitleIndex: number = 1;
  @Prop topOffset: number = 68;
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @State @Watch('publishInterface') private expandedIds: string[] = [];
  onClose: () => void = (): void => {};
  onSelectAll: () => void = (): void => {};
  onDisplay: (kind: string) => void = (_kind: string): void => {};
  onHistory: () => void = (): void => {};
  onFilter: () => void = (): void => {};
  onFindReplace: () => void = (): void => {};
  onSaveSearch: () => void = (): void => {};
  onFlagNames: () => void = (): void => {};
  onSubtitle: (index: number) => void = (_index: number): void => {};
  private interfaceMounted: boolean = false;

  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void {
    this.interfaceMounted = false;
    for (const surface of ['browser_more', 'browser_search_tools', 'browser_display_settings', 'browser_more_settings']) {
      appInterface.leave(surface);
    }
  }

  private menuItems(): AppInterfaceMenuItem[] {
    return browserInterfaceMenu(this.available, this.filterActive, this.subtitleIndex);
  }

  private entries(): CardActionMenuEntry[] {
    return this.menuItems().map((item: AppInterfaceMenuItem, index: number): CardActionMenuEntry =>
      this.menuEntry(item, index === 3 || index === 5));
  }

  private menuEntry(item: AppInterfaceMenuItem, divider: boolean = false): CardActionMenuEntry {
    return { id: item.id, value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, item.titleKey),
      icon: actionIcon(item.id), enabled: item.enabled, selected: item.selected, divider: divider,
      children: item.children?.map((child: AppInterfaceMenuItem, index: number): CardActionMenuEntry =>
        this.menuEntry(child, item.id === 'display_settings' && index === 1)) };
  }

  private handleBackRequest(): void {
    if (this.expandedIds.length > 0) this.expandedIds = [];
    else this.onClose();
  }

  private toggleBranch(id: string): void {
    this.expandedIds = toggleActionMenuBranch(this.entries(), this.expandedIds, id);
  }

  private publishSurface(surface: string, items: AppInterfaceMenuItem[]): void {
    const controls: AppInterfaceControl[] = items.map((item: AppInterfaceMenuItem): AppInterfaceControl => ({
      id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
      enabled: item.enabled, selected: item.selected }));
    appInterface.observe({ surface: surface, sectionId: '', selectedId: '', busy: !this.available,
      optionIds: controls.map((item: AppInterfaceControl): string => item.id),
      optionLabels: controls.map((item: AppInterfaceControl): string => item.title), items: controls, controlsComplete: true });
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.interfaceMounted) return;
    const items: AppInterfaceMenuItem[] = this.menuItems();
    this.publishSurface('browser_more', items);
    for (const item of items) {
      if (item.children === undefined || item.opens === undefined) continue;
      if (this.expandedIds.includes(item.id)) this.publishSurface(item.opens, item.children);
      else appInterface.leave(item.opens);
    }
  }

  private selectItem(id: string): void {
    const row: ActionMenuRow | undefined = visibleActionMenuRows(this.entries(), this.expandedIds)
      .find((entry: ActionMenuRow): boolean => entry.node.id === id);
    if (row === undefined || !row.enabled) return;
    if (row.node.children !== undefined) { this.toggleBranch(id); return; }
    if (id === 'select_all') this.onSelectAll();
    else if (id === 'columns') this.onDisplay('columns');
    else if (id === 'search_options') this.onDisplay('search');
    else if (id === 'recent_searches') this.onDisplay('recent');
    else if (id === 'history') this.onHistory();
    else if (id === 'filter') this.onFilter();
    else if (id === 'find_replace') this.onFindReplace();
    else if (id === 'save_search') this.onSaveSearch();
    else if (id === 'flag_names') this.onFlagNames();
    else if (id === 'subtitle_deck') this.onSubtitle(1);
    else if (id === 'subtitle_answer') this.onSubtitle(4);
    else if (id === 'subtitle_due') this.onSubtitle(2);
  }

  build() {
    CardActionMenu({ items: this.entries(), menuWidth: 应用尺寸.cardActionMenuWidth, topOffset: this.topOffset,
      expandedIds: this.expandedIds,
      onToggleBranch: (item: CardActionMenuEntry): void => { this.toggleBranch(item.id ?? ''); },
      onClose: (): void => { this.onClose(); },
      onSelect: (item: CardActionMenuEntry): void => { this.selectItem(item.id ?? ''); } })
  }
}
