// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
interface 牌组项 { id: number; 名: string; }

@Component
export struct BrowserDeckDialog {
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
  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .onClick((): void => {
          if (!this.busy) { this.onClose(); }
        })

      Column({ space: 应用尺寸.间距_14 }) {
        DialogHeader({
          title: $r('app.string.browser_action_change_deck'),
          showClose: false,
          actionLabel: $r('app.string.browser_detail_cancel'),
          actionEnabled: !this.busy,
          onAction: (): void => { this.onClose(); }
        })

        Scroll() {
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
                  .onClick((): void => { this.onSubmit(项.id); })
              }, (项: 牌组项): string => `${项.id}`)
            }
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)

      }
      .width('88%')
      .constraintSize({ maxWidth: 520, maxHeight: '80%' })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
    }
  }
}
