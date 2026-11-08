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
function sampleContour(x: number, y: number, band: number, depth: number, edges: ContourEdge[]): GlassPoint {
  const nearest = contourNearest(x, y, edges);
  const distance = nearest.distance;
  if (band <= 0 || depth <= 0 || distance <= -band || distance >= 0 || distance > -0.00001) return { x, y };
  const frost = glassBlend(distance, band);
  const shift = Math.min(depth, band * .3) * 4 * frost * (1 - frost);
  // 在整个过渡带上求平均梯度；不重新归一化，保留拐角处梯度自然衰减，避免采样回折。
  const epsilon = Math.max(0.25, band);
  const dx = contourNearest(x + epsilon, y, edges).distance - contourNearest(x - epsilon, y, edges).distance;
  const dy = contourNearest(x, y + epsilon, edges).distance - contourNearest(x, y - epsilon, edges).distance;
  return { x: x - shift * dx / (2 * epsilon), y: y - shift * dy / (2 * epsilon) };
}
export function glassSample(x: number, y: number, width: number, height: number, radius: number, band: number, depth: number, contour: GlassPoint[] = []): GlassPoint {
  if (contour.length > 2) return sampleContour(x, y, band, depth, contourEdges(contour));
  const distance = glassDistance(x, y, width, height, radius);
  if (band <= 0 || depth <= 0 || distance <= -band || distance >= 0) return { x, y };
  // 在整个过渡带上求平均梯度；不重新归一化，保留拐角处梯度自然衰减，避免采样回折。
  const epsilon = Math.max(0.25, band);
  const dx = glassDistance(x + epsilon, y, width, height, radius, contour) - glassDistance(x - epsilon, y, width, height, radius, contour);
  const dy = glassDistance(x, y + epsilon, width, height, radius, contour) - glassDistance(x, y - epsilon, width, height, radius, contour);
  const length = Math.hypot(dx, dy);
  if (length < 0.00001) return { x, y };
  const frost = glassBlend(distance, band);
  // 位移仍在轮廓及带内缘归零；平直边缘保持原有折射强度。
  const shift = Math.min(depth, band * .3) * 4 * frost * (1 - frost);
  return { x: x - shift * dx / (2 * epsilon), y: y - shift * dy / (2 * epsilon) };
}

/** 网格仅在尺寸变化时建立；图片刷新只更新共享纹理。 */
export function glassMesh(width: number, height: number, radius: number, density: number = 1, contour: GlassPoint[] = []): GlassMesh {
  const columns = Math.max(8, Math.min(96, Math.ceil(width / (4 * density))));
  const rows = Math.max(8, Math.min(96, Math.ceil(height / (4 * density))));
  const band = glassTransitionBand(width, height, density);
  const depth = Math.min(10 * density, band * 0.3);
  const edges: ContourEdge[] = contourEdges(contour);
  const result: GlassMesh = { positions: [], texture: [], indices: [] };
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const x = column / columns * width, y = row / rows * height;
      result.positions.push({ x, y });
      result.texture.push(edges.length > 2 ? sampleContour(x, y, band, depth, edges) :
        glassSample(x, y, width, height, radius, band, depth));
      if (row < rows && column < columns) {
        const index = row * (columns + 1) + column;
        result.indices.push(index, index + 1, index + columns + 1, index + 1, index + columns + 2, index + columns + 1);
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
interface ContourNearest { distance: number; x: number; y: number; }
interface ContourEdge { x: number; y: number; dx: number; dy: number; inverseLength: number; }
function contourEdges(points: GlassPoint[]): ContourEdge[] {
  const edges: ContourEdge[] = [];
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b.x-a.x, dy = b.y-a.y;
    edges.push({ x: a.x, y: a.y, dx, dy, inverseLength: 1 / Math.max(0.000001, dx*dx+dy*dy) });
  }
  return edges;
}
function contourNearest(x: number, y: number, edges: ContourEdge[]): ContourNearest {
  let distance = Number.POSITIVE_INFINITY, inside = false, nearestX = x, nearestY = y;
  for (const edge of edges) {
    const ax = x-edge.x, ay = y-edge.y;
    const t = Math.max(0, Math.min(1, (ax*edge.dx+ay*edge.dy) * edge.inverseLength));
    const qx = ax-t*edge.dx, qy = ay-t*edge.dy;
    const squared = qx*qx+qy*qy;
    if (squared < distance) { distance = squared; nearestX = x-qx; nearestY = y-qy; }
    if ((edge.y > y) !== (edge.y+edge.dy > y) && ax < edge.dx*ay/edge.dy) inside = !inside;
  }
  return { distance: (inside ? -1 : 1) * Math.sqrt(distance), x: nearestX, y: nearestY };
}

function contourDistance(x: number, y: number, points: GlassPoint[]): number {
  return contourNearest(x, y, contourEdges(points)).distance;
}

export function glassFrostAlpha(x: number, y: number, width: number, height: number, radius: number, density: number): number {
  return glassBlend(glassDistance(x, y, width, height, radius), glassTransitionBand(width, height, density));
}
