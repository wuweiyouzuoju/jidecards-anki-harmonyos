import { IconActionButton } from '../common/IconActionButton';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { PressFeedback } from '../../utils/PressFeedback';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { DirectoryTree } from '../common/DirectoryTree';
import { DirectoryRow, DirectoryView } from '../../model/DirectoryTree';
import { deckDirectoryRows } from '../../model/DeckDirectory';
import { appInterface } from '../../backend/AppInterfaceService';

// ========================================================
// @名称 浏览侧边栏
//
// @作用
// 浏览页 T6 侧边栏：抽屉式（左侧滑入），树形展示牌组 + 标签 + 已保存搜索三区。
// 点击完整标签路径搜索；长按管理标签，展开箭头与搜索点击分别处理。
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
// onToggleTag / onClearUnusedTags：持久化展开状态 / 清理未用标签
// onToggle折叠: (section: 'decks' | 'tags' | 'saved_searches') => void  切换分区折叠
//
// @Invariants
// - 本组件不直接调后端，所有操作经回调上抛
// - 牌组目录从 Core 折叠状态初始化，公共树在侧栏内独立展开；不写首页折叠状态
// - 分区折叠（section 级）由父级控制，组件仅渲染对应状态
// - 标签长按弹 ActionMenu（追加搜索/重命名/删除），牌组长按仍直接追加 AND
//
// @Extension Points
// - 长按追加当前仅支持 AND，后续可扩展 AND/OR 切换（加顶部 Joiner 选择器）
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import type { BrowserSavedSearch as 已保存搜索项 } from '../../model/BrowserSidebar';
import { promptAction } from '@kit.ArkUI';
import { BusinessError } from '@ohos.base';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { AnchoredMenuItem } from '../common/MenuItem';
import { TagTreeList } from '../common/TagTreeList';
import { TagRow, flattenTagTree } from '../../model/NoteTags';
import { 颜色键 } from '../../model/颜色主题';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { TagTreeNode } from '../../proto/messages/TagsMessages';

/** 已保存搜索项（Anki/AnkiDroid savedFilters JSON 映射展开后的元素） */
export type { BrowserSavedSearch as 已保存搜索项 } from '../../model/BrowserSidebar';

/** 侧边栏分区标识 */
type 侧边栏分区 = 'decks' | 'tags' | 'saved_searches';

@Component
export struct 浏览侧边栏 {
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop tagWriteBusy: boolean = false;
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
  onRenameSavedSearch: (item: 已保存搜索项) => void = (_item: 已保存搜索项): void => {};
  onDeleteSavedSearch: (item: 已保存搜索项) => void = (_item: 已保存搜索项): void => {};
  onAppendDeck: (deckName: string) => void = (_name: string): void => {};
  onAppendTag: (tagName: string) => void = (_name: string): void => {};
  onRenameTag: (tagName: string) => void = (_name: string): void => {};
  onDeleteTag: (tagName: string) => void = (_name: string): void => {};
  onToggleTag: (tagName: string) => void = (_name: string): void => {};
  onClearUnusedTags: () => void = (): void => {};
  private disposed: boolean = false;
  aboutToDisappear(): void { this.disposed = true; }
  onToggle折叠: (section: 侧边栏分区) => void = (_section: 侧边栏分区): void => {};
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  private deckRows(): DirectoryRow[] { return deckDirectoryRows(this.牌组树, 0, true); }
  private selectDeck(id: string, append: boolean = false): void {
    if (this.busy) return;
    const row: DirectoryRow | undefined = this.deckRows().find((item: DirectoryRow): boolean => item.id === id);
    if (row !== undefined) { if (append) this.onAppendDeck(row.path); else this.onSelectDeck(row.path); }
  }

