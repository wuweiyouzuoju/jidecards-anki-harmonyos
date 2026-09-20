// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-FIND-DUPES-001
// @名称 查找重复对话框
//
// @作用
// Anki 兼容的「查找重复笔记」功能：让用户选择笔记类型，扫描该类型所有笔记的
// 第一个字段，按字段值（trim + toLowerCase 归一化）分组，找出 count > 1 的重复组。
// 点击重复组跳转浏览页查看具体笔记。
//
// Anki 后端无 findDupes RPC，前端分组实现：
//   1. 搜索服务.搜索笔记({ search: `note:"类型名"`, order: { kind: 'none' } }) 取所有笔记 ID
//   2. 分批并发（每批 10 个）调 笔记服务.获取笔记 取 fields[0]
//   3. Map<string, number[]> 按归一化字段值分组
//   4. 过滤 count > 1，按重复数降序排列
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
// onJumpToBrowser: 跳转浏览页回调（参数为搜索串，由父组件走 NavPathStack 推栈）
//
// @输出
// 渲染查找重复对话框；用户操作时调后端 RPC 拉取笔记。
//
// @业务规则
// - 限制最多扫描 1000 个笔记，超过提示「笔记过多，请缩小范围」
// - 字段值归一化：trim + toLowerCase，避免大小写/空白差异漏判
// - 跳转浏览页搜索串：`note:"类型名" "字段值"`（字段值用引号包裹）
// - 所有用户可见文案走 $r('app.string.find_dupes_*')，禁止硬编码中文
// - 失败时错误信息显示在面板内（红字），不弹 toast
//
// @副作用
// 持有 搜索服务 / 笔记服务 / 笔记类型服务 实例；点击按钮时调后端 RPC（经 后端会话 → NAPI 桥）。
// ========================================================

import { 搜索服务 } from '../../backend/搜索服务';
import { 笔记服务 } from '../../backend/笔记服务';
import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import type { SearchRequest, SortOrder } from '../../proto/messages/SearchMessages';
import type { NotetypeNameId } from '../../proto/messages/NotetypeMessages';

/** 重复组：归一化字段值 + 笔记 ID 列表。 */
interface 重复组 {
  字段值: string;
  笔记ID列表: number[];
}

/** 取笔记第一字段的中间结果；失败或字段为空时 有效=false 不计入分组。 */
interface 笔记字段结果 {
  笔记ID: number;
  字段值: string;
  有效: boolean;
}

@Component
export struct 查找重复对话框 {
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onJumpToBrowser: (searchText: string) => void = (searchText: string): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 加载中: boolean = false;
  @State private 笔记类型列表: NotetypeNameId[] = [];
  @State private 选中类型索引: number = 0;
  @State private 重复组列表: 重复组[] = [];
  @State private 错误信息: string = '';
  @State private 展开组索引: number = -1;
  @State private 已扫描数: number = 0;
  @State private 总笔记数: number = 0;
  @State private 已查找: boolean = false;

  private readonly 搜索服务实例: 搜索服务 = new 搜索服务();
  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();

  /** 扫描上限：超过此数提示用户缩小范围（与 Anki 桌面端 findDupes 量级一致）。 */
  private readonly 扫描上限: number = 1000;
  /** 批量并发数：每批 10 个 笔记服务.获取笔记 并发拉取。 */
  private readonly 批量大小: number = 10;

