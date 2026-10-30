import test from 'node:test';
import assert from 'node:assert/strict';

import {
  解析可展示官方公告,
  构建官方公告请求地址,
  追加已确认官方公告ID,
  官方公告截止剩余毫秒,
  官方公告检查窗口毫秒,
  官方公告检查延迟毫秒,
} from '../../entry/src/main/ets/model/官方公告模型.ts';

const documentOf = (announcement) => JSON.stringify({ schemaVersion: 1, announcement });

const active = {
  id: '20260829-01',
  enabled: true,
  titleZh: '官方公告',
  contentZh: '中文正文',
  titleEn: 'Official announcement',
  contentEn: 'English body',
  publishedAt: '2026-08-29T18:00:00+08:00',
  startsAt: '2026-08-29T18:00:00+08:00',
  expiresAt: '2026-09-30T23:59:59+08:00',
  minimumAppVersion: '2.0.0',
  maximumAppVersion: '',
  actionUrl: 'https://example.com/announcement.html',
};

test('parses a targeted announcement and chooses the requested language', () => {
  const now = Date.parse('2026-08-30T00:00:00+08:00');
  const zh = 解析可展示官方公告(documentOf(active), '2.3.3', now, 'zh-Hans');
  const en = 解析可展示官方公告(documentOf(active), '2.3.3', now, 'en');
  assert.equal(zh?.title, '官方公告');
  assert.equal(en?.content, 'English body');
  assert.equal(en?.publishedAt, active.publishedAt);
  assert.equal(en?.actionUrl, active.actionUrl);
});

test('falls back field-by-field to Chinese when English copy is empty', () => {
  const raw = { ...active, titleEn: '', contentEn: '' };
  const item = 解析可展示官方公告(
    documentOf(raw), '2.3.3', Date.parse('2026-08-30T00:00:00+08:00'), 'en');
  assert.equal(item?.title, active.titleZh);
  assert.equal(item?.content, active.contentZh);
});

test('returns null for disabled, null, early, expired, and out-of-range notices', () => {
  const now = Date.parse('2026-08-30T00:00:00+08:00');
  assert.equal(解析可展示官方公告(documentOf(null), '2.3.3', now, 'zh-Hans'), null);
  assert.equal(解析可展示官方公告(documentOf({ ...active, enabled: false }), '2.3.3', now, 'zh-Hans'), null);
  assert.equal(解析可展示官方公告(documentOf(active), '2.3.3', Date.parse('2026-08-28T00:00:00+08:00'), 'zh-Hans'), null);
  assert.equal(解析可展示官方公告(documentOf(active), '2.3.3', Date.parse('2026-10-01T00:00:00+08:00'), 'zh-Hans'), null);
  assert.equal(解析可展示官方公告(documentOf({ ...active, minimumAppVersion: '3.0.0' }), '2.3.3', now, 'zh-Hans'), null);
  assert.equal(解析可展示官方公告(documentOf({ ...active, maximumAppVersion: '2.2.9' }), '2.3.3', now, 'zh-Hans'), null);
});

