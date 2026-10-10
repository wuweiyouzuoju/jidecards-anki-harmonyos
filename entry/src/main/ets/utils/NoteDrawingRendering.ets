// SPDX-License-Identifier: AGPL-3.0-or-later
import { image } from '@kit.ImageKit';
import { LengthMetricsUnit } from '@kit.ArkUI';
import { NoteDrawingDocument, DrawingText, DrawingTextBounds } from '../model/NoteDrawing';
import { WhiteboardStroke } from '../model/StudyWhiteboard';

/** 与合成图使用相同字体、基线及行距，逐行合并实际字形边界，空行只影响后续行位置。 */
export function measureNoteDrawingText(context: OffscreenCanvasRenderingContext2D, entry: DrawingText): DrawingTextBounds {
  context.font = `${entry.size}px sans-serif`; context.textBaseline = 'top'; context.textAlign = 'left';
  let left: number = Infinity;
  let top: number = Infinity;
  let right: number = -Infinity;
  let bottom: number = -Infinity;
  const lines: string[] = entry.text.split('\n');
  for (let index: number = 0; index < lines.length; index++) {
    if (lines[index].trim() === '') continue;
    const metrics: TextMetrics = context.measureText(lines[index]);
    const lineTop: number = index * entry.size * 1.2;
    left = Math.min(left, -metrics.actualBoundingBoxLeft);
    right = Math.max(right, metrics.actualBoundingBoxRight);
    top = Math.min(top, lineTop - metrics.actualBoundingBoxAscent);
    bottom = Math.max(bottom, lineTop + metrics.actualBoundingBoxDescent);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom) ||
    right <= left || bottom <= top) {
    return { x: 0, y: 0, width: Math.max(1, entry.size * 0.5), height: entry.size };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function paintNoteDrawingText(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  entry: DrawingText, x: number, y: number, size: number, unit: string = 'px'): void {
  context.fillStyle = entry.color; context.font = `${size}${unit} sans-serif`;
  context.textBaseline = 'top'; context.textAlign = 'left';
  const lines: string[] = entry.text.split('\n');
  for (let index: number = 0; index < lines.length; index++) {
    context.fillText(lines[index], x, y + index * size * 1.2);
  }
}

/** 只绘笔迹层，擦除不会影响底图或文字；屏幕与导出共用相同坐标。 */
export function paintNoteDrawingStroke(context: CanvasRenderer, stroke: WhiteboardStroke,
  width: number, height: number, documentWidth: number): void {
  if (stroke.points.length === 0) return;
  context.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color; context.fillStyle = stroke.color;
  context.lineWidth = stroke.width * width / documentWidth;
  context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath();
  const first = stroke.points[0];
  if (stroke.points.length === 1) {
    context.arc(first.x * width, first.y * height, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
  } else {
    context.moveTo(first.x * width, first.y * height);
    for (let index: number = 1; index < stroke.points.length; index++) {
      context.lineTo(stroke.points[index].x * width, stroke.points[index].y * height);
    }
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
}

/** @throws {Error} 调用方释放返回 PixelMap 及输入图层。 */
export function renderNoteDrawing(document: NoteDrawingDocument, base: image.PixelMap | null,
  officialInk: image.PixelMap | null): image.PixelMap {
  const context: OffscreenCanvasRenderingContext2D = new OffscreenCanvasRenderingContext2D(document.width,
    document.height, new RenderingContextSettings(true), LengthMetricsUnit.PX);
  context.fillStyle = document.background; context.fillRect(0, 0, document.width, document.height);
  if (base !== null) context.drawImage(base, 0, 0, document.width, document.height);
  if (officialInk !== null) context.drawImage(officialInk, 0, 0, document.width, document.height);
  if (document.strokes.length > 0) {
    const ink: OffscreenCanvasRenderingContext2D = new OffscreenCanvasRenderingContext2D(document.width,
      document.height, new RenderingContextSettings(true), LengthMetricsUnit.PX);
    for (const stroke of document.strokes) paintNoteDrawingStroke(ink, stroke, document.width, document.height, document.width);
    const pixels: image.PixelMap = ink.getPixelMap(0, 0, document.width, document.height);
    try { context.drawImage(pixels, 0, 0); } finally { pixels.release(); }
  }
  for (const text of document.texts) {
    paintNoteDrawingText(context, text, text.x * document.width, text.y * document.height, text.size);
  }
  return context.getPixelMap(0, 0, document.width, document.height);
}
