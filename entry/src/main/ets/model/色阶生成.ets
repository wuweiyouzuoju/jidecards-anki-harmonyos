// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-COLOR-SHADES-001
// @名称 色阶生成工具
//
// @作用
// 从一个种子色出发，按 ArcoDesign 色板算法思路派生 10 档色阶（shade 1-10），
// 并按浅色/深色模式自动选档，组装出一组可直接绑定到 UI 的语义色
// （主色/悬停/按下/容器/容器悬停/边框/图标/文字 等）。
//
// @输入
// 种子色 hex 字符串（= ArcoDesign shade 6）
// 是否深色模式 布尔值
//
// @输出
// 色阶数组（10 档 hex 字符串）
// 完整色阶（含色阶数组 + 语义色集合）
//
// @业务规则
// 输出索引约定：
// - shades[0] = shade 1（最浅，用于 container 背景等大面积极浅色）
// - shades[5] = shade 6（种子色，primary 主色）
// - shades[9] = shade 10（最深，用于深色模式 container 等）
// 阶梯常量取自 ArcoDesign 色板规范：
// - 色相每档微调 ±2°，暖色（0-60, 240-360）向浅向加，冷色（60-240）向浅向减
// - 浅色段饱和度每档 -16%，深色段每档 +5%（最末档 +16%）
// - 浅色段明度每档 +5%，深色段每档 -15%（最末档 -5%）
// 按钮背景专用主色：在 shades 中从指定档向深档搜索，取首个白字对比度 ≥4.5 的档。
//
// @副作用
// 无。本文件为纯函数工具，不读不写状态。
//
// @注意
// 灵感来源：ArcoDesign 色板生成算法（https://arco.design/palette/list）。
// 本文件为借鉴思路重写，未直接复制 ArcoDesign 源码。
// 修改选档逻辑可能影响所有主题在浅色/深色模式下的视觉呈现与对比度达标情况。
// ========================================================

/** HSV 颜色（色相:0-360, 饱和度:0-100, 明度:0-100）。 */
export interface HSV颜色 {
  色相: number;
  饱和度: number;
  明度: number;
}

/** 10 档色阶（索引 0=最浅，9=最深）。 */
export type 色阶数组 = string[];

/** 由种子色派生的一组语义色（已根据 是否深色 选档，可直接用于 UI 绑定）。 */
export interface 语义色集合 {
  /** 主色（按钮、进度条、强调） */
  主色: string;
  /** 悬停态（比 主色 略浅） */
  主色悬停: string;
  /** 按下态（比 主色 略深） */
  主色按下: string;
  /**
   * 按钮背景专用主色（配 #FFFFFF 文字）。2.1.4.1 色彩对比度：白字 ≥ 4.5:1。
   * 浅色：从 shade 6 向深档搜索，取首个白字对比度 ≥4.5 的档（aurora/midnight=shade6，forest/lagoon/sunset=shade8，lemon=shade9）。
   * 深色：从 shade 5 向深档搜索，取首个达标档（aurora/midnight=shade6，forest/lagoon/sunset=shade8，lemon=shade9）。
   * 高明度主题（lemon/sunset/lagoon/forest）按钮背景比 主色 更深，但白字可读性达标。
   */
  按钮背景主色: string;
  /** 按钮按下态背景（比 按钮背景主色 更深一档；若 按钮背景主色 已是最末档则保持不变）。 */
  按钮背景按下: string;
  /** 主色容器背景（极浅/极深，用作选中行底色、tag 底色等） */
  主色容器: string;
  /** 主色容器悬停背景 */
  主色容器悬停: string;
  /** 主色边框（选中边框、强调边框） */
  主色边框: string;
  /** 主色图标（与 主色 一致或略深，保证小尺寸清晰） */
  主色图标: string;
  /** 在浅色背景上的主色文字（比 主色 略深，保证 AA 对比度） */
  主色文字: string;
}

/** 完整色阶 + 语义色（一个主题在浅色或深色模式下的完整主色派生系）。 */
export interface 完整色阶 {
  色阶: 色阶数组;
  语义: 语义色集合;
}

