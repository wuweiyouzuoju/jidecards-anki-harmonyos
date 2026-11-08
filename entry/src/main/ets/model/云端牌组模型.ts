// SPDX-License-Identifier: AGPL-3.0-or-later

/** 云端牌组的访问方式；兑换码能力只保留协议位，本版本不负责兑换。 */
export type 云端牌组访问类型 = 'public' | 'redeem_code';

export const CLOUD_DECK_MAX_COUNT: number = 3;
export const CLOUD_DECK_MAX_MB: number = 100;
export const CLOUD_DECK_MAX_BYTES: number = CLOUD_DECK_MAX_MB * 1024 * 1024;
export const CLOUD_DECK_QQ_GROUP: string = '726837065';

/** 经过校验、可以交给界面和下载服务使用的目录条目。 */
export interface 云端牌组目录项 {
  id: string;
  name: string;
  description: string;
  version: string;
  accessType: 云端牌组访问类型;
  downloadUrl: string;
  coverUrl?: string;
  size?: number;
  cardCount?: number;
}

/** 当前应用支持的云端牌组目录。 */
export interface 云端牌组目录 {
  schemaVersion: number;
  decks: 云端牌组目录项[];
}

export type CloudDeckSelectionIssue = 'count' | 'size' | 'unavailable' | 'retry_only';

export function cloudDeckSelectionIssue(decks: 云端牌组目录项[], ids: string[],
  successIds: string[], failedIds: string[]): CloudDeckSelectionIssue | null {
  if (ids.length + successIds.length > CLOUD_DECK_MAX_COUNT) return 'count';
  const unique: Set<string> = new Set<string>();
  let bytes: number = 0;
  for (const id of successIds.concat(ids)) {
    if (unique.has(id)) return 'unavailable';
    unique.add(id);
    const deck: 云端牌组目录项 | undefined = decks.find((item: 云端牌组目录项): boolean => item.id === id);
    if (deck === undefined || deck.accessType !== 'public' || deck.size === undefined ||
      !Number.isSafeInteger(deck.size) || deck.size <= 0) return 'unavailable';
    bytes += deck.size;
    if (bytes > CLOUD_DECK_MAX_BYTES) return 'size';
  }
  if (successIds.length > 0 && ids.some((id: string): boolean => failedIds.indexOf(id) < 0)) return 'retry_only';
  return null;
}

interface 原始牌组目录项 {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  accessType?: string;
  downloadUrl?: string;
  coverUrl?: string;
  size?: number;
  cardCount?: number;
}

interface 原始云端牌组目录 {
  schemaVersion?: number;
  decks?: 原始牌组目录项[];
}

function 是安全牌组ID(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id);
}

function 是HTTPS地址(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url);
}

function 是有效大小(size: number | undefined): boolean {
  return size === undefined || (Number.isInteger(size) && size >= 0);
}

function 是有效卡片数量(cardCount: number | undefined): boolean {
  return cardCount === undefined || (Number.isInteger(cardCount) && cardCount > 0);
}

function 解析目录项(raw: 原始牌组目录项): 云端牌组目录项 | null {
  const id: string = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name: string = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description: string = typeof raw.description === 'string' ? raw.description.trim() : '';
  const version: string = typeof raw.version === 'string' ? raw.version.trim() : '';
  const accessType: string = typeof raw.accessType === 'string' ? raw.accessType : '';
  const downloadUrl: string = typeof raw.downloadUrl === 'string' ? raw.downloadUrl.trim() : '';

  if (!是安全牌组ID(id) || name.length === 0 || version.length === 0 || !是有效大小(raw.size) ||
    !是有效卡片数量(raw.cardCount)) {
    return null;
  }
  if (accessType !== 'public' && accessType !== 'redeem_code') {
    return null;
  }
  if (accessType === 'public' && !是HTTPS地址(downloadUrl)) {
    return null;
  }
  if (accessType === 'redeem_code' && downloadUrl.length > 0 && !是HTTPS地址(downloadUrl)) {
    return null;
  }

  const item: 云端牌组目录项 = {
    id: id,
    name: name,
    description: description,
    version: version,
    accessType: accessType,
    downloadUrl: downloadUrl
  };
  if (raw.size !== undefined) {
    item.size = raw.size;
  }
  if (raw.cardCount !== undefined) {
    item.cardCount = raw.cardCount;
  }
  if (typeof raw.coverUrl === 'string' && 是HTTPS地址(raw.coverUrl.trim())) {
    item.coverUrl = raw.coverUrl.trim();
  }
  return item;
}

/**
 * 解析并过滤由第三方托管返回的 JSON 目录。
 * 目录级协议错误会抛错；单个坏条目会被忽略，避免一项配置错误拖垮整个目录。
 */
export function 解析云端牌组目录(jsonText: string): 云端牌组目录 {
  let raw: 原始云端牌组目录;
  try {
    raw = JSON.parse(jsonText) as 原始云端牌组目录;
  } catch (error) {
    throw new Error('云端牌组目录 JSON 无效');
  }

  if (raw.schemaVersion !== 1) {
    throw new Error('不支持的云端牌组目录版本');
  }
  if (!Array.isArray(raw.decks)) {
    throw new Error('云端牌组目录缺少牌组列表');
  }

  const decks: 云端牌组目录项[] = [];
  const seenIds: Set<string> = new Set<string>();
  for (const rawItem of raw.decks) {
    if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue;
    }
    const item: 云端牌组目录项 | null = 解析目录项(rawItem);
    if (item === null || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    decks.push(item);
  }
  return { schemaVersion: 1, decks: decks };
}

/** 将可选字节数格式化为适合目录列表展示的短文本。 */
export function 格式化云端牌组大小(size: number | undefined): string {
  if (size === undefined || size < 0) {
    return '';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    const kilobytes: number = Math.round(size / 102.4) / 10;
    return `${kilobytes} KB`;
  }
  const megabytes: number = Math.round(size / (1024 * 102.4)) / 10;
  return `${megabytes} MB`;
}
