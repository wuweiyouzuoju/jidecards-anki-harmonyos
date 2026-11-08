// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SURFACE_MATERIAL_KEY, SURFACE_MATERIALS, surfaceMaterialTitleKey, MODULE_OPACITY_KEY,
  MaterialOpacity, DEFAULT_MODULE_OPACITY, moduleOpacityPercent, BUTTON_OPACITY_KEY, DEFAULT_BUTTON_OPACITY,
  buttonOpacityPercent, DIALOG_OPACITY_KEY, DEFAULT_DIALOG_OPACITY, dialogOpacityPercent, SURFACE_MATERIAL_ITEMS, validModuleOpacity } from '../../model/SurfaceMaterial';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { 颜色键 } from '../../model/颜色主题';
import { saveSurfaceMaterial, saveModuleOpacity, saveButtonOpacity, saveDialogOpacity } from '../../utils/SurfaceMaterialStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

type OpacityTarget = 'module' | 'button' | 'dialog';

interface OpacityPreview {
  key: string;
  material: string;
  original: MaterialOpacity;
}

@CustomDialog
export struct SurfaceMaterialDialog {
  controller?: CustomDialogController;
  onClose: () => void = (): void => {};
  registerDismiss: (guard: () => boolean) => void = (_guard: () => boolean): void => {};
  private mounted: boolean = false;
  private preview: OpacityPreview | undefined = undefined;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(SURFACE_MATERIAL_KEY) @Watch('syncOpacity') private style: string = 'flat';
  @StorageProp(MODULE_OPACITY_KEY) @Watch('syncOpacity') private moduleOpacity: MaterialOpacity = DEFAULT_MODULE_OPACITY;
  @StorageProp(BUTTON_OPACITY_KEY) @Watch('syncOpacity') private buttonOpacity: MaterialOpacity = DEFAULT_BUTTON_OPACITY;
  @StorageProp(DIALOG_OPACITY_KEY) @Watch('syncOpacity') private dialogOpacity: MaterialOpacity = DEFAULT_DIALOG_OPACITY;
  @StorageProp('themeMode') @Watch('syncOpacity') private mode: string = 'system';
  @StorageProp('systemDarkMode') @Watch('syncOpacity') private systemDark: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  @State private opacityDraft: number = 100;
  @State private buttonDraft: number = 100;
  @State private dialogDraft: number = 0;
  @State @Watch('publishInterface') private saving: boolean = false;
  @State private saveFailed: boolean = false;
  @State private selectionRevision: number = 0;

  aboutToAppear(): void {
    this.mounted = true;
    this.registerDismiss((): boolean => !this.saving);
    this.syncOpacity();
  }

  aboutToDisappear(): void {
    this.mounted = false;
    if (!this.saving) this.restoreOpacityPreview();
    appInterface.leave('surface_material_settings');
  }

  private close(): void { if (!this.saving) this.onClose(); }

  private publishInterface(): void {
    if (!this.mounted) return;
    appInterface.observe({ surface: 'surface_material_settings', sectionId: this.style, selectedId: this.style,
      optionIds: SURFACE_MATERIALS, optionLabels: [], busy: this.saving, controlsComplete: true,
      items: SURFACE_MATERIAL_ITEMS.map((item): AppInterfaceControl => ({
        id: item.id, titleKey: item.titleKey, title: '', enabled: !this.saving, selected: false
      })),
      values: [
        { id: 'module_opacity', value: String(moduleOpacityPercent(this.moduleOpacity, this.style, SeriesVisual.isDark(this.mode, this.systemDark))) },
        { id: 'button_opacity', value: String(buttonOpacityPercent(this.buttonOpacity, this.style)) },
        { id: 'dialog_opacity', value: String(dialogOpacityPercent(this.dialogOpacity, this.style)) }
      ] });
  }

  private syncOpacity(): void {
    if (!this.saving && this.preview !== undefined && this.preview.material !== this.style) {
      this.restoreOpacityPreview();
    }
    this.opacityDraft = moduleOpacityPercent(this.moduleOpacity, this.style, SeriesVisual.isDark(this.mode, this.systemDark));
    this.buttonDraft = buttonOpacityPercent(this.buttonOpacity, this.style);
    this.dialogDraft = dialogOpacityPercent(this.dialogOpacity, this.style);
    this.publishInterface();
  }

