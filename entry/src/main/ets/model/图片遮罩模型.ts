// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-IMAGE-OCCLUSION-001
// @名称 图片遮罩模型
//
// @作用
// 定义图片遮盖（Image Occlusion）建卡与编辑的纯数据、历史及字符串逻辑：
//   1. 遮罩描述 接口：矩形、椭圆、多边形、文字的归一化坐标与编号
//   2. 生成Occlusions字符串：把遮罩列表渲染为 Anki 兼容的 cloze 字符串
//   3. 编号颜色：c1-c7 对应红橙黄绿青蓝紫，供编辑器组件高亮使用
//
// 与 Anki rslib image_occlusion/imageocclusion.rs 的 parse_image_cloze
// 严格对齐：每个遮罩渲染为
//   {{cN::image-occlusion:rect:left=L:top=T:width=W:height=H}}
// 多个遮罩直接串连，无分隔符。
//
// @输入
// 遮罩描述列表（坐标均归一化到 0-1，与 Anki 后端协议一致）
//
// @输出
// Anki cloze 字符串
//
// @业务规则
// 椭圆使用 rx/ry，文字使用 fs/scale，angle 单位为万分之一圈，与锁定 Core 对齐。
// 导入片段无改动时逐字保留；修改只覆盖图形对应属性，不丢未知属性或多卡编号。
// 新建简单矩形保留旧的四位小数输出，c0 文字标注不生成卡片。
// 该文件不依赖 HarmonyOS Kit 或 ArkUI，可被 node test runner 直接 import。
//
// @副作用
// 无。
// ========================================================

/** 图形编辑用边界框，原始属性单独保留。宽/高对应椭圆的两倍半径。 */
export interface 遮罩描述 {
  /** Core 图形类型；未知类型保留原文而不提供编辑操作。 */
  形状: string;
  /** 左上角横坐标，归一化 0-1 */
  左: number;
  /** 左上角纵坐标，归一化 0-1 */
  顶: number;
  /** 宽度，归一化 0-1 */
  宽: number;
  /** 高度，归一化 0-1 */
  高: number;
  /** 主 cloze 编号，0 为非考查标注；多编号保留在 ordinalText。 */
  编号: number;
  /** 原始属性与片段保留导入精度和未知扩展，图形变更只覆盖对应属性。 */
  properties?: OcclusionProperty[];
  source?: string;
  sourceStart?: number;
  ordinalText?: string;
}

export interface OcclusionProperty { name: string; value: string; }

/** Imported multi-card masks may reserve numbers beyond their primary ordinal. */
export function nextOcclusionOrdinal(masks: 遮罩描述[]): number {
  let largest: number = 0;
  for (const mask of masks) {
    largest = Math.max(largest, mask.编号);
    if (mask.ordinalText === undefined || Number(mask.ordinalText.split(',')[0]) !== mask.编号) continue;
    for (const text of mask.ordinalText.split(',')) largest = Math.max(largest, Number(text));
  }
  return largest + 1;
}

/** 展示固定候选、已存在的组及当前待绘制组；候选本身不生成卡片。 */
export function occlusionOrdinals(masks: 遮罩描述[], current: number, minimum: number = 0): number[] {
  const ordinals: Set<number> = new Set<number>();
  for (let ordinal: number = 1; ordinal <= minimum; ordinal++) ordinals.add(ordinal);
  if (current > 0) ordinals.add(current);
  for (const mask of masks) {
    if (mask.形状 === 'text') continue;
    if (mask.编号 > 0) ordinals.add(mask.编号);
    if (mask.ordinalText === undefined || Number(mask.ordinalText.split(',')[0]) !== mask.编号) continue;
    for (const text of mask.ordinalText.split(',')) {
      const ordinal: number = Number(text);
      if (Number.isInteger(ordinal) && ordinal > 0) ordinals.add(ordinal);
    }
  }
  return Array.from(ordinals).sort((a: number, b: number): number => a - b);
}

export function maskProperty(mask: 遮罩描述, name: string, fallback: string = ''): string {
  return mask.properties?.find((property: OcclusionProperty): boolean => property.name === name)?.value ?? fallback;
}

export function maskNumber(mask: 遮罩描述, name: string, fallback: number = 0): number {
  const value: string = maskProperty(mask, name);
  const number: number = Number(value);
  return value !== '' && Number.isFinite(number) ? number : fallback;
}

export function copyMask(mask: 遮罩描述): 遮罩描述 {
  return { 形状: mask.形状, 左: mask.左, 顶: mask.顶, 宽: mask.宽, 高: mask.高, 编号: mask.编号,
    properties: mask.properties?.map((property: OcclusionProperty): OcclusionProperty => ({ name: property.name, value: property.value })),
    source: mask.source, sourceStart: mask.sourceStart, ordinalText: mask.ordinalText };
}

