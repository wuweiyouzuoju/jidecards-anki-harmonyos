// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import type { AgentConversation } from '../../model/agent/AgentConversationTypes';
@Component
export struct AgentHistoryList {
  @Prop conversations: AgentConversation[] = [];
  @Prop conversationId: string = '';
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  onRestore: (item: AgentConversation) => void = (): void => {};
  onDelete: (item: AgentConversation) => void = (): void => {};
  private 两位数(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }
  private 格式化历史时间(value: number): string {
    const time: Date = new Date(value);
    return `${time.getFullYear()}-${this.两位数(time.getMonth() + 1)}-${this.两位数(time.getDate())} ` +
      `${this.两位数(time.getHours())}:${this.两位数(time.getMinutes())}`;
  }
  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      if (this.conversations.length === 0) {
        Text($r('app.string.ai_agent_history_none'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
          .textAlign(TextAlign.Center)
      } else {
        Scroll() {
          Column({ space: 应用尺寸.间距_8 }) {
            ForEach(this.conversations, (item: AgentConversation) => {
              Row({ space: 应用尺寸.间距_8 }) {
                Column({ space: 应用尺寸.间距_4 }) {
                  Row({ space: 应用尺寸.间距_5 }) {
                    Text(item.title)
                      .fontSize(应用尺寸.字号_正文)
                      .fontWeight(FontWeight.Medium)
                      .fontColor($r('app.color.text_primary'))
                      .maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis })
                  }
                  .width('100%')
                  Text(this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.ai_agent_history_message_count').id, `${item.messages.length}`) + ` · ${this.格式化历史时间(item.updatedAt)}`)
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                }
                .layoutWeight(1)
                .onClick((): void => { this.onRestore(item); })
                Button($r('app.string.ai_agent_history_delete'))
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.error_text'))
                  .backgroundColor(Color.Transparent)
                  .onClick((): void => { this.onDelete(item); })
              }
              .width('100%')
              .padding(应用尺寸.间距_10)
              .backgroundColor(item.id === this.conversationId ?
                this.选中背景色 : $r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              .borderRadius(应用尺寸.圆角_面板)
            }, (item: AgentConversation): string => item.id)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.pageContentTopInset,
      bottom: 应用尺寸.pageBottomInset
    })
    .backgroundColor(this.页面底色微染值)
  }
}
