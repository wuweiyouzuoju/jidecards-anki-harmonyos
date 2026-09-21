// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 浏览侧边栏
//
// @作用
// 浏览页 T6 侧边栏：抽屉式（左侧滑入），树形展示牌组 + 标签 + 已保存搜索三区。
// 点击节点触发对应搜索（替换搜索文本）；长按标签弹操作菜单（追加搜索/重命名/删除/补全）。
// 纯展示层组件，父级（浏览页）拥有全部后端调用与状态管理。
//
// @输入
// isDark: 是否深色主题
// busy: 父级是否正在加载树数据
// errorMessage: 父级下发的错误文案
// 牌组树: DeckTreeNode | null（null=未加载）
// 标签树: TagTreeNode | null（null=未加载）
// 已保存搜索列表: 已保存搜索项[]（空数组=无已保存搜索）
// 牌组折叠: boolean（true=分区折叠）
// 标签折叠: boolean
// 已保存搜索折叠: boolean
//
// @输出
// onClose: 关闭侧边栏回调
// onSelectDeck: (deckName: string) => void  点击牌组 → 替换搜索为 deck:"xxx"
// onSelectTag: (tagName: string) => void  点击标签 → 替换搜索为 tag:"xxx"
// onSelectSavedSearch: (search: string) => void  点击已保存搜索 → 替换搜索文本
// onAppendDeck: (deckName: string) => void  长按牌组 → 追加 AND deck:"xxx"
// onAppendTag: (tagName: string) => void  标签菜单「追加到搜索」→ 追加 AND tag:"xxx"
// onRenameTag: (tagName: string) => void  标签菜单「重命名」→ 弹重命名对话框
// onDeleteTag: (tagName: string) => void  标签菜单「删除」→ 弹删除确认
// onCompleteTag: (tagName: string) => void  标签菜单「补全」→ 执行标签补全
// onToggle折叠: (section: 'decks' | 'tags' | 'saved_searches') => void  切换分区折叠
//
// @Invariants
// - 本组件不直接调后端，所有操作经回调上抛
// - 树节点折叠（node.collapsed）由组件内部尊重，不展示折叠节点的 children
// - 分区折叠（section 级）由父级控制，组件仅渲染对应状态
// - 标签长按弹 ActionMenu（追加搜索/重命名/删除/补全），牌组长按仍直接追加 AND
//
// @Extension Points
// - 长按追加当前仅支持 AND，后续可扩展 AND/OR 切换（加顶部 Joiner 选择器）
// - 已保存搜索的管理（新增/删除/重命名）可扩展为独立对话框
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import type { BrowserSavedSearch as 已保存搜索项 } from '../../model/BrowserSidebar';
import { promptAction } from '@kit.ArkUI';
import { BusinessError } from '@ohos.base';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { TagTreeNode } from '../../proto/messages/TagsMessages';

/** 已保存搜索项（Anki 桌面端 savedSearches JSON 数组元素） */
export type { BrowserSavedSearch as 已保存搜索项 } from '../../model/BrowserSidebar';

/** 扁平化后的牌组行（含 level 驱动缩进） */
interface 牌组行 {
  name: string;
  level: number;
  deckId: number;
  totalInDeck: number;
}

/** 扁平化后的标签行（含 level 驱动缩进） */
interface 标签行 {
  name: string;
  level: number;
}

/** 侧边栏分区标识 */
type 侧边栏分区 = 'decks' | 'tags' | 'saved_searches';

@Component
export struct 浏览侧边栏 {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop 牌组树: DeckTreeNode | null = null;
  @Prop 标签树: TagTreeNode | null = null;
  @Prop 已保存搜索列表: 已保存搜索项[] = [];
  @Prop 牌组折叠: boolean = false;
  @Prop 标签折叠: boolean = false;
  @Prop 已保存搜索折叠: boolean = false;

