// SPDX-License-Identifier: AGPL-3.0-or-later

export type 官方公告语言 = 'zh-Hans' | 'en';

export interface 官方公告展示项 {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  actionUrl: string;
}

export interface 原始官方公告 {
  id?: string;
  enabled?: boolean;
  titleZh?: string;
  contentZh?: string;
  titleEn?: string;
  contentEn?: string;
  publishedAt?: string;
  startsAt?: string;
  expiresAt?: string;
  minimumAppVersion?: string;
  maximumAppVersion?: string;
  actionUrl?: string;
}

interface 原始官方公告文档 {
  schemaVersion?: number;
  announcement?: 原始官方公告 | null;
}

const 最大响应字节数: number = 65536;
const 最多已确认ID数: number = 32;
const 总截止毫秒: number = 2000;

/** 主页返回检查窗口与 CDN 时间桶共用：10 分钟。 */
export const 官方公告检查窗口毫秒: number = 10 * 60 * 1000;

function UTF8字节数(value: string): number {
  let bytes: number = 0;
  for (let index: number = 0; index < value.length; index++) {
    const code: number = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function 官方公告ID有效(id: string): boolean {
  return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9._-]+$/.test(id);
}

function HTTPS地址有效(url: string): boolean {
  if (url.length === 0) return true;
  const rest: string = url.replace(/^https:\/\//i, '');
  if (rest.length === url.length) return false;
  const host: string = rest.split('/')[0].split('?')[0].split('#')[0];
  return /^[A-Za-z0-9._~-]+(?::\d{1,5})?$/.test(host);
}

function 版本有效(version: string): boolean {
  return /^\d+(?:\.\d+){1,3}$/.test(version);
}

function 比较版本(left: string, right: string): number {
  const leftParts: number[] = left.split('.').map((item: string): number => Number(item));
  const rightParts: number[] = right.split('.').map((item: string): number => Number(item));
  const count: number = Math.max(leftParts.length, rightParts.length);
  for (let index: number = 0; index < count; index++) {
    const leftValue: number = index < leftParts.length ? leftParts[index] : 0;
    const rightValue: number = index < rightParts.length ? rightParts[index] : 0;
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

function 必填文本(value: string | undefined, maxLength: number, field: string): string {
  const text: string = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > maxLength) throw new Error(`官方公告 ${field} 无效`);
  return text;
}

function 有效时间(value: string | undefined, field: string): number {
  const text: string = typeof value === 'string' ? value : '';
  const time: number = Date.parse(text);
  if (text.length === 0 || !Number.isFinite(time)) throw new Error(`官方公告 ${field} 无效`);
  return time;
}

export function 解析可展示官方公告(
  jsonText: string,
  currentVersion: string,
  nowMs: number,
  language: 官方公告语言
): 官方公告展示项 | null {
  if (UTF8字节数(jsonText) > 最大响应字节数) throw new Error('官方公告响应超过 64 KiB');
  let raw: 原始官方公告文档;
  try {
    raw = JSON.parse(jsonText) as 原始官方公告文档;
  } catch (error) {
    throw new Error('官方公告 JSON 无效');
  }
  if (raw === null || raw.schemaVersion !== 1) throw new Error('官方公告协议版本无效');
  if (raw.announcement === null) return null;
  if (raw.announcement === undefined || typeof raw.announcement !== 'object' || Array.isArray(raw.announcement)) {
    throw new Error('官方公告数据缺失');
  }
  const item: 原始官方公告 = raw.announcement;
  if (item.enabled !== true) return null;
  const id: string = typeof item.id === 'string' ? item.id.trim() : '';
  if (!官方公告ID有效(id)) throw new Error('官方公告 ID 无效');
  const titleZh: string = 必填文本(item.titleZh, 80, '中文标题');
  const contentZh: string = 必填文本(item.contentZh, 4000, '中文正文');
  const titleEn: string = typeof item.titleEn === 'string' ? item.titleEn.trim() : '';
  const contentEn: string = typeof item.contentEn === 'string' ? item.contentEn.trim() : '';
  if (titleEn.length > 80 || contentEn.length > 4000) throw new Error('官方公告英文内容过长');
  有效时间(item.publishedAt, '发布时间');
  const startsTime: number = 有效时间(item.startsAt, '开始时间');
  const expiresTime: number = 有效时间(item.expiresAt, '过期时间');
  if (startsTime >= expiresTime) throw new Error('官方公告时间窗无效');
  const minimumVersion: string = typeof item.minimumAppVersion === 'string' ? item.minimumAppVersion.trim() : '';
  const maximumVersion: string = typeof item.maximumAppVersion === 'string' ? item.maximumAppVersion.trim() : '';
  if (!版本有效(currentVersion) || !版本有效(minimumVersion) ||
    (maximumVersion.length > 0 && !版本有效(maximumVersion))) throw new Error('官方公告版本范围无效');
  const actionUrl: string = typeof item.actionUrl === 'string' ? item.actionUrl.trim() : '';
  if (!HTTPS地址有效(actionUrl)) throw new Error('官方公告详情地址无效');
  if (nowMs < startsTime || nowMs >= expiresTime || 比较版本(currentVersion, minimumVersion) < 0 ||
    (maximumVersion.length > 0 && 比较版本(currentVersion, maximumVersion) > 0)) return null;
  return {
    id: id,
    title: language === 'en' && titleEn.length > 0 ? titleEn : titleZh,
    content: language === 'en' && contentEn.length > 0 ? contentEn : contentZh,
    publishedAt: item.publishedAt as string,
    actionUrl: actionUrl
  };
}

function 两位(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** 使用设备时区展示服务器记录的发布时间，保留到秒。 */
export function 格式化公告发布时间(value: string): string {
  const date: Date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${两位(date.getMonth() + 1)}-${两位(date.getDate())} ` +
    `${两位(date.getHours())}:${两位(date.getMinutes())}:${两位(date.getSeconds())}`;
}

/**
 * 123 直链 CDN 忽略查询参数，但会区分百分号编码中字母的大小写；两种写法在源站仍指向同一文件。
 * 每个 10 分钟时间桶轮换一种等价路径，避免删除后同名上传仍命中旧边缘缓存。
 */
function 轮换等价路径编码(baseUrl: string, bucketIndex: number): string {
  const queryIndex: number = baseUrl.indexOf('?');
  const path: string = queryIndex >= 0 ? baseUrl.substring(0, queryIndex) : baseUrl;
  const query: string = queryIndex >= 0 ? baseUrl.substring(queryIndex) : '';
  let letterIndex: number = 0;
  let rotated: string = '';
  for (let index: number = 0; index < path.length; index++) {
    const value: string = path[index];
    const inEscape: boolean = index >= 1 && path[index - 1] === '%' ||
      index >= 2 && path[index - 2] === '%';
    if (inEscape && /^[A-Fa-f]$/.test(value)) {
      const useLowerCase: boolean = Math.floor(bucketIndex / Math.pow(2, letterIndex)) % 2 === 1;
      rotated += useLowerCase ? value.toLowerCase() : value.toUpperCase();
      letterIndex += 1;
    } else {
      rotated += value;
    }
  }
  return `${rotated}${query}`;
}

export function 构建官方公告请求地址(baseUrl: string, nowMs: number): string {
  const bucketIndex: number = Math.floor(nowMs / 官方公告检查窗口毫秒);
  const bucketMs: number = bucketIndex * 官方公告检查窗口毫秒;
  const date: Date = new Date(bucketMs);
  const key: string = `${date.getUTCFullYear()}${两位(date.getUTCMonth() + 1)}${两位(date.getUTCDate())}` +
    `${两位(date.getUTCHours())}${两位(date.getUTCMinutes())}`;
  const rotatedUrl: string = 轮换等价路径编码(baseUrl, bucketIndex);
  return `${rotatedUrl}${rotatedUrl.indexOf('?') >= 0 ? '&' : '?'}v=${key}`;
}

/** 返回主页后距离下一次允许检查还剩多少毫秒；0 表示现在即可检查。 */
export function 官方公告检查延迟毫秒(lastCheckStartedAtMs: number, nowMs: number): number {
  if (lastCheckStartedAtMs <= 0) return 0;
  const elapsed: number = nowMs - lastCheckStartedAtMs;
  if (elapsed < 0) return 官方公告检查窗口毫秒;
  if (elapsed >= 官方公告检查窗口毫秒) return 0;
  return 官方公告检查窗口毫秒 - elapsed;
}

export function 追加已确认官方公告ID(ids: string[], id: string): string[] {
  const next: string[] = ids.filter((item: string): boolean => 官方公告ID有效(item) && item !== id);
  if (官方公告ID有效(id)) next.push(id);
  return next.length <= 最多已确认ID数 ? next : next.slice(next.length - 最多已确认ID数);
}

/** 公告请求的总截止预算：返回距离 2 秒硬截止还剩多少毫秒，超时钳为 0。 */
export function 官方公告截止剩余毫秒(startMs: number, nowMs: number): number {
  const remaining: number = 总截止毫秒 - (nowMs - startMs);
  return remaining > 0 ? remaining : 0;
}