  /** 保留完整标签路径和折叠状态；可见行与搜索交给公共树。 */
  private 扁平化标签树(): TagRow[] {
    return this.标签树 === null ? [] : flattenTagTree(this.标签树);
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
          IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_close'), label: $r('app.string.icon_sidebar_close'),
            onAction: (): void => { this.onClose(); } })
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
            Column() {
            AnchoredMenuItem({ label: $r('app.string.browser_sidebar_decks'), disclosure: true, expanded: !this.牌组折叠,
              onSelect: (): void => { this.onToggle折叠('decks'); } })
            if (!this.牌组折叠) {
              if (this.牌组树 === null) {
                this.空提示()
              } else {
                Column() {
                  DirectoryTree({ rows: this.deckRows(), isInteractive: !this.busy, framed: false,
                    selectionMode: 'none', revealSelection: false,
                    onSelect: (id: string): void => { this.selectDeck(id); },
                    onLongPress: (id: string): void => { this.selectDeck(id, true); },
                    onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('browser_decks', view); } })
                }.width('100%').padding(应用尺寸.卡片内边距)
              }
            }
            }.width('100%').backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_指标卡).clip(true)
              .margin({ bottom: 应用尺寸.页面分组间距(this.narrowDeckLayout) })

            // 标签分区
            Column() {
            AnchoredMenuItem({ label: $r('app.string.browser_sidebar_tags'), disclosure: true, expanded: !this.标签折叠,
              onSelect: (): void => { this.onToggle折叠('tags'); } })
            if (!this.标签折叠) {
              if (this.标签树 === null) {
                this.空提示()
              } else {
                Column() {
                    TagTreeList({ rows: this.扁平化标签树(), searchable: true, isInteractive: !this.busy && !this.tagWriteBusy,
                      onSelect: (name: string): void => { this.onSelectTag(name); },
                      onToggle: (name: string): void => { this.onToggleTag(name); },
                      onLongPress: (name: string): void => { this.显示标签操作菜单(name); },
                      onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('browser_tags', view); } })
                }.width('100%').padding(应用尺寸.卡片内边距)
                AnchoredMenuItem({ label: $r('app.string.settings_clear_unused_tags'),
                  available: !this.busy && !this.tagWriteBusy,
                  onSelect: (): void => { this.onClearUnusedTags(); } })
              }
            }
            }.width('100%').backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_指标卡).clip(true)
              .margin({ bottom: 应用尺寸.页面分组间距(this.narrowDeckLayout) })

            // 已保存搜索分区
            Column() {
            AnchoredMenuItem({ label: $r('app.string.browser_sidebar_saved_searches'), disclosure: true, expanded: !this.已保存搜索折叠,
              onSelect: (): void => { this.onToggle折叠('saved_searches'); } })
            if (!this.已保存搜索折叠) {
              if (this.已保存搜索列表.length === 0) {
                this.空提示()
              } else {
                ForEach(this.已保存搜索列表, (项: 已保存搜索项): void => {
                  this.已保存搜索行(项)
                }, (项: 已保存搜索项, 索引: number): string => `${索引}-${项.name}`)
              }
            }
            }.width('100%').backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_指标卡).clip(true)
              .margin({ bottom: 应用尺寸.页面分组间距(this.narrowDeckLayout) })

          }
          .width('100%')
          .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout), bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout) })
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

  /** 标签长按操作菜单：追加到搜索 / 重命名 / 删除。 */
  private 显示标签操作菜单(标签名: string): void {
    if (this.disposed || this.busy || this.tagWriteBusy) return;
    this.getUIContext().getPromptAction().showActionMenu({
      title: $r('app.string.browser_tag_actions'),
      buttons: [
        { text: $r('app.string.browser_tag_append_search'), color: $r('app.color.text_primary') },
        { text: $r('app.string.browser_tag_rename'), color: $r('app.color.text_primary') },
        { text: $r('app.string.browser_tag_delete'), color: $r('app.color.error_text') }
      ]
    }, (err: BusinessError, data: promptAction.ActionMenuSuccessResponse): void => {
      if (err !== null || this.disposed || this.busy || this.tagWriteBusy) {
        return;
      }
      const index: number = data.index;
      if (index === 0) {
        this.onAppendTag(标签名);
      } else if (index === 1) {
        this.onRenameTag(标签名);
      } else if (index === 2) {
        this.onDeleteTag(标签名);
      }
    });
  }

  /** 已保存搜索行：名称。短按替换搜索文本。 */
  private 显示保存搜索操作菜单(项: 已保存搜索项): void {
    if (this.disposed || this.busy) return;
    this.getUIContext().getPromptAction().showActionMenu({
      title: $r('app.string.browser_saved_search_actions'),
      buttons: [
        { text: $r('app.string.browser_saved_search_rename'), color: $r('app.color.text_primary') },
        { text: $r('app.string.browser_saved_search_delete'), color: $r('app.color.error_text') }
      ]
    }, (err: BusinessError, data: promptAction.ActionMenuSuccessResponse): void => {
      if (err !== null || this.disposed || this.busy) return;
      if (data.index === 0) this.onRenameSavedSearch(项);
      if (data.index === 1) this.onDeleteSavedSearch(项);
    });
  }

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
    .attributeModifier(new PressFeedback())
    .onClick((): void => {
      this.onSelectSavedSearch(项.search);
    })
    .gesture(LongPressGesture({ repeat: false, duration: 500 }).onAction((): void => {
      this.显示保存搜索操作菜单(项);
    }))
  }
}