  private restoreOpacityPreview(): void {
    const preview: OpacityPreview | undefined = this.preview;
    this.preview = undefined;
    if (preview !== undefined) AppStorage.setOrCreate<MaterialOpacity>(preview.key, preview.original);
  }

  private changeOpacity(value: number, mode: SliderChangeMode, target: OpacityTarget): void {
    if (!this.mounted || this.saving || !validModuleOpacity(value)) return;
    const key: string = target === 'dialog' ? DIALOG_OPACITY_KEY : target === 'button' ? BUTTON_OPACITY_KEY : MODULE_OPACITY_KEY;
    if (this.preview === undefined || this.preview.key !== key) {
      this.restoreOpacityPreview();
      const original: MaterialOpacity = target === 'dialog' ? this.dialogOpacity :
        target === 'button' ? this.buttonOpacity : this.moduleOpacity;
      this.preview = { key: key, material: this.style, original: original };
    }
    const original: MaterialOpacity = this.preview.original;
    const next: MaterialOpacity = this.style === 'glass' ? { flat: original.flat, glass: value } :
      { flat: value, glass: original.glass };
    AppStorage.setOrCreate<MaterialOpacity>(key, next);
    if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.persistOpacity(value, target, this.style);
  }

  private async persistOpacity(value: number, target: OpacityTarget, material: string): Promise<void> {
    this.saving = true;
    this.saveFailed = false;
    try {
      if (target === 'dialog') await saveDialogOpacity(material, value);
      else if (target === 'button') await saveButtonOpacity(material, value);
      else await saveModuleOpacity(material, value);
      this.preview = undefined;
    } catch (error) {
      this.restoreOpacityPreview();
      this.saveFailed = true;
    } finally {
      this.syncOpacity();
      this.saving = false;
    }
  }

  private options(): SelectOption[] {
    return SURFACE_MATERIALS.map((style: string): SelectOption => {
      return { value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, surfaceMaterialTitleKey(style)) };
    });
  }

  private async selectStyle(index: number): Promise<void> {
    if (this.saving || index < 0 || index >= SURFACE_MATERIALS.length || SURFACE_MATERIALS[index] === this.style) return;
    this.restoreOpacityPreview();
    this.saving = true;
    this.saveFailed = false;
    try { await saveSurfaceMaterial(SURFACE_MATERIALS[index]); }
    catch (error) { this.saveFailed = true; }
    finally { this.saving = false; this.selectionRevision++; }
  }

  private opacityValue(target: OpacityTarget): number {
    return target === 'dialog' ? this.dialogDraft : target === 'button' ? this.buttonDraft : this.opacityDraft;
  }

  @Builder
  private opacitySlider(target: OpacityTarget, label: Resource) {
    Column({ space: FormRowLayout.hintGap }) {
      Row() {
        Text(label)
          .fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
        Text(`${this.opacityValue(target)}%`).fontSize(15).fontColor($r('app.color.text_secondary'))
      }.width('100%')
      Slider({ value: this.opacityValue(target), min: 0, max: 100, step: 1 }).width('100%')
        .selectedColor(this.actionColor).enabled(!this.saving)
        .onChange((value: number, mode: SliderChangeMode): void => { this.changeOpacity(value, mode, target); })
    }.width('100%')
  }

  @Builder
  private content() {
    Column({ space: FormRowLayout.gap * 2 }) {
      ForEach([this.selectionRevision], (_revision: number) => {
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'surface_material', this.uiLanguage),
          options: this.options(), selectedIndex: SURFACE_MATERIALS.indexOf(this.style),
          value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, surfaceMaterialTitleKey(this.style)),
          isInteractive: !this.saving, onSelect: (index: number): void => { this.selectStyle(index); } })
      }, (revision: number): string => revision.toString())
      Column({ space: FormRowLayout.rowGap }) {
        this.opacitySlider('module', $r('app.string.module_opacity'))
        this.opacitySlider('button', $r('app.string.button_opacity'))
        this.opacitySlider('dialog', $r('app.string.dialog_opacity'))
      }.width('100%')
      if (this.saveFailed) {
        Text($r('app.string.surface_material_save_failed')).fontSize(12).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.surface_material'), showAction: false, closeEnabled: !this.saving,
      onClose: (): void => { this.close(); } })
  }

  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.saving,
      header: (): void => { this.header(); }, content: (): void => { this.content(); },
      onDismiss: (): void => { this.close(); } })
  }
}
