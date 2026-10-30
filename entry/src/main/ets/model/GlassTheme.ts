// SPDX-License-Identifier: AGPL-3.0-or-later
/** 玻璃保留原 alpha 和明暗层次，只给底色加入少量当前主题色。 */
export function tintGlassFill(fill: string, accent: string, dark: boolean): string {
  if (!/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(fill) || !/^#[\da-f]{6}$/i.test(accent)) return fill;
  const rgb: string = fill.slice(-6);
  const theme: string = accent.slice(1);
  const weight: number = dark ? 0.12 : 0.10;
  let mixed: string = '';
  for (let index: number = 0; index < 6; index += 2) {
    const value: number = Math.round(parseInt(rgb.slice(index, index + 2), 16) * (1 - weight) +
      parseInt(theme.slice(index, index + 2), 16) * weight);
    mixed += value.toString(16).padStart(2, '0');
  }
  return '#' + (fill.length === 9 ? fill.slice(1, 3) : '') + mixed.toUpperCase();
}
