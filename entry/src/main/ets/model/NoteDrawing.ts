// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WhiteboardStroke } from './StudyWhiteboard';

export interface DrawingText { id: number; text: string; x: number; y: number; size: number; color: string; }
export interface DrawingFile { name: string; data: string; }
/** 可编辑源嵌入 PNG 私有辅助块，随普通 Anki 图片同步，不产生悬空的旁文件。 */
export interface NoteDrawingDocument {
  version: number;
  width: number;
  height: number;
  background: string;
  base: string;
  engine: string;
  ink: DrawingFile[];
  strokes: WhiteboardStroke[];
  texts: DrawingText[];
}
export const DRAWING_MAX_BYTES: number = 32 * 1024 * 1024;
export const DRAWING_COLORS: string[] = ['#202632', '#D83B46', '#2768D8', '#16805D'];
export const DRAWING_COLOR_KEYS: string[] = ['note_drawing_black', 'study_whiteboard_red', 'study_whiteboard_blue', 'study_whiteboard_green'];
export const DRAWING_TEXT_MIN_SIZE: number = 8;
export const DRAWING_TEXT_MAX_SIZE: number = 256;

export interface DrawingTextBounds { x: number; y: number; width: number; height: number; }
export interface DrawingTextHandle { id: string; x: number; y: number; }
export const DRAWING_TEXT_HANDLES: DrawingTextHandle[] = [
  { id: 'top_left', x: 0, y: 0 }, { id: 'top', x: 0.5, y: 0 }, { id: 'top_right', x: 1, y: 0 },
  { id: 'left', x: 0, y: 0.5 }, { id: 'right', x: 1, y: 0.5 },
  { id: 'bottom_left', x: 0, y: 1 }, { id: 'bottom', x: 0.5, y: 1 }, { id: 'bottom_right', x: 1, y: 1 }
];

/** 四边沿对应轴缩放；角点采用变化更大的轴，避免长文字吞掉竖向拖动。 */
export function drawingTextResizeScale(width: number, height: number, handle: DrawingTextHandle,
  x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  const horizontal: number = handle.x === 0.5 ? 0 : x * (handle.x === 0 ? -1 : 1) / Math.max(1, width);
  const vertical: number = handle.y === 0.5 ? 0 : y * (handle.y === 0 ? -1 : 1) / Math.max(1, height);
  return Math.max(0.001, 1 + (Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical));
}

/** 手柄与双指缩放共用源文档字号边界，不在手势期间修改文档。 */
export function scaledDrawingTextSize(size: number, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return size;
  return Math.max(DRAWING_TEXT_MIN_SIZE, Math.min(DRAWING_TEXT_MAX_SIZE, size * scale));
}

/** UI 与 JIDE 共用实际图片动作名称。 */
export function noteDrawingImageActionKey(hasBackground: boolean): string {
  return hasBackground ? 'note_drawing_replace_image' : 'note_drawing_add_image';
}

export function emptyNoteDrawing(width: number = 1200, height: number = 900): NoteDrawingDocument {
  return { version: 1, width: width, height: height, background: '#FFFFFF', base: '', engine: '',
    ink: [], strokes: [], texts: [] };
}

export function validDrawingFileName(name: string): boolean {
  return name === 'ink' || (name.startsWith('ink/') && name.split('/').every((part: string): boolean =>
    part !== '' && part !== '.' && part !== '..' && !new RegExp('[\\\\:\\x00-\\x1f]').test(part)));
}

