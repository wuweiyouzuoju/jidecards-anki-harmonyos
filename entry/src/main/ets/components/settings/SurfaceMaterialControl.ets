// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SURFACE_MATERIAL_KEY, SURFACE_MATERIALS, surfaceMaterialTitleKey } from '../../model/SurfaceMaterial';
import { saveSurfaceMaterial } from '../../utils/SurfaceMaterialStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@Component
export struct SurfaceMaterialControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(SURFACE_MATERIAL_KEY) private style: string = 'flat';
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;
  @State private selectionRevision: number = 0;

  private options(): SelectOption[] {
    return SURFACE_MATERIALS.map((style: string): SelectOption => {
      return { value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, surfaceMaterialTitleKey(style)) };
    });
  }

  private async selectStyle(index: number): Promise<void> {
    if (this.saving || index < 0 || index >= SURFACE_MATERIALS.length || SURFACE_MATERIALS[index] === this.style) return;
    this.saving = true;
    this.saveFailed = false;
    try { await saveSurfaceMaterial(SURFACE_MATERIALS[index]); }
    catch (error) { this.saveFailed = true; }
    finally { this.saving = false; this.selectionRevision++; }
  }

  build() {
    Column({ space: FormRowLayout.hintGap }) {
      ForEach([this.selectionRevision], (_revision: number) => {
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'surface_material', this.uiLanguage),
          options: this.options(), selectedIndex: SURFACE_MATERIALS.indexOf(this.style),
          value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, surfaceMaterialTitleKey(this.style)),
          isInteractive: !this.saving, onSelect: (index: number): void => { this.selectStyle(index); } })
      }, (revision: number): string => revision.toString())
      if (this.saveFailed) {
        Text($r('app.string.surface_material_save_failed')).fontSize(12).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }
}
