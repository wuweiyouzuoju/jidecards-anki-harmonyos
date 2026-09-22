// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { resourceText } from '../../utils/UiFeedback';

// ========================================================
// @块ID UI-COMMON-THEMETEXT
// @名称 幻彩文字渲染
//
// @作用
// 把主题强调色板应用到标签文字，放入原生 Text 保留字号、字重、截断和本地化参数。
//
// @业务规则
// - 数据文字（时间、计数、百分比、号码、链接、路径）不换色，调用方传空色板沿用原单色；
// - 标签文字在色板前两色之间按字符位置线性插值，整段读作一条连续渐变；
// - 少于 3 个字的标签直接用首色，两个字不会出现两种颜色。
//
// @Invariants
// - 禁止逐字对色板取模轮换色相：四个色相跳色会被读成“一个数字一个颜色”。
// - 只插值 RGB 并保留首尾两色本身，不改变字重、截断与逐字点击。
//
// @Extension Points
// 需要更多色相时扩宽 themeAccentRampColor 的取色区间，不要在调用点恢复取模。
// ========================================================

export interface ThemeLabelGlyph {
  letter: string;
  color: string;
}

/** 保留本地化参数与 Unicode 码点，不把表情拆成两个字形。 */
function themeLabelCharacters(label: ResourceStr, context: UIContext): string[] {
  if (typeof label === 'string') return label.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) ?? [];
  const args: Array<string | number> = [];
  if (label.params !== undefined) {
    for (let index: number = 1; index < label.params.length; index++) {
      const value: Object = label.params[index];
      if (typeof value === 'string' || typeof value === 'number') args.push(value);
    }
  }
  const text: string = resourceText(context, label, ...args);
  return text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) ?? [];
}

/** 解析 #RRGGBB / #AARRGGBB，只取 RGB 参与插值。 */
function themeAccentRgb(color: string): number[] {
  const hex: string = color.startsWith('#') ? color.slice(1) : color;
  const rgb: string = hex.length === 8 ? hex.slice(2) : hex;
  return [parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)];
}

/** 在首色与次色之间按字符位置取色；色板不足两色或少于 3 个字时用首色。 */
export function themeAccentRampColor(index: number, length: number, colors: string[]): string {
  if (colors.length < 2 || length < 3) return colors[0];
  if (index <= 0) return colors[0];
  if (index >= length - 1) return colors[1];
  const from: number[] = themeAccentRgb(colors[0]);
  const to: number[] = themeAccentRgb(colors[1]);
  const amount: number = index / (length - 1);
  let result: string = '#';
  for (let channel: number = 0; channel < 3; channel++) {
    const value: number = Math.round(from[channel] + (to[channel] - from[channel]) * amount);
    result += value.toString(16).padStart(2, '0').toUpperCase();
  }
  return result;
}

/** 逐字颜色在进入 ForEach 前一次算完，避免在 item builder 里按字符重复查资源。 */
export function themeLabelGlyphs(label: ResourceStr, colors: string[], context: UIContext): ThemeLabelGlyph[] {
  const letters: string[] = themeLabelCharacters(label, context);
  return letters.map((letter: string, index: number): ThemeLabelGlyph => ({
    letter: letter, color: themeAccentRampColor(index, letters.length, colors)
  }));
}

/** 放入原生 Text，继承字号、字重和排版；普通/禁用/危险/数据文字传空色板。 */
@Builder
export function ThemeTextSpans(label: ResourceStr, colors: string[], context: UIContext) {
  if (colors.length > 0) {
    ForEach(themeLabelGlyphs(label, colors, context), (glyph: ThemeLabelGlyph) => {
      Span(glyph.letter).fontColor(glyph.color)
    }, (glyph: ThemeLabelGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
  } else {
    Span(label)
  }
}
