import { display } from '@kit.ArkUI';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { APPEARANCE_CUSTOMIZATION_ITEMS } from '../../model/AppearanceCustomization';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { IBestImageCropperController } from '@ibestservices/ibest-ui';
import { PREVIEW_ACCENT_KEY, CUSTOM_ACCENT_KEY, DEFAULT_CUSTOM_ACCENT, WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, WALLPAPER_LIGHT_KEY, WALLPAPER_DARK_KEY,
  validAccent, rgbAccent, ACCENT_LIGHT_ADAPTATION_KEY, ACCENT_DARK_ADAPTATION_KEY, PREVIEW_LIGHT_ADAPTATION_KEY, PREVIEW_DARK_ADAPTATION_KEY } from '../../model/AppearanceCustomization';
import { saveWallpaper, saveWallpaperMask, saveWallpaperOpacity } from '../../utils/AppearanceCustomizationStore';
import { 从图库选取图片 } from '../../utils/文件导入助手';
import { appThemeColorSession } from '../../backend/AppThemeService';
import { releaseDeckBackground } from '../../backend/DeckBackgroundImage';
import { ImageCropViewport } from '../common/ImageCropViewport';
import { SelectionOptions } from '../common/SelectionOptions';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用颜色主题 } from '../../utils/颜色主题管理器';
import { 解析主题色板 } from '../../model/颜色主题';
import { ThemeId } from '../../model/ThemeCatalog';
import { SeriesVisual } from '../../utils/SeriesVisual';

