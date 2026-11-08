// SPDX-License-Identifier: AGPL-3.0-or-later
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { OFFICIAL_QQ_GROUP, OFFICIAL_HELP_LINKS, OfficialHelpLink } from '../../model/OfficialCommunity';
import { common } from '@kit.AbilityKit';
import { copyOfficialQQGroup, openOfficialHelpLink } from '../../utils/OfficialHelpActions';
import { 链接服务 } from '../../backend/链接服务';
import { HelpPage } from '../../proto/messages/LinksMessages';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 打开应用内好评 } from '../../utils/好评引导';
import { 颜色键 } from '../../model/颜色主题';
import { AboutActionDialog } from './AboutActionDialog';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { settingsIcon } from '../../utils/SettingsIcons';
import { PressFeedback } from '../../utils/PressFeedback';
import { ThemeTextSpans, themeTextKey } from '../common/ThemeText';

/** 关于分组独占外链和反馈交互；主壳只负责目录与许可证导航。 */
@Component
export struct AboutSettings {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop centerCommunity: boolean = false;
  @Prop 是否深色: boolean = false;
  @StorageLink(颜色键.动作主色) private 动作主色链接: string = '';
  打开许可证回调: () => void = (): void => {};
  private readonly 链接服务实例: 链接服务 = new 链接服务();
  // 官方 QQ 群号（关于分组入口点击复制到剪贴板，与 欢迎弹窗 中 QQ群号 保持一致）
  private readonly QQ群号: string = OFFICIAL_QQ_GROUP;
  // 本应用 bundleName，用于拼接应用市场 DeepLink 跳转本应用详情页（好评回退路径）
  private readonly 本应用包名: string = 'com.jide.kapian';
  private readonly feedbackDialog: NativeDialogHost = new NativeDialogHost();

  private readonly createFeedbackDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.feedbackDialog.presentation();
    return new CustomDialogController({
      onWillDismiss: dismiss,
      builder: AboutActionDialog({
        onClose: this.feedbackDialog.guard((): void => { this.feedbackDialog.close(); }),
        groupNumber: this.QQ群号,
        onCopyGroup: (): void => { copyOfficialQQGroup(this.getUIContext()); }
      }),
      width: presentation.width, height: presentation.height, keyboardAvoidMode: presentation.keyboardAvoidMode, maskColor: presentation.maskColor,
      autoCancel: presentation.autoCancel,
      alignment: presentation.alignment,
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation, customStyle: presentation.customStyle
    });
  };

  aboutToAppear(): void { this.feedbackDialog.activate(); }

  aboutToDisappear(): void {
    this.feedbackDialog.dispose();
  }
  private 解析主色(): string {
    return this.动作主色链接 !== '' ? this.动作主色链接 : 设置面板色板_取(this.是否深色).主色;
  }
  private async openLink(link: OfficialHelpLink): Promise<void> {
    let url: string = link.url;
    if (link.id === 'anki_documentation') {
      try { url = await this.链接服务实例.获取帮助页链接(HelpPage.INDEX) || url; } catch {}
    }
    await openOfficialHelpLink(this.getUIContext(), url);
  }

  private 打开好评弹窗(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    打开应用内好评(context, this.本应用包名);
  }

  @Builder
  private communityHint(): void {
    Flex({ wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center }) {
      Text($r('app.string.home_intro_copy_qq')).fontSize(12).fontColor($r('app.color.text_secondary'))
      Text() { ForEach([themeTextKey(this.QQ群号, [], this.getUIContext(), this.uiLanguage)], (_textKey: string) => { ThemeTextSpans(this.QQ群号, [], this.getUIContext()) }, (_textKey: string): string => _textKey) }
        .fontSize(12).fontColor(this.解析主色()).fontWeight(FontWeight.Medium)
    }.width('100%')
    Text($r('app.string.about_qq_group_summary')).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
  }

  build() {
    Column() {
      if (this.centerCommunity) {
        Column({ space: 6 }) {
          Button({ type: ButtonType.Normal, stateEffect: false }) {
            Row({ space: 10 }) {
              Text($r('app.string.about_qq_group_title')).fontSize(18).fontWeight(FontWeight.Bold)
                .fontColor($r('app.color.text_primary'))
              Text(this.QQ群号).fontSize(18).fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.home_intro_link'))
            }.width('100%').justifyContent(FlexAlign.Center)
          }.width('100%').constraintSize({ minHeight: 44 }).backgroundColor(Color.Transparent)
            .attributeModifier(new PressFeedback())
            .onClick((): void => { copyOfficialQQGroup(this.getUIContext()); })
          Text($r('app.string.home_intro_qq_details')).fontSize(12).lineHeight(18)
            .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center).width('100%')
            .attributeModifier(new PressFeedback())
            .onClick((): void => { copyOfficialQQGroup(this.getUIContext()); })
        }.width('100%').alignItems(HorizontalAlign.Center).padding({ bottom: 16 })
      }
      if (!this.centerCommunity) {
        Column({ space: 9 }) {
          Text(settingsItemText(this.getUIContext(), 'app_information', this.uiLanguage))
            .fontSize(18).fontWeight(FontWeight.Bold)
            .fontColor(设置面板色板_取(this.是否深色).主文字).width('100%')
          Text($r('app.string.app_about_copyright')).fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).三级文字).width('100%')
        }.width('100%').alignItems(HorizontalAlign.Start).padding({ bottom: 12 })
        Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'feedback', this.uiLanguage), icon: settingsIcon('feedback'),
          onAction: (): void => { this.feedbackDialog.open(this.createFeedbackDialog); } })
        Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'rate', this.uiLanguage),
          hint: $r('app.string.about_rate_summary'), icon: settingsIcon('rate'),
          onAction: (): void => { this.打开好评弹窗(); } })
      }
      ForEach(OFFICIAL_HELP_LINKS.filter((link: OfficialHelpLink): boolean => !this.centerCommunity || link.id !== 'community'), (link: OfficialHelpLink) => {
        Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)
        if (link.id === 'community') {
          SettingsActionRow({ title: settingsItemText(this.getUIContext(), link.id, this.uiLanguage),
            icon: settingsIcon('community'), hint: $r('app.string.about_qq_group_summary'),
            hintContent: (): void => { this.communityHint(); },
            onAction: (): void => { copyOfficialQQGroup(this.getUIContext()); } })
        } else {
          SettingsActionRow({ title: settingsItemText(this.getUIContext(), link.id, this.uiLanguage),
            hint: this.centerCommunity ? '' : link.url, icon: settingsIcon(link.id), onAction: (): void => { this.openLink(link); } })
        }
      }, (link: OfficialHelpLink): string => link.id)
      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'licenses', this.uiLanguage),
        hint: this.centerCommunity ? '' : $r('app.string.licenses_summary'), icon: settingsIcon('licenses'),
        onAction: (): void => { this.打开许可证回调(); } })
    }.width('100%')
  }
}
