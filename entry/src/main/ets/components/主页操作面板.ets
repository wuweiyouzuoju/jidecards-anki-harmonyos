// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from './common/AnchoredMenu';
import { AnchoredMenuItem } from './common/MenuItem';

import { 应用尺寸 } from '../utils/应用尺寸';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';
import { 简洁模式AppStorage键 } from '../model/简洁模式存储';

// ========================================================
// @块ID COMP-HOME-ACTION-001
// @名称 主页操作面板
//
// @作用
// 首页动作菜单（顶部弹出形态，纯 UI 积木）。
// 触发按钮在右上角，菜单锚定其下方弹出，手指零移动；
// 普通下拉式打开：不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 创建牌组回调 / 导入牌组回调 / 关闭回调（均由父级 Index 注入）。
//
// @输出
// 渲染全局创建与导入入口；高级入口和下载渠道按当前模式及发布配置显示。
//
// @业务规则
// 不加遮罩：透明层仅承接点击关闭，不遮暗不模糊。
// 入场只使用轻微缩放与淡入，不位移、不阻塞菜单操作。
//
// @副作用
// 无。点击事件通过回调上抛，由父级处理实际跳转。
// ========================================================

@Component
export struct 主页操作面板 {
  创建牌组回调: () => void = (): void => {};
  onCreateFilteredDeck: () => void = (): void => {};
  导入牌组回调: () => void = (): void => {};
  AI制卡回调: () => void = (): void => {};
  AI改卡回调: () => void = (): void => {};
  /** 由父级按渠道开关和下载配额决定是否显示。 */
  @Prop 显示获取直链牌组: boolean = false;
  获取直链牌组回调: () => void = (): void => {};
  关闭回调: () => void = (): void => {};
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;

  build() {
    AnchoredMenu({ menuWidth: !this.简洁模式 || this.Agent入口已启用 || this.显示获取直链牌组 ? 应用尺寸.extendedMenuWidth : 应用尺寸.compactMenuWidth, alignEnd: true,
      contentMaxWidth: 应用尺寸.内容最大宽度,
      topOffset: 应用尺寸.工具栏高度 + this.状态栏高度 + 应用尺寸.pageContentTopInset,
      onClose: (): void => { this.关闭回调(); } }) {
      AnchoredMenuItem({ label: $r('app.string.create_deck_title'), divider: false,
        onSelect: (): void => { this.创建牌组回调(); } })
      if (!this.简洁模式) {
        AnchoredMenuItem({ label: $r('app.string.filtered_deck_title'), divider: true,
          onSelect: (): void => { this.onCreateFilteredDeck(); } })
      }
      AnchoredMenuItem({ label: $r('app.string.transfer_import_deck'), divider: true,
        onSelect: (): void => { this.导入牌组回调(); } })
      if (this.Agent入口已启用) {
      AnchoredMenuItem({ label: $r('app.string.ai_card_title'), divider: true,
        onSelect: (): void => { this.AI制卡回调(); } })
      }
      if (this.Agent入口已启用) {
      AnchoredMenuItem({ label: $r('app.string.ai_card_edit'), divider: true,
        onSelect: (): void => { this.AI改卡回调(); } })
      }
      if (this.显示获取直链牌组) {
      AnchoredMenuItem({ label: $r('app.string.cloud_deck_menu_entry'), divider: true,
        onSelect: (): void => { this.获取直链牌组回调(); } })
      }
    }
  }
}
