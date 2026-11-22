// SPDX-License-Identifier: AGPL-3.0-or-later
export const HOME_SUMMARY_HEIGHT: number = 168;
export const HOME_SUMMARY_PAGE_COUNT: number = 8;

export function homeSummaryCardCount(desktop: boolean, contentWidth: number, gap: number): number {
  return desktop && contentWidth >= 480 + gap ? 2 : 1;
}

export function isHomeSummaryPage(page: number): boolean {
  return Number.isInteger(page) && page >= 0 && page < HOME_SUMMARY_PAGE_COUNT;
}
export interface HomeActionAnchor {
  left: number;
  top: number;
  width: number;
}
export interface HomeHeaderGeometry {
  summaryWidth: number;
  summaryHeight: number;
  actionGap: number;
  actionSeparation: number;
  trailingWidth: number;
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
  sectionGap: number;
  countRowGap: number;
  bottomPadding: number;
}

/** 放大字体后的窄窗口改为数字与完整标签逐行排列，避免三列强挤长单词。 */
export function homeSummaryStacksMetrics(contentWidth: number, fontScale: number): boolean {
  return fontScale > 1 && contentWidth / fontScale < 360;
}

/** 分页指示点独占顶部留白；八页共用标题槽、正文区和图表基线。 */
export function homeSummaryGeometry(cardHeight: number, compact: boolean, indicatorSpace: number = 10,
  fontScale: number = 1, compactLandscape: boolean = false): HomeSummaryGeometry {
  const padding: number = compact ? 12 : 16;
  const topPadding: number = (compactLandscape ? 10 : padding) + indicatorSpace;
  const bottomPadding: number = compactLandscape ? 8 : padding;
  const titleHeight: number = (compactLandscape ? 22 : 24) * Math.max(1, fontScale);
  const sectionGap: number = compactLandscape ? 4 : 8;
  const bodyHeight: number = Math.max(0, cardHeight - topPadding - bottomPadding - titleHeight - sectionGap);
  return { padding, topPadding, bottomPadding, titleHeight, sectionGap, bodyHeight,
    countRowGap: sectionGap, chartHeight: Math.max(0, bodyHeight - 20) };
}

/** 更多独居左端，其余五个靠右；公共按钮尺寸由宿主传入，窄窗共同收缩。 */
export function homeHeaderGeometry(contentWidth: number, gap: number, showSummary: boolean,
  buttonSize: number, fontScale: number = 1, densityScale: number = 1): HomeHeaderGeometry {
  const width: number = Math.max(0, contentWidth);
  const spacing: number = Math.min(Math.max(0, gap), width / 40);
  const summaryWidth: number = showSummary ? width : 0;
  const compactCard: boolean = showSummary && summaryWidth < 260;
  const summaryHeight: number = HOME_SUMMARY_HEIGHT * Math.max(1, fontScale) * densityScale;
  const controlWidth: number = Math.min(Math.max(0, buttonSize), Math.max(0, (width - spacing * 5) / 6));
  const controlHeight: number = controlWidth;
  const trailingWidth: number = controlWidth * 5 + spacing * 4;
  const actionSeparation: number = Math.max(0, width - controlWidth - trailingWidth);
  return { summaryWidth: summaryWidth, summaryHeight: summaryHeight, actionGap: spacing,
    actionSeparation: actionSeparation, trailingWidth: trailingWidth,
    actionsHeight: controlHeight, controlWidth: controlWidth, controlHeight: controlHeight,
    controlGlyphSize: Math.min(18, controlWidth * 0.46, controlHeight * 0.46),
    compactCard: compactCard };
}
