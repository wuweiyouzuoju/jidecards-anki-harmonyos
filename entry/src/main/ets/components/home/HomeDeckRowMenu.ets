// SPDX-License-Identifier: AGPL-3.0-or-later
import { CardActionMenu, CardActionMenuEntry } from '../common/CardActionMenu';
import { ActionMenuAnchor } from '../common/ActionMenuLayout';
import { AppInterfaceControl, AppInterfaceItem, deckRowMenuItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';
import { DECK_TONE_CHOICES, DeckToneChoice, 牌组色调 } from '../../model/DeckTone';
import { 简洁模式AppStorage键 } from '../../model/简洁模式存储';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 与学习/浏览旗标复用同一分组菜单；首页拥有目标和原业务回调。 */
@Component
export struct HomeDeckRowMenu {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(简洁模式AppStorage键) @Watch('publishInterface') private simple: boolean = true;
  @Prop @Watch('publishInterface') deckId: string = '';
  @Prop anchor: ActionMenuAnchor = { left: 0, top: 0, width: 0, height: 0 };
  @Prop @Watch('publishInterface') tone: 牌组色调 = 牌组色调.Blue;
  @Prop @Watch('publishInterface') filtered: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('handleBack') backRequest: number = 0;
  @State @Watch('publishInterface') private expandedIds: string[] = [];
  private mounted: boolean = false;
  onClose: () => void = (): void => {};
  onAction: (deckId: string, action: string) => void = (): void => {};
  onToneChange: (deckId: string, tone: 牌组色调) => void = (): void => {};

  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void {
    this.mounted = false;
    appInterface.leave('deck_row_menu'); appInterface.leave('deck_tones');
  }

  private handleBack(): void {
    if (this.expandedIds.length > 0) this.expandedIds = [];
    else this.onClose();
  }

  private toneItems(): CardActionMenuEntry[] {
    return DECK_TONE_CHOICES.map((choice: DeckToneChoice): CardActionMenuEntry => ({
      id: String(choice.tone),
      value: interfaceItemText(this.getUIContext(), 'deck_tones', String(choice.tone), this.uiLanguage),
      icon: $r('app.media.' + choice.iconKey),
      iconTint: choice.colorKey === '' ? undefined : $r('app.color.' + choice.colorKey),
      enabled: !this.busy, selected: choice.tone === this.tone,
      selectionUsesAccent: choice.tone !== 牌组色调.None
    }));
  }

  private menuItems(): CardActionMenuEntry[] {
    return deckRowMenuItems(this.simple, this.filtered).map((item: AppInterfaceItem): CardActionMenuEntry => ({
      id: item.id,
      value: interfaceItemText(this.getUIContext(), 'deck_row_menu', item.id, this.uiLanguage),
      enabled: !this.busy, destructive: item.id === 'delete',
      children: item.id === 'tone' ? this.toneItems() : undefined
    }));
  }

  private toggleBranch(item: CardActionMenuEntry): void {
    if (this.busy || item.id !== 'tone') return;
    this.expandedIds = this.expandedIds.includes('tone') ? [] : ['tone'];
  }

  private selectItem(item: CardActionMenuEntry): void {
    if (this.busy || !this.mounted) return;
    if (this.expandedIds.includes('tone')) {
      const choice: DeckToneChoice | undefined = DECK_TONE_CHOICES.find((entry: DeckToneChoice): boolean => String(entry.tone) === item.id);
      if (choice !== undefined) {
        const deckId: string = this.deckId;
        this.onClose(); this.onToneChange(deckId, choice.tone); return;
      }
    }
    const current: AppInterfaceItem | undefined = deckRowMenuItems(this.simple, this.filtered)
      .find((entry: AppInterfaceItem): boolean => entry.id === item.id);
    if (current === undefined || current.id === 'tone') return;
    const deckId: string = this.deckId;
    this.onClose(); this.onAction(deckId, current.id);
  }

  private publishInterface(): void {
    if (!this.mounted) return;
    const items: AppInterfaceControl[] = deckRowMenuItems(this.simple, this.filtered).map((item: AppInterfaceItem): AppInterfaceControl => ({
      id: item.id, titleKey: item.titleKey,
      title: interfaceItemText(this.getUIContext(), 'deck_row_menu', item.id, this.uiLanguage),
      enabled: !this.busy, selected: this.expandedIds.includes(item.id)
    }));
    appInterface.observe({ surface: 'deck_row_menu', sectionId: '', selectedId: this.deckId, busy: this.busy,
      optionIds: items.map((item: AppInterfaceControl): string => item.id),
      optionLabels: items.map((item: AppInterfaceControl): string => item.title), items: items, controlsComplete: true,
      values: [{ id: 'filtered', value: String(this.filtered) }, { id: 'tone', value: String(this.tone) },
        { id: 'anchor', value: 'deck_row' }, { id: 'pointer', value: 'selected_deck_border' }] });
    if (this.expandedIds.includes('tone')) {
      const tones: AppInterfaceControl[] = DECK_TONE_CHOICES.map((choice: DeckToneChoice): AppInterfaceControl => ({
        id: String(choice.tone), titleKey: choice.titleKey,
        title: interfaceItemText(this.getUIContext(), 'deck_tones', String(choice.tone), this.uiLanguage),
        enabled: !this.busy, selected: choice.tone === this.tone
      }));
      appInterface.observe({ surface: 'deck_tones', sectionId: this.deckId, selectedId: String(this.tone), busy: this.busy,
        optionIds: tones.map((item: AppInterfaceControl): string => item.id),
        optionLabels: tones.map((item: AppInterfaceControl): string => item.title), items: tones, controlsComplete: true });
    } else appInterface.leave('deck_tones');
  }

  build() {
    CardActionMenu({ items: this.menuItems(), expandedIds: this.expandedIds, menuWidth: 应用尺寸.contextMenuWidth, anchor: this.anchor,
      onClose: (): void => { this.handleBack(); },
      onToggleBranch: (item: CardActionMenuEntry): void => { this.toggleBranch(item); },
      onSelect: (item: CardActionMenuEntry): void => { this.selectItem(item); } })
  }
}
