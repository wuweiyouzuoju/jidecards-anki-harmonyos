// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 页面根层承载只读说明；关闭不提交或丢弃下层表单草稿。 */
@Component
export struct 字段帮助面板 {
  @Prop 标题: ResourceStr = $r('app.string.deck_options_title');
  @Prop 正文: ResourceStr = '';
  onClose: () => void = (): void => {};
  @BuilderParam 内容: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  @Builder
  private headerContent() {
    DialogHeader({ title: this.标题, showClose: false,
      actionLabel: $r('app.string.done'), onAction: (): void => { this.onClose(); } })
  }

  @Builder
  private helpContent() {
    if (this.正文 !== '') {
      Text(this.正文).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).width('100%')
    }
    this.内容()
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth,
      onDismiss: (): void => { this.onClose(); },
      header: () => { this.headerContent(); },
      content: () => { this.helpContent(); }
    })
  }
}

/** 原生弹窗宿主的薄适配；系统返回只关闭这一层，展示仍复用字段帮助面板。 */
@CustomDialog
export struct 字段帮助对话框 {
  controller?: CustomDialogController;
  标题: ResourceStr = '';
  正文: ResourceStr = '';
  onDismiss: () => void = (): void => {};
  @BuilderParam 内容: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    字段帮助面板({ 标题: this.标题, 正文: this.正文,
      内容: (): void => { this.内容(); },
      onClose: (): void => { this.controller?.close(); this.onDismiss(); }
    })
  }
}
