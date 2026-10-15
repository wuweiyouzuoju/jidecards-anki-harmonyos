// SPDX-License-Identifier: AGPL-3.0-or-later
/** 图标绘制、触摸范围与标题排版各自独立；热区不能变成标题的占位框。 */
export class HelpLayout {
  static readonly iconSize: number = 18;
  static readonly touchSize: number = 44;
  static readonly titleGap: number = 4;

  static hitRegion(): Rectangle {
    const outset: number = (HelpLayout.touchSize - HelpLayout.iconSize) / 2;
    return { x: -outset, y: -outset, width: HelpLayout.touchSize, height: HelpLayout.touchSize };
  }

  static titleMaxWidth(centered: boolean, showHelp: boolean, showAction: boolean = false): string {
    if (!showHelp && !showAction) return '100%';
    // 居中标题两侧对称限制长文字，帮助仍是绝对定位，不参与居中计算。
    // 双图标间隔一个完整热区；额外动作同时为最右侧帮助的热区留位。
    const trailing: number = showAction ? HelpLayout.titleGap + HelpLayout.iconSize +
      (HelpLayout.touchSize - HelpLayout.iconSize) / 2 + (showHelp ? HelpLayout.touchSize : 0) :
      HelpLayout.iconSize + HelpLayout.titleGap;
    const reserve: number = trailing * (centered ? 2 : 1);
    return 'calc(100% - ' + String(reserve) + 'vp)';
  }

  static titleHelpPosition(width: number, height: number, showAction: boolean = false): Position {
    return { x: width + HelpLayout.titleGap + (showAction ? HelpLayout.touchSize : 0),
      y: (height - HelpLayout.iconSize) / 2 };
  }

  static titleActionPosition(width: number, height: number): Position {
    return { x: width + HelpLayout.titleGap - (HelpLayout.touchSize - HelpLayout.iconSize) / 2,
      y: (height - HelpLayout.touchSize) / 2 };
  }
}
