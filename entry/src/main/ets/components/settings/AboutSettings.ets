// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { 链接服务 } from '../../backend/链接服务';
import { HelpPage } from '../../proto/messages/LinksMessages';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { showToastSafely } from '../../utils/UiFeedback';
import { 打开应用内好评 } from '../../utils/好评引导';
import { 颜色键 } from '../../model/颜色主题';
import { AboutActionDialog } from './AboutActionDialog';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { ThemeTextSpans } from '../common/ThemeText';

/** 关于分组独占外链和反馈交互；主壳只负责目录与许可证导航。 */
@Component
export struct AboutSettings {
  @Prop 是否深色: boolean = false;
  @StorageLink(颜色键.动作主色) private 动作主色链接: string = '';
  打开许可证回调: () => void = (): void => {};
  private readonly 链接服务实例: 链接服务 = new 链接服务();
  // AnkiWeb 共享牌组网址（与 AnkiWeb引导对话框.ets 同款字面量，作为外部网址保留原文）
  private readonly AnkiWeb网址: string = 'https://ankiweb.net/shared/decks';
  // Anki 官方文档 URL（后端 LinksService.HelpPageLink 不可用时的兜底常量，与 docs.ankiweb.net 一致）
  private readonly Anki文档网址: string = 'https://docs.ankiweb.net';
  // 官方 QQ 群号（关于分组入口点击复制到剪贴板，与 欢迎弹窗 中 QQ群号 保持一致）
  private readonly QQ群号: string = '726837065';
  // 本应用 bundleName，用于拼接应用市场 DeepLink 跳转本应用详情页（好评回退路径）
  private readonly 本应用包名: string = 'com.jide.kapian';
  private feedbackDialog: CustomDialogController = new CustomDialogController({
    builder: AboutActionDialog({
      groupNumber: this.QQ群号,
      onCopyGroup: (): void => { this.复制QQ群号到剪贴板(); }
    }),
    autoCancel: true,
    alignment: DialogAlignment.Center,
    customStyle: true
  });

  aboutToDisappear(): void {
    this.feedbackDialog.close();
  }
  private 解析主色(): string {
    return this.动作主色链接 !== '' ? this.动作主色链接 : 设置面板色板_取(this.是否深色).主色;
  }
  private 打开AnkiWeb网址(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: this.AnkiWeb网址
    }).catch((错误: Error): void => {
      // 兜底：复制网址到剪贴板 + toast 提示用户手动打开
      this.复制AnkiWeb网址到剪贴板();
    });
  }

  private async 复制AnkiWeb网址到剪贴板(): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.AnkiWeb网址);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.about_ankiweb_open_failed')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到网址文本手动抄录
    }
  }

  private async 打开Anki官方文档(): Promise<void> {
    let 网址: string = this.Anki文档网址;
    try {
      const 后端网址: string = await this.链接服务实例.获取帮助页链接(HelpPage.INDEX);
      if (后端网址 !== '') {
        网址 = 后端网址;
      }
    } catch (错误) {
      // 后端不可用：兜底用本地常量网址，确保用户仍能打开文档
    }
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: 网址
    }).catch((错误: Error): void => {
      // 兜底：复制网址到剪贴板 + toast 提示用户手动打开
      this.复制Anki文档网址到剪贴板(网址);
    });
  }

  private async 复制Anki文档网址到剪贴板(网址: string): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, 网址);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.about_anki_docs_open_failed')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到网址文本手动抄录
    }
  }

  // 点击「关于 → QQ 群」入口行：把 QQ 群号写入系统剪贴板并 toast 提示。
  // 不跳转 QQ 应用（避免未装 QQ 时 startAbility 失败的复杂降级链路），统一走复制 + 用户自行打开 QQ 加群。
  private async 复制QQ群号到剪贴板(): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.QQ群号);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.about_qq_group_copied')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到群号文本手动抄录
    }
  }

  private 打开好评弹窗(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    打开应用内好评(context, this.本应用包名);
  }

  build() {
    Column() {
      Column({ space: 9 }) {
        Text($r('app.string.app_about_title'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(设置面板色板_取(this.是否深色).主文字)
          .width('100%')
        Text($r('app.string.app_about_copyright'))
          .fontSize(12)
          .fontColor(设置面板色板_取(this.是否深色).三级文字)
          .width('100%')
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ bottom: 12 })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      Row() {
        Text($r('app.string.feedback_title'))
          .fontSize(15)
          .fontColor(设置面板色板_取(this.是否深色).主文字)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(48)
      .attributeModifier(new PressFeedback()).onClick((): void => { this.feedbackDialog.open(); })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 复用公共好评入口及市场降级。
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_rate_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text($r('app.string.about_rate_summary'))
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(58)
      .attributeModifier(new PressFeedback()).onClick(() => {
        this.打开好评弹窗();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // AnkiWeb 资源入口行：点击用系统浏览器打开 AnkiWeb 共享牌组页面
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_ankiweb_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text(this.AnkiWeb网址)
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(58)
      .attributeModifier(new PressFeedback()).onClick(() => {
        this.打开AnkiWeb网址();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // QQ 群入口行：点击复制群号到剪贴板（不跳转 QQ 应用，避免未装 QQ 时降级链路复杂）
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_qq_group_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Row({ space: 4 }) {
            Text($r('app.string.about_qq_group_summary'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            Text($r('app.string.about_qq_group_number_label'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            Text() { ThemeTextSpans(this.QQ群号, [], this.getUIContext()) }
              .fontSize(12)
              .fontColor(this.解析主色())
              .fontWeight(FontWeight.Medium)
              .copyOption(CopyOptions.LocalDevice)
          }
          .width('100%')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(58)
      .attributeModifier(new PressFeedback()).onClick(() => {
        this.复制QQ群号到剪贴板();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 许可证入口行
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.licenses_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text($r('app.string.licenses_summary'))
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
        }
        .alignItems(HorizontalAlign.Start)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(58)
      .attributeModifier(new PressFeedback()).onClick(() => {
        this.打开许可证回调();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // Anki 官方文档入口行（设置页底部）：点击用系统浏览器打开 docs.ankiweb.net
      // 优先调后端 LinksService.HelpPageLink 取 URL（按 locale 选站点），失败兜底本地常量
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_anki_docs_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text(this.Anki文档网址)
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
      }
      .width('100%')
      .height(58)
      .attributeModifier(new PressFeedback()).onClick(() => {
        this.打开Anki官方文档();
      })
    }
    .width('100%')
  }

}
