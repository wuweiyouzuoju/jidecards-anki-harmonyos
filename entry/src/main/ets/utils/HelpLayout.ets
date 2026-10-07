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

  static titleMaxWidth(centered: boolean, showHelp: boolean): string {
    if (!showHelp) return '100%';
    // 居中标题两侧对称限制长文字，帮助仍是绝对定位，不参与居中计算。
    const reserve: number = (HelpLayout.iconSize + HelpLayout.titleGap) * (centered ? 2 : 1);
    return 'calc(100% - ' + String(reserve) + 'vp)';
  }

  static titleHelpPosition(width: number, height: number): Position {
    return { x: width + HelpLayout.titleGap, y: (height - HelpLayout.iconSize) / 2 };
  }
}