test('rejects malformed and unsafe protocol data', () => {
  const now = Date.parse('2026-08-30T00:00:00+08:00');
  assert.throws(() => 解析可展示官方公告('{', '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告(JSON.stringify({ schemaVersion: 2, announcement: active }), '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告(documentOf({ ...active, id: '../bad' }), '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告(documentOf({ ...active, actionUrl: 'http://example.com' }), '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告(documentOf({ ...active, expiresAt: active.startsAt }), '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告(documentOf({ ...active, titleZh: 'x'.repeat(81) }), '2.3.3', now, 'zh-Hans'));
  assert.throws(() => 解析可展示官方公告('你'.repeat(22000), '2.3.3', now, 'zh-Hans'), /64 KiB/);
});

test('rejects detail URLs without a valid HTTPS host', () => {
  const now = Date.parse('2026-08-30T00:00:00+08:00');
  for (const badUrl of ['https://?', 'https:///path', 'https://', 'http://example.com']) {
    assert.throws(() => 解析可展示官方公告(documentOf({ ...active, actionUrl: badUrl }), '2.3.3', now, 'zh-Hans'));
  }
  const bare = 解析可展示官方公告(documentOf({ ...active, actionUrl: '' }), '2.3.3', now, 'zh-Hans');
  assert.equal(bare?.actionUrl, '');
  const hostOnly = 解析可展示官方公告(documentOf({ ...active, actionUrl: 'https://example.com' }), '2.3.3', now, 'zh-Hans');
  assert.equal(hostOnly?.actionUrl, 'https://example.com');
  const withPort = 解析可展示官方公告(documentOf({ ...active, actionUrl: 'https://example.com:8443/a.html' }), '2.3.3', now, 'zh-Hans');
  assert.equal(withPort?.actionUrl, 'https://example.com:8443/a.html');
});

test('request deadline clamps elapsed time into the two-second budget', () => {
  const start = 1000000;
  assert.equal(官方公告截止剩余毫秒(start, start), 2000);
  assert.equal(官方公告截止剩余毫秒(start, start + 500), 1500);
  assert.equal(官方公告截止剩余毫秒(start, start + 2000), 0);
  assert.equal(官方公告截止剩余毫秒(start, start + 9000), 0);
});

test('builds a stable ten-minute cache key', () => {
  const a = 构建官方公告请求地址(
    'https://example.com/announcement.json', Date.parse('2026-08-29T18:03:01Z'));
  const b = 构建官方公告请求地址(
    'https://example.com/announcement.json', Date.parse('2026-08-29T18:09:59Z'));
  const c = 构建官方公告请求地址(
    'https://example.com/announcement.json?channel=stable', Date.parse('2026-08-29T18:10:00Z'));
  assert.equal(a, b);
  assert.match(a, /\?v=202608291800$/);
  assert.match(c, /&v=202608291810$/);
});

test('rotates an equivalent encoded path between ten-minute windows', () => {
  const base =
    'https://4001784660.cdn.123clouddisk.com/4001784660/CET%E5%9B%9B%E5%85%AD%E7%BA%A7/announcement.json';
  const first = 构建官方公告请求地址(base, Date.parse('2026-08-29T18:00:00Z'));
  const sameWindow = 构建官方公告请求地址(base, Date.parse('2026-08-29T18:09:59Z'));
  const nextWindow = 构建官方公告请求地址(base, Date.parse('2026-08-29T18:10:00Z'));
  const firstPath = first.split('?')[0];
  const nextPath = nextWindow.split('?')[0];

  assert.equal(first, sameWindow);
  assert.notEqual(firstPath, nextPath);
  assert.equal(decodeURI(firstPath), decodeURI(base));
  assert.equal(decodeURI(nextPath), decodeURI(base));
});

test('home check delay is immediate initially and otherwise bounded by ten minutes', () => {
  const start = 1000000;
  assert.equal(官方公告检查窗口毫秒, 600000);
  assert.equal(官方公告检查延迟毫秒(0, start), 0);
  assert.equal(官方公告检查延迟毫秒(start, start), 600000);
  assert.equal(官方公告检查延迟毫秒(start, start + 9 * 60 * 1000), 60000);
  assert.equal(官方公告检查延迟毫秒(start, start + 10 * 60 * 1000), 0);
  assert.equal(官方公告检查延迟毫秒(start, start + 60 * 60 * 1000), 0);
  assert.equal(官方公告检查延迟毫秒(start + 1000, start), 600000);
});

test('acknowledged ids are unique and bounded to the latest 32', () => {
  let ids = [];
  for (let index = 0; index < 35; index += 1) {
    ids = 追加已确认官方公告ID(ids, `notice-${index}`);
  }
  ids = 追加已确认官方公告ID(ids, 'notice-34');
  assert.equal(ids.length, 32);
  assert.equal(ids[0], 'notice-3');
  assert.equal(ids.at(-1), 'notice-34');
  assert.equal(ids.filter((id) => id === 'notice-34').length, 1);
});
