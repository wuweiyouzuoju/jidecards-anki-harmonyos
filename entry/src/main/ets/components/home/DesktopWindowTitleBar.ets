// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { appInterface } from '../../backend/AppInterfaceService';
import { DESKTOP_WINDOW_TITLE_BAR, WINDOW_PINNED_KEY, WindowTitleBarLayout } from '../../model/WindowSafeLayout';
import { localizedResourceText, showToastSafely } from '../../utils/UiFeedback';

@Component
export struct DesktopWindowTitleBar {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop layout: WindowTitleBarLayout = { height: 0, controlsWidth: 0, controlsTop: 0, controlsHeight: 0 };
  @StorageProp(WINDOW_PINNED_KEY) @Watch('publishInterface') private pinned: boolean = false;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @State @Watch('publishInterface') private busy: boolean = false;
  private active: boolean = false;
  private moved: boolean = false;

  aboutToAppear(): void {
    this.active = true;
    this.publishInterface();
  }

  aboutToDisappear(): void {
    this.active = false;
    appInterface.leave(DESKTOP_WINDOW_TITLE_BAR);
  }

  private publishInterface(): void {
    if (!this.active) return;
    appInterface.observe({ surface: DESKTOP_WINDOW_TITLE_BAR, sectionId: '', selectedId: '', optionIds: [], optionLabels: [],
      busy: this.busy, controlsComplete: true, items: [{ id: 'window_pin', title: '',
        titleKey: this.pinned ? 'window_unpin' : 'window_pin',
        iconKey: this.pinned ? 'ic_editor_pin_filled' : 'ic_editor_pin', enabled: !this.busy, selected: this.pinned }] });
  }

  private pinLabel(): string {
    return localizedResourceText(this.getUIContext(), this.uiLanguage,
      this.pinned ? $r('app.string.window_unpin') : $r('app.string.window_pin'));
  }

  private mainWindow(): window.Window | undefined {
    try {
      const host = this.getUIContext().getHostContext() as common.UIAbilityContext;
      return host.windowStage.getMainWindowSync();
    } catch {
      return undefined;
    }
  }

  private async togglePin(): Promise<void> {
    if (this.busy) return;
    const next: boolean = !this.pinned;
    this.busy = true;
    try {
      const host = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const stage = host.windowStage;
      await stage.getMainWindowSync().setWindowTopmost(next);
      if (host.windowStage === stage) AppStorage.setOrCreate<boolean>(WINDOW_PINNED_KEY, next);
    } catch {
      if (this.active) showToastSafely(this.getUIContext(), { message: $r('app.string.window_pin_failed') });
    } finally {
      this.busy = false;
    }
  }

  private async dragWindow(event: TouchEvent): Promise<void> {
    if (event.type === TouchType.Down) this.moved = false;
    if (event.type !== TouchType.Move || this.moved || event.touches.length !== 1) return;
    this.moved = true;
    try { await this.mainWindow()?.startMoving(); } catch { /* The pointer may already have been released. */ }
  }

  private async toggleMaximize(): Promise<void> {
    try {
      const target: window.Window | undefined = this.mainWindow();
      if (target === undefined) return;
      if (target.getWindowStatus() === window.WindowStatusType.MAXIMIZE) await target.recover();
      else await target.maximize(window.MaximizePresentation.EXIT_IMMERSIVE);
    } catch { /* Window state may have changed while processing the gesture. */ }
  }

  build() {
    Row() {
      Row({ space: 8 }) {
        Image($r('app.media.app_icon')).width(20).height(20).objectFit(ImageFit.Contain)
        Text($r('app.string.app_name')).fontSize(14).fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
      }
      .padding({ left: 16, right: 8 }).height('100%').layoutWeight(1)
      .onTouch((event: TouchEvent): void => { void this.dragWindow(event); })
      .gesture(TapGesture({ count: 2 }).onAction((): void => { void this.toggleMaximize(); }))

      Column() {
        Button() {
          // Retain each SVG's fill so the outline and filled states remain distinct.
          Image(this.pinned ? $r('app.media.ic_editor_pin_filled') : $r('app.media.ic_editor_pin'))
            .width(14).height(14).objectFit(ImageFit.Contain)
            .accessibilityLevel('no').hitTestBehavior(HitTestMode.None)
        }
        .type(ButtonType.Normal)
        .width(this.layout.controlsHeight).height(this.layout.controlsHeight).padding(0).borderRadius(4)
        .backgroundColor(Color.Transparent).hoverEffect(HoverEffect.Highlight)
        .attributeModifier(new PressFeedback()).stateEffect(false)
        .enabled(!this.busy).accessibilityText(this.pinLabel()).accessibilitySelected(this.pinned)
        .bindTips(this.pinLabel()).id('desktop_window_pin')
        .onClick((): void => { void this.togglePin(); })
      }
      .height('100%').alignItems(HorizontalAlign.Center).justifyContent(FlexAlign.Start)
      .padding({ top: this.layout.controlsTop, right: 6 }).flexShrink(0)

      Blank().width(this.layout.controlsWidth).flexShrink(0).hitTestBehavior(HitTestMode.None)
    }
    .width('100%').height(this.layout.height).flexShrink(0)
    .backgroundColor($r('app.color.surface_card'))
  }
}
