// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectionDialog } from '../common/SelectionDialog';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { showToastSafely } from '../../utils/UiFeedback';
import { DialogBackdrop } from '../common/DialogBackdrop';
import { AnchoredMenu } from '../common/AnchoredMenu';
import { 牌组列表项 } from '../牌组列表项';
import { 牌组汇总, 空牌组汇总 } from '../../model/主页模型';
import { deckMenuPlacement, centeredDeckMenuPlacement, DeckMenuPlacement } from '../../model/DeckMenuPresentation';
import { WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';
import { deviceInfo } from '@kit.BasicServicesKit';
import { GlassBackdrop, GlassRegion } from '../../utils/GlassBackdrop';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { AnchoredMenuItem } from '../common/MenuItem';
import { ActionMenuListItem } from '../common/ActionMenuList';
import { AppInterfaceControl, AppInterfaceItem, deckRowMenuItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';
import { DECK_TONE_CHOICES, DeckToneChoice, 牌组色调 } from '../../model/DeckTone';
import { 简洁模式AppStorage键 } from '../../model/简洁模式存储';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { CardActionMenu, CardActionMenuEntry } from '../common/CardActionMenu';
import { ActionMenuAnchor, actionMenuHostAnchor } from '../common/ActionMenuLayout';
import { WindowPoint } from '../../model/WindowSafeLayout';

/** 右键按指针定位，长按保留行预览，详情更多在窗口居中；动作和业务回调共用。 */
@Component
export struct HomeDeckRowMenu {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(简洁模式AppStorage键) @Watch('publishInterface') private simple: boolean = true;
  @Prop centered: boolean = false;
  @Prop refractionSource: string = '';
  @Prop deck: 牌组汇总 = 空牌组汇总;
  @Prop liftAnchor: ActionMenuAnchor = { left: 16, top: 180, width: 320, height: 64 };
  @State private viewportHeight: number = 900;
  @State private viewportWidth: number = 420;
  @State private previewHeight: number = 64;
  @State private menuContentHeight: number = 400;
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @State private liftX: number = 0;
  @State private liftY: number = 0;
  @State private liftOpacity: number = .01;
  private liftMeasured: boolean = false;
  private liftRequested: boolean = false;
  private liftStarted: boolean = false;
  @StorageProp('surface_material') private material: string = 'flat';
  @State private previewRegion: GlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @State private previewFailed: boolean = false;
  private previewReady: boolean = false;
  private menuReady: boolean = false;
  private previewTimer: number = -1;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @Prop @Watch('publishInterface') deckId: string = '';
  @Prop @Watch('publishInterface') deckName: string = '';
  @Prop @Watch('publishInterface') point: WindowPoint | undefined = undefined;
  @State private hostLeft: number = 0;
  @State private hostTop: number = 0;
  @Prop @Watch('publishInterface') tone: 牌组色调 = 牌组色调.Blue;
  @Prop @Watch('publishInterface') filtered: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('handleBack') backRequest: number = 0;
  @State @Watch('publishInterface') private expandedIds: string[] = [];
  @State private toneAnchor: ActionMenuAnchor | undefined = undefined;
  private recordToneAnchor(area: Area): void {
    this.toneAnchor = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
      width: Number(area.width), height: Number(area.height) };
  }
  @State private toneRows: ActionMenuListItem[] = [];
  @State private toneInteractive: boolean = true;
  private readonly toneDialog: NativeDialogHost = new NativeDialogHost();
  private readonly createToneDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.toneDialog.presentation();
    const isCurrent: () => boolean = this.toneDialog.captureCurrent();
    const deckId: string = this.deckId;
    return new CustomDialogController({
      builder: SelectionDialog({ anchor: this.toneAnchor, items: this.toneRows, isInteractive: this.toneInteractive,
        title: interfaceItemText(this.getUIContext(), 'deck_row_menu', 'tone', this.uiLanguage),
        onSelect: (id: string): void => { if (isCurrent() && deckId === this.deckId) this.selectItem({ id: id, label: '' }); },
        onClose: this.toneDialog.guard((): void => { this.closeTones(); }) }),
      onWillDismiss: dismiss, autoCancel: presentation.autoCancel, customStyle: presentation.customStyle,
      alignment: presentation.alignment, width: presentation.width, height: presentation.height,
      keyboardAvoidMode: presentation.keyboardAvoidMode, maskColor: presentation.maskColor,
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation
    });
  };
  private mounted: boolean = false;
  onClose: () => void = (): void => {};
  onAction: (deckId: string, action: string) => void = (): void => {};
  onToneChange: (deckId: string, tone: 牌组色调) => void = (): void => {};

  aboutToAppear(): void {
    this.mounted = true; this.previewHeight = Math.max(32, this.liftAnchor.height);
    this.toneDialog.activate(); this.publishInterface();
    this.previewReady = !this.usesGlass();
    if (!this.previewReady) this.previewTimer = setTimeout((): void => {
      this.previewFailed = true; this.previewReady = true; this.startLift();
    }, 250);
  }
  aboutToDisappear(): void {
    this.mounted = false; clearTimeout(this.previewTimer); this.toneDialog.dispose();
    appInterface.leave('deck_row_menu'); appInterface.leave('deck_tones');
  }

  private handleBack(): void {
    if (this.busy || !this.mounted) return;
    if (this.expandedIds.length > 0) this.closeTones();
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

  private contextAnchor(): ActionMenuAnchor {
    const anchor: ActionMenuAnchor = { left: this.point?.x ?? 0, top: this.point?.y ?? 0, width: 0, height: 0 };
    return actionMenuHostAnchor(anchor, this.hostLeft, this.hostTop);
  }

  private contextEntries(): CardActionMenuEntry[] {
    return this.menuItems().map((item: ActionMenuListItem): CardActionMenuEntry => ({
      id: item.id, value: item.label, enabled: item.available !== false, destructive: item.destructive,
      action: (): void => { this.selectItem(item); }
    }));
  }


  private toggleBranch(item: ActionMenuListItem): void {
    if (this.busy || !this.mounted || item.id !== 'tone') return;
    if (this.expandedIds.includes('tone')) { this.closeTones(); return; }
    this.expandedIds = ['tone']; this.publishInterface();
    try { this.toneDialog.open(this.createToneDialog, (): boolean => {
      if (this.busy) return false;
      this.expandedIds = []; return true;
    }); } catch (error) {
      this.expandedIds = [];
      showToastSafely(this.getUIContext(), { message: $r('app.string.directory_open_error') });
    }
  }

  private closeTones(): void { this.toneDialog.close(); this.expandedIds = []; }

  private selectItem(item: ActionMenuListItem): void {
    if (this.busy || !this.mounted) return;
    if (item.id === 'tone') { this.toggleBranch(item); return; }
    if (this.expandedIds.includes('tone')) {
      const choice: DeckToneChoice | undefined = DECK_TONE_CHOICES.find((entry: DeckToneChoice): boolean => String(entry.tone) === item.id);
      if (choice !== undefined) {
        const deckId: string = this.deckId;
        this.closeTones(); this.onClose(); this.onToneChange(deckId, choice.tone); return;
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
    this.toneRows = this.toneItems(); this.toneInteractive = !this.busy;
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
        { id: 'presentation', value: this.centered ? 'centered_details_menu' : this.point === undefined ? 'lifted_deck_context_menu' : 'pointer_context_menu' },
        { id: 'tone_presentation', value: 'secondary_dialog' },
        { id: 'triggers', value: 'long_press,right_click,details_more' }, { id: 'deck_name', value: this.deckName }] });
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

  private placement(): DeckMenuPlacement {
    const left = Math.max(16, this.safeLeft - this.hostLeft + 16);
    const top = Math.max(16, this.safeTop - this.hostTop + 16);
    if (this.centered) return centeredDeckMenuPlacement(
      { left, top, width: Math.max(48, this.viewportWidth - left - this.safeRight - 16),
        height: Math.max(48, this.viewportHeight - top - this.safeBottom - 16) }, this.menuContentHeight, this.previewHeight);
    return deckMenuPlacement(actionMenuHostAnchor(this.liftAnchor, this.hostLeft, this.hostTop),
      { left, top, width: Math.max(48, this.viewportWidth - left - this.safeRight - 16),
        height: Math.max(160, this.viewportHeight - top - this.safeBottom - 16) }, this.previewHeight, this.menuContentHeight);
  }
  private previewTop(): number { return this.placement().preview.top; }
  private menuTop(): number { return this.placement().menu.top; }
  private previewWidth(): number { return this.placement().preview.width; }
  private previewLeft(): number { return this.placement().preview.left; }
  private panelWidth(): number { return this.placement().menu.width; }
  private prepareLift(): void {
    if (this.liftMeasured) return;
    this.liftMeasured = true;
    if (this.liftRequested) this.startLift();
  }
  private usesGlass(): boolean { return this.material === 'glass' && this.refractionSource !== '' && deviceInfo.apiAvailable(23); }
  private startLift(): void {
    this.liftRequested = true;
    if (!this.previewReady || !this.menuReady) return;
    if (!this.liftMeasured || this.liftStarted) return;
    this.liftStarted = true;
    this.liftX = this.centered ? 0 : this.liftAnchor.left - this.hostLeft - this.previewLeft();
    this.liftY = this.centered ? 0 : this.liftAnchor.top - this.hostTop - this.previewTop();
    setTimeout((): void => {
      if (!this.mounted) return;
      this.getUIContext().animateTo(SurfaceTransition.dialogEnterAnimation(), (): void => {
        this.liftX = 0; this.liftY = 0; this.liftOpacity = 1;
      });
    }, 0);
  }

  @Builder
  private dialogContent() {
    Column() {
      ForEach(this.menuItems(), (item: ActionMenuListItem, index: number) => {
        AnchoredMenuItem({ label: item.label, available: item.available !== false,
          destructive: item.destructive === true, divider: index > 0 && ['tone', 'rename'].includes(item.id),
          disclosure: item.id === 'tone', expanded: this.expandedIds.includes(item.id),
          onSelect: (): void => { if (item.id === 'tone') this.toggleBranch(item); else this.selectItem(item); } })
      }, (item: ActionMenuListItem): string => item.id)
    }.width('100%').onAreaChange((_old: Area, area: Area): void => {
      if (!this.liftStarted) this.menuContentHeight = Number(area.height);
    })
      .accessibilityLevel(this.expandedIds.includes('tone') ? 'no-hide-descendants' : 'auto')
  }

  build() {
    Stack() {
      if (this.point !== undefined) {
        CardActionMenu({ onPrimaryArea: (area: Area): void => { this.recordToneAnchor(area); }, items: this.contextEntries(), anchor: this.contextAnchor(), expandedIds: this.expandedIds,
          menuWidth: 应用尺寸.cardActionMenuWidth,
          onToggleBranch: (item: CardActionMenuEntry): void => { this.toggleBranch({ id: item.id ?? '', label: item.value }); },
          onSelect: (item: CardActionMenuEntry): void => { item.action?.(); }, onClose: (): void => { this.dismiss(); } })
          .hitTestBehavior(this.expandedIds.includes('tone') ? HitTestMode.None : HitTestMode.Default)
      } else {
        DialogBackdrop().onClick((): void => { this.dismiss(); })
        AnchoredMenu({ onPanelArea: (area: Area): void => { this.recordToneAnchor(area); }, refractionSource: this.refractionSource, materialRole: 'menu',
          menuWidth: this.panelWidth(), topOffset: this.menuTop(), alignEnd: false,
          contentLeft: this.placement().menu.left, contentMaxWidth: this.panelWidth(),
          onPrepared: (): void => { this.menuReady = true; this.startLift(); },
          maxHeight: this.placement().menu.height,
          cornerRadius: 应用尺寸.圆角_卡片, onClose: (): void => { this.dismiss(); } }) {
          this.dialogContent()
        }
        Stack() {
          if (this.usesGlass() && !this.previewFailed) {
            GlassBackdrop({ source: this.refractionSource, role: 'menu', region: this.previewRegion,
              radius: 应用尺寸.圆角_牌组行, onReady: (): void => {
                this.previewReady = true; clearTimeout(this.previewTimer); this.startLift();
              } }).width('100%').height('100%').position({ x: 0, y: 0 })
          }
          牌组列表项({ deck: this.deck, selected: false, menuOpen: true })
            .onAreaChange((_old: Area, area: Area): void => { this.previewHeight = Number(area.height); })
        }
          .width(this.previewWidth()).height(this.previewHeight).borderRadius(应用尺寸.圆角_牌组行).clip(true)
          .position({ x: this.previewLeft(), y: this.previewTop() })
          .onAreaChange((_old: Area, area: Area): void => {
            this.previewRegion = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
              width: Number(area.width), height: Number(area.height) };
          })
          .shadow({ radius: 16, color: '#33000000', offsetX: 0, offsetY: 8 })
          .translate({ x: this.liftX, y: this.liftY }).opacity(this.liftOpacity)
          .hitTestBehavior(HitTestMode.None)
      }
    }.width('100%').height('100%').onClick((): void => { this.dismiss(); }).onAreaChange((_old: Area, area: Area): void => {
      this.hostLeft = Number(area.globalPosition.x); this.hostTop = Number(area.globalPosition.y);
      this.viewportHeight = Number(area.height); this.viewportWidth = Number(area.width); this.prepareLift();
    })
  }
}