/** 调色草稿实时预览，退出恢复原主题，确认后才持久保存。裁剪沿用牌组背景实现。 */
@CustomDialog
export struct AppearanceCustomizationDialog {
  controller?: CustomDialogController;
  @Prop pane: string = 'color';
  onClose: () => void = (): void => {};
  registerDismiss: (guard: () => boolean) => void = (_guard: () => boolean): void => {};
  @StorageProp(CUSTOM_ACCENT_KEY) @Watch('publishInterface') private savedAccent: string = DEFAULT_CUSTOM_ACCENT;
  @StorageProp(ACCENT_LIGHT_ADAPTATION_KEY) @Watch('publishInterface') private savedLightAdaptation: number = 100;
  @StorageProp(ACCENT_DARK_ADAPTATION_KEY) @Watch('publishInterface') private savedDarkAdaptation: number = 100;
  @StorageProp(WALLPAPER_KEY) @Watch('publishInterface') private wallpaper: string = '';
  @StorageProp(WALLPAPER_OPACITY_KEY) @Watch('publishInterface') private wallpaperOpacity: number = 100;
  @StorageProp(WALLPAPER_LIGHT_KEY) private lightMask: number = 0.2;
  @StorageProp(WALLPAPER_DARK_KEY) private darkMask: number = 0.45;
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  @State private draft: string = DEFAULT_CUSTOM_ACCENT;
  @State private lightAdaptationDraft: number = 100;
  @State private darkAdaptationDraft: number = 100;
  @State private red: number = 91;
  @State private green: number = 107;
  @State private blue: number = 138;
  @State @Watch('publishInterface') private editingColor: boolean = false;
  @State @Watch('publishInterface') private uri: string = '';
  @State @Watch('publishInterface') private wallpaperDraft: PixelMap | null = null;
  private savingWallpaper: boolean = false;
  @State private widthVp: number = 0;
  @State private aspect: number = 0.5;
  @State @Watch('publishInterface') private busy: boolean = false;
  @State @Watch('publishInterface') private losslessWallpaper: boolean = false;
  @State private failed: boolean = false;
  @State private opacityDraft: number = 100;
  @State private lightDraft: number = 20;
  @State private darkDraft: number = 45;
  private initialTheme: ThemeId = 'aurora';
  private colorConfirmed: boolean = false;
  private generation: number = 0;
  private disposed: boolean = false;
  private readonly cropper: IBestImageCropperController = new IBestImageCropperController();
  aboutToAppear(): void {
    this.disposed = false;
    this.initialTheme = AppStorage.get<ThemeId>('colorTheme') ?? 'aurora';
    this.colorConfirmed = false;
    try { const screen: display.Display = display.getDefaultDisplaySync(); this.aspect = screen.width / screen.height; }
    catch (error) { this.aspect = 0.5; }
    this.editingColor = this.pane === 'color';
    this.draft = this.savedAccent; this.syncChannels();
    this.lightAdaptationDraft = this.savedLightAdaptation;
    this.darkAdaptationDraft = this.savedDarkAdaptation;
    this.registerDismiss((): boolean => { return this.dismiss(); });
    this.publishInterface();
    this.opacityDraft = this.wallpaperOpacity;
    this.lightDraft = Math.round(this.lightMask * 100); this.darkDraft = Math.round(this.darkMask * 100);
  }
  aboutToDisappear(): void {
    this.restorePreview();
    this.disposed = true;
    this.generation++;
    if (!this.savingWallpaper && this.wallpaperDraft !== null) releaseDeckBackground(this.wallpaperDraft);
    this.wallpaperDraft = null;
    appInterface.leave('appearance_customization');
  }
  private publishInterface(): void {
    if (this.disposed) return;
    appInterface.observe({ surface: 'appearance_customization', sectionId: this.uri !== '' ? 'crop' : this.pane,
      selectedId: '', optionIds: [], optionLabels: [], busy: this.busy, controlsComplete: true,
      items: APPEARANCE_CUSTOMIZATION_ITEMS.filter((item): boolean => {
        const formatOption: boolean = item.id === 'wallpaper_save_lossless' || item.id === 'wallpaper_save_compact';
        if (this.uri !== '') {
          return item.id === 'wallpaper_crop_cancel' || item.id === 'wallpaper_crop_apply';
        }
        if (formatOption || item.id === 'wallpaper_apply') return this.wallpaperDraft !== null;
        if (item.id === 'wallpaper_crop_apply' || item.id === 'wallpaper_crop_cancel') return false;
        if (this.pane === 'color') return ['apply_accent', 'accent_light_adaptation', 'accent_dark_adaptation'].includes(item.id);
        if (['custom_accent', 'apply_accent', 'accent_light_adaptation', 'accent_dark_adaptation'].includes(item.id)) return false;
        if (item.id === 'wallpaper_opacity') return this.wallpaperDraft !== null || this.wallpaper !== '';
        if (item.id === 'wallpaper_remove' || item.id === 'wallpaper_masks') {
          return this.wallpaperDraft === null && this.wallpaper !== '';
        }
        return true;
      }).map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: '', enabled: !this.busy,
        selected: item.id === 'wallpaper_save_lossless' && this.losslessWallpaper ||
          item.id === 'wallpaper_save_compact' && !this.losslessWallpaper })),
      values: [{ id: 'custom_accent', value: this.savedAccent }, { id: 'preview_accent', value: validAccent(this.draft) ? this.draft : '' }, { id: 'accent_light_adaptation', value: String(this.savedLightAdaptation) }, { id: 'accent_dark_adaptation', value: String(this.savedDarkAdaptation) },
        { id: 'preview_light_adaptation', value: String(this.lightAdaptationDraft) }, { id: 'preview_dark_adaptation', value: String(this.darkAdaptationDraft) }, { id: 'wallpaper_present', value: String(this.wallpaper !== '') },
        { id: 'wallpaper_opacity', value: String(this.wallpaperOpacity) }, { id: 'light_mask', value: String(this.lightMask) }, { id: 'dark_mask', value: String(this.darkMask) }] });
  }
  private dismiss(): boolean {
    if (this.busy) return false;
    if (this.uri !== '') { this.uri = ''; this.generation++; return false; }
    this.restorePreview();
    return true;
  }
  private close(): void { if (this.dismiss()) this.onClose(); }
  private previewColor(): void {
    if (this.disposed || this.pane !== 'color' || this.busy || !validAccent(this.draft)) return;
    AppStorage.setOrCreate<number>(PREVIEW_LIGHT_ADAPTATION_KEY, this.lightAdaptationDraft);
    AppStorage.setOrCreate<number>(PREVIEW_DARK_ADAPTATION_KEY, this.darkAdaptationDraft);
    AppStorage.setOrCreate<string>(PREVIEW_ACCENT_KEY, this.draft);
    应用颜色主题('custom', SeriesVisual.isDark(this.mode, this.systemDark));
    this.publishInterface();
  }
  private restorePreview(): void {
    if (this.pane !== 'color' || this.colorConfirmed) return;
    this.clearPreview();
    const current: ThemeId = AppStorage.get<ThemeId>('colorTheme') ?? this.initialTheme;
    应用颜色主题(current, SeriesVisual.isDark(this.mode, this.systemDark));
  }
  private clearPreview(): void {
    AppStorage.setOrCreate<string>(PREVIEW_ACCENT_KEY, '');
    AppStorage.delete(PREVIEW_LIGHT_ADAPTATION_KEY);
    AppStorage.delete(PREVIEW_DARK_ADAPTATION_KEY);
  }
  private changeAdaptation(dark: boolean, value: number): void {
    if (this.busy) return;
    if (dark) this.darkAdaptationDraft = value;
    else this.lightAdaptationDraft = value;
    this.previewColor();
  }
  private effectiveAccent(dark: boolean): string {
    const seed: string = validAccent(this.draft) ? this.draft : this.savedAccent;
    return 解析主题色板('custom', dark, seed, dark ? this.darkAdaptationDraft : this.lightAdaptationDraft).动作主色;
  }
  private syncChannels(): void {
    if (!validAccent(this.draft)) return;
    this.red = parseInt(this.draft.slice(1, 3), 16);
    this.green = parseInt(this.draft.slice(3, 5), 16);
    this.blue = parseInt(this.draft.slice(5, 7), 16);
  }
  private changeChannel(channel: number, value: number): void {
    if (channel === 0) this.red = value;
    else if (channel === 1) this.green = value;
    else this.blue = value;
    this.draft = rgbAccent(this.red, this.green, this.blue);
    this.previewColor();
  }
  private async applyColor(): Promise<void> {
    if (this.busy || !validAccent(this.draft)) return;
    this.busy = true; this.failed = false;
    try {
      const result = await appThemeColorSession.setColor('custom', this.initialTheme, this.draft,
        { light: this.lightAdaptationDraft, dark: this.darkAdaptationDraft });
      if (result.saved) {
        this.colorConfirmed = true;
        this.clearPreview();
        应用颜色主题('custom', SeriesVisual.isDark(this.mode, this.systemDark));
      }
      if (!result.applied) throw new Error(result.errorCode);
      if (!this.disposed) this.onClose();
    } catch (error) { if (!this.disposed) this.failed = true; }
    finally { if (!this.disposed) this.busy = false; }
  }
  private async chooseImage(): Promise<void> {
    if (this.busy) return;
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { this.failed = true; return; }
    const sequence: number = ++this.generation;
    this.busy = true; this.failed = false;
    try {
      const result: string | null = await 从图库选取图片(context);
      if (!this.disposed && sequence === this.generation && result) {
        this.uri = result;
      }
    } catch (error) { if (!this.disposed && sequence === this.generation) this.failed = true; }
    finally { if (!this.disposed && sequence === this.generation) this.busy = false; }
  }
  private async confirmCrop(): Promise<void> {
    if (this.busy || this.uri === '') return;
    this.busy = true; this.failed = false;
    const sequence: number = this.generation;
    let pixels: PixelMap | null = null;
    try {
      pixels = await this.cropper.getResult();
      if (this.disposed || sequence !== this.generation) return;
      releaseDeckBackground(this.wallpaperDraft);
      this.wallpaperDraft = pixels;
      pixels = null;
      this.losslessWallpaper = false;
      this.uri = '';
    } catch (error) { if (!this.disposed) this.failed = true; }
    finally { releaseDeckBackground(pixels); if (!this.disposed) this.busy = false; }
  }
  private async removeImage(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.failed = false;
    try { await saveWallpaper(null); }
    catch (error) { if (!this.disposed) this.failed = true; }
    finally { if (!this.disposed) this.busy = false; }
  }
  private async applyWallpaper(): Promise<void> {
    if (this.busy) return;
    const pixels: PixelMap | null = this.wallpaperDraft;
    const lossless: boolean = this.losslessWallpaper;
    this.savingWallpaper = pixels !== null;
    this.busy = true; this.failed = false;
    try {
      await saveWallpaperOpacity(this.opacityDraft);
      await saveWallpaperMask(false, this.lightDraft / 100);
      await saveWallpaperMask(true, this.darkDraft / 100);
      if (pixels !== null) await saveWallpaper(pixels, lossless);
      if (!this.disposed) this.onClose();
    } catch (error) { if (!this.disposed) this.failed = true; }
    finally {
      this.savingWallpaper = false;
      if (this.disposed) releaseDeckBackground(pixels);
      else this.busy = false;
    }
  }
  private channelValue(channel: number): number {
    return channel === 0 ? this.red : channel === 1 ? this.green : this.blue;
  }
  @Builder
  private channelSlider(channel: number, label: Resource) {
    Row() {
      Text(label).fontColor($r('app.color.text_secondary'))
      Slider({ value: this.channelValue(channel), min: 0, max: 255, step: 1 }).layoutWeight(1).selectedColor(this.accent)
        .enabled(!this.busy).onChange((next: number): void => { this.changeChannel(channel, next); })
    }.width('100%')
  }
  @Builder
  private resultColor(source: number) {
    Column({ space: 6 }) {
      Row().width(28).height(28).borderRadius(8).backgroundColor(source === 0 ?
        (validAccent(this.draft) ? this.draft : this.savedAccent) : this.effectiveAccent(source === 2))
      Text(source === 0 ? $r('app.string.appearance_original_color') :
        source === 1 ? $r('app.string.appearance_light_result') : $r('app.string.appearance_dark_result'))
        .fontSize(12).fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center)
      Text((source === 0 ? (validAccent(this.draft) ? this.draft : this.savedAccent) :
        this.effectiveAccent(source === 2)).toUpperCase()).fontSize(12).fontColor($r('app.color.text_primary'))
    }.layoutWeight(1)
  }
  @Builder
  private adaptationSlider(dark: boolean) {
    Column({ space: 4 }) {
      Row({ space: 8 }) {
        Text(dark ? $r('app.string.appearance_dark_adaptation') : $r('app.string.appearance_light_adaptation'))
          .layoutWeight(1).fontColor($r('app.color.text_primary'))
        Text((dark ? this.darkAdaptationDraft : this.lightAdaptationDraft).toFixed(0) + '%')
          .fontColor($r('app.color.text_secondary'))
      }.width('100%')
      Slider({ value: dark ? this.darkAdaptationDraft : this.lightAdaptationDraft, min: 0, max: 100, step: 1 })
        .width('100%').selectedColor(this.accent).enabled(!this.busy)
        .onChange((value: number): void => { this.changeAdaptation(dark, value); })
    }.width('100%')
  }
  @Builder
  private colorEditor() {
    Column({ space: 8 }) {
      Row({ space: 12 }) {
        Row().width(40).height(40).borderRadius(12).backgroundColor(validAccent(this.draft) ? this.draft : this.savedAccent)
        TextInput({ text: this.draft, placeholder: DEFAULT_CUSTOM_ACCENT }).layoutWeight(1).maxLength(7)
          .attributeModifier(new FormInputStyle()).enabled(!this.busy)
          .onChange((value: string): void => { this.draft = value; this.syncChannels(); this.previewColor(); })
      }.width('100%')
      this.channelSlider(0, $r('app.string.appearance_red'))
      this.channelSlider(1, $r('app.string.appearance_green'))
      this.channelSlider(2, $r('app.string.appearance_blue'))
      Text($r('app.string.appearance_adaptation_hint')).fontSize(12)
        .fontColor($r('app.color.text_secondary')).width('100%')
      this.adaptationSlider(false)
      this.adaptationSlider(true)
      Text($r('app.string.appearance_adaptation_scale')).fontSize(12)
        .fontColor($r('app.color.text_secondary')).width('100%')
      Row({ space: 8 }) {
        this.resultColor(0)
        this.resultColor(1)
        this.resultColor(2)
      }.width('100%')

    }.width('100%')
  }
  @Builder
  private header() {
    DialogHeader({ title: this.uri !== '' ? $r('app.string.deck_customize_background_crop_title') :
        this.pane === 'color' ? $r('app.string.appearance_custom_color') : $r('app.string.appearance_wallpaper'),
      actionLabel: this.uri !== '' ? $r('app.string.appearance_apply_crop') :
        this.pane === 'color' ? $r('app.string.appearance_apply_color') :
        this.wallpaperDraft !== null ? $r('app.string.deck_customize_save') : $r('app.string.appearance_apply_masks'),
      showAction: this.pane === 'color' || this.uri !== '' || this.wallpaper !== '' || this.wallpaperDraft !== null,
      actionEnabled: !this.busy && (this.pane !== 'color' || validAccent(this.draft)),
      closeEnabled: !this.busy, onClose: (): void => { this.close(); },
      onAction: (): void => {
        if (this.uri !== '') this.confirmCrop();
        else if (this.pane === 'color') this.applyColor();
        else this.applyWallpaper();
      } })
  }
  @Builder
  private wallpaperEditor() {
    Column({ space: 12 }) {
      if (this.uri === '') {
        Text($r('app.string.appearance_wallpaper_hint')).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        if (this.wallpaperDraft !== null || this.wallpaper !== '') {
          Stack() {
            Stack() {
              Image(this.wallpaperDraft ?? ('file://' + this.wallpaper)).width('100%').height(180).objectFit(ImageFit.Cover)
              Column().width('100%').height(180)
                .backgroundColor(SeriesVisual.isDark(this.mode, this.systemDark) ? '#000000' : '#FFFFFF')
                .opacity(SeriesVisual.isDark(this.mode, this.systemDark) ? this.darkDraft / 100 : this.lightDraft / 100)
            }.width('100%').height(180).opacity(this.opacityDraft / 100)
          }.width('100%').height(180).backgroundColor($r('app.color.surface_page')).borderRadius(16).clip(true)
        }
        SettingsActionRow({ title: $r('app.string.appearance_choose_wallpaper'), isInteractive: !this.busy,
          onAction: (): void => { this.chooseImage(); } })
        if (this.wallpaperDraft !== null) {
          SelectionOptions({ horizontal: true, items: [
            { id: 'wallpaper_save_lossless', label: $r('app.string.appearance_wallpaper_lossless'),
              selected: this.losslessWallpaper },
            { id: 'wallpaper_save_compact', label: $r('app.string.appearance_wallpaper_compact'),
              selected: !this.losslessWallpaper }
          ], isInteractive: !this.busy,
            onSelect: (id: string): void => { this.losslessWallpaper = id === 'wallpaper_save_lossless'; } })
        } else if (this.wallpaper !== '') {
          SettingsActionRow({ title: $r('app.string.appearance_remove_wallpaper'), isInteractive: !this.busy,
            onAction: (): void => { this.removeImage(); } })
        }
        if (this.wallpaperDraft !== null || this.wallpaper !== '') {
          Text($r('app.string.appearance_wallpaper_opacity_value', `${this.opacityDraft}%`)).fontColor($r('app.color.text_primary'))
          Slider({ value: this.opacityDraft, min: 0, max: 100, step: 1 }).width('100%').enabled(!this.busy)
            .onChange((value: number): void => { this.opacityDraft = value; })
          Text($r('app.string.appearance_light_mask', `${this.lightDraft}%`)).fontColor($r('app.color.text_primary'))
          Slider({ value: this.lightDraft, min: 0, max: 85, step: 1 }).width('100%').enabled(!this.busy)
            .onChange((value: number): void => { this.lightDraft = value; })
          Text($r('app.string.appearance_dark_mask', `${this.darkDraft}%`)).fontColor($r('app.color.text_primary'))
          Slider({ value: this.darkDraft, min: 0, max: 85, step: 1 }).width('100%').enabled(!this.busy)
            .onChange((value: number): void => { this.darkDraft = value; })
        }
      } else {
        ImageCropViewport({ uri: this.uri, cropWidth: this.widthVp, cropHeight: this.widthVp / this.aspect,
          viewportHeight: this.widthVp / this.aspect, accent: this.accent, controller: this.cropper })
          .width('100%').height(this.widthVp / this.aspect)
      }
    }.width('100%').onAreaChange((_old: Area, area: Area): void => {
      this.widthVp = Math.min(280, Number(area.width));
    })
  }
  @Builder
  private body() {
    Column({ space: 12 }) {
      if (this.pane === 'color') this.colorEditor()
      else this.wallpaperEditor()
      if (this.failed) Text($r('app.string.redemption_storage_failed')).fontColor($r('app.color.error_text'))
    }.width('100%')
  }
  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy,
      header: (): void => { this.header(); }, content: (): void => { this.body(); },
      onDismiss: (): void => { this.close(); } })
  }
}
