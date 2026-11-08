// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { AboutSettings } from '../settings/AboutSettings';
import { GLASS_HOME_SOURCE } from '../../utils/GlassBackdrop';
import { SOFTWARE_HELP_ITEMS, SettingsItem } from '../../model/SettingsStructure';
import { AppInterfaceControl } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';

@Component
export struct HomeSoftwareHelp {
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onOpenLicenses: () => void = (): void => {};

  aboutToAppear(): void {
    const items: AppInterfaceControl[] = SOFTWARE_HELP_ITEMS.map((item: SettingsItem): AppInterfaceControl =>
      ({ id: item.id, title: '', titleKey: item.titleKey, enabled: true, selected: false }));
    items.push({ id: 'close', title: '', titleKey: 'close', enabled: true, selected: false });
    appInterface.observe({ surface: 'software_help', sectionId: '', selectedId: '', busy: false,
      items, controlsComplete: true, optionIds: [], optionLabels: [], values: [] });
  }

  aboutToDisappear(): void { appInterface.leave('software_help'); }

  @Builder
  private helpHeader() {
    DialogHeader({ title: $r('app.string.study_more'), showAction: false, onClose: this.onClose })
  }

  @Builder
  private helpBody() {
    AboutSettings({ 是否深色: this.isDark, 打开许可证回调: this.onOpenLicenses })
  }

  build() {
    DialogFrame({ maximumWidth: 480, refractionSource: GLASS_HOME_SOURCE, fillBody: false, showFooter: false,
      canDismiss: true, onDismiss: this.onClose,
      header: () => { this.helpHeader(); }, content: () => { this.helpBody(); } })
  }
}
