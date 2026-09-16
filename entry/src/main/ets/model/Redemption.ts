// SPDX-License-Identifier: AGPL-3.0-or-later
import { themeForContent } from './ThemeCatalog';

export const IRIDESCENT_CONTENT: string = 'theme-iridescent';
export const THEME_MOTION_KEY: string = 'themeMotion';
export const APP_FOREGROUND_KEY: string = 'appForeground';

export interface RedemptionToken {
  fingerprint: string;
  contentId: string;
  message: string;
  signature: string;
  encoded: string;
}

/** 安装指纹只接受完整的 128 位随机值；展示分组不影响签名。 */
export function normalizeFingerprint(value: string): string {
  const compact: string = value.trim().toUpperCase().replace(new RegExp('^JCF1-'), '')
    .replace(new RegExp('[-\\s]', 'g'), '');
  return new RegExp('^[0-9A-F]{32}$').test(compact) ? compact : '';
}

/** 分组展示便于复制核对，不改变原始身份。 */
export function displayFingerprint(value: string): string {
  const fingerprint: string = normalizeFingerprint(value);
  if (fingerprint === '') return '';
  const groups: string[] = [];
  for (let index: number = 0; index < fingerprint.length; index += 4) {
    groups.push(fingerprint.slice(index, index + 4));
  }
  return 'JCF1-' + groups.join('-');
}

/**
 * 固定协议边界，拒绝截断、未知版本与多内容编码。
 * Invariants: message 的原始 ASCII 字节必须整体验签，不能先重排或改写字段。
 * Extension Points: 新内容使用独立 contentId；版本变更使用新的协议前缀。
 */
export function parseRedemption(value: string): RedemptionToken | null {
  if (value.length > 1024) return null;
  const encoded: string = value.replace(new RegExp('\\s', 'g'), '');
  const parts: string[] = encoded.split('.');
  // 内容编号用连字符，避免和字段分隔符混淆。
  if (parts.length !== 4 || parts[0] !== 'JCR1' ||
    !new RegExp('^[0-9A-F]{32}$').test(parts[1]) ||
    !new RegExp('^[a-z][a-z0-9-]{0,47}$').test(parts[2]) ||
    !new RegExp('^[A-Za-z0-9_-]{86}$').test(parts[3])) return null;
  return {
    fingerprint: parts[1], contentId: parts[2],
    message: parts.slice(0, 3).join('.'), signature: parts[3], encoded: encoded
  };
}

/** 当前版本可兑换内容白名单；每个码仅对应其中一项。 */
export function isSupportedContent(contentId: string): boolean {
  return themeForContent(contentId) !== undefined;
}

/** 同一指纹同一内容只保留一个凭证，多内容之间互不覆盖。 */
export function mergeRedemption(tokens: string[], token: RedemptionToken): string[] {
  return tokens.filter((value: string): boolean => {
    const existing: RedemptionToken | null = parseRedemption(value);
    return existing !== null && existing.contentId !== token.contentId;
  }).concat([token.encoded]);
}
