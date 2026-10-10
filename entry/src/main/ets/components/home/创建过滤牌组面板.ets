import { DialogFrame } from '../common/DialogFrame';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { showToastSafely, resourceText, localizedNamedResourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';
import { SettingsToggleRow } from '../common/SettingsToggleRow';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-FILTERED-DECK-001
// @名称 创建过滤牌组面板
//
// @作用
// 手动模式创建过滤牌组：用户输入搜索串 + 选择排序 + 设置数量上限 + 是否调整调度，
// 调用 DecksService.GetOrCreateFilteredDeck(0) 获取模板 → 编辑 → AddOrUpdateFilteredDeck 落库。
// 与 Anki 桌面端 Tools → Create Filtered Deck 行为一致。
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
// onSuccess: 成功后回调（刷新首页牌组树等）
//
// @输出
// 渲染创建过滤牌组浮卡面板；用户填好后调后端 RPC。
//
// @业务规则
// - GetOrCreateFilteredDeck(0) 返回 id=0 的模板，前端编辑 name/search/terms 后回写
// - 默认名称「Filtered Deck」，默认搜索空串，默认 limit=100，默认 reschedule=false
// - 搜索串为空时不允许提交
// - 所有用户可见文案走 $r('app.string.filtered_deck_*')
//
// @副作用
// 持有 牌组服务 实例；点击创建时调后端 RPC。
// ========================================================

import { 牌组服务 } from '../../backend/牌组服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 过滤牌组排序 } from '../../proto/messages/DeckMessages';
import type { 过滤牌组更新, 搜索条件 } from '../../proto/messages/DeckMessages';
import { FILTERED_DECK_ORDERS, filteredDeckOrderTitleKey } from '../../model/FilteredDeckOptions';
import type { FilteredDeckOrderChoice } from '../../model/FilteredDeckOptions';

@Component
export struct 创建过滤牌组面板 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.disposed && !this.处理中) this.onClose();
  }

  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onSuccess: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 搜索串: string = '';
  @State private 数量上限: string = '100';
  @State private 排序值: number = 过滤牌组排序.添加顺序;
  @State private 调整调度: boolean = false;
  @State private 处理中: boolean = false;
  @State private 错误信息: string = '';

  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();
  private disposed: boolean = false;
  aboutToDisappear(): void { this.disposed = true; }

  private 取本地化文本(资源: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private orderOptions(): SelectOption[] {
    return FILTERED_DECK_ORDERS.map((choice: FilteredDeckOrderChoice): SelectOption => ({
      value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, choice.titleKey)
    }));
  }

  private orderValue(): string {
    return localizedNamedResourceText(this.getUIContext(), this.uiLanguage, filteredDeckOrderTitleKey(this.排序值));
  }

  private 可提交(): boolean {
    if (this.disposed || this.处理中) {
      return false;
    }
    if (this.搜索串.trim() === '') {
      return false;
    }
    const 上限 = Number(this.数量上限.trim());
    if (isNaN(上限) || 上限 <= 0 || !Number.isInteger(上限)) {
      return false;
    }
    return true;
  }

  private async 执行创建(): Promise<void> {
    if (!this.可提交()) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    const 搜索条件项: 搜索条件 = {
      search: this.搜索串.trim(), limit: Number(this.数量上限.trim()), order: this.排序值
    };
    const reschedule: boolean = this.调整调度;
    const name: string = this.取本地化文本($r('app.string.filtered_deck_title'));
    try {
      // 1. 获取模板（id=0 表示新建）
      const 模板: 过滤牌组更新 = await this.牌组服务实例.获取或创建过滤牌组(0);
      // 2. 填充用户输入
      模板.name = name;
      模板.config.reschedule = reschedule;
      模板.config.searchTerms = [搜索条件项];
      模板.allowEmpty = true;
      // 3. 回写后端
      await this.牌组服务实例.添加或更新过滤牌组(模板);
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (this.disposed) return;
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.filtered_deck_success')),
        duration: 2000
      });
      this.onSuccess();
      this.onClose();
    } catch (error) {
      if (!this.disposed) this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (!this.disposed) this.处理中 = false;
    }
  }

  @Builder
  private panelHeader() {
    DialogHeader({
      title: $r('app.string.filtered_deck_title'),
      showActionLabel: this.处理中, actionLabel: this.处理中 ?
        $r('app.string.filtered_deck_creating') : $r('app.string.filtered_deck_confirm'),
      actionEnabled: this.可提交(),
      closeLabel: $r('app.string.filtered_deck_cancel'),
      closeEnabled: !this.处理中,
      onClose: () => { this.handleBackRequest(); },
      onAction: () => { this.执行创建(); }
    })
  }

  @Builder
  private panelContent() {
    Column({ space: 应用尺寸.间距_16 }) {

      // 搜索条件
      Column({ space: 应用尺寸.间距_5 }) {
        Text($r('app.string.filtered_deck_search_label'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
        TextInput({ placeholder: $r('app.string.filtered_deck_search_placeholder'), text: this.搜索串 })
          .attributeModifier(new FormInputStyle(应用尺寸.卡片内边距))
          .enabled(!this.处理中)
          .onChange((value: string) => { this.搜索串 = value; })
      }
      .width('100%')

      // 数量上限
      Column({ space: 应用尺寸.间距_5 }) {
        Text($r('app.string.filtered_deck_limit_label'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
        TextInput({ text: this.数量上限 })
          .attributeModifier(new FormInputStyle(应用尺寸.卡片内边距))
          .type(InputType.Number)
          .enabled(!this.处理中)
          .onChange((value: string) => { this.数量上限 = value; })
      }
      .width('100%')

      // 排序方式
      FormSelectRow({ label: $r('app.string.filtered_deck_order_label'),
        options: this.orderOptions(),
        selectedIndex: FILTERED_DECK_ORDERS.findIndex((choice: FilteredDeckOrderChoice): boolean => choice.value === this.排序值),
        value: this.orderValue(), isInteractive: !this.处理中,
        onSelect: (index: number): void => { this.排序值 = FILTERED_DECK_ORDERS[index].value; } })

      // 调整调度开关
      SettingsToggleRow({ title: $r('app.string.filtered_deck_reschedule_label'),
        hint: $r('app.string.filtered_deck_reschedule_hint'), isOn: this.调整调度,
        isInteractive: !this.处理中, isDark: this.isDark, tint: this.主色按钮背景,
        onChange: (value: boolean): void => { this.调整调度 = value; } })

      if (this.错误信息 !== '') {
        Text(this.错误信息)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .width('100%')
          .maxLines(3)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
    }.width('100%')
  }

  build() {
    DialogFrame({ header: () => { this.panelHeader(); }, content: () => { this.panelContent(); },
      canDismiss: !this.处理中, onDismiss: (): void => { this.handleBackRequest(); } })
  }
}
