// SPDX-License-Identifier: AGPL-3.0-or-later
export const HOME_SUMMARY_HEIGHT: number = 168;
export interface HomeHeaderGeometry {
  summaryWidth: number;
  summaryHeight: number;
  actionGap: number;
  actionsHeight: number;
  controlWidth: number;
  controlHeight: number;
  controlGlyphSize: number;
  compactCard: boolean;
}

export interface HomeSummaryGeometry {
  padding: number;
  topPadding: number;
  titleHeight: number;
  bodyHeight: number;
  chartHeight: number;
}

/** 分页指示点独占顶部留白；八页共用标题槽、正文区和图表基线。 */
export function homeSummaryGeometry(cardHeight: number, compact: boolean, indicatorSpace: number = 10): HomeSummaryGeometry {
  const padding: number = compact ? 12 : 16;
  const topPadding: number = padding + indicatorSpace;
  const titleHeight: number = 24;
  const bodyHeight: number = Math.max(0, cardHeight - topPadding - padding - titleHeight - 8);
  return { padding: padding, topPadding: topPadding, titleHeight: titleHeight,
    bodyHeight: bodyHeight, chartHeight: Math.max(0, bodyHeight - 20) };
}

/** 六个按钮始终横排；按实测宽度共同收缩间距、点击区和图标，保留两端菜单锚点。 */
export function homeHeaderGeometry(contentWidth: number, gap: number, showSummary: boolean): HomeHeaderGeometry {
  const width: number = Math.max(0, contentWidth);
  const spacing: number = Math.min(Math.max(0, gap), width / 40);
  const summaryWidth: number = showSummary ? width : 0;
  const compactCard: boolean = showSummary && summaryWidth < 260;
  const summaryHeight: number = HOME_SUMMARY_HEIGHT;
  const controlWidth: number = Math.max(0, (width - spacing * 5) / 6);
  const controlHeight: number = Math.min(56, Math.max(44, controlWidth));
  return { summaryWidth: summaryWidth, summaryHeight: summaryHeight, actionGap: spacing,
    actionsHeight: controlHeight, controlWidth: controlWidth, controlHeight: controlHeight,
    controlGlyphSize: Math.min(28, controlWidth * 0.46, controlHeight * 0.46),
    compactCard: compactCard };
}