export function setMaskProperty(mask: 遮罩描述, name: string, value: string): void {
  if (mask.properties === undefined) mask.properties = [];
  const property: OcclusionProperty | undefined = mask.properties.find((item: OcclusionProperty): boolean => item.name === name);
  if (property === undefined) mask.properties.push({ name: name, value: value });
  else property.value = value;
}

/** The same colon escaping accepted by Core parse_image_cloze; keep unknown properties. */
export function parseOcclusionMasks(source: string): 遮罩描述[] {
  const pattern: RegExp = new RegExp('\\{\\{c([0-9]+(?:,[0-9]+)*)::image-occlusion:([^]*?)\\}\\}', 'g');
  const masks: 遮罩描述[] = [];
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match !== null) {
    const chunks: string[] = match[2].split(new RegExp('(?<!\\\\):'));
    const properties: OcclusionProperty[] = [];
    for (let i: number = 1; i < chunks.length; i++) {
      const equals: number = chunks[i].indexOf('=');
      if (equals > 0) properties.push({ name: chunks[i].slice(0, equals),
        value: chunks[i].slice(equals + 1).split('\\:').join(':') });
    }
    const mask: 遮罩描述 = { 形状: chunks[0], 左: 0, 顶: 0, 宽: 0, 高: 0,
      编号: Number(match[1].split(',')[0]), ordinalText: match[1], properties: properties, source: match[0], sourceStart: match.index };
    mask.左 = maskNumber(mask, 'left'); mask.顶 = maskNumber(mask, 'top');
    mask.宽 = maskNumber(mask, 'width'); mask.高 = maskNumber(mask, 'height');
    if (mask.形状 === 'ellipse') {
      mask.宽 = maskNumber(mask, 'rx', mask.宽 / 2) * 2;
      mask.高 = maskNumber(mask, 'ry', mask.高 / 2) * 2;
    } else if (mask.形状 === 'polygon') {
      const points: OcclusionPoint[] = maskPoints(mask);
      if (points.length > 0) {
        mask.宽 = Math.max(...points.map((p: OcclusionPoint): number => p.x)) - Math.min(...points.map((p: OcclusionPoint): number => p.x));
        mask.高 = Math.max(...points.map((p: OcclusionPoint): number => p.y)) - Math.min(...points.map((p: OcclusionPoint): number => p.y));
      }
    } else if (mask.形状 === 'text') {
      const scale: number = maskNumber(mask, 'scale', 1);
      const font: number = maskNumber(mask, 'fs', 0.04);
      mask.宽 = Math.max(0.04, maskProperty(mask, 'text').length * font * 0.6 * scale);
      mask.高 = Math.max(0.04, font * 1.5 * scale);
    }
    masks.push(mask); match = pattern.exec(source);
  }
  return masks;
}

