// SPDX-License-Identifier: AGPL-3.0-or-later
export interface GlassPoint { x: number; y: number; }
export interface GlassMesh {
  positions: GlassPoint[];
  texture: GlassPoint[];
  indices: number[];
}

/** 圆角矩形的有符号距离；负值位于玻璃内。单位由调用方统一为物理像素。 */
export function glassDistance(x: number, y: number, width: number, height: number, radius: number, contour: GlassPoint[] = []): number {
  if (contour.length > 2) return contourDistance(x, y, contour);
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const qx = Math.abs(x - width / 2) - width / 2 + r;
  const qy = Math.abs(y - height / 2) - height / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 形变与磨砂使用相同的36vp距离场；轮廓位移归零，背景线条保持连接。 */
export function glassTransitionBand(width: number, height: number, density: number): number {
  return Math.min(36 * density, Math.min(width, height) * 0.4);
}

function glassBlend(distance: number, band: number): number {
  const t = Math.max(0, Math.min(1, -distance / Math.max(.01, band)));
  return t * t * (3 - 2 * t);
}
function sampleContour(x: number, y: number, band: number, depth: number, edges: ContourEdge[], centerX: number, centerY: number): GlassPoint {
  const distance = contourSignedDistance(x, y, edges);
  if (band <= 0 || depth <= 0 || distance >= -0.00001) return { x, y };
  const frost = glassBlend(distance, band);
  const lensX = x + (centerX - x) * 0.02 * frost;
  const lensY = y + (centerY - y) * 0.02 * frost;
  if (distance <= -band) return { x: lensX, y: lensY };
  const shift = Math.min(depth, band * .3) * 4 * frost * (1 - frost);
  // 在整个过渡带上求平均梯度；不重新归一化，保留拐角处梯度自然衰减，避免采样回折。
  const epsilon = Math.max(0.25, band);
  const dx = contourSignedDistance(x + epsilon, y, edges) - contourSignedDistance(x - epsilon, y, edges);
  const dy = contourSignedDistance(x, y + epsilon, edges) - contourSignedDistance(x, y - epsilon, edges);
  return { x: lensX - shift * dx / (2 * epsilon), y: lensY - shift * dy / (2 * epsilon) };
}
export function glassSample(x: number, y: number, width: number, height: number, radius: number, band: number, depth: number, contour: GlassPoint[] = []): GlassPoint {
  if (contour.length > 2) return sampleContour(x, y, band, depth, contourEdges(contour), width / 2, height / 2);
  const distance = glassDistance(x, y, width, height, radius);
  if (band <= 0 || depth <= 0 || distance >= 0) return { x, y };
  const frost = glassBlend(distance, band);
  const lensX = x + (width / 2 - x) * 0.02 * frost;
  const lensY = y + (height / 2 - y) * 0.02 * frost;
  if (distance <= -band) return { x: lensX, y: lensY };
  // 在整个过渡带上求平均梯度；不重新归一化，保留拐角处梯度自然衰减，避免采样回折。
  const epsilon = Math.max(0.25, band);
  const dx = glassDistance(x + epsilon, y, width, height, radius, contour) - glassDistance(x - epsilon, y, width, height, radius, contour);
  const dy = glassDistance(x, y + epsilon, width, height, radius, contour) - glassDistance(x, y - epsilon, width, height, radius, contour);
  const length = Math.hypot(dx, dy);
  if (length < 0.00001) return { x: lensX, y: lensY };
  // 位移仍在轮廓及带内缘归零；平直边缘保持原有折射强度。
  const shift = Math.min(depth, band * .3) * 4 * frost * (1 - frost);
  return { x: lensX - shift * dx / (2 * epsilon), y: lensY - shift * dy / (2 * epsilon) };
}

/** 两端保留原采样密度；远离圆角后，形变沿直边的长轴保持恒定。 */
export function glassMeshAxis(length: number, steps: number, edge: number): number[] {
  const edgeSteps = Math.ceil(edge / length * steps);
  const axis: number[] = [];
  for (let step = 0; step <= steps; step++) {
    if (step <= edgeSteps || step >= steps - edgeSteps) axis.push(step / steps * length);
  }
  return axis;
}

/** 网格仅在尺寸变化时建立；图片刷新只更新共享纹理。 */
export function glassMesh(width: number, height: number, radius: number, density: number = 1, contour: GlassPoint[] = []): GlassMesh {
  const columns = Math.max(8, Math.min(96, Math.ceil(width / (4 * density))));
  const rows = Math.max(8, Math.min(96, Math.ceil(height / (4 * density))));
  const band = glassTransitionBand(width, height, density);
  const depth = Math.min(10 * density, band * 0.3);
  const edges: ContourEdge[] = contourEdges(contour);
  // 梯度采样还会向两侧探测一个过渡带，覆盖它可能碰到的最近边切换。
  const edge = edges.length > 2 ? Math.max(width, height) : Math.min(radius, width / 2, height / 2) + 2 * band;
  const xs = glassMeshAxis(width, columns, edge);
  const ys = glassMeshAxis(height, rows, edge);
  const result: GlassMesh = { positions: [], texture: [], indices: [] };
  for (let row = 0; row < ys.length; row++) {
    for (let column = 0; column < xs.length; column++) {
      const x = xs[column], y = ys[row];
      result.positions.push({ x, y });
      result.texture.push(edges.length > 2 ? sampleContour(x, y, band, depth, edges, width / 2, height / 2) :
        glassSample(x, y, width, height, radius, band, depth));
      if (row + 1 < ys.length && column + 1 < xs.length) {
        const index = row * xs.length + column;
        result.indices.push(index, index + 1, index + xs.length, index + 1, index + xs.length + 1, index + xs.length);
      }
    }
  }
  return result;
}

export function glassTexturePoint(point: GlassPoint, left: number, top: number, sourceLeft: number, sourceTop: number, scaleX: number, scaleY: number): GlassPoint {
  return { x: (left - sourceLeft + point.x) * scaleX, y: (top - sourceTop + point.y) * scaleY };
}


/** 宿主的M/L/Q/C/Z轮廓同时用于裁剪和光学；坐标为物理像素。 */
export function glassContour(path: string): GlassPoint[] {
  const tokens = path.match(/[MLQCZ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? [];
  const points: GlassPoint[] = [];
  let current: GlassPoint = { x: 0, y: 0 };
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'Z') break;
    const count = command === 'C' ? 3 : command === 'Q' ? 2 : 1;
    const controls: GlassPoint[] = [current];
    for (let n = 0; n < count; n++) controls.push({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
    if (command === 'M' || command === 'L') points.push(controls[count]);
    else for (let step = 1; step <= 16; step++) {
      const t = step / 16, u = 1 - t;
      const a = controls[0], b = controls[1], c = controls[2];
      if (command === 'Q') points.push({ x: u*u*a.x+2*u*t*b.x+t*t*c.x, y: u*u*a.y+2*u*t*b.y+t*t*c.y });
      else { const d = controls[3]; points.push({ x: u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
        y: u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y }); }
    }
    current = controls[count];
  }
  return points;
}
interface ContourEdge { x: number; y: number; dx: number; dy: number; inverseLength: number; }
function contourEdges(points: GlassPoint[]): ContourEdge[] {
  const edges: ContourEdge[] = [];
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b.x-a.x, dy = b.y-a.y;
    edges.push({ x: a.x, y: a.y, dx, dy, inverseLength: 1 / Math.max(0.000001, dx*dx+dy*dy) });
  }
  return edges;
}
function contourSignedDistance(x: number, y: number, edges: ContourEdge[]): number {
  let distance = Number.POSITIVE_INFINITY, inside = false;
  for (const edge of edges) {
    const ax = x-edge.x, ay = y-edge.y;
    const t = Math.max(0, Math.min(1, (ax*edge.dx+ay*edge.dy) * edge.inverseLength));
    const qx = ax-t*edge.dx, qy = ay-t*edge.dy;
    const squared = qx*qx+qy*qy;
    if (squared < distance) distance = squared;
    if ((edge.y > y) !== (edge.y+edge.dy > y) && ax < edge.dx*ay/edge.dy) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(distance);
}

function contourDistance(x: number, y: number, points: GlassPoint[]): number {
  return contourSignedDistance(x, y, contourEdges(points));
}

export function glassFrostAlpha(x: number, y: number, width: number, height: number, radius: number, density: number): number {
  return glassBlend(glassDistance(x, y, width, height, radius), glassTransitionBand(width, height, density));
}
