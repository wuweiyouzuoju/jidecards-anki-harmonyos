// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppInterfaceItem, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';

// ========================================================
// @名称 主页更多面板
//
// @作用
// 首页"更多"按钮触发的下拉动作菜单（顶部弹出形态，纯 UI 积木）。
// 与 主页操作面板 同模式：透明承接层 + 左上角下拉动作条目。
// 触发按钮在左上角，菜单锚定其下方弹出，手指零移动；
// 不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 设置回调 / onSync / 浏览回调 / 统计回调 / 关闭回调（均由父级 Index 注入）。
//
// @输出
// 渲染透明承接层和左上角下拉动作菜单。
//
// @Invariants
// - 与 主页操作面板 同布局/同过渡：150ms 淡入 + 0.98 轻缩放，禁止位移
// - 锚定 TopStart（左上角），与 主页操作面板 的 TopEnd（右上角）对称
//
// @Extension Points
// - 条目数量可扩展（如未来加"导出数据"等）
//
// @副作用
// 无。点击事件通过回调上抛，由父级处理实际跳转。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';

@Component
export struct 主页更多面板 {
  onAgent: () => void = (): void => {};
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private Agent入口已启用: boolean = false;
  设置回调: () => void = (): void => {};
  onSync: () => void = (): void => {};
  浏览回调: () => void = (): void => {};
  统计回调: () => void = (): void => {};
  提醒回调: () => void = (): void => {};
  onIntro: () => void = (): void => {};
  关闭回调: () => void = (): void => {};
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  private menuItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('home_more', { simple: false, agent: this.Agent入口已启用, cloudDeck: false, themeHasTextures: false });
  }

  private selectItem(id: string): void {
    switch (id) {
      case 'settings': this.设置回调(); break;
      case 'agent': this.onAgent(); break;
      case 'sync': this.onSync(); break;
      case 'browser': this.浏览回调(); break;
      case 'stats': this.统计回调(); break;
      case 'reminders': this.提醒回调(); break;
      case 'intro': this.onIntro(); break;
    }
  }

  private publishInterface(): void {
    const items: AppInterfaceItem[] = this.menuItems();
    appInterface.observe({ surface: 'home_more', sectionId: '', selectedId: '',
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => namedResourceText(this.getUIContext(), item.titleKey)), busy: false });
  }
  aboutToAppear(): void { this.publishInterface(); }
  aboutToDisappear(): void { appInterface.leave('home_more'); }

  build() {
    AnchoredMenu({ menuWidth: 应用尺寸.compactMenuWidth, alignEnd: false,
      contentMaxWidth: 应用尺寸.内容最大宽度,
      topOffset: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout),
      onClose: (): void => { this.关闭回调(); } }) {
      ForEach(this.menuItems(), (item: AppInterfaceItem, index: number) => {
        AnchoredMenuItem({ label: namedResourceText(this.getUIContext(), item.titleKey), divider: index > 0,
          onSelect: (): void => { this.selectItem(item.id); } })
      }, (item: AppInterfaceItem): string => item.id)
    }
  }
}