export interface OcclusionPoint { x: number; y: number; }
export function maskPoints(mask: 遮罩描述): OcclusionPoint[] {
  const points: OcclusionPoint[] = [];
  for (const pair of maskProperty(mask, 'points').trim().split(new RegExp('\\s+'))) {
    const xy: string[] = pair.split(',');
    if (xy.length !== 2 || xy[0] === '' || xy[1] === '') return [];
    const point: OcclusionPoint = { x: Number(xy[0]), y: Number(xy[1]) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    points.push(point);
  }
  return points;
}

export function polygonImagePoints(mask: 遮罩描述): OcclusionPoint[] {
  const points: OcclusionPoint[] = maskPoints(mask);
  if (points.length === 0) return [];
  const minX: number = Math.min(...points.map((p: OcclusionPoint): number => p.x));
  const minY: number = Math.min(...points.map((p: OcclusionPoint): number => p.y));
  return points.map((p: OcclusionPoint): OcclusionPoint => ({ x: mask.左 + p.x - minX, y: mask.顶 + p.y - minY }));
}

/** 顶点移动以原图坐标重定边界，保留其他顶点和未知属性。 */
export function setPolygonImagePoints(mask: 遮罩描述, points: OcclusionPoint[]): void {
  mask.左 = Math.min(...points.map((p: OcclusionPoint): number => p.x));
  mask.顶 = Math.min(...points.map((p: OcclusionPoint): number => p.y));
  mask.宽 = Math.max(...points.map((p: OcclusionPoint): number => p.x)) - mask.左;
  mask.高 = Math.max(...points.map((p: OcclusionPoint): number => p.y)) - mask.顶;
  setMaskProperty(mask, 'points', points.map((p: OcclusionPoint): string => String(p.x) + ',' + String(p.y)).join(' '));
}

export function occlusionPolygonArea(points: OcclusionPoint[]): number {
  let area: number = 0;
  for (let i: number = 0; i < points.length; i++) {
    const a: OcclusionPoint = points[i], b: OcclusionPoint = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Preserve the original token byte-for-byte when its geometry/group is untouched. */
export function serializeMask(mask: 遮罩描述): string {
  if (mask.source !== undefined) {
    const original: 遮罩描述 | undefined = parseOcclusionMasks(mask.source)[0];
    if (original !== undefined && original.形状 === mask.形状 && original.编号 === mask.编号 &&
      original.左 === mask.左 && original.顶 === mask.顶 && original.宽 === mask.宽 && original.高 === mask.高 &&
      original.ordinalText === mask.ordinalText && JSON.stringify(original.properties) === JSON.stringify(mask.properties)) return mask.source;
  }
  const output: 遮罩描述 = copyMask(mask);
  setMaskProperty(output, 'left', String(mask.左)); setMaskProperty(output, 'top', String(mask.顶));
  if (mask.形状 === 'rect') {
    setMaskProperty(output, 'width', String(mask.宽)); setMaskProperty(output, 'height', String(mask.高));
  } else if (mask.形状 === 'ellipse') {
    setMaskProperty(output, 'rx', String(mask.宽 / 2)); setMaskProperty(output, 'ry', String(mask.高 / 2));
  }
  let value: string = mask.形状;
  for (const property of output.properties ?? []) value += ':' + property.name + '=' + property.value.split(':').join('\\:');
  const ordinal: string = mask.ordinalText !== undefined && Number(mask.ordinalText.split(',')[0]) === mask.编号 ? mask.ordinalText : String(mask.编号);
  return '{{c' + ordinal + '::image-occlusion:' + value + '}}';
}

/** Remove only deleted shape tokens; preserve all unrelated HTML and unrecognized syntax. */
export function serializeOcclusionDocument(source: string, masks: 遮罩描述[]): string {
  let output: string = '', cursor: number = 0;
  for (const original of parseOcclusionMasks(source)) {
    const start: number = original.sourceStart ?? 0;
    output += source.slice(cursor, start);
    const mask: 遮罩描述 | undefined = masks.find((item: 遮罩描述): boolean => item.sourceStart === start);
    if (mask !== undefined) output += serializeMask(mask);
    cursor = start + (original.source?.length ?? 0);
  }
  output += source.slice(cursor);
  for (const mask of masks) if (mask.sourceStart === undefined) output += serializeMask(mask);
  return output;
}

export class OcclusionHistory {
  private undoStates: 遮罩描述[][] = [];
  private redoStates: 遮罩描述[][] = [];
  remember(masks: 遮罩描述[]): void {
    this.undoStates.push(masks.map(copyMask));
    if (this.undoStates.length > 100) this.undoStates.shift();
    this.redoStates = [];
  }
  canUndo(): boolean { return this.undoStates.length > 0; }
  canRedo(): boolean { return this.redoStates.length > 0; }
  undo(current: 遮罩描述[]): 遮罩描述[] {
    const previous: 遮罩描述[] | undefined = this.undoStates.pop();
    if (previous === undefined) return current;
    this.redoStates.push(current.map(copyMask)); return previous.map(copyMask);
  }
  redo(current: 遮罩描述[]): 遮罩描述[] {
    const next: 遮罩描述[] | undefined = this.redoStates.pop();
    if (next === undefined) return current;
    this.undoStates.push(current.map(copyMask)); return next.map(copyMask);
  }
}

// ========================================================
// @块ID MODEL-IMAGE-OCCLUSION-002
// @名称 格式化归一化坐标
//
// @作用
// 把归一化坐标格式化为 Anki 解析器可接受的字符串：
// 先四舍五入到 4 位小数（避免浮点尾数误差），再用 String() 转换，
// 自然去除末尾 0（0.2 → "0.2"，0 → "0"，1 → "1"）。
//
// @输入
// 归一化数值（理论上 0-1，但不强校验，由调用方保证）
//
// @输出
// 字符串形式的坐标
//
// @副作用
// 无。
// ========================================================
function 格式化归一化坐标(值: number): string {
  const 四舍五入: number = Math.round(值 * 10000) / 10000;
  return String(四舍五入);
}

// ========================================================
// @块ID MODEL-IMAGE-OCCLUSION-003
// @名称 生成Occlusions字符串
//
// @作用
// 把遮罩列表渲染为 Anki ImageOcclusion 笔记的 Occlusions 字段值：
//   {{c1::image-occlusion:rect:left=0.2:top=0.3:width=0.4:height=0.1}}
//   {{c2::image-occlusion:rect:left=...:top=...:width=...:height=...}}
// 多个遮罩直接串连，无分隔符（与 Anki rslib parse_image_occlusions 兼容）。
//
// @输入
// 遮罩描述列表
//
// @输出
// 串连后的 cloze 字符串；空列表返回空字符串
//
// @业务规则
// 字段顺序固定为 left/top/width/height（与 spec 示例一致；
// Anki 解析器基于 nom separated_pair 顺序无关，但保持稳定输出便于测试）。
// 不对编号范围、坐标范围做强校验：调用方负责保证业务约束。
//
// @副作用
// 无。
// ========================================================
export function 生成Occlusions字符串(遮罩列表: 遮罩描述[]): string {
  let 结果: string = '';
  for (let i = 0; i < 遮罩列表.length; i++) {
    const 遮罩: 遮罩描述 = 遮罩列表[i];
    if (遮罩.形状 !== 'rect' || 遮罩.properties !== undefined) {
      结果 += serializeMask(遮罩);
      continue;
    }
    const 左: string = 格式化归一化坐标(遮罩.左);
    const 顶: string = 格式化归一化坐标(遮罩.顶);
    const 宽: string = 格式化归一化坐标(遮罩.宽);
    const 高: string = 格式化归一化坐标(遮罩.高);
    结果 += `{{c${遮罩.编号}::image-occlusion:rect:left=${左}:top=${顶}:width=${宽}:height=${高}}}`;
  }
  return 结果;
}

// ========================================================
// @块ID MODEL-IMAGE-OCCLUSION-005
// @名称 识别图片扩展名
//
// @作用
// 按图片字节头部的魔数识别格式，返回 Anki 支持的扩展名（jpg/png/webp/gif）。
// 后端 AddImageOcclusionNote 会用临时文件名直接作为 collection.media 里的媒体文件名，
// 而 Anki rslib is_image_file 只认 jpg/jpeg/png/gif/svg/webp/ico/avif，
// 扩展名不对会导致遮罩编辑器无法回读图片，因此不能用 .img 之类的伪扩展名。
//
// @输入
// 图片完整字节（Uint8Array）
//
// @输出
// 扩展名字符串（不含点）；无法识别时兜底 png（受 Anki 支持，渲染按内容嗅探）
//
// @业务规则
// 魔数依据：JPEG=FF D8 FF；PNG=89 50 4E 47；WEBP=RIFF....WEBP；GIF=GIF8。
//
// @副作用
// 无。
// ========================================================
export function 识别图片扩展名(字节: Uint8Array): string {
  if (字节.length >= 3 && 字节[0] === 0xFF && 字节[1] === 0xD8 && 字节[2] === 0xFF) {
    return 'jpg';
  }
  if (字节.length >= 4 && 字节[0] === 0x89 && 字节[1] === 0x50 && 字节[2] === 0x4E && 字节[3] === 0x47) {
    return 'png';
  }
  if (字节.length >= 12 && 字节[0] === 0x52 && 字节[1] === 0x49 && 字节[2] === 0x46 && 字节[3] === 0x46
    && 字节[8] === 0x57 && 字节[9] === 0x45 && 字节[10] === 0x42 && 字节[11] === 0x50) {
    return 'webp';
  }
  if (字节.length >= 3 && 字节[0] === 0x47 && 字节[1] === 0x49 && 字节[2] === 0x46) {
    return 'gif';
  }
  return 'png';
}

// ========================================================
// @块ID MODEL-IMAGE-OCCLUSION-004
// @名称 编号颜色
//
// @作用
// 正编号循环使用七色，导入的更大编号继续保留展示色。
//
// @输入
// cloze 编号，0 和非法编号使用标注灰色。
//
// @输出
// hex 颜色字符串
//
// @副作用
// 无。
// ========================================================
export function 编号颜色(编号: number): string {
  if (!Number.isInteger(编号) || 编号 <= 0) return '#9E9E9E';
  switch ((编号 - 1) % 7 + 1) {
    case 1:
      return '#E53935'; // c1 红
    case 2:
      return '#FB8C00'; // c2 橙
    case 3:
      return '#FDD835'; // c3 黄
    case 4:
      return '#43A047'; // c4 绿
    case 5:
      return '#00ACC1'; // c5 青
    case 6:
      return '#1E88E5'; // c6 蓝
    default:
      return '#8E24AA'; // c7 紫
  }
}
