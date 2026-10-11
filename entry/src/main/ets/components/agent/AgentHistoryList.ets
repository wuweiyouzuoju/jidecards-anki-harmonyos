// SPDX-License-Identifier: AGPL-3.0-or-later
import { localizedResourceText } from '../../utils/UiFeedback';
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import type { AgentConversationSummary } from '../../model/agent/AgentConversationTypes';
import { agentHistoryRepository } from '../../backend/agent/AgentHistoryFiles';
import { AgentHistoryMatch } from '../../model/agent/AgentHistoryRepository';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { IconActionButton } from '../common/IconActionButton';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { interfaceItemText, interfaceItemTitleKey } from '../../utils/AppInterfaceText';
@Component
export struct AgentHistoryList {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @Prop @Watch('refreshSearch') conversations: AgentConversationSummary[] = [];
  @Prop @Watch('publishInterface') isInteractive: boolean = true;
  @Prop @Watch('publishInterface') canRestore: boolean = true;
  @Prop navigationBarHeight: number = 0;
  @Prop errorText: string = '';
  @Prop management: boolean = false;
  @State private query: string = '';
  @State private matches: AgentHistoryMatch[] = [];
  @State private searching: boolean = false;
  @State private searchError: boolean = false;
  private searchGeneration: number = 0;
  private searchTimer: number = -1;
  @Prop @Watch('publishInterface') conversationId: string = '';
  private interfaceMounted: boolean = false;
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  onRestore: (item: AgentConversationSummary) => void = (): void => {};
  onDelete: (item: AgentConversationSummary) => void = (): void => {};
  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void {
    this.interfaceMounted = false; this.searchGeneration++; clearTimeout(this.searchTimer);
    appInterface.leave(this.management ? 'agent_history_management' : 'agent_history');
  }
  private visible(): AgentConversationSummary[] { return this.query.trim() === '' ? this.conversations : this.matches; }
  private refreshSearch(): void {
    this.searchGeneration++; clearTimeout(this.searchTimer); this.matches = []; this.searchError = false;
    if (this.query.trim() === '') { this.searching = false; this.publishInterface(); return; }
    this.searching = true;
    this.searchTimer = setTimeout((): void => { this.search(); }, 250);
  }
  private async search(): Promise<void> {
    const generation: number = ++this.searchGeneration;
    try {
      // 500份正文逐个扫描，不把全文常驻UI；UI展示全部匹配的轻量索引。
      const repository = agentHistoryRepository();
      let result = await repository.search(this.query.trim(), 0, 20);
      const matches: AgentHistoryMatch[] = result.items.slice();
      while (result.nextOffset >= 0) {
        if (!this.interfaceMounted || generation !== this.searchGeneration) return;
        result = await repository.search(this.query.trim(), result.nextOffset, 20, result.revision);
        matches.push(...result.items);
      }
      if (this.interfaceMounted && generation === this.searchGeneration) {
        this.matches = matches.filter((item: AgentConversationSummary): boolean =>
          this.conversations.some((conversation: AgentConversationSummary): boolean => conversation.id === item.id));
      }
    } catch (error) {
      if (this.interfaceMounted && generation === this.searchGeneration) this.searchError = true;
    } finally {
      if (this.interfaceMounted && generation === this.searchGeneration) { this.searching = false; this.publishInterface(); }
    }
  }
  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const conversations: AgentConversationSummary[] = this.visible().slice(0, 100);
    const controls: AppInterfaceControl[] = [{ id: 'search', title: '', titleKey: 'agent_history_search', enabled: this.isInteractive, selected: false }];
    if (conversations.length > 0) {
      controls.push({ id: 'delete', title: interfaceItemText(this.getUIContext(), 'agent_history', 'delete', this.uiLanguage),
        titleKey: interfaceItemTitleKey('agent_history', 'delete'), enabled: this.isInteractive, selected: false });
    }
    for (const item of conversations) {
      if (this.canRestore) controls.push({ id: item.id, title: item.title.slice(0, 160), enabled: this.isInteractive, selected: item.id === this.conversationId });
      controls.push({ id: 'delete-' + item.id, title: interfaceItemText(this.getUIContext(), 'agent_history', 'delete', this.uiLanguage),
        titleKey: interfaceItemTitleKey('agent_history', 'delete'), enabled: this.isInteractive, selected: false });
    }
    appInterface.observe({ surface: this.management ? 'agent_history_management' : 'agent_history', sectionId: '', selectedId: this.conversationId,
      optionIds: conversations.map((item): string => item.id), optionLabels: conversations.map((item): string => item.title.slice(0, 160)),
      optionsTotal: this.visible().length, busy: this.searching || !this.isInteractive, items: controls, controlsComplete: this.visible().length <= 100 });
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
      TextInput({ text: this.query, placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.agent_history_search')) })
        .attributeModifier(new FormInputStyle()).maxLength(200).enabled(this.isInteractive)
        .onChange((value: string): void => { this.query = value; this.refreshSearch(); })
      if (this.errorText !== '' || this.searchError) {
        Text(this.errorText || $r('app.string.ai_agent_history_load_failed')).fontColor($r('app.color.error_text')).width('100%')
      }
      if (this.searching) { LoadingProgress().width(应用尺寸.加载指示器尺寸).height(应用尺寸.加载指示器尺寸) }
      if (!this.searching && this.visible().length === 0) {
        Text($r('app.string.ai_agent_history_none'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
          .textAlign(TextAlign.Center)
      } else {
        List({ space: 应用尺寸.间距_8 }) {
            ForEach(this.visible(), (item: AgentConversationSummary) => {
              ListItem() {
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
                  Text(localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.ai_agent_history_message_count'), `${item.messageCount}`) + ` · ${this.格式化历史时间(item.updatedAt)}`)
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                }
                .layoutWeight(1)
                .attributeModifier(new PressFeedback())
                .onClick((): void => { if (this.isInteractive && this.canRestore) this.onRestore(item); })
                IconActionButton({ source: $r('app.media.ic_study_delete'), glyphColor: '#D34D4D',
                  label: $r('app.string.ai_agent_history_delete'), isInteractive: this.isInteractive,
                  onAction: (): void => { if (this.isInteractive) this.onDelete(item); } })
              }
              .width('100%')
              .padding(应用尺寸.间距_10)
              .backgroundColor(item.id === this.conversationId ?
                this.选中背景色 : $r('app.color.surface_card'))
              .border(SurfaceBorder.options())
              .borderRadius(应用尺寸.圆角_面板)
              }
            }, (item: AgentConversationSummary): string => item.id + String(item.updatedAt))
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }
    }
    .width('100%')
    .layoutWeight(this.management ? 0 : 1)
    .constraintSize(this.management ? { minHeight: 280, maxHeight: 420 } : {})
    .padding({
      left: this.management ? 0 : 应用尺寸.页面内边距_水平,
      right: this.management ? 0 : 应用尺寸.页面内边距_水平,
      top: this.management ? 0 : 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
      bottom: this.management ? 0 : 应用尺寸.页面底部间距(this.narrowDeckLayout) + Math.max(0, this.navigationBarHeight)
    })
    .backgroundColor(this.management ? Color.Transparent : this.页面底色微染值)
  }
}
