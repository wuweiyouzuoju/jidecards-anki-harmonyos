// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 统一加载态 } from '../common/统一加载态';
import { 按下态按钮 } from '../common/按下态按钮';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { searchHomeDecks } from '../../model/HomeDeckSearch';
import { 牌组汇总, 主页加载状态, 牌组显示名 } from '../../model/主页模型';
import { appInterface } from '../../backend/AppInterfaceService';

/** 输入即筛选，不改主页列表；选择交给原牌组入口，沿用其展开祖先与详情行为。 */
@Component
export struct HomeDeckSearchDialog {
  @Prop @Watch('publishInterface') decks: 牌组汇总[] = [];
  @Prop @Watch('publishInterface') hiddenIds: Set<string> = new Set<string>();
  @Prop @Watch('publishInterface') loadState: 主页加载状态 = 'loading';
  @State @Watch('publishInterface') private query: string = '';
  onSelect: (id: string) => void = (): void => {};
  onRetry: () => void = (): void => {};
  onClose: () => void = (): void => {};

  private results(): 牌组汇总[] { return searchHomeDecks(this.decks, this.hiddenIds, this.query); }
  private ready(): boolean { return this.loadState !== 'loading' && this.loadState !== 'error'; }
  private select(id: string): void {
    if (this.ready() && this.results().some((deck: 牌组汇总): boolean => deck.id === id)) this.onSelect(id);
  }
  private publishInterface(): void {
    const results: 牌组汇总[] = this.ready() ? this.results() : [];
    appInterface.observe({ surface: 'home_search', sectionId: '', selectedId: '',
      optionIds: results.slice(0, 100).map((deck: 牌组汇总): string => deck.id),
      optionLabels: results.slice(0, 100).map((deck: 牌组汇总): string => deck.fullName),
      optionsTotal: results.length, busy: this.loadState === 'loading',
      values: [{ id: 'query', value: this.query }, { id: 'load_state', value: this.loadState }],
      items: [
        { id: 'query', title: '', titleKey: 'home_search_placeholder', enabled: true, selected: false },
        { id: 'results', title: '', titleKey: 'home_interface_decks', enabled: this.ready(), selected: false },
        { id: 'retry', title: '', titleKey: 'common_retry', enabled: this.loadState === 'error', selected: false },
        { id: 'close', title: '', titleKey: 'close', enabled: true, selected: false }
      ] });
  }
  aboutToAppear(): void { this.publishInterface(); }
  aboutToDisappear(): void { appInterface.leave('home_search'); }

  @Builder
  private header() {
    Column() {
      DialogHeader({ title: $r('app.string.home_search_title'), closeLabel: $r('app.string.close'), showAction: false,
        onClose: this.onClose })
      TextInput({ text: this.query, placeholder: $r('app.string.home_search_placeholder') })
        .attributeModifier(new FormInputStyle()).defaultFocus(true).maxLength(200)
        .cancelButton({ style: CancelButtonStyle.INPUT })
        .onChange((value: string): void => { this.query = value; })
    }.width('100%')
  }

  @Builder
  private content() {
    if (this.loadState === 'loading') {
      统一加载态().height(应用尺寸.按钮高度 * 2)
    } else if (this.loadState === 'error') {
      Text($r('app.string.home_load_error')).fontColor($r('app.color.error_text'))
      按下态按钮({ 文案: $r('app.string.common_retry'), 点击回调: this.onRetry })
    } else if (this.results().length === 0) {
      Text($r('app.string.home_search_empty')).fontColor($r('app.color.text_secondary'))
        .fontSize(应用尺寸.字号_正文).width('100%').padding(应用尺寸.间距_16)
    } else {
      Text($r('app.string.home_search_count', this.results().length)).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      ForEach(this.results(), (deck: 牌组汇总) => {
        Button() {
          Column({ space: 应用尺寸.间距_4 }) {
            Text(牌组显示名(deck)).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
            if (deck.fullName !== 牌组显示名(deck)) {
              Text(deck.fullName).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
            }
          }.width('100%').alignItems(HorizontalAlign.Start).padding(应用尺寸.间距_12)
        }.width('100%').type(ButtonType.Normal).backgroundColor(Color.Transparent)
          .constraintSize({ minHeight: 应用尺寸.按钮高度 }).borderRadius(应用尺寸.圆角_面板)
          .attributeModifier(new PressFeedback()).stateEffect(false)
          .onClick((): void => { this.select(deck.id); })
      }, (deck: 牌组汇总): string => deck.id)
    }
  }

  build() {
    DialogFrame({ header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onClose })
  }
}
