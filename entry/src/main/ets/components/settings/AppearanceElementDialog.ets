// SPDX-License-Identifier: AGPL-3.0-or-later
import { ColorMetrics } from '@kit.ArkUI';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { APPEARANCE_EDITOR_SECTIONS } from '../../model/AppearanceElements';
import { AppearanceSectionPicker } from './AppearanceSectionPicker';
import { SliderStyle } from '../../utils/SliderStyle';
import { APPEARANCE_CUSTOMIZATION_ITEMS } from '../../model/AppearanceCustomization';
import { accentToPicker } from '../../model/ColorPicker';
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { APPEARANCE_ELEMENTS_KEY, APPEARANCE_ELEMENTS_PREVIEW_KEY, APPEARANCE_ELEMENTS_ACTIVE_KEY,
  APPEARANCE_ELEMENT_ITEMS, APPEARANCE_ELEMENT_CONTROLS, AppearanceElementStyle,
  elementStyleFor, replaceElementStyle } from '../../model/AppearanceElements';
import { saveAppearanceElements } from '../../utils/AppearanceElementStore';
import { AppearanceColorPicker } from './AppearanceColorPicker';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { 应用颜色主题 } from '../../utils/颜色主题管理器';
import { ThemeId } from '../../model/ThemeCatalog';
import { validAccent } from '../../model/AppearanceCustomization';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl, AppInterfaceValue } from '../../model/AppInterface';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@CustomDialog
export struct AppearanceElementDialog {
  controller?: CustomDialogController;
  @Prop autoSave: boolean = false;
  registerFlush: (flush: () => Promise<boolean>) => void = (_flush: () => Promise<boolean>): void => {};
  private saveTimer: number = -1;
  private dirty: boolean = false;
  private pendingSave: Promise<boolean> | undefined = undefined;
  @Prop showSectionPicker: boolean = false;
  @Prop sectionSwitching: boolean = false;
  @Prop sectionMemoryFailed: boolean = false;
  onSectionSelect: (id: string) => void = (_id: string): void => {};

