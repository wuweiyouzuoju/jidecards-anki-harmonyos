// SPDX-License-Identifier: AGPL-3.0-or-later
import { APPEARANCE_EDITOR_SECTION_KEY, validAppearanceSection } from '../../model/AppearanceElements';
import { saveAppearanceSection } from '../../utils/AppearanceElementStore';
import { AppearanceCustomizationDialog } from './AppearanceCustomizationDialog';
import { AppearanceElementDialog } from './AppearanceElementDialog';
import { SurfaceMaterialDialog } from './SurfaceMaterialDialog';

/** 一个原生窗口负责分区记忆；离开当前分区沿用原编辑器的草稿/忙碌守卫。 */
@CustomDialog
export struct AppearanceCustomizationHubDialog {
  controller?: CustomDialogController;
  onClose: () => void = (): void => {};
  registerDismiss: (guard: () => boolean) => void = (_guard: () => boolean): void => {};
  @State private section: string = 'color';
  @State private switching: boolean = false;
  @State private memoryFailed: boolean = false;
  private mounted: boolean = false;
  private flushCurrent: () => Promise<boolean> = async (): Promise<boolean> => true;
  private dismissGuard: () => boolean = (): boolean => true;
  aboutToAppear(): void {
    this.mounted = true;
    const previous: string = AppStorage.get<string>(APPEARANCE_EDITOR_SECTION_KEY) ?? 'color';
    const saved: string = previous === 'appearance_border' ? 'appearance_module_outline' : previous;
    this.section = validAppearanceSection(saved) ? saved : 'color';
    this.registerDismiss((): boolean => !this.switching && this.dismissGuard());
  }
  aboutToDisappear(): void { this.mounted = false; }
  private async select(section: string): Promise<void> {
    if (this.switching || section === this.section || !validAppearanceSection(section)) return;
    this.switching = true; this.memoryFailed = false;
    if (!await this.flushCurrent() || !this.dismissGuard()) { this.switching = false; return; }
    try {
      await saveAppearanceSection(section);
      if (this.mounted) { if (section === 'material') this.flushCurrent = async (): Promise<boolean> => true; this.section = section; }
    } catch (error) {
      if (this.mounted) { this.memoryFailed = true; if (section === 'material') this.flushCurrent = async (): Promise<boolean> => true; this.section = section; }
    } finally { if (this.mounted) this.switching = false; }
  }
  build() {
    ForEach([this.section], (current: string) => {
    if (current === 'color' || current === 'wallpaper') {
      AppearanceCustomizationDialog({ pane: current, autoSave: true, 
        registerFlush: (flush: () => Promise<boolean>): void => { this.flushCurrent = flush; }, showSectionPicker: true, sectionSwitching: this.switching, sectionMemoryFailed: this.memoryFailed,
        onSectionSelect: (id: string): void => { this.select(id); },
        registerDismiss: (guard: () => boolean): void => { this.dismissGuard = guard; }, onClose: this.onClose })
    } else if (current === 'material') {
      SurfaceMaterialDialog({ showSectionPicker: true, sectionSwitching: this.switching, sectionMemoryFailed: this.memoryFailed,
        onSectionSelect: (id: string): void => { this.select(id); },
        registerDismiss: (guard: () => boolean): void => { this.dismissGuard = guard; }, onClose: this.onClose })
    } else {
        AppearanceElementDialog({ target: current, autoSave: true, 
          registerFlush: (flush: () => Promise<boolean>): void => { this.flushCurrent = flush; }, showSectionPicker: true, sectionSwitching: this.switching, sectionMemoryFailed: this.memoryFailed,
          onSectionSelect: (next: string): void => { this.select(next); },
          registerDismiss: (guard: () => boolean): void => { this.dismissGuard = guard; }, onClose: this.onClose })
    }
    }, (current: string): string => current)
  }
}
