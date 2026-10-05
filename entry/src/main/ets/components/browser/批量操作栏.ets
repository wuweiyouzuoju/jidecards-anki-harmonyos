import { actionIcon } from '../../utils/ActionIcons';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { CardActionMenu, CardActionMenuEntry } from '../common/CardActionMenu';
import { actionMenuRows, toggleActionMenuBranch, ActionMenuRow } from '../common/ActionMenuTree';
import { flagMenuChoices } from '../common/FlagMenuChoices';
import { FlagLabels, CARD_FLAGS, CardFlagDefinition, customFlagLabel } from '../../model/CardMarking';
import { visibleInterfaceItems, AppInterfaceItem, AppInterfaceControl } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';

/** 多选动作锚定“已选 X 项”下方；保留既有回调，公共菜单拥有几何、滚动和按压反馈。 */
@Component
export struct 批量操作栏 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private Agent入口已启用: boolean = false;
  @Prop isDark: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('publishInterface') 选中数: number = 0;
  @Prop @Watch('publishInterface') notesMode: boolean = false;
  @Prop topOffset: number = 68;
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @Prop @Watch('publishInterface') labels: FlagLabels = {};
  @State @Watch('publishInterface') private primaryObscured: boolean = false;
  @State @Watch('publishInterface') private expandedIds: string[] = ['marking'];
  on改牌组: () => void = (): void => {};
  on设置标志: () => void = (): void => {};
  onFlag: (flag: number) => void = (_flag: number): void => {};
  onFlagNames: () => void = (): void => {};
  onMark: (marked: boolean) => void = (_marked: boolean): void => {};
  onTags: () => void = (): void => {};
  on挂起: () => void = (): void => {};
  onReset: () => void = (): void => {};
  onBury: () => void = (): void => {};
  on删除: () => void = (): void => {};
  on设置到期日: () => void = (): void => {};
  on重新定位: () => void = (): void => {};
  on更改笔记类型: () => void = (): void => {};
  onAI改卡: () => void = (): void => {};
  onHelp: () => void = (): void => {};
  onExit: () => void = (): void => {};
  onClose: () => void = (): void => {};
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void {
    this.mounted = false;
    appInterface.leave('browser_batch'); appInterface.leave('browser_batch_marking'); appInterface.leave('browser_batch_flags');
  }

  private handleBackRequest(): void {
    if (this.expandedIds.includes('flag')) this.expandedIds = this.expandedIds.filter((id: string): boolean => id !== 'flag');
    else this.onClose();
  }
  private markingItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('browser_batch_marking', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false });
  }
  private toggleBranch(id: string): void {
    if (this.busy || this.选中数 === 0) return;
    const expanded: string[] = toggleActionMenuBranch(this.entries(), this.expandedIds, id);
    const openingFlags: boolean = id === 'flag' && !this.expandedIds.includes('flag') && expanded.includes('flag');
    this.expandedIds = expanded;
    if (openingFlags) this.on设置标志();
  }

  private menuItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('browser_batch', { simple: false, agent: this.Agent入口已启用,
      cloudDeck: false, themeHasTextures: false }).filter((item: AppInterfaceItem): boolean =>
        !this.notesMode || (item.id !== 'due' && item.id !== 'reposition'));
  }
  private entries(): CardActionMenuEntry[] { return this.menuItems().map((item: AppInterfaceItem): CardActionMenuEntry => this.menuEntry(item)); }
  private menuEntry(item: AppInterfaceItem, _locale: string = this.uiLanguage): CardActionMenuEntry {
    return { id: item.id, value: namedResourceText(this.getUIContext(), item.titleKey),
      destructive: item.id === 'delete', enabled: !this.busy && this.选中数 > 0,
      icon: actionIcon(item.id),
      children: item.id === 'marking' ? this.markingItems().map((child: AppInterfaceItem): CardActionMenuEntry => this.menuEntry(child)) :
        item.id === 'flag' ? this.flagEntries() : undefined,
      action: (): void => { this.selectItem(item.id); } };
  }
  private flagEntries(): CardActionMenuEntry[] {
    return flagMenuChoices(this.getUIContext(), this.labels, -1, this.busy || this.选中数 === 0,
      (flag: number): void => { this.submitFlag(flag); });
  }
  private submitFlag(flag: number): void {
    if (!this.expandedIds.includes('flag') || !this.expandedIds.includes('marking') || this.busy || this.选中数 === 0 || !CARD_FLAGS.some((item: CardFlagDefinition): boolean => item.value === flag)) return;
    this.expandedIds = [];
    this.onClose(); this.onFlag(flag);
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    if (!this.primaryObscured) this.publishSurface('browser_batch', this.menuItems());
    else appInterface.leave('browser_batch');
    if (this.expandedIds.includes('marking')) this.publishSurface('browser_batch_marking', this.markingItems());
    else appInterface.leave('browser_batch_marking');
    if (this.expandedIds.includes('marking') && this.expandedIds.includes('flag')) {
      const items: AppInterfaceControl[] = this.flagEntries().map((item: CardActionMenuEntry, index: number): AppInterfaceControl => ({
        id: String(index), titleKey: customFlagLabel(this.labels, index) ? undefined : CARD_FLAGS[index].labelKey,
        title: typeof item.value === 'string' ? item.value : '', selected: false, enabled: item.enabled !== false }));
      this.observeSurface('browser_batch_flags', items);
    } else appInterface.leave('browser_batch_flags');
  }
  private publishSurface(surface: string, definitions: AppInterfaceItem[], _locale: string = this.uiLanguage): void {
    const items: AppInterfaceControl[] = definitions.map((item: AppInterfaceItem): AppInterfaceControl => ({
      id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
      selected: false, enabled: !this.busy && this.选中数 > 0 }));
    this.observeSurface(surface, items);
  }


  private observeSurface(surface: string, items: AppInterfaceControl[]): void {
    appInterface.observe({ surface: surface, sectionId: '', selectedId: '', busy: this.busy,
      optionIds: items.map((item: AppInterfaceControl): string => item.id),
      optionLabels: items.map((item: AppInterfaceControl): string => item.title), items: items,
      values: [{ id: 'selected_count', value: String(this.选中数) }], controlsComplete: true });
  }
  private selectItem(id: string): void {
    if (this.busy || this.选中数 === 0) return;
    const row: ActionMenuRow | undefined = actionMenuRows(this.entries(), this.expandedIds)
      .find((item: ActionMenuRow): boolean => item.node.id === id);
    if (row === undefined || !row.enabled || (this.primaryObscured && row.depth === 0)) return;
    if (row.node.children !== undefined) { this.toggleBranch(id); return; }
    this.expandedIds = [];
    this.onClose();
    switch (id) {
      case 'suspend': this.on挂起(); break;
      case 'reset': this.onReset(); break;
      case 'bury': this.onBury(); break;
      case 'notetype': this.on更改笔记类型(); break;
      case 'deck': this.on改牌组(); break;
      case 'reposition': this.on重新定位(); break;
      case 'due': this.on设置到期日(); break;
      case 'tags': this.onTags(); break;
      case 'flag_names': this.onFlagNames(); break;
      case 'mark': this.onMark(true); break;
      case 'unmark': this.onMark(false); break;
      case 'delete': this.on删除(); break;
      case 'agent': this.onAI改卡(); break;
      case 'help': this.onHelp(); break;
      case 'exit': this.onExit(); break;
    }
  }
  build() {
    CardActionMenu({ items: this.entries(), menuWidth: 应用尺寸.cardActionMenuWidth, topOffset: this.topOffset,
      expandedIds: this.expandedIds, onPrimaryObscured: (obscured: boolean): void => { this.primaryObscured = obscured; },
      onToggleBranch: (item: CardActionMenuEntry): void => { this.toggleBranch(item.id ?? ''); },
      onClose: (): void => { this.onClose(); },
      onSelect: (item: CardActionMenuEntry): void => { item.action?.(); } })
  }
}