export function validateNoteDrawing(document: NoteDrawingDocument): void {
  if (document === null || typeof document !== 'object' || document.version !== 1 ||
    !Number.isInteger(document.width) || !Number.isInteger(document.height) ||
    document.width < 64 || document.width > 4096 || document.height < 64 || document.height > 4096 ||
    typeof document.base !== 'string' || document.base.length > DRAWING_MAX_BYTES ||
    !new RegExp('^#[0-9A-Fa-f]{6}$').test(document.background) ||
    !['', 'huawei_pen_kit', 'local_canvas'].includes(document.engine) ||
    !Array.isArray(document.texts) || document.texts.length > 100 ||
    !Array.isArray(document.ink) || document.ink.length > 128 ||
    !Array.isArray(document.strokes) || document.strokes.length > 2048) throw new Error('Invalid drawing document');
  const names: Set<string> = new Set<string>();
  for (const file of document.ink) {
    if (file === null || typeof file.name !== 'string' || !validDrawingFileName(file.name) ||
      names.has(file.name) || typeof file.data !== 'string' || file.data.length > DRAWING_MAX_BYTES) {
      throw new Error('Invalid drawing ink');
    }
    names.add(file.name);
  }
  let points: number = 0;
  for (const stroke of document.strokes) {
    if (stroke === null || !Array.isArray(stroke.points) || typeof stroke.eraser !== 'boolean' ||
      !new RegExp('^#[0-9A-Fa-f]{6}$').test(stroke.color) || !Number.isFinite(stroke.width) ||
      stroke.width <= 0 || stroke.width > 4096) throw new Error('Invalid drawing stroke');
    points += stroke.points.length;
    if (points > 65536) throw new Error('Drawing is too large');
    for (const point of stroke.points) {
      if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw new Error('Invalid drawing point');
    }
  }
  const ids: Set<number> = new Set<number>();
  for (const text of document.texts) {
    if (text === null || !Number.isInteger(text.id) || text.id < 1 || ids.has(text.id) || typeof text.text !== 'string' ||
      text.text.length > 2000 || !Number.isFinite(text.x) || !Number.isFinite(text.y) ||
      text.x < 0 || text.x > 1 || text.y < 0 || text.y > 1 || !Number.isFinite(text.size) ||
      text.size < DRAWING_TEXT_MIN_SIZE || text.size > DRAWING_TEXT_MAX_SIZE || !new RegExp('^#[0-9A-Fa-f]{6}$').test(text.color)) {
      throw new Error('Invalid drawing text');
    }
    ids.add(text.id);
  }
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 + bytes[offset + 3]) >>> 0;
}
function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value;
}
function crc32(bytes: Uint8Array): number {
  let crc: number = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit: number = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) !== 0 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
interface PngChunk { start: number; end: number; kind: string; }
function pngChunks(bytes: Uint8Array): PngChunk[] {
  const signature: number[] = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 20 || !signature.every((value: number, index: number): boolean => bytes[index] === value)) return [];
  const chunks: PngChunk[] = [];
  for (let offset: number = 8; offset + 12 <= bytes.length;) {
    const length: number = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) throw new Error('Invalid PNG chunk');
    const kind: string = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const end: number = offset + length + 12;
    chunks.push({ start: offset, end: end, kind: kind });
    if (kind === 'IEND') return chunks;
    offset = end;
  }
  throw new Error('Incomplete PNG');
}

export function drawingMetadata(bytes: Uint8Array): Uint8Array | null {
  for (const chunk of pngChunks(bytes)) {
    if (chunk.kind !== 'jiDe') continue;
    if (chunk.end - chunk.start - 12 > DRAWING_MAX_BYTES ||
      crc32(bytes.slice(chunk.start + 4, chunk.end - 4)) !== readU32(bytes, chunk.end - 4)) {
      throw new Error('Corrupt drawing source');
    }
    return bytes.slice(chunk.start + 8, chunk.end - 4);
  }
  return null;
}

export function embedDrawingMetadata(png: Uint8Array, metadata: Uint8Array): Uint8Array {
  if (metadata.length > DRAWING_MAX_BYTES) throw new Error('Drawing is too large');
  const chunks: PngChunk[] = pngChunks(png);
  if (chunks.length === 0) throw new Error('Drawing export requires PNG');
  const sourceChunk: Uint8Array = new Uint8Array(metadata.length + 12);
  writeU32(sourceChunk, 0, metadata.length);
  sourceChunk.set([106, 105, 68, 101], 4); sourceChunk.set(metadata, 8);
  writeU32(sourceChunk, sourceChunk.length - 4, crc32(sourceChunk.slice(4, sourceChunk.length - 4)));
  const kept: PngChunk[] = chunks.filter((chunk: PngChunk): boolean => chunk.kind !== 'jiDe');
  const output: Uint8Array = new Uint8Array(8 + sourceChunk.length +
    kept.reduce((sum: number, chunk: PngChunk): number => sum + chunk.end - chunk.start, 0));
  output.set(png.slice(0, 8));
  let offset: number = 8;
  for (const chunk of kept) {
    if (chunk.kind === 'IEND') { output.set(sourceChunk, offset); offset += sourceChunk.length; }
    output.set(png.slice(chunk.start, chunk.end), offset); offset += chunk.end - chunk.start;
  }
  return output;
}
