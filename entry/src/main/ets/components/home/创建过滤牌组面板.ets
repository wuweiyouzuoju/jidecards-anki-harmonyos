// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';

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
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import { 过滤牌组排序 } from '../../proto/messages/DeckMessages';
import type { 过滤牌组更新, 搜索条件 } from '../../proto/messages/DeckMessages';
import { promptAction } from '@kit.ArkUI';

interface 排序选项 {
  值: number;
  标签资源: Resource;
}

@Component
export struct 创建过滤牌组面板 {
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

  private readonly 排序选项列表: 排序选项[] = [
    { 值: 过滤牌组排序.最旧复习优先, 标签资源: $r('app.string.filtered_deck_order_oldest') },
    { 值: 过滤牌组排序.随机, 标签资源: $r('app.string.filtered_deck_order_random') },
    { 值: 过滤牌组排序.间隔升序, 标签资源: $r('app.string.filtered_deck_order_interval_asc') },
    { 值: 过滤牌组排序.间隔降序, 标签资源: $r('app.string.filtered_deck_order_interval_desc') },
    { 值: 过滤牌组排序.遗忘次数, 标签资源: $r('app.string.filtered_deck_order_lapses') },
    { 值: 过滤牌组排序.添加顺序, 标签资源: $r('app.string.filtered_deck_order_added') },
    { 值: 过滤牌组排序.到期日, 标签资源: $r('app.string.filtered_deck_order_due') },
    { 值: 过滤牌组排序.逆添加顺序, 标签资源: $r('app.string.filtered_deck_order_reverse_added') },
    { 值: 过滤牌组排序.可回忆率升序, 标签资源: $r('app.string.filtered_deck_order_retr_asc') },
    { 值: 过滤牌组排序.可回忆率降序, 标签资源: $r('app.string.filtered_deck_order_retr_desc') },
    { 值: 过滤牌组排序.相对逾期程度, 标签资源: $r('app.string.filtered_deck_order_relative') }
  ];

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  private 可提交(): boolean {
    if (this.处理中) {
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
    try {
      // 1. 获取模板（id=0 表示新建）
      const 模板: 过滤牌组更新 = await this.牌组服务实例.获取或创建过滤牌组(0);
      // 2. 填充用户输入
      const 搜索条件项: 搜索条件 = {
        search: this.搜索串.trim(),
        limit: Number(this.数量上限.trim()),
        order: this.排序值
      };
      模板.name = this.取本地化文本($r('app.string.filtered_deck_title'));
      模板.config.reschedule = this.调整调度;
      模板.config.searchTerms = [搜索条件项];
      模板.allowEmpty = true;
      // 3. 回写后端
      await this.牌组服务实例.添加或更新过滤牌组(模板);
      promptAction.showToast({
        message: this.取本地化文本($r('app.string.filtered_deck_success')),
        duration: 2000
      });
      this.onSuccess();
      this.onClose();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(设置面板色板_取(this.isDark).遮罩)
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          if (!this.处理中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        DialogHeader({
          title: $r('app.string.filtered_deck_title'),
          actionLabel: this.处理中 ?
            $r('app.string.filtered_deck_creating') : $r('app.string.filtered_deck_confirm'),
          actionEnabled: this.可提交(),
          closeLabel: $r('app.string.filtered_deck_cancel'),
          closeEnabled: !this.处理中,
          onClose: () => { this.onClose(); },
          onAction: () => { this.执行创建(); }
        })

        // 搜索条件
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.filtered_deck_search_label'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ placeholder: $r('app.string.filtered_deck_search_placeholder'), text: this.搜索串 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
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
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .type(InputType.Number)
            .enabled(!this.处理中)
            .onChange((value: string) => { this.数量上限 = value; })
        }
        .width('100%')

        // 排序方式
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.filtered_deck_order_label'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          Select([
            ...this.排序选项列表.map((选项: 排序选项): SelectOption => {
              return { value: this.取本地化文本(选项.标签资源) };
            })
          ])
            .selected(this.排序选项列表.findIndex((选项: 排序选项) => 选项.值 === this.排序值))
            .value(this.取本地化文本(
              this.排序选项列表.find((选项: 排序选项) => 选项.值 === this.排序值)?.标签资源
              ?? $r('app.string.filtered_deck_order_added')))
            .width('100%')
            .enabled(!this.处理中)
            .attributeModifier(new SelectStyle())
            .font(SelectStyle.controlFont)
            .borderRadius(SelectStyle.controlRadius)
            .onSelect((index: number) => {
              if (index >= 0 && index < this.排序选项列表.length) {
                this.排序值 = this.排序选项列表[index].值;
              }
            })
        }
        .width('100%')

        // 调整调度开关
        Row() {
          Column({ space: 2 }) {
            Text($r('app.string.filtered_deck_reschedule_label'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
            Text($r('app.string.filtered_deck_reschedule_hint'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
          .alignItems(HorizontalAlign.Start)
          .layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.调整调度 })
            .selectedColor(this.主色按钮背景)
            .enabled(!this.处理中)
            .onChange((值: boolean) => { this.调整调度 = 值; })
        }
        .width('100%')

        if (this.错误信息 !== '') {
          Text(this.错误信息)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.面板内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {})
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
  }
}
