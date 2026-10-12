// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { AnchoredMenuItem } from '../common/MenuItem';
import { ActionMenuListItem } from '../common/ActionMenuList';
import { AppInterfaceControl, AppInterfaceItem, deckRowMenuItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';
import { DECK_TONE_CHOICES, DeckToneChoice, 牌组色调 } from '../../model/DeckTone';
import { 简洁模式AppStorage键 } from '../../model/简洁模式存储';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 牌组长按复用公共居中弹窗与动作行；首页拥有目标和原业务回调。 */
@Component
export struct HomeDeckRowMenu {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(简洁模式AppStorage键) @Watch('publishInterface') private simple: boolean = true;
  @Prop @Watch('publishInterface') deckId: string = '';
  @Prop @Watch('publishInterface') deckName: string = '';
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
    if (this.busy || !this.mounted) return;
    if (this.expandedIds.length > 0) this.expandedIds = [];
    else this.dismiss();
  }

  private dismiss(): void {
    if (!this.busy && this.mounted) this.onClose();
  }

  private toneItems(): ActionMenuListItem[] {
    return DECK_TONE_CHOICES.map((choice: DeckToneChoice): ActionMenuListItem => ({
      id: String(choice.tone),
      label: interfaceItemText(this.getUIContext(), 'deck_tones', String(choice.tone), this.uiLanguage),
      icon: $r('app.media.' + choice.iconKey),
      iconTint: choice.colorKey === '' ? undefined : $r('app.color.' + choice.colorKey),
      available: !this.busy, selected: choice.tone === this.tone
    }));
  }

  private menuItems(): ActionMenuListItem[] {
    return deckRowMenuItems(this.simple, this.filtered).map((item: AppInterfaceItem): ActionMenuListItem => ({
      id: item.id,
      label: interfaceItemText(this.getUIContext(), 'deck_row_menu', item.id, this.uiLanguage),
      available: !this.busy, destructive: item.id === 'delete'
    }));
  }

  private toggleBranch(item: ActionMenuListItem): void {
    if (this.busy || !this.mounted || item.id !== 'tone') return;
    this.expandedIds = this.expandedIds.includes('tone') ? [] : ['tone'];
  }

  private selectItem(item: ActionMenuListItem): void {
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
    items.push({ id: 'close', titleKey: 'cancel',
      title: interfaceItemText(this.getUIContext(), 'deck_row_menu', 'close', this.uiLanguage),
      iconKey: 'ic_common_close', enabled: !this.busy, selected: false });
    appInterface.observe({ surface: 'deck_row_menu', sectionId: '', selectedId: this.deckId, busy: this.busy,
      optionIds: items.map((item: AppInterfaceControl): string => item.id),
      optionLabels: items.map((item: AppInterfaceControl): string => item.title), items: items, controlsComplete: true,
      values: [{ id: 'filtered', value: String(this.filtered) }, { id: 'tone', value: String(this.tone) },
        { id: 'presentation', value: 'centered_dialog' }, { id: 'deck_name', value: this.deckName }] });
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

  @Builder
  private dialogHeader() {
    DialogHeader({ title: this.deckName, showAction: false, closeEnabled: !this.busy,
      closeLabel: interfaceItemText(this.getUIContext(), 'deck_row_menu', 'close', this.uiLanguage),
      onClose: (): void => { this.dismiss(); } })
  }

  @Builder
  private dialogContent() {
    Column() {
      ForEach(this.menuItems(), (item: ActionMenuListItem, index: number) => {
        AnchoredMenuItem({ label: item.label, available: item.available !== false,
          destructive: item.destructive === true, divider: index > 0,
          disclosure: item.id === 'tone', expanded: this.expandedIds.includes(item.id),
          onSelect: (): void => { if (item.id === 'tone') this.toggleBranch(item); else this.selectItem(item); } })
        if (item.id === 'tone' && this.expandedIds.includes('tone')) {
          ForEach(this.toneItems(), (choice: ActionMenuListItem) => {
            AnchoredMenuItem({ label: choice.label, icon: choice.icon, iconTint: choice.iconTint,
              available: choice.available !== false, selected: choice.selected === true,
              selectionUsesAccent: choice.id !== String(牌组色调.None),
              onSelect: (): void => { this.selectItem(choice); } })
          }, (choice: ActionMenuListItem): string => choice.id)
        }
      }, (item: ActionMenuListItem): string => item.id)
    }.width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      onDismiss: (): void => { this.dismiss(); },
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); } })
  }
}