  onClose: () => void = (): void => {};
  onSelectDeck: (deckName: string) => void = (_name: string): void => {};
  onSelectTag: (tagName: string) => void = (_name: string): void => {};
  onSelectSavedSearch: (search: string) => void = (_search: string): void => {};
  onAppendDeck: (deckName: string) => void = (_name: string): void => {};
  onAppendTag: (tagName: string) => void = (_name: string): void => {};
  onRenameTag: (tagName: string) => void = (_name: string): void => {};
  onDeleteTag: (tagName: string) => void = (_name: string): void => {};
  onCompleteTag: (tagName: string) => void = (_name: string): void => {};
  onToggle折叠: (section: 侧边栏分区) => void = (_section: 侧边栏分区): void => {};
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  /** 扁平化牌组树为行数组（尊重 node.collapsed，折叠的节点不展开 children）。 */
  private 扁平化牌组树(): 牌组行[] {
    if (this.牌组树 === null) {
      return [];
    }
    const 行: 牌组行[] = [];
    this.遍历牌组节点(this.牌组树, 行);
    return 行;
  }

  /** 递归遍历牌组节点（跳过根节点的 name，根节点 name 通常为空）。 */
  private 遍历牌组节点(节点: DeckTreeNode, 输出: 牌组行[]): void {
    for (const 子节点 of 节点.children) {
      输出.push({
        name: 子节点.name,
        level: 子节点.level,
        deckId: 子节点.deckId,
        totalInDeck: 子节点.totalInDeck
      });
      if (!子节点.collapsed && 子节点.children.length > 0) {
        this.遍历牌组节点(子节点, 输出);
      }
    }
  }

  /** 扁平化标签树为行数组（尊重 node.collapsed）。 */
  private 扁平化标签树(): 标签行[] {
    if (this.标签树 === null) {
      return [];
    }
    const 行: 标签行[] = [];
    this.遍历标签节点(this.标签树, 行);
    return 行;
  }

  /** 递归遍历标签节点（跳过根节点，根节点 name 通常为空）。 */
  private 遍历标签节点(节点: TagTreeNode, 输出: 标签行[]): void {
    for (const 子节点 of 节点.children) {
      输出.push({
        name: 子节点.name,
        level: 子节点.level
      });
      if (!子节点.collapsed && 子节点.children.length > 0) {
        this.遍历标签节点(子节点, 输出);
      }
    }
  }

  /** 分区标题折叠图标：折叠显示 +，展开显示 −。 */
  private 折叠图标(折叠: boolean): string {
    return 折叠 ? '+' : '−';
  }

  build() {
    Stack({ alignContent: Alignment.Start }) {
      // 遮罩层：点击关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {
          if (!this.busy) {
            this.onClose();
          }
        })

