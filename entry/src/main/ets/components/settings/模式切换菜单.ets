// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';


// ========================================================
// @名称 模式切换菜单
//
// @作用
// 设置页顶栏右上角「当前模式」按钮触发的下拉选择菜单（顶部弹出形态，纯 UI 积木）。
// 与 主页操作面板 同模式：透明承接层 + 右上角下拉的 2 个模式条目（简洁版/实验版）；
// 当前模式条目文字高亮主题色；不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 当前简洁模式：bool，true=简洁版选中，false=实验版选中；
// 主色：当前模式条目的高亮色；
// 顶部偏移：菜单卡片距面板顶部的距离（顶栏高度 + 间距，由 设置面板 传入）；
// 选择回调(简洁: boolean) / 关闭回调（均由 设置面板 注入）。
//
// @输出
// 渲染一个全屏 Stack：透明承接层 + 右上角下拉的 2 个模式条目。
//
// @Invariants
// - 与 主页操作面板/主页更多面板 同布局/同过渡：150ms 淡入 + 0.98 轻缩放，禁止位移
// - 锚定 TopEnd（右上角），与触发按钮（顶栏右侧）对齐
// - 条目为居中文字（用户裁定 2026-08-29 去掉 ✓ 标记），当前项仅文字高亮主色
//
// @副作用
// 无。选择与关闭事件通过回调上抛，由 设置面板 落库并关闭菜单。
// ========================================================

@Component
export struct 模式切换菜单 {
  @Prop 当前简洁模式: boolean = true;
  @Prop 主色: ResourceColor = $r('app.color.action_primary');
  @Prop 顶部偏移: number = 68;
  选择回调: (简洁: boolean) => void = (_简洁: boolean): void => {};
  关闭回调: () => void = (): void => {};

  build() {
    AnchoredMenu({ topOffset: this.顶部偏移, onClose: (): void => { this.关闭回调(); } }) {
      AnchoredMenuItem({ label: $r('app.string.settings_simple_mode_simple'), selected: this.当前简洁模式,
        onSelect: (): void => { this.选择回调(true); } })
      AnchoredMenuItem({ label: $r('app.string.settings_simple_mode_full'), selected: !this.当前简洁模式, divider: true,
        onSelect: (): void => { this.选择回调(false); } })
    }
  }
}