// ===== Hex / RGB / HSV 互转（无依赖纯函数） =====

export function 十六进制转RGB(hex: string): [number, number, number] {
  let 规范化: string = hex.trim();
  if (规范化.startsWith('#')) {
    规范化 = 规范化.slice(1);
  }
  if (规范化.length === 3) {
    // #abc → #aabbcc
    规范化 = 规范化.split('').map((c: string): string => c + c).join('');
  }
  const r: number = parseInt(规范化.slice(0, 2), 16);
  const g: number = parseInt(规范化.slice(2, 4), 16);
  const b: number = parseInt(规范化.slice(4, 6), 16);
  return [r, g, b];
}

export function RGB转十六进制(r: number, g: number, b: number): string {
  const 转换 = (n: number): string => {
    const 限定: number = Math.max(0, Math.min(255, Math.round(n)));
    const s: string = 限定.toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + 转换(r) + 转换(g) + 转换(b);
}

// ===== WCAG sRGB 对比度计算（用于 按钮背景主色 选档，保证白字 ≥ 4.5:1） =====

/** sRGB 通道 → 线性亮度（WCAG 2.x 公式）。 */
function sRGB通道转线性亮度(c: number): number {
  const cs: number = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** 相对亮度（WCAG）。 */
function 相对亮度(hex: string): number {
  const rgb: [number, number, number] = 十六进制转RGB(hex);
  return 0.2126 * sRGB通道转线性亮度(rgb[0])
    + 0.7152 * sRGB通道转线性亮度(rgb[1])
    + 0.0722 * sRGB通道转线性亮度(rgb[2]);
}

/** 两色 WCAG 对比度（1.0~21.0）。 */
export function 对比度(a: string, b: string): number {
  const 亮a: number = 相对亮度(a);
  const 亮b: number = 相对亮度(b);
  const 较亮: number = Math.max(亮a, 亮b);
  const 较暗: number = Math.min(亮a, 亮b);
  return (较亮 + 0.05) / (较暗 + 0.05);
}

/** 在 色阶 中从 起始索引 搜索，取首个与 参考色 对比度 ≥ 阈值 的色档索引。
 *  向深档=true 时索引递增（找更深的色，用于浅色模式配浅底需更深前景）；
 *  向深档=false 时索引递减（找更浅的色，用于深色模式配深底需更亮前景）。
 *  都不达标时：向深档回退到最末档 色阶.length - 1，向浅档回退到 0。
 *
 *  用途：2.1.4.1 色彩对比度统一修复——主色文字/主色图标/主色边框/热力3 等语义色
 *  在不同主题×模式下对比度可能不达标，用搜索算法保证选档始终满足 WCAG 阈值。 */
export function 选取对比度达标档索引(
  色阶: 色阶数组,
  起始索引: number,
  参考色: string,
  阈值: number,
  向深档: boolean
): number {
  if (向深档) {
    for (let i: number = 起始索引; i < 色阶.length; i++) {
      if (对比度(参考色, 色阶[i]) >= 阈值) {
        return i;
      }
    }
    return 色阶.length - 1;
  }
  for (let i: number = 起始索引; i >= 0; i--) {
    if (对比度(参考色, 色阶[i]) >= 阈值) {
      return i;
    }
  }
  return 0;
}

/** 在 色阶 中从 起始索引 向深档（索引递增）搜索，返回首个"白字对比度 ≥ 4.5"的色的索引；
 *  都不达标则回退到最末档索引 色阶.length - 1（已是最深）。 */
function 选取白字达标档索引(色阶: 色阶数组, 起始索引: number): number {
  for (let i: number = 起始索引; i < 色阶.length; i++) {
    if (对比度('#FFFFFF', 色阶[i]) >= 4.5) {
      return i;
    }
  }
  return 色阶.length - 1;
}

export function RGB转HSV(r: number, g: number, b: number): HSV颜色 {
  const rf: number = r / 255;
  const gf: number = g / 255;
  const bf: number = b / 255;
  const 最大: number = Math.max(rf, gf, bf);
  const 最小: number = Math.min(rf, gf, bf);
  const 差值: number = 最大 - 最小;
  let h: number = 0;
  if (差值 > 0) {
    if (最大 === rf) {
      h = ((gf - bf) / 差值) % 6;
    } else if (最大 === gf) {
      h = (bf - rf) / 差值 + 2;
    } else {
      h = (rf - gf) / 差值 + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s: number = 最大 === 0 ? 0 : (差值 / 最大) * 100;
  const v: number = 最大 * 100;
  return { 色相: h, 饱和度: s, 明度: v };
}

export function HSV转RGB(h: number, s: number, v: number): [number, number, number] {
  const sf: number = s / 100;
  const vf: number = v / 100;
  const c: number = vf * sf;
  const hp: number = h / 60;
  const x: number = c * (1 - Math.abs(hp % 2 - 1));
  const m: number = vf - c;
  let r: number = 0;
  let g: number = 0;
  let b: number = 0;
  if (hp >= 0 && hp < 1) {
    r = c; g = x; b = 0;
  } else if (hp < 2) {
    r = x; g = c; b = 0;
  } else if (hp < 3) {
    r = 0; g = c; b = x;
  } else if (hp < 4) {
    r = 0; g = x; b = c;
  } else if (hp < 5) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ===== ArcoDesign 风格的色阶生成算法 =====
// 阶梯常量取自 ArcoDesign 色板规范：
// - 色相每档微调 ±2°，暖色（0-60, 240-360）向浅向加，冷色（60-240）向浅向减
// - 浅色段饱和度每档 -16%，深色段每档 +5%（最末档 +16%）
// - 浅色段明度每档 +5%，深色段每档 -15%（最末档 -5%）

const 色相步长: number = 2;
const 浅色段饱和度步长: number = 16;
const 深色段饱和度步长: number = 5;
const 深色段末档饱和度步长: number = 16;
const 浅色段明度步长: number = 5;
const 深色段明度步长: number = 15;
const 深色段末档明度步长: number = 5;
const 浅色段档数: number = 5;   // shade 1-5（浅色段）
const 深色段档数: number = 4;    // shade 7-10（深色段）

function 偏移色相(hsv: HSV颜色, i: number, 浅色段: boolean): number {
  // 暖色（色相∈[0,60]∪[240,360]）：浅色段加色相、深色段减
  // 冷色（色相∈(60,240)）：浅色段减色相、深色段加
  const 是暖色: boolean = hsv.色相 <= 60 || hsv.色相 >= 240;
  let h: number;
  if (是暖色) {
    h = 浅色段 ? hsv.色相 + 色相步长 * i : hsv.色相 - 色相步长 * i;
  } else {
    h = 浅色段 ? hsv.色相 - 色相步长 * i : hsv.色相 + 色相步长 * i;
  }
  if (h < 0) {
    h += 360;
  }
  if (h >= 360) {
    h -= 360;
  }
  return h;
}

function 偏移饱和度(hsv: HSV颜色, i: number, 浅色段: boolean): number {
  let s: number;
  if (浅色段) {
    s = hsv.饱和度 - 浅色段饱和度步长 * i;
  } else if (i === 深色段档数) {
    s = hsv.饱和度 + 深色段末档饱和度步长;
  } else {
    s = hsv.饱和度 + 深色段饱和度步长 * i;
  }
  return Math.max(0, Math.min(100, s));
}

function 偏移明度(hsv: HSV颜色, i: number, 浅色段: boolean): number {
  let v: number;
  if (浅色段) {
    v = hsv.明度 + 浅色段明度步长 * i;
  } else if (i === 深色段档数) {
    v = hsv.明度 - 深色段末档明度步长;
  } else {
    v = hsv.明度 - 深色段明度步长 * i;
  }
  return Math.max(0, Math.min(100, v));
}

/**
 * 从种子色生成 10 档色阶（shade 1-10）。
 * shades[0]=shade1（最浅）、shades[5]=shade6（种子）、shades[9]=shade10（最深）。
 */
export function 生成色阶(种子hex: string): 色阶数组 {
  const 种子rgb: [number, number, number] = 十六进制转RGB(种子hex);
  const 种子: HSV颜色 = RGB转HSV(种子rgb[0], 种子rgb[1], 种子rgb[2]);
  const 色阶: string[] = [];

  // shade 1-5（浅色段，i 从 浅色段档数 递减到 1）
  for (let i: number = 浅色段档数; i >= 1; i--) {
    const h: number = 偏移色相(种子, i, true);
    const s: number = 偏移饱和度(种子, i, true);
    const v: number = 偏移明度(种子, i, true);
    const rgb: [number, number, number] = HSV转RGB(h, s, v);
    色阶.push(RGB转十六进制(rgb[0], rgb[1], rgb[2]));
  }

  // shade 6（种子原色）
  色阶.push(种子hex);

  // shade 7-10（深色段，i 从 1 到 深色段档数）
  for (let i: number = 1; i <= 深色段档数; i++) {
    const h: number = 偏移色相(种子, i, false);
    const s: number = 偏移饱和度(种子, i, false);
    const v: number = 偏移明度(种子, i, false);
    const rgb: [number, number, number] = HSV转RGB(h, s, v);
    色阶.push(RGB转十六进制(rgb[0], rgb[1], rgb[2]));
  }

  return 色阶;
}

/** 浅色模式卡片底色（与 resources base/color.json surface_card 对齐，
 *  用于主色文字/主色图标/主色边框 的对比度搜索参考）。 */
const 浅色卡片底色: string = '#FFFFFF';
/** 深色模式卡片底色（与 resources dark/color.json surface_card 对齐，
 *  用于深色模式主色文字/主色边框 的对比度搜索参考）。 */
const 深色卡片底色: string = '#18202B';

/**
 * 由种子色构建完整色阶 + 语义色（按 是否深色 自动选档）。
 *
 * 浅色模式选档（参考 ArcoDesign light semantics）：
 * - 主色 = shade 6（种子）
 * - 悬停 = shade 5、按下 = shade 7
 * - 容器 = shade 1、容器悬停 = shade 2
 * - 边框/图标/文字：用 选取对比度达标档索引 搜索首个满足 WCAG 阈值的档
 *   （2.1.4.1 对比度修复：高明度主题 shade 6/7 在白底上不达标，需深一档或几档；
 *    所有主题 shade 3 边框在白底上不达标，需深一档或几档）
 *
 * 深色模式选档（参考 ArcoDesign dark semantics）：
 * - 主色 = shade 5（比浅色浅一档，保证暗背景上可读）
 * - 悬停 = shade 4、按下 = shade 6
 * - 容器 = shade 10、容器悬停 = shade 9
 * - 边框/文字：用 选取对比度达标档索引 向浅档搜索（更亮 = 与深底对比更高）
 *   （2.1.4.1 对比度修复：极光蓝/暗夜紫 shade 5/7 在深底上不达标，需浅一档；
 *    其他主题已达标保持不变）
 */
export function 构建完整色阶(种子hex: string, 是否深色: boolean): 完整色阶 {
  const 色阶: 色阶数组 = 生成色阶(种子hex);
  if (是否深色) {
    // 按钮背景：从 shade 5（idx 4）向深档搜索首个白字 ≥4.5 的档
    const 按钮档索引: number = 选取白字达标档索引(色阶, 4);
    const 按钮按下档索引: number = Math.min(按钮档索引 + 1, 色阶.length - 1);
    // 主色文字：从 shade 5（idx 4）向浅档搜索，配深色卡片底 ≥4.5:1
    //   极光蓝 shade 5 = 4.39（差 0.11）、暗夜紫 shade 5 = 3.55 不达标，浅一档；其他主题达标保持不变
    const 主色文字档索引: number = 选取对比度达标档索引(色阶, 4, 深色卡片底色, 4.5, false);
    // 主色边框：从 shade 7（idx 6）向浅档搜索，配深色卡片底 ≥3:1
    //   极光蓝 shade 7 = 1.90、暗夜紫 shade 7 = 1.66 不达标，浅一档；其他主题达标保持不变
    const 主色边框档索引: number = 选取对比度达标档索引(色阶, 6, 深色卡片底色, 3, false);
    return {
      色阶,
      语义: {
        主色: 色阶[4],                // shade 5：暗背景上需更亮，比浅色 主色 浅一档
        主色悬停: 色阶[3],            // shade 4
        主色按下: 色阶[5],            // shade 6
        按钮背景主色: 色阶[按钮档索引],
        按钮背景按下: 色阶[按钮按下档索引],
        主色容器: 色阶[9],            // shade 10（深色容器）
        主色容器悬停: 色阶[8],        // shade 9
        主色边框: 色阶[主色边框档索引],
        // AppGallery 审核修复：图标可能落在比卡底更深的 页面底色微染 上
        //（碧涛青 shade 5 配微染底 2.91 <3），改为以页面底为参考搜索达标档
        主色图标: 色阶[选取对比度达标档索引(色阶, 4, '#10151D', 3, false)],
        主色文字: 色阶[主色文字档索引]
      }
    };
  }
  // 浅色：按钮背景从 shade 6（idx 5）向深档搜索首个白字 ≥4.5 的档
  const 按钮档索引浅色: number = 选取白字达标档索引(色阶, 5);
  const 按钮按下档索引浅色: number = Math.min(按钮档索引浅色 + 1, 色阶.length - 1);
  // 主色文字：从 shade 7（idx 6）向深档搜索，配浅色卡片底 ≥4.5:1
  //   高明度主题（绿/青/橙/黄）shade 7 不达标（2.64~4.29），深一档或几档；蓝/紫达标保持不变
  const 主色文字档索引浅色: number = 选取对比度达标档索引(色阶, 6, 浅色卡片底色, 4.5, true);
  // 主色图标：从 shade 6（idx 5）向深档搜索，配浅色页面底 ≥3.15:1
  //   高明度主题 shade 6 不达标（1.75~2.78），深一档或几档；蓝/紫达标保持不变
  //   AppGallery 审核修复：参考底从纯白改为页面底 #F5F7FA 并留余量——
  //   图标常落在各主题 页面底色微染（6% 主色混入页面底，略深于纯白）上，纯白参考会漏检（碧涛青 2.91）
  const 主色图标档索引浅色: number = 选取对比度达标档索引(色阶, 5, '#F5F7FA', 3.15, true);
  // 主色边框：从 shade 3（idx 2）向深档搜索，配浅色卡片底 ≥3:1
  //   所有主题 shade 3 不达标（1.18~1.89），深一档或几档
  const 主色边框档索引浅色: number = 选取对比度达标档索引(色阶, 2, 浅色卡片底色, 3, true);
  return {
    色阶,
    语义: {
      主色: 色阶[5],                 // shade 6 = 种子
      主色悬停: 色阶[4],             // shade 5
      主色按下: 色阶[6],             // shade 7
      按钮背景主色: 色阶[按钮档索引浅色],
      按钮背景按下: 色阶[按钮按下档索引浅色],
      主色容器: 色阶[1],             // shade 2（原 shade 1 对蓝/紫饱和度被减到 0%=纯白，选中态不可见）
      主色容器悬停: 色阶[2],         // shade 3（原 shade 2，跟随 容器 上移一档）
      主色边框: 色阶[主色边框档索引浅色],
      主色图标: 色阶[主色图标档索引浅色],
      主色文字: 色阶[主色文字档索引浅色]
    }
  };
}

/** 实色按钮沿用公共对比度计算，自动选择黑字或白字。 */
export function themeSolidTextColor(background: string): string {
  return 对比度('#000000', background) >= 对比度('#FFFFFF', background) ? '#000000' : '#FFFFFF';
}