      // 侧边栏主面板（左侧 80% 宽度）
      Column() {
        // 头部：标题 + 关闭按钮
        Row() {
          Text($r('app.string.browser_sidebar_title'))
            .fontSize(应用尺寸.字号_面板标题)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
          Blank()
          Button('×')
            .height(应用尺寸.按钮高度)
            .width(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_面板标题)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick((): void => {
              this.onClose();
            })
        }
        .width('100%')
        .height(56 + this.状态栏高度)
        .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16, top: this.状态栏高度 })
        .alignItems(VerticalAlign.Center)

        // 错误提示
        if (this.errorMessage !== '') {
          Text(this.errorMessage)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
              top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
        }

        // 滚动内容区
        Scroll() {
          Column() {
            // 牌组分区
            this.分区标题($r('app.string.browser_sidebar_decks'), this.牌组折叠, 'decks')
            if (!this.牌组折叠) {
              if (this.牌组树 === null) {
                this.空提示()
              } else {
                ForEach(this.扁平化牌组树(), (行: 牌组行): void => {
                  this.牌组节点行(行)
                }, (行: 牌组行): string => `${行.deckId}-${行.name}`)
              }
            }

            // 标签分区
            this.分区标题($r('app.string.browser_sidebar_tags'), this.标签折叠, 'tags')
            if (!this.标签折叠) {
              if (this.标签树 === null) {
                this.空提示()
              } else {
                ForEach(this.扁平化标签树(), (行: 标签行): void => {
                  this.标签节点行(行)
                }, (行: 标签行, 索引: number): string => `${索引}-${行.name}`)
              }
            }

            // 已保存搜索分区
            this.分区标题($r('app.string.browser_sidebar_saved_searches'), this.已保存搜索折叠, 'saved_searches')
            if (!this.已保存搜索折叠) {
              if (this.已保存搜索列表.length === 0) {
                this.空提示()
              } else {
                ForEach(this.已保存搜索列表, (项: 已保存搜索项): void => {
                  this.已保存搜索行(项)
                }, (项: 已保存搜索项, 索引: number): string => `${索引}-${项.name}`)
              }
            }
          }
          .width('100%')
          .padding({ bottom: 应用尺寸.间距_16 })
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)
      }
      .width('80%')
      .height('100%')
      .backgroundColor($r('app.color.surface_page'))
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    }
    .width('100%')
    .height('100%')
  }

  /** 分区标题行：折叠图标 + 标题 + 计数。 */
  @Builder
  分区标题(标题: Resource, 折叠: boolean, 分区: 侧边栏分区) {
    Row({ space: 应用尺寸.间距_8 }) {
      Text(this.折叠图标(折叠))
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
        .width(16)
      Text(标题)
        .fontSize(应用尺寸.字号_正文)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
      top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_8 })
    .backgroundColor($r('app.color.surface_card'))
    .onClick((): void => {
      this.onToggle折叠(分区);
    })
  }

  /** 空提示行（树未加载或无数据时显示）。 */
  @Builder
  空提示() {
    Text($r('app.string.browser_sidebar_empty'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_tertiary'))
      .width('100%')
      .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
        top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
  }

  /** 牌组节点行：缩进 + 名称 + 计数。短按替换搜索，长按追加 AND。 */
  @Builder
  牌组节点行(行: 牌组行) {
    Row() {
      Blank()
        .width(行.level * 应用尺寸.间距_12)
      Text(行.name)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (行.totalInDeck > 0) {
        Text(String(行.totalInDeck))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_tertiary'))
      }
    }
    .width('100%')
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
      top: 应用尺寸.间距_10, bottom: 应用尺寸.间距_10 })
    .onClick((): void => {
      this.onSelectDeck(行.name);
    })
    .gesture(
      LongPressGesture({ repeat: false, duration: 500 })
        .onAction((): void => {
          this.onAppendDeck(行.name);
        })
    )
  }

  /** 标签节点行：缩进 + 名称。短按替换搜索，长按弹操作菜单。 */
  @Builder
  标签节点行(行: 标签行) {
    Row() {
      Blank()
        .width(行.level * 应用尺寸.间距_12)
      Text(行.name)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
      top: 应用尺寸.间距_10, bottom: 应用尺寸.间距_10 })
    .onClick((): void => {
      this.onSelectTag(行.name);
    })
    .gesture(
      LongPressGesture({ repeat: false, duration: 500 })
        .onAction((): void => {
          this.显示标签操作菜单(行.name);
        })
    )
  }

  /** 标签长按操作菜单：追加到搜索 / 重命名 / 删除 / 补全。 */
  private 显示标签操作菜单(标签名: string): void {
    promptAction.showActionMenu({
      title: $r('app.string.browser_tag_actions'),
      buttons: [
        { text: $r('app.string.browser_tag_append_search'), color: $r('app.color.text_primary') },
        { text: $r('app.string.browser_tag_rename'), color: $r('app.color.text_primary') },
        { text: $r('app.string.browser_tag_delete'), color: $r('app.color.error_text') },
        { text: $r('app.string.browser_tag_complete'), color: $r('app.color.text_primary') }
      ]
    }, (err: BusinessError, data: promptAction.ActionMenuSuccessResponse): void => {
      if (err !== null) {
        return;
      }
      const index: number = data.index;
      if (index === 0) {
        this.onAppendTag(标签名);
      } else if (index === 1) {
        this.onRenameTag(标签名);
      } else if (index === 2) {
        this.onDeleteTag(标签名);
      } else if (index === 3) {
        this.onCompleteTag(标签名);
      }
    });
  }

  /** 已保存搜索行：名称。短按替换搜索文本。 */
  @Builder
  已保存搜索行(项: 已保存搜索项) {
    Row() {
      Text(项.name)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
      top: 应用尺寸.间距_10, bottom: 应用尺寸.间距_10 })
    .onClick((): void => {
      this.onSelectSavedSearch(项.search);
    })
  }
}
