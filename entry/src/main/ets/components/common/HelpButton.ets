// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { resourceText } from '../../utils/UiFeedback';
import { HelpLayout } from '../../utils/HelpLayout';

/** 帮助/信息共用图标与独立点击区；不把点击转交给所在设置行或卡片行。 */
@Component
export struct HelpButton {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop label: ResourceStr = '';
  @Prop isHelpEnabled: boolean = true;
  onHelp: () => void = (): void => {};

  private activate(): void {
    if (this.isHelpEnabled) this.onHelp();
  }

  private accessibilityLabel(_locale: string = this.uiLanguage): string {
    return typeof this.label === 'string' ? this.label : resourceText(this.getUIContext(), this.label);
  }

  build() {
    Button() {
      Image($r('app.media.ic_info'))
        .width(HelpLayout.iconSize).height(HelpLayout.iconSize).objectFit(ImageFit.Contain)
        .hitTestBehavior(HitTestMode.None)
        .accessibilityLevel('no')
    }
    .type(ButtonType.Normal)
    .width(HelpLayout.iconSize).height(HelpLayout.iconSize).padding(0)
    .responseRegion(HelpLayout.hitRegion()).mouseResponseRegion(HelpLayout.hitRegion())
    .flexShrink(0)
    .borderRadius(HelpLayout.iconSize / 2)
    .backgroundColor(Color.Transparent)
    .enabled(this.isHelpEnabled)
    .attributeModifier(new PressFeedback())
    .stateEffect(false)
    .accessibilityText(this.accessibilityLabel())
    .accessibilityDescription($r('app.string.help_accessibility_description'))
    .monopolizeEvents(true)
    .onClick((): void => { this.activate(); })
  }
}
