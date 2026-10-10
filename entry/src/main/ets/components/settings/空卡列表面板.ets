// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../../utils/UiFeedback';
import { EMPTY_CARDS_ACTIONS } from '../../model/AppInterface';
import { DialogFrame } from '../common/DialogFrame';
import { 按下态按钮 } from '../common/按下态按钮';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-EMPTY-CARDS-001
// @名称 空卡列表面板
//
// @作用
// 调用 CardRenderingService.GetEmptyCards RPC 获取空卡报告，
// 列出因模板缺失或字段为空导致无卡片可渲染的笔记。
// 每条笔记显示 note_id / 空卡数量 / 删除后是否变空笔记标记，
// 用户可勾选后批量删除空卡（连同 will_delete_note=true 的笔记一并删除）。
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
//
// @输出
// 渲染空卡列表面板；用户操作时调 卡片服务.删除卡片 并刷新列表。
//
// @业务规则
// - GetEmptyCards 请求为 generic.Empty，返回 EmptyCardsReport
// - will_delete_note=true 表示删除这些空卡后笔记会变空，UI 提示「将一并删除笔记」
// - 删除走 卡片服务.删除卡片(卡片ID列表)，Anki 后端会自动清理无卡笔记
// - 所有用户可见文案走 $r('app.string.empty_cards_*')，禁止硬编码中文
// - 失败时错误信息显示在面板内（红字），不弹 toast
//
// @副作用
// 持有 卡片渲染服务 / 卡片服务 实例；点击按钮时调后端 RPC（经 后端会话 → NAPI 桥）。
// ========================================================

import { 卡片渲染服务 } from '../../backend/卡片渲染服务';
import { 卡片服务 } from '../../backend/卡片服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import type { 笔记空卡 } from '../../proto/messages/CardRenderingMessages';