  aboutToAppear(): void {
    this.加载笔记类型();
  }

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  private 取本地化带参文本(资源: Resource, 参数: Array<string | number>): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id, ...参数);
  }

  /** Select 选项：从笔记类型列表生成。 */
  private 类型选项(): SelectOption[] {
    const 选项: SelectOption[] = [];
    for (let i = 0; i < this.笔记类型列表.length; i++) {
      选项.push({ value: this.笔记类型列表[i].name });
    }
    return 选项;
  }

  private async 加载笔记类型(): Promise<void> {
    this.加载中 = true;
    this.错误信息 = '';
    try {
      this.笔记类型列表 = await this.笔记类型服务实例.获取笔记类型名列表();
      this.选中类型索引 = this.笔记类型列表.length > 0 ? 0 : -1;
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.加载中 = false;
    }
  }

  /** 字段值归一化：trim + toLowerCase，避免大小写/空白差异漏判。 */
  private 归一化(原始: string): string {
    return 原始.trim().toLowerCase();
  }

  /** 截断字段值到最大长度，避免超长字段撑爆 UI。 */
  private 截断(文本: string, 最大长度: number): string {
    return 文本.length > 最大长度 ? 文本.substring(0, 最大长度) + '…' : 文本;
  }

  private async 执行查找(): Promise<void> {
    if (this.加载中) {
      return;
    }
    if (this.笔记类型列表.length === 0 || this.选中类型索引 < 0) {
      return;
    }
    this.加载中 = true;
    this.错误信息 = '';
    this.重复组列表 = [];
    this.展开组索引 = -1;
    this.已扫描数 = 0;
    this.总笔记数 = 0;
    this.已查找 = false;
    try {
      const 类型名 = this.笔记类型列表[this.选中类型索引].name;
      // 搜索该类型所有笔记（类型名用引号包裹，避免带空格的类型名被解析为多个 token）
      const 顺序: SortOrder = { kind: 'none' };
      const 请求: SearchRequest = {
        search: `note:"${类型名}"`,
        order: 顺序
      };
      const 笔记IDs = await this.搜索服务实例.搜索笔记(请求);
      this.总笔记数 = 笔记IDs.length;
      if (笔记IDs.length > this.扫描上限) {
        this.错误信息 = this.取本地化文本($r('app.string.find_dupes_too_many'));
        return;
      }

      // 分批并发拉取笔记，取第一个字段值；Map 按归一化键分组
      const 分组 = new Map<string, number[]>();
      for (let 起点 = 0; 起点 < 笔记IDs.length; 起点 += this.批量大小) {
        const 终点 = Math.min(起点 + this.批量大小, 笔记IDs.length);
        const 批次: Promise<笔记字段结果>[] = [];
        for (let i = 起点; i < 终点; i++) {
          批次.push(this.取笔记第一字段(笔记IDs[i]));
        }
        const 结果 = await Promise.all(批次);
        for (let i = 0; i < 结果.length; i++) {
          const 项 = 结果[i];
          if (项.有效) {
            const 键 = this.归一化(项.字段值);
            const 已有 = 分组.get(键);
            if (已有 !== undefined) {
              已有.push(项.笔记ID);
            } else {
              分组.set(键, [项.笔记ID]);
            }
          }
        }
        this.已扫描数 = 终点;
      }

      // 过滤 count > 1 的组，按重复数降序
      const 重复: 重复组[] = [];
      分组.forEach((id列表: number[], 键: string) => {
        if (id列表.length > 1) {
          重复.push({ 字段值: 键, 笔记ID列表: id列表 });
        }
      });
      重复.sort((a: 重复组, b: 重复组): number => b.笔记ID列表.length - a.笔记ID列表.length);
      this.重复组列表 = 重复;
      this.已查找 = true;
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.加载中 = false;
    }
  }

  /** 拉单条笔记的第一字段值；失败返回 有效=false 不计入分组。 */
  private async 取笔记第一字段(笔记ID: number): Promise<笔记字段结果> {
    try {
      const 笔记 = await this.笔记服务实例.获取笔记(笔记ID);
      if (笔记.fields.length > 0) {
        return { 笔记ID, 字段值: 笔记.fields[0], 有效: true };
      }
      return { 笔记ID, 字段值: '', 有效: false };
    } catch (_错误) {
      return { 笔记ID, 字段值: '', 有效: false };
    }
  }

  /** 点击重复组：构造搜索串 `note:"类型名" "字段值"` 跳转浏览页。 */
  private 跳转浏览(组: 重复组): void {
    if (this.选中类型索引 < 0 || this.选中类型索引 >= this.笔记类型列表.length) {
      return;
    }
    const 类型名 = this.笔记类型列表[this.选中类型索引].name;
    const 搜索串 = `note:"${类型名}" "${组.字段值}"`;
    this.onJumpToBrowser(搜索串);
  }

  @Builder
  private 重复组行(索引: number) {
    Column({ space: 应用尺寸.间距_4 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        Column({ space: 2 }) {
          Text(this.截断(this.重复组列表[索引].字段值, 80))
            .fontSize(应用尺寸.字号_正文)
            .fontColor(设置面板色板_取(this.isDark).主文字)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)
          Text(this.取本地化带参文本($r('app.string.find_dupes_notes_in_group'),
            [this.重复组列表[索引].笔记ID列表.length]))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.isDark).弱化文字)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.isDark).弱化文字)
      }
      .width('100%')
      .onClick(() => { this.跳转浏览(this.重复组列表[索引]); })

      if (this.展开组索引 === 索引) {
        Column({ space: 2 }) {
          ForEach(this.重复组列表[索引].笔记ID列表, (id: number) => {
            Text(`#${id}`)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(设置面板色板_取(this.isDark).次文字)
          }, (id: number): string => `${id}`)
        }
        .width('100%')
        .padding({ left: 应用尺寸.间距_8 })
      }
    }
    .width('100%')
    .padding(应用尺寸.间距_8)
    .borderRadius(应用尺寸.圆角_面板)
    .backgroundColor(设置面板色板_取(this.isDark).标签背景)
  }

  build() {
    Stack() {
      // 磨砂玻璃遮罩层
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
          if (!this.加载中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        // 固定标题操作栏
        DialogHeader({
          title: $r('app.string.find_dupes_title'),
          actionLabel: $r('app.string.find_dupes_search'),
          actionEnabled: !this.加载中 && this.笔记类型列表.length > 0,
          closeLabel: $r('app.string.close'),
          closeEnabled: !this.加载中,
          onClose: () => { this.onClose(); },
          onAction: () => { this.执行查找(); }
        })

        // 笔记类型选择
        if (this.笔记类型列表.length > 0) {
          Row() {
            Text($r('app.string.find_dupes_select_notetype'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .layoutWeight(1)
            Select(this.类型选项())
              .selected(this.选中类型索引)
              .value(this.选中类型索引 >= 0 ? this.笔记类型列表[this.选中类型索引].name : '')
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number): void => {
                this.选中类型索引 = 索引;
                this.重复组列表 = [];
                this.已查找 = false;
                this.错误信息 = '';
              })
          }
          .width('100%')
        }

        // 查找按钮

        // busy 指示 + 进度
        if (this.加载中) {
          Row({ space: 应用尺寸.间距_8 }) {
            LoadingProgress()
              .width(20)
              .height(20)
              .color($r('app.color.action_primary'))
            Text(this.总笔记数 > 0
              ? this.取本地化带参文本($r('app.string.find_dupes_progress'),
                [this.已扫描数, this.总笔记数])
              : this.取本地化文本($r('app.string.find_dupes_searching')))
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

        // 查找结果
        if (this.已查找 && !this.加载中) {
          Scroll() {
            Column({ space: 应用尺寸.间距_8 }) {
              Text(this.取本地化带参文本($r('app.string.find_dupes_count'), [this.重复组列表.length]))
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .fontWeight(FontWeight.Medium)
                .width('100%')

              if (this.重复组列表.length === 0) {
                Text($r('app.string.find_dupes_no_duplicates'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                  .width('100%')
              }

              ForEach(this.重复组列表, (组: 重复组, 索引: number) => {
                this.重复组行(索引)
              }, (组: 重复组, 索引: number): string =>
                `${组.字段值}|${索引}|${this.展开组索引 === 索引 ? 1 : 0}`)
            }
            .width('100%')
          }
          .width('100%')
          .constraintSize({ maxHeight: 320 })
          .scrollBar(BarState.Auto)
          .edgeEffect(EdgeEffect.Spring)
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
