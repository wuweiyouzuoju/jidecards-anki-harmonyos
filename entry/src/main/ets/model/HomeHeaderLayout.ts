// SPDX-License-Identifier: AGPL-3.0-or-later
export const HOME_SUMMARY_HEIGHT: number = 168;
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

/** 更多独居左端，其余五个靠右；公共按钮尺寸由宿主传入，窄窗共同收缩。 */
export function homeHeaderGeometry(contentWidth: number, gap: number, showSummary: boolean,
  buttonSize: number): HomeHeaderGeometry {
  const width: number = Math.max(0, contentWidth);
  const spacing: number = Math.min(Math.max(0, gap), width / 40);
  const summaryWidth: number = showSummary ? width : 0;
  const compactCard: boolean = showSummary && summaryWidth < 260;
  const summaryHeight: number = HOME_SUMMARY_HEIGHT;
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
