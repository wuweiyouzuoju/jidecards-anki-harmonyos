// SPDX-License-Identifier: AGPL-3.0-or-later
import type { OcclusionPoint } from './图片遮罩模型';

export interface OcclusionEditorSize { width: number; height: number; }
export interface OcclusionEditorBounds extends OcclusionEditorSize { left: number; top: number; }
export interface OcclusionTextExtent { width: number; ascent: number; descent: number; }
export interface OcclusionTextLayout extends OcclusionEditorBounds { lineHeight: number; }

/** 图像独占实际比例，不用工具区和图片区的权重分配制造上下留白。 */
export function occlusionStageSize(width: number, viewportHeight: number, ratio: number): OcclusionEditorSize {
  const available: number = Math.max(1, width);
  if (ratio <= 0) return { width: available, height: 160 };
  const height: number = Math.min(available / ratio, Math.max(160, viewportHeight * 0.7));
  return { width: Math.min(available, height * ratio), height: height };
}

/** 与 reviewer 相同的行距；选择框只包住实际字形，不在末行下再添加整行。 */
export function occlusionTextLayout(extents: OcclusionTextExtent[], fontSize: number,
  referenceHeight: number): OcclusionTextLayout {
  const lineHeight: number = (Number.isFinite(referenceHeight) && referenceHeight > 0 ? referenceHeight : fontSize) * 1.5;
  let width: number = 0;
  let top: number = Infinity;
  let bottom: number = -Infinity;
  for (let i: number = 0; i < extents.length; i++) {
    const metrics: OcclusionTextExtent = extents[i];
    width = Math.max(width, metrics.width);
    if (metrics.width <= 0) continue;
    const valid: boolean = Number.isFinite(metrics.ascent) && Number.isFinite(metrics.descent) &&
      metrics.ascent + metrics.descent > 0;
    top = Math.min(top, i * lineHeight - (valid ? metrics.ascent : 0));
    bottom = Math.max(bottom, i * lineHeight + (valid ? metrics.descent : fontSize));
  }
  if (!Number.isFinite(top)) { top = 0; bottom = fontSize; }
  return { left: -2, top: top - 2, width: width + 4, height: bottom - top + 4, lineHeight: lineHeight };
}

/** 旋转后的实际外缘也参与移动限制；大于图像的导入图形允许在两侧之间移动。 */
export function clampOcclusionOrigin(left: number, top: number, bounds: OcclusionEditorBounds,
  image: OcclusionEditorSize, angle: number): OcclusionPoint {
  const corners: OcclusionPoint[] = [
    { x: bounds.left, y: bounds.top }, { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left, y: bounds.top + bounds.height }, { x: bounds.left + bounds.width, y: bounds.top + bounds.height }
  ].map((p: OcclusionPoint): OcclusionPoint => ({
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle)
  }));
  const minX: number = -Math.min(...corners.map((p: OcclusionPoint): number => p.x)) / image.width;
  const maxX: number = 1 - Math.max(...corners.map((p: OcclusionPoint): number => p.x)) / image.width;
  const minY: number = -Math.min(...corners.map((p: OcclusionPoint): number => p.y)) / image.height;
  const maxY: number = 1 - Math.max(...corners.map((p: OcclusionPoint): number => p.y)) / image.height;
  return {
    x: Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), left)),
    y: Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), top))
  };
}
