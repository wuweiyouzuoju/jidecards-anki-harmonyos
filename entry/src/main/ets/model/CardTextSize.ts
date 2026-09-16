// SPDX-License-Identifier: AGPL-3.0-or-later

export const CARD_TEXT_SIZE_KEY: string = 'cardTextSizePercent';
export const DEFAULT_CARD_TEXT_SIZE: number = 100;
export const MIN_CARD_TEXT_SIZE: number = 50;
export const MAX_CARD_TEXT_SIZE: number = 200;

/** 将本机卡片文字缩放限制到可读范围，非法存储值回退到原始大小。 */
export function normalizeCardTextSize(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_CARD_TEXT_SIZE, Math.max(MIN_CARD_TEXT_SIZE, Math.round(value)))
    : DEFAULT_CARD_TEXT_SIZE;
}
