// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import type { AgentConversation } from '../../model/agent/AgentConversationTypes';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { interfaceItemText, interfaceItemTitleKey } from '../../utils/AppInterfaceText';
@Component
export struct AgentHistoryList {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @Prop @Watch('publishInterface') conversations: AgentConversation[] = [];
  @Prop @Watch('publishInterface') conversationId: string = '';
  private interfaceMounted: boolean = false;
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  onRestore: (item: AgentConversation) => void = (): void => {};
  onDelete: (item: AgentConversation) => void = (): void => {};
  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('agent_history'); }
  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const conversations: AgentConversation[] = this.conversations.slice(0, 100);
    const controls: AppInterfaceControl[] = [];
    if (conversations.length > 0) {
      controls.push({ id: 'delete', title: interfaceItemText(this.getUIContext(), 'agent_history', 'delete'),
        titleKey: interfaceItemTitleKey('agent_history', 'delete'), enabled: true, selected: false });
    }
    for (const item of conversations) {
      controls.push({ id: item.id, title: item.title.slice(0, 160), enabled: true, selected: item.id === this.conversationId });
      controls.push({ id: 'delete-' + item.id, title: interfaceItemText(this.getUIContext(), 'agent_history', 'delete'),
        titleKey: interfaceItemTitleKey('agent_history', 'delete'), enabled: true, selected: false });
    }
    appInterface.observe({ surface: 'agent_history', sectionId: '', selectedId: this.conversationId,
      optionIds: conversations.map((item): string => item.id), optionLabels: conversations.map((item): string => item.title.slice(0, 160)),
      optionsTotal: this.conversations.length, busy: false, items: controls, controlsComplete: true });
  }
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
                .attributeModifier(new PressFeedback())
                .onClick((): void => { this.onRestore(item); })
                Button(interfaceItemText(this.getUIContext(), 'agent_history', 'delete'))
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.error_text'))
                  .backgroundColor(Color.Transparent)
                  .attributeModifier(new PressFeedback())
                  .stateEffect(false)
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
      top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
      bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout)
    })
    .backgroundColor(this.页面底色微染值)
  }
}