@Component
export struct 空卡列表面板 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.disposed && !this.处理中) this.onClose();
  }

  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 检查中: boolean = false;
  @State private 处理中: boolean = false;
  @State private 已检查: boolean = false;
  @State private 笔记列表: 笔记空卡[] = [];
  @State private 选中状态: boolean[] = [];
  @State private 错误信息: string = '';

  private readonly 渲染服务: 卡片渲染服务 = new 卡片渲染服务();
  private readonly 卡片服务实例: 卡片服务 = new 卡片服务();
  private disposed: boolean = false;
  private confirmingDelete: boolean = false;

  aboutToAppear(): void {
    this.执行检查();
  }
  aboutToDisappear(): void { this.disposed = true; }

  private 取本地化文本(资源: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private 取本地化带参文本(资源: Resource, 参数: Array<string | number>, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源, ...参数);
  }

  private 选中数量(): number {
    let 计数 = 0;
    for (let i = 0; i < this.选中状态.length; i++) {
      if (this.选中状态[i]) {
        计数++;
      }
    }
    return 计数;
  }

  private 全选状态(): boolean {
    if (this.笔记列表.length === 0) {
      return false;
    }
    return this.选中数量() === this.笔记列表.length;
  }

  private 切换全选(): void {
    const 全选 = !this.全选状态();
    const 新状态: boolean[] = [];
    for (let i = 0; i < this.笔记列表.length; i++) {
      新状态.push(全选);
    }
    this.选中状态 = 新状态;
  }

  private 切换选中(索引: number): void {
    const 新状态: boolean[] = [];
    for (let i = 0; i < this.选中状态.length; i++) {
      新状态.push(i === 索引 ? !this.选中状态[i] : this.选中状态[i]);
    }
    this.选中状态 = 新状态;
  }

  private async 执行检查(): Promise<void> {
    if (this.disposed || this.检查中 || this.处理中 || this.confirmingDelete) return;
    await this.loadReport();
  }

  private async loadReport(): Promise<void> {
    this.检查中 = true;
    this.错误信息 = '';
    try {
      const 报告 = await this.渲染服务.获取空卡报告();
      if (this.disposed) return;
      this.笔记列表 = 报告.笔记列表;
      const 初始选中: boolean[] = [];
      for (let i = 0; i < this.笔记列表.length; i++) {
        初始选中.push(false);
      }
      this.选中状态 = 初始选中;
      this.已检查 = true;
    } catch (error) {
      if (!this.disposed) this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (!this.disposed) this.检查中 = false;
    }
  }

  private 确认删除(): void {
    const 选中数 = this.选中数量();
    if (this.disposed || 选中数 === 0 || this.检查中 || this.处理中 || this.confirmingDelete) {
      return;
    }
    const ids: number[] = this.selectedCardIds();
    this.confirmingDelete = true;
    let settled: boolean = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true; this.confirmingDelete = false; return true;
    };
    try {
    this.getUIContext().showAlertDialog({
      title: this.取本地化文本($r('app.string.empty_cards_delete')),
      message: this.取本地化带参文本($r('app.string.empty_cards_confirm_delete'), [选中数]),
      autoCancel: true,
      alignment: DialogAlignment.Center,
      cancel: (): void => { finish(); },
      primaryButton: {
        value: this.取本地化文本($r('app.string.cancel')),
        action: (): void => { finish(); }
      },
      secondaryButton: {
        value: this.取本地化文本($r('app.string.empty_cards_delete')),
        fontColor: $r('app.color.error_text'),
        action: (): void => { if (finish()) this.执行删除(ids); }
      }
    });
    } catch (error) { finish(); }
  }

  private selectedCardIds(): number[] {
    const 选中卡片IDs: number[] = [];
    for (let i = 0; i < this.笔记列表.length; i++) {
      if (this.选中状态[i]) {
        const 笔记 = this.笔记列表[i];
        for (let j = 0; j < 笔记.卡片IDs.length; j++) {
          选中卡片IDs.push(笔记.卡片IDs[j]);
        }
      }
    }
    return 选中卡片IDs;
  }

  private async 执行删除(选中卡片IDs: number[]): Promise<void> {
    if (this.disposed || 选中卡片IDs.length === 0 || this.检查中 || this.处理中) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.卡片服务实例.删除卡片(选中卡片IDs);
      // 通知首页刷新牌组计数（本面板挂在设置页内，无 onPop 可依赖）
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (!this.disposed) await this.loadReport();
    } catch (error) {
      if (!this.disposed) this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (!this.disposed) this.处理中 = false;
    }
  }

  @Builder
  private 笔记项行(索引: number) {
    Row({ space: 应用尺寸.间距_8 }) {
      Toggle({ type: ToggleType.Checkbox, isOn: this.选中状态[索引] })
        .selectedColor(this.主色按钮背景)
        .onChange((值: boolean): void => { this.切换选中(索引); })
      Column({ space: 2 }) {
        Text(this.取本地化带参文本($r('app.string.empty_cards_note_id'), [this.笔记列表[索引].笔记ID]))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor(设置面板色板_取(this.isDark).主文字)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Row({ space: 应用尺寸.间距_4 }) {
          Text(this.取本地化带参文本($r('app.string.empty_cards_card_count'), [this.笔记列表[索引].卡片IDs.length]))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.isDark).弱化文字)
          if (this.笔记列表[索引].删除后无卡) {
            Text($r('app.string.empty_cards_will_delete_note'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.warning_text'))
          }
        }
        .width('100%')
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .width('100%')
    .height(56)
  }

  @Builder
  private panelHeader() {
    DialogHeader({
      title: $r('app.string.empty_cards_title'),
      actionLabel: this.检查中 ? $r('app.string.empty_cards_checking') :
        $r('app.string.' + EMPTY_CARDS_ACTIONS.refresh.titleKey),
      actionIcon: $r('app.media.' + EMPTY_CARDS_ACTIONS.refresh.iconKey),
      actionEnabled: !this.检查中 && !this.处理中,
      closeLabel: $r('app.string.close'),
      closeEnabled: !this.处理中,
      onClose: () => { this.handleBackRequest(); },
      onAction: () => { this.执行检查(); }
    })
  }

  @Builder
  private panelContent() {
    // 说明文案
    Text($r('app.string.empty_cards_description'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary'))
      .width('100%')

    // busy 指示
    if (this.检查中) {
      Row({ space: 应用尺寸.间距_8 }) {
        LoadingProgress()
          .width(20)
          .height(20)
          .color($r('app.color.text_secondary'))
        Text($r('app.string.empty_cards_checking'))
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
    }

    // 错误信息
    if (this.错误信息 !== '') {
      Text(this.错误信息)
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.error_text'))
        .width('100%')
    }

    // 检查结果
    if (this.已检查) {
        Column({ space: 应用尺寸.间距_4 }) {
          Row() {
            Text(this.取本地化带参文本($r('app.string.empty_cards_count'), [this.笔记列表.length]))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .fontWeight(FontWeight.Medium)
              .layoutWeight(1)
            if (this.笔记列表.length > 0) {
              按下态按钮({ 文案: this.全选状态() ?
                $r('app.string.' + EMPTY_CARDS_ACTIONS.deselect_all.titleKey) :
                $r('app.string.' + EMPTY_CARDS_ACTIONS.select_all.titleKey),
                themeText: true, 字色: this.主色按钮背景, singleLine: true,
                是否启用: !this.检查中 && !this.处理中,
                点击回调: (): void => { this.切换全选(); } })
            }
          }
          .width('100%')

          if (this.笔记列表.length === 0) {
            Text($r('app.string.empty_cards_none'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
          }

          ForEach(this.笔记列表, (笔记: 笔记空卡, 索引: number) => {
            this.笔记项行(索引)
          }, (笔记: 笔记空卡, 索引: number): string => `${笔记.笔记ID}|${this.选中状态[索引] ? 1 : 0}`)
        }
        .width('100%')

      按下态按钮({ 文案: $r('app.string.' + EMPTY_CARDS_ACTIONS.delete.titleKey),
        图标: $r('app.media.' + EMPTY_CARDS_ACTIONS.delete.iconKey),
        字色: $r('app.color.error_text'),
        是否启用: this.选中数量() > 0 && !this.检查中 && !this.处理中,
        点击回调: (): void => { this.确认删除(); } })
        .alignSelf(ItemAlign.End)

      // 处理中指示
      if (this.处理中) {
        Row({ space: 应用尺寸.间距_8 }) {
          LoadingProgress()
            .width(20)
            .height(20)
            .color($r('app.color.text_secondary'))
          Text($r('app.string.empty_cards_processing'))
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
      }
    }
  }

  build() {
    DialogFrame({ header: () => { this.panelHeader(); }, content: () => { this.panelContent(); },
      canDismiss: !this.处理中, onDismiss: (): void => { this.handleBackRequest(); } })
  }
}
