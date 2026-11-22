// SPDX-License-Identifier: AGPL-3.0-or-later
import { normalizedAccent, rgbAccent } from './AppearanceCustomization';
export interface PickerColor { hue: number; saturation: number; brightness: number; }
export function accentToPicker(hex: string, fallbackHue: number = 0): PickerColor {
  const color: string = normalizedAccent(hex);
  const red: number = parseInt(color.slice(1, 3), 16) / 255;
  const green: number = parseInt(color.slice(3, 5), 16) / 255;
  const blue: number = parseInt(color.slice(5, 7), 16) / 255;
  const high: number = Math.max(red, green, blue), low: number = Math.min(red, green, blue);
  const delta: number = high - low;
  let hue: number = fallbackHue;
  if (delta > 0) {
    hue = high === red ? 60 * ((green - blue) / delta % 6) :
      high === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation: high === 0 ? 0 : delta / high * 100, brightness: high * 100 };
}
export function pickerToAccent(hue: number, saturation: number, brightness: number): string {
  const h: number = ((hue % 360) + 360) % 360 / 60;
  const s: number = Math.max(0, Math.min(100, saturation)) / 100;
  const v: number = Math.max(0, Math.min(100, brightness)) / 100;
  const c: number = v * s, x: number = c * (1 - Math.abs(h % 2 - 1)), m: number = v - c;
  const parts: number[] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] :
    h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return rgbAccent((parts[0] + m) * 255, (parts[1] + m) * 255, (parts[2] + m) * 255);
}
export function pickerHue(x: number, y: number): number { return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
