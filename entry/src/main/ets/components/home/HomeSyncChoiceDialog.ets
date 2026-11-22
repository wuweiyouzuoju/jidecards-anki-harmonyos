// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { CloudGeneration } from '../../model/cloud-sync/CloudCollectionSync';
import { cloudGenerationDisplayText } from '../../utils/CloudGenerationDisplayText';
import { AppInterfaceItem } from '../../model/AppInterface';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';

/** 只选择同步入口；设备和同步范围仍由直连页确认。 */
@Component
export struct HomeSyncChoiceDialog {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop busy: boolean = false;
  @Prop downloading: boolean = false;
  @Prop choices: AppInterfaceItem[] = [];
  @Prop sources: CloudGeneration[] = [];
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  onChoose: (target: string) => void = (_target: string): void => {};
  onClose: () => void = (): void => {};

  private sourceLabel(id: string): string {
    const source = this.sources.find((value: CloudGeneration): boolean => value.device === id);
    return source ? cloudGenerationDisplayText(this.getUIContext(), source, this.uiLanguage) : id.slice(0, 8);
  }

  @Builder
  private header() {
    DialogHeader({ title: this.downloading ? $r('app.string.huawei_cloud_sources') : $r('app.string.sync_choice_title'), showAction: false, onClose: this.onClose })
  }

  @Builder
  private content() {
    Text(this.downloading ? $r('app.string.huawei_cloud_choose_source') : $r('app.string.sync_choice_hint')).fontSize(应用尺寸.字号_正文_小)
      .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
    ForEach(this.choices, (item: AppInterfaceItem) => {
      SettingsActionRow({ title: $r('app.string.' + item.titleKey), icon: item.iconKey ? $r('app.media.' + item.iconKey) : undefined,
        hint: this.downloading ? this.sourceLabel(item.id) : item.id === 'cloud' ? $r('app.string.sync_choice_cloud_hint') : item.id === 'device' ? $r('app.string.sync_choice_device_hint') : '',
        isInteractive: !this.busy, onAction: (): void => { this.onChoose(item.id); } })
    }, (item: AppInterfaceItem): string => item.id + (this.downloading ? this.sourceLabel(item.id) : ''))
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, onDismiss: this.onClose,
      header: () => { this.header(); }, content: () => { this.content(); } })
  }
}