  @Prop target: string = 'appearance_text';
  registerDismiss: (guard: () => boolean) => void = (_guard: () => boolean): void => {};
  onClose: () => void = (): void => {};
  @StorageProp(APPEARANCE_ELEMENTS_ACTIVE_KEY) private appearanceElements: string = '';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  @State private color: string = '#182230';
  @State private radius: number = 16;
  @State private widthDraft: number = 1;
  @State private busy: boolean = false;
  @State private failed: boolean = false;
  private original: string = '';
  private draft: AppearanceElementStyle = { text: '', moduleOutline: '', outline: '', background: '', radius: -1, width: -1, moduleRadius: -1, moduleWidth: -1, blur: 80 };
  private dark: boolean = false;
  private disposed: boolean = false;
  aboutToAppear(): void {
    this.disposed = false;
    this.registerFlush((): Promise<boolean> => this.flushChanges());
    this.dark = SeriesVisual.isDark(this.mode, this.systemDark);
    this.original = AppStorage.get<string>(APPEARANCE_ELEMENTS_KEY) ?? '';
    this.draft = elementStyleFor(this.original, this.dark);
    this.color = this.target === 'appearance_text' ? this.draft.text || this.currentResourceColor($r('app.color.text_primary'), this.dark ? '#E6EDF7' : '#182230') :
      this.target === 'appearance_module_outline' ? this.draft.moduleOutline || this.currentResourceColor($r('app.color.surface_border'), this.dark ? '#77869A' : '#CFD7E3') :
      this.target === 'appearance_outline' ? this.draft.outline || this.currentResourceColor(SurfaceBorder.color(), this.dark ? '#77869A' : '#CFD7E3') :
      this.draft.background || AppStorage.get<string>('theme_color_surface_page_tint') || '#F5F7FA';
    this.refreshShapeControls();
    this.registerDismiss((): boolean => { if (this.busy) return false; if (this.autoSave && this.dirty) { this.closeSaved(); return false; } this.restore(); return true; });
    this.publish();
  }
  aboutToDisappear(): void { clearTimeout(this.saveTimer); this.disposed = true; this.restore(); appInterface.leave('appearance_customization'); }
  private refreshShapeControls(): void {
    const module: boolean = this.target === 'appearance_module_outline';
    const radius: number = module ? this.draft.moduleRadius : this.draft.radius;
    const width: number = module ? this.draft.moduleWidth : this.draft.width;
    this.radius = radius < 0 ? (module ? (SeriesVisual.cardRadius ?? 16) : 16) : radius;
    const glass: boolean = AppStorage.get<string>('surface_material') === 'glass';
    this.widthDraft = width < 0 ? (module ? (this.dark ? (glass ? 0.8 : 1) : 0) : (glass ? SurfaceBorder.glassOutlineWidth(this.dark) : 1)) : width;
  }
  private currentResourceColor(value: ResourceColor, fallback: string): string {
    try {
      const color: ColorMetrics = ColorMetrics.resourceColor(value);
      return '#' + [color.red, color.green, color.blue].map((channel: number): string =>
        Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (error) { return fallback; }
  }
  private refreshTheme(): void {
    应用颜色主题(AppStorage.get<ThemeId>('colorTheme') ?? 'aurora', SeriesVisual.isDark(this.mode, this.systemDark));
  }
  private restore(): void { AppStorage.delete(APPEARANCE_ELEMENTS_PREVIEW_KEY); this.refreshTheme(); }
  private preview(): void {
    AppStorage.setOrCreate<string>(APPEARANCE_ELEMENTS_PREVIEW_KEY, replaceElementStyle(this.original, this.dark, this.draft));
    this.refreshTheme(); this.publish();
    this.scheduleSave();
  }
  private changeColor(value: string): void {
    if (this.busy || value.toUpperCase() === this.color.toUpperCase()) return;
    this.color = value;
    if (!validAccent(value)) { this.publish(); return; }
    if (this.target === 'appearance_text') this.draft.text = value;
    else if (this.target === 'appearance_module_outline') this.draft.moduleOutline = value;
    else if (this.target === 'appearance_outline') this.draft.outline = value;
    else this.draft.background = value;
    this.preview();
  }
  private changeShape(radius: boolean, value: number): void {
    if (this.busy || value === (radius ? this.radius : this.widthDraft)) return;
    if (radius) { this.radius = value; if (this.target === 'appearance_module_outline') this.draft.moduleRadius = value; else this.draft.radius = value; }
    else { this.widthDraft = value; if (this.target === 'appearance_module_outline') this.draft.moduleWidth = value; else this.draft.width = value; }
    this.preview();
  }
  private reset(): void {
    if (this.busy) return;
    if (this.target === 'appearance_text') this.draft.text = '';
    else if (this.target === 'appearance_module_outline') { this.draft.moduleOutline = ''; this.draft.moduleRadius = -1; this.draft.moduleWidth = -1; }
    else if (this.target === 'appearance_outline') { this.draft.outline = ''; this.draft.radius = -1; this.draft.width = -1; }
    else if (this.target === 'appearance_background') this.draft.background = '';
    else { this.draft.radius = -1; this.draft.width = -1; }
    this.refreshShapeControls();
    this.preview();
    // 跟随主题也是有效草稿；输入框继续显示当前预览颜色。
    this.color = this.target === 'appearance_text' ? this.dark ? '#E6EDF7' : '#182230' :
      (this.target === 'appearance_outline' || this.target === 'appearance_module_outline') ? this.dark ? '#77869A' : '#CFD7E3' :
      AppStorage.get<string>('theme_color_surface_page_tint') ?? '#F5F7FA';
    this.publish();
  }
  private async apply(closeAfter: boolean = true): Promise<void> {
    if (this.busy || this.target !== 'appearance_border' && !validAccent(this.color)) return;
    this.busy = true; this.failed = false; this.publish();
    try {
      await saveAppearanceElements(this.dark, this.draft, this.original);
      this.original = replaceElementStyle(this.original, this.dark, this.draft);
      this.dirty = false;
      this.restore();
      if (!this.disposed && closeAfter) this.onClose();
    } catch (error) { if (!this.disposed) this.failed = true; }
    finally { if (!this.disposed) { this.busy = false; this.publish(); } }
  }
  private scheduleSave(): void {
    if (!this.autoSave) return;
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout((): void => { this.flushChanges(); }, 400);
  }
  private async closeSaved(): Promise<void> {
    if (await this.flushChanges() && !this.disposed) this.onClose();
  }
  private async flushChanges(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    if (this.pendingSave !== undefined) return this.pendingSave;
    if (this.busy) return false;
    if (!this.dirty) return true;
    this.pendingSave = this.persistChanges();
    const result: boolean = await this.pendingSave;
    this.pendingSave = undefined;
    return result;
  }
  private async persistChanges(): Promise<boolean> {
    await this.apply(false);
    return !this.dirty && !this.failed;
  }
  private close(): void {
    if (this.autoSave) { this.closeSaved(); return; }
    if (!this.busy) { this.restore(); this.onClose(); }
  }
  private title(): string {
    const item = APPEARANCE_ELEMENT_ITEMS.find((value): boolean => value.id === this.target);
    return localizedNamedResourceText(this.getUIContext(), this.language, item?.titleKey ?? 'appearance_element_text');
  }
  private publish(): void {
    if (this.disposed) return;
    const shape: boolean = this.target === 'appearance_border' || this.target === 'appearance_outline' || this.target === 'appearance_module_outline';
    const picker = accentToPicker(validAccent(this.color) ? this.color : '#182230');
    const values: AppInterfaceValue[] = [
      { id: 'appearance_section', value: this.target }, { id: 'appearance_section_options', value: JSON.stringify(APPEARANCE_EDITOR_SECTIONS) },
      { id: 'accent_hue', value: String(picker.hue) },
      { id: 'accent_saturation', value: String(picker.saturation) },
      { id: 'accent_brightness', value: String(picker.brightness) },
      { id: 'appearance_color_input', value: this.color },
      { id: 'appearance_editing_mode', value: this.dark ? 'dark' : 'light' },
      { id: 'appearance_saved', value: JSON.stringify(elementStyleFor(this.original, this.dark)) },
      { id: 'appearance_draft', value: JSON.stringify(this.draft) }
    ];
    appInterface.observe({ surface: 'appearance_customization', sectionId: this.target,
      selectedId: this.target, optionIds: [], optionLabels: [], busy: this.busy, controlsComplete: true,
      items: [...APPEARANCE_ELEMENT_CONTROLS, ...APPEARANCE_CUSTOMIZATION_ITEMS.filter((item): boolean =>
        ['appearance_section', 'accent_hue', 'accent_saturation', 'accent_brightness'].includes(item.id))].filter((item): boolean =>
        item.id === 'appearance_section' && this.showSectionPicker || item.id === 'appearance_element_reset' || item.id === 'appearance_element_apply' && !this.autoSave ||
        (shape && (item.id === 'appearance_border_radius' || item.id === 'appearance_border_width') || this.target !== 'appearance_border' && (item.id === 'appearance_element_color' || ['accent_hue', 'accent_saturation', 'accent_brightness'].includes(item.id))))
        .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: '', enabled: !this.busy && (item.id !== 'appearance_element_apply' || shape || validAccent(this.color)), selected: false })),
      values: values });
  }
  @Builder
  private shapeSlider(radius: boolean) {
    Column({ space: 4 }) {
      Row() {
        Text(radius ? $r('app.string.appearance_border_radius') : $r('app.string.appearance_border_width'))
          .layoutWeight(1).fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
        Text((radius ? this.radius : this.widthDraft).toString() + ' vp').fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
      }.width('100%')
      Slider({ value: radius ? this.radius : this.widthDraft, min: 0, max: radius ? 32 : 4, step: radius ? 1 : 0.5 }).attributeModifier(new SliderStyle(this.accent))
        .width('100%').enabled(!this.busy).onChange((value: number): void => { this.changeShape(radius, value); })
    }.width('100%')
  }
  @Builder
  private header() {
    Column({ space: 8 }) {
    DialogHeader({ title: this.title(), showAction: !this.autoSave, closeLabel: this.autoSave ? $r('app.string.done') : $r('app.string.cancel'), actionLabel: $r('app.string.appearance_element_apply'),
      actionEnabled: !this.busy && (this.target === 'appearance_border' || validAccent(this.color)), closeEnabled: !this.busy,
      onClose: (): void => { this.close(); }, onAction: (): void => { this.apply(); } })
    if (this.showSectionPicker) AppearanceSectionPicker({ selectedId: this.target,
      isInteractive: !this.busy && !this.sectionSwitching, memoryFailed: this.sectionMemoryFailed, onSelect: this.onSectionSelect })
    }.width('100%')
  }
  @Builder
  private body() {
    Column({ space: 12 }) {
      Text(this.dark ? $r('app.string.appearance_editing_dark') : $r('app.string.appearance_editing_light'))
        .fontSize(12).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
      if (this.target === 'appearance_border') {
        this.shapeSlider(true)
        this.shapeSlider(false)
      } else {
        if (this.target === 'appearance_module_outline' || this.target === 'appearance_outline') {
          this.shapeSlider(true)
          this.shapeSlider(false)
        }
        AppearanceColorPicker({ color: this.color, isInteractive: !this.busy,
          onChange: (value: string): void => { this.changeColor(value); } })
        Row() {
        TextInput({ text: this.color }).maxLength(7).attributeModifier(new FormInputStyle( undefined, this.appearanceElements)).enabled(!this.busy)
          .onChange((value: string): void => { this.changeColor(value); })
        }.width('100%').padding({ left: 2, right: 2 })
      }
      SettingsActionRow({ title: $r('app.string.appearance_element_reset'), isInteractive: !this.busy,
        showDisclosure: false, onAction: (): void => { this.reset(); } })
      if (this.failed) Text($r('app.string.surface_material_save_failed')).fontColor($r('app.color.error_text'))
    }.width('100%')
  }
  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy,
      header: (): void => { this.header(); }, content: (): void => { this.body(); }, onDismiss: (): void => { this.close(); } })
  }
}
