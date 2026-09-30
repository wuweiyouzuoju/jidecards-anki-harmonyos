// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
interface 牌组项 { id: number; 名: string; }

@Component
export struct BrowserDeckDialog {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  @Prop 牌组树: DeckTreeNode | null = null;
  onSubmit: (id: number) => void = (_id: number): void => {};
  private 扁平化牌组树(节点: DeckTreeNode, 前缀: string, 输出: 牌组项[]): void {
    if (节点.deckId !== 0) {
      const 项: 牌组项 = { id: 节点.deckId, 名: 前缀 + 节点.name };
      输出.push(项);
    }
    for (const 子 of 节点.children) {
      const 子前缀: string = 节点.deckId === 0 ? '' : 前缀 + 节点.name + '::';
      this.扁平化牌组树(子, 子前缀, 输出);
    }
  }
  private 扁平化牌组树为列表(): 牌组项[] {
    const 输出: 牌组项[] = [];
    if (this.牌组树 !== null) {
      this.扁平化牌组树(this.牌组树, '', 输出);
    }
    return 输出;
  }
  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_action_change_deck'),
      showAction: false,
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); }
    })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_4 }) {
        if (this.牌组树 !== null) {
          ForEach(this.扁平化牌组树为列表(), (项: 牌组项) => {
            Text(项.名)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
                top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_12 })
              .width('100%')
              .borderRadius(应用尺寸.圆角_面板)
              .backgroundColor($r('app.color.surface_page'))
              .enabled(!this.busy)
              .attributeModifier(new PressFeedback())
              .onClick((): void => { if (!this.busy) this.onSubmit(项.id); })
          }, (项: 牌组项): string => `${项.id}`)
        }
      }
      .width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
