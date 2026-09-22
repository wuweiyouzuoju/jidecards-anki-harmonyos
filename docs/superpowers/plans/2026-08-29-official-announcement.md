# Official Startup Announcement Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Add a non-dismissible, once-per-announcement startup notice whose public JSON is hosted through 123 Cloud Disk static hosting and whose management credentials never enter the app.

**Architecture:** A pure TypeScript model validates the remote protocol and decides whether a notice targets the current version and time. A small NetworkKit service fetches the public JSON with a five-minute cache-busting key, an ArkData store remembers acknowledged IDs, and the home page serializes the announcement before the existing cloud-deck onboarding and version welcome modal. ArkUI renders remote text natively; optional detail HTML opens only in the system browser.

**Tech Stack:** HarmonyOS ArkTS/ArkUI, NetworkKit HTTP, ArkData Preferences, AbilityKit bundleManager/startAbility, 123 Cloud Disk static hosting, Node `node:test` contract tests.

## Global Constraints

- Treat this as a Structural change: execute on a feature branch/worktree, update `.trae/decisions.md` and `PROJECT_CONTEXT.md`, run `npm test`, `npm run build:app`, and perform device validation.
- The current checkout contains unrelated user changes; never stage them and never use `git add .`.
- Keep `entry/src/main/ets/model/官方公告模型.ts` free of `@kit.*` imports so Node tests can import it.
- The response body limit is exactly 65,536 UTF-8 bytes; title limit is 80 UTF-16 code units; content limit is 4,000 UTF-16 code units; ID limit is 64 characters.
- Announcement IDs accept only `A-Z a-z 0-9 . _ -`; the acknowledged list keeps the most recent 32 unique IDs.
- The static JSON request has `connectTimeout: 2000`, `readTimeout: 2000`, `usingCache: false`, and no retry.
- The production public URL is `https://4001784660.cdn.123clouddisk.com/4001784660/jidecards/announcement.json`.
- Device validation uses the isolated temporary URL `https://4001784660.cdn.123clouddisk.com/4001784660/jidecards/announcement-device-test.json`; it is never committed into production config.
- The client contains no 123 Cloud Disk account, Client ID, Client Secret, access token, refresh token, or upload credential.
- A storage failure after “我知道了” shows a localized warning but still closes the announcement and continues startup.
- Startup order is `官方公告 → 强制云端牌组引导 → 版本欢迎弹窗`; network or protocol failure must continue within about two seconds.
- The system back action and backdrop cannot dismiss the official announcement.
- All fixed user-visible copy uses matching base/en_US resource keys; remote title/body are data and may be rendered directly.
- Do not add an announcement center, history screen, unread badge, push notification, analytics, targeting backend, or embedded remote HTML.
- Never uninstall the app during validation; use `hdc install -r` only.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `entry/src/main/ets/model/官方公告模型.ts` | Pure protocol parsing, UTF-8 size validation, version/time targeting, language fallback, cache-key construction, bounded acknowledged-ID helper |
| `entry/src/main/ets/model/官方公告配置.ts` | Single production public JSON URL |
| `entry/src/main/ets/model/官方公告存储.ets` | Preferences read/write for the most recent 32 acknowledged IDs |
| `entry/src/main/ets/backend/官方公告服务.ets` | Two-second anonymous NetworkKit GET and conversion to a displayable announcement |
| `entry/src/main/ets/components/官方公告弹窗.ets` | Native themed presentation and acknowledgement/detail callbacks only |
| `entry/src/main/ets/pages/首页.ets` | Current version lookup, read-state check, startup sequencing, persistence result, external browser action |
| `hosting/announcement.json` | Deployable static-hosting manifest, initially disabled with `announcement: null` |
| `docs/official-announcement-hosting.md` | Exact publishing, rollback, cache, and validation procedure |
| `tools/tests/official-announcement-model.test.mjs` | Executable pure-model behavior tests |
| `tools/tests/official-announcement-flow-contract.test.mjs` | Storage/service/UI/home/hosting source contracts |
| `entry/src/main/resources/base/element/string.json` | Chinese fixed UI strings |
| `entry/src/main/resources/en_US/element/string.json` | Matching English fixed UI strings |
| `.trae/decisions.md` | Structural decision and final verification evidence |
| `PROJECT_CONTEXT.md` | New module boundary and extension route |

---

### Task 1: Pure announcement protocol and decision model

**Files:**
- Create: `entry/src/main/ets/model/官方公告模型.ts`
- Create: `tools/tests/official-announcement-model.test.mjs`
- Modify: `.trae/decisions.md`

**Interfaces:**
- Consumes: JSON text, `currentVersion: string`, `nowMs: number`, `language: 'zh-Hans' | 'en'`.
- Produces: `官方公告展示项`, `解析可展示官方公告(...)`, `构建官方公告请求地址(...)`, `追加已确认官方公告ID(...)`, `官方公告ID有效(...)`.

- [ ] **Step 1: Record the structural decision before implementation**

Append this decision section to `.trae/decisions.md`:

```markdown
---

## 2026-08-29：123 云盘静态托管官方启动公告

- **意图**: 让记得闪卡无需发版即可发布重要启动公告，每条公告在单台设备只确认一次。
- **做法**: 123 云盘公开托管单条 announcement.json；客户端原生解析和渲染；Preferences 保存最近 32 个已确认 ID；启动顺序为公告→云端牌组→版本欢迎。
- **备选**: 公告并入 cloud-decks.json（故障耦合，放弃）；内嵌静态 HTML（主题、安全和失败边界差，放弃）；自建动态 API（当前过度，放弃）。
- **假设**: 公开直链接受查询参数；当前已用直链实测追加 `?v=` 仍返回 HTTP 200。
- **坑**: 当前工作区有用户的未提交 UI 修改，公告功能必须在隔离分支实施并按文件提交。
- **验证**: 实施完成后补 npm test、build:app、公开 URL 和真机结果。
```

- [ ] **Step 2: Write the failing model tests**

Create `tools/tests/official-announcement-model.test.mjs` with these tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  解析可展示官方公告,
  构建官方公告请求地址,
  追加已确认官方公告ID,
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

test('builds a stable five-minute cache key', () => {
  const a = 构建官方公告请求地址('https://example.com/announcement.json', Date.parse('2026-08-29T18:03:01Z'));
  const b = 构建官方公告请求地址('https://example.com/announcement.json', Date.parse('2026-08-29T18:04:59Z'));
  const c = 构建官方公告请求地址('https://example.com/announcement.json?channel=stable', Date.parse('2026-08-29T18:05:00Z'));
  assert.equal(a, b);
  assert.match(a, /\?v=202608291800$/);
  assert.match(c, /&v=202608291805$/);
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
```

- [ ] **Step 3: Run the model test and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-model.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `官方公告模型.ts`.

- [ ] **Step 4: Implement the complete pure model**

Create `entry/src/main/ets/model/官方公告模型.ts` with these public types/functions and private validators:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later

export type 官方公告语言 = 'zh-Hans' | 'en';

export interface 官方公告展示项 {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  actionUrl: string;
}

interface 原始官方公告 {
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
  return url.length === 0 || /^https:\/\/[^\s]+$/i.test(url);
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

export function 构建官方公告请求地址(baseUrl: string, nowMs: number): string {
  const bucketMs: number = Math.floor(nowMs / 300000) * 300000;
  const date: Date = new Date(bucketMs);
  const key: string = `${date.getUTCFullYear()}${两位(date.getUTCMonth() + 1)}${两位(date.getUTCDate())}` +
    `${两位(date.getUTCHours())}${两位(date.getUTCMinutes())}`;
  return `${baseUrl}${baseUrl.indexOf('?') >= 0 ? '&' : '?'}v=${key}`;
}

export function 追加已确认官方公告ID(ids: string[], id: string): string[] {
  const next: string[] = ids.filter((item: string): boolean => 官方公告ID有效(item) && item !== id);
  if (官方公告ID有效(id)) next.push(id);
  return next.length <= 最多已确认ID数 ? next : next.slice(next.length - 最多已确认ID数);
}
```

- [ ] **Step 5: Run the model test and verify GREEN**

Run the Step 3 command again.

Expected: 6 tests PASS, 0 FAIL.

- [ ] **Step 6: Commit the pure model**

```powershell
git add -- '.trae/decisions.md' 'entry/src/main/ets/model/官方公告模型.ts' 'tools/tests/official-announcement-model.test.mjs'
git commit -m "feat: define official announcement protocol"
```

---

### Task 2: Acknowledgement persistence

**Files:**
- Create: `entry/src/main/ets/model/官方公告存储.ets`
- Create: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `官方公告ID有效(id)` and `追加已确认官方公告ID(ids, id)` from Task 1; `AppStorage['abilityContext']`.
- Produces: `读取已确认官方公告ID列表(): Promise<string[]>`, `是否已确认官方公告(id: string): Promise<boolean>`, `标记已确认官方公告(id: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing storage contract**

Create `tools/tests/official-announcement-flow-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('announcement acknowledgements use one bounded Preferences record', () => {
  const source = read('../../entry/src/main/ets/model/官方公告存储.ets');
  assert.match(source, /official_announcement_acknowledged_ids_v1/);
  assert.match(source, /读取已确认官方公告ID列表\(\): Promise<string\[\]>/);
  assert.match(source, /是否已确认官方公告\(id: string\): Promise<boolean>/);
  assert.match(source, /标记已确认官方公告\(id: string\): Promise<boolean>/);
  assert.match(source, /追加已确认官方公告ID/);
  assert.match(source, /await store\.flush\(\);\s*return true;/);
  assert.match(source, /catch \(error\) \{\s*return false;/);
});
```

- [ ] **Step 2: Run the storage contract and verify RED**

Run:

```powershell
node --test tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: FAIL because `官方公告存储.ets` does not exist.

- [ ] **Step 3: Implement Preferences storage**

Create `entry/src/main/ets/model/官方公告存储.ets`:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { 官方公告ID有效, 追加已确认官方公告ID } from './官方公告模型';

const 存储名: string = 'jidecards_settings';
const 已确认公告键: string = 'official_announcement_acknowledged_ids_v1';
const 上下文键: string = 'abilityContext';

function 取能力上下文(): common.UIAbilityContext | null {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>(上下文键);
  return context === undefined ? null : context;
}

function 解析已确认ID列表(text: string): string[] {
  try {
    const parsed: string[] = JSON.parse(text) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: string): boolean => typeof item === 'string' && 官方公告ID有效(item));
  } catch (error) {
    return [];
  }
}

export async function 读取已确认官方公告ID列表(): Promise<string[]> {
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) return [];
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    const value: preferences.ValueType = await store.get(已确认公告键, '[]');
    return typeof value === 'string' ? 解析已确认ID列表(value) : [];
  } catch (error) {
    return [];
  }
}

export async function 是否已确认官方公告(id: string): Promise<boolean> {
  const ids: string[] = await 读取已确认官方公告ID列表();
  return ids.indexOf(id) >= 0;
}

export async function 标记已确认官方公告(id: string): Promise<boolean> {
  if (!官方公告ID有效(id)) return false;
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) return false;
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    const currentValue: preferences.ValueType = await store.get(已确认公告键, '[]');
    const current: string[] = typeof currentValue === 'string' ? 解析已确认ID列表(currentValue) : [];
    await store.put(已确认公告键, JSON.stringify(追加已确认官方公告ID(current, id)));
    await store.flush();
    return true;
  } catch (error) {
    return false;
  }
}
```

- [ ] **Step 4: Run model and storage tests**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-model.test.mjs tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit persistence**

```powershell
git add -- 'entry/src/main/ets/model/官方公告存储.ets' 'tools/tests/official-announcement-flow-contract.test.mjs'
git commit -m "feat: persist official announcement acknowledgements"
```

---

### Task 3: Static-hosting configuration and two-second fetch service

**Files:**
- Create: `entry/src/main/ets/model/官方公告配置.ts`
- Create: `entry/src/main/ets/backend/官方公告服务.ets`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `官方公告地址`, `构建官方公告请求地址`, `解析可展示官方公告`, `官方公告语言`.
- Produces: `官方公告服务.加载公告(currentVersion: string, language: 官方公告语言, nowMs?: number): Promise<官方公告展示项 | null>`.

- [ ] **Step 1: Extend the flow contract for URL and HTTP behavior**

Append:

```js
test('announcement hosting has one public URL and no management credential', () => {
  const source = read('../../entry/src/main/ets/model/官方公告配置.ts');
  assert.match(source, /https:\/\/4001784660\.cdn\.123clouddisk\.com\/4001784660\/jidecards\/announcement\.json/);
  assert.doesNotMatch(source, /(clientSecret|clientID|accessToken|refreshToken|password|管理密钥)/i);
});

test('announcement service performs one uncached two-second GET and always destroys the client', () => {
  const source = read('../../entry/src/main/ets/backend/官方公告服务.ets');
  assert.match(source, /from '@kit\.NetworkKit'/);
  assert.match(source, /构建官方公告请求地址/);
  assert.match(source, /http\.RequestMethod\.GET/);
  assert.match(source, /http\.HttpDataType\.STRING/);
  assert.match(source, /usingCache: false/);
  assert.match(source, /connectTimeout: 2000/);
  assert.match(source, /readTimeout: 2000/);
  assert.match(source, /解析可展示官方公告/);
  assert.match(source, /finally \{\s*client\.destroy\(\);/);
  assert.doesNotMatch(source, /setTimeout|retry|ClientSecret|accessToken/i);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run the Task 2 Step 4 command.

Expected: the two new tests FAIL because config/service files do not exist.

- [ ] **Step 3: Create the single production URL**

Create `entry/src/main/ets/model/官方公告配置.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later

/** 123 云盘静态托管的公开公告清单；客户端只读，不含管理凭据。 */
export const 官方公告地址: string =
  'https://4001784660.cdn.123clouddisk.com/4001784660/jidecards/announcement.json';
```

- [ ] **Step 4: Implement the fetch service**

Create `entry/src/main/ets/backend/官方公告服务.ets`:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later

import { http } from '@kit.NetworkKit';
import { 官方公告地址 } from '../model/官方公告配置';
import {
  构建官方公告请求地址,
  解析可展示官方公告
} from '../model/官方公告模型';
import type { 官方公告语言, 官方公告展示项 } from '../model/官方公告模型';

function HTTPS地址有效(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url);
}

export class 官方公告服务 {
  private readonly manifestUrl: string;

  constructor(manifestUrl: string = 官方公告地址) {
    this.manifestUrl = manifestUrl.trim();
  }

  async 加载公告(
    currentVersion: string,
    language: 官方公告语言,
    nowMs: number = Date.now()
  ): Promise<官方公告展示项 | null> {
    if (!HTTPS地址有效(this.manifestUrl)) return null;
    const client: http.HttpRequest = http.createHttp();
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.GET,
      expectDataType: http.HttpDataType.STRING,
      usingCache: false,
      connectTimeout: 2000,
      readTimeout: 2000
    };
    try {
      const url: string = 构建官方公告请求地址(this.manifestUrl, nowMs);
      const response: http.HttpResponse = await client.request(url, options);
      if (response.responseCode < 200 || response.responseCode >= 300 || typeof response.result !== 'string') {
        return null;
      }
      return 解析可展示官方公告(response.result, currentVersion, nowMs, language);
    } catch (error) {
      return null;
    } finally {
      client.destroy();
    }
  }
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 2 Step 4 command.

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the hosting boundary**

```powershell
git add -- 'entry/src/main/ets/model/官方公告配置.ts' 'entry/src/main/ets/backend/官方公告服务.ets' 'tools/tests/official-announcement-flow-contract.test.mjs'
git commit -m "feat: fetch official announcements from static hosting"
```

---

### Task 4: Native non-dismissible announcement modal

**Files:**
- Create: `entry/src/main/ets/components/官方公告弹窗.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `announcement: 官方公告展示项`, `isDark: boolean`, `acknowledging: boolean`.
- Produces callbacks: `onAcknowledge(): void`, `onOpenDetails(): void`.

- [ ] **Step 1: Add failing UI and i18n contracts**

Append:

```js
test('announcement modal is native, themed, scrollable and non-dismissible', () => {
  const source = read('../../entry/src/main/ets/components/官方公告弹窗.ets');
  assert.match(source, /官方公告展示项/);
  assert.match(source, /announcement\.title/);
  assert.match(source, /announcement\.content/);
  assert.match(source, /official_announcement_published_at/);
  assert.match(source, /official_announcement_acknowledge/);
  assert.match(source, /official_announcement_details/);
  assert.match(source, /onAcknowledge/);
  assert.match(source, /onOpenDetails/);
  assert.match(source, /backgroundBlurStyle\(BlurStyle\.Thin/);
  assert.match(source, /取全屏转场/);
  assert.match(source, /edgeEffect\(EdgeEffect\.Spring\)/);
  assert.doesNotMatch(source, /Web\(|RichText\(|onClose|\.onClick\(\(\) => this\.onAcknowledge/);
});

test('announcement fixed strings are aligned and translated', () => {
  const zh = JSON.parse(read('../../entry/src/main/resources/base/element/string.json')).string;
  const en = JSON.parse(read('../../entry/src/main/resources/en_US/element/string.json')).string;
  const zhMap = new Map(zh.map((item) => [item.name, item.value]));
  const enMap = new Map(en.map((item) => [item.name, item.value]));
  const keys = [
    'official_announcement_published_at',
    'official_announcement_acknowledge',
    'official_announcement_details',
    'official_announcement_open_failed',
    'official_announcement_save_failed',
  ];
  for (const key of keys) {
    assert.ok(zhMap.has(key));
    assert.ok(enMap.has(key));
    assert.doesNotMatch(enMap.get(key), /[\u3400-\u9fff]/);
  }
});
```

- [ ] **Step 2: Run the flow contract and verify RED**

Run:

```powershell
node --test tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: modal/i18n tests FAIL.

- [ ] **Step 3: Add exact i18n resources to both JSON files**

Add these base entries:

```json
{ "name": "official_announcement_published_at", "value": "发布于 %s" },
{ "name": "official_announcement_acknowledge", "value": "我知道了" },
{ "name": "official_announcement_details", "value": "查看详情" },
{ "name": "official_announcement_open_failed", "value": "无法打开公告详情，请稍后重试" },
{ "name": "official_announcement_save_failed", "value": "未能保存已读状态，下次启动可能再次显示" }
```

Add these `en_US` entries:

```json
{ "name": "official_announcement_published_at", "value": "Published %s" },
{ "name": "official_announcement_acknowledge", "value": "Got it" },
{ "name": "official_announcement_details", "value": "Learn more" },
{ "name": "official_announcement_open_failed", "value": "Couldn't open announcement details. Please try again later." },
{ "name": "official_announcement_save_failed", "value": "Read status couldn't be saved, so this may appear again next time." }
```

- [ ] **Step 4: Implement the pure ArkUI component**

Create `entry/src/main/ets/components/官方公告弹窗.ets` with this structure; use the existing `应用尺寸`, `颜色键`, and full-screen transition helpers rather than new constants:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { 官方公告展示项 } from '../model/官方公告模型';
import { 颜色键 } from '../model/颜色主题';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct 官方公告弹窗 {
  @Prop announcement: 官方公告展示项;
  @Prop isDark: boolean = false;
  @Prop acknowledging: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  onAcknowledge: () => void = (): void => {};
  onOpenDetails: () => void = (): void => {};

  private 发布日期(): string {
    return this.announcement.publishedAt.substring(0, 10);
  }

  private 本地化发布时间(): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(
      $r('app.string.official_announcement_published_at').id, this.发布日期());
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {})
        .transition(TransitionEffect.OPACITY.animation({
          curve: 取全屏转场曲线(), duration: 取全屏转场时长()
        }))

      Column({ space: 应用尺寸.间距_12 }) {
        Text(this.announcement.title)
          .fontSize(应用尺寸.字号_面板标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .width('100%')

        Text(this.本地化发布时间())
          .fontSize(应用尺寸.字号_说明)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')

        Scroll() {
          Text(this.announcement.content)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .lineHeight(22)
            .width('100%')
        }
        .constraintSize({ maxHeight: 360 })
        .edgeEffect(EdgeEffect.Spring)
        .width('100%')

        Row({ space: 应用尺寸.间距_12 }) {
          if (this.announcement.actionUrl.length > 0) {
            Button($r('app.string.official_announcement_details'))
              .type(ButtonType.Normal)
              .layoutWeight(1)
              .height(应用尺寸.按钮高度)
              .fontColor($r('app.color.action_primary'))
              .backgroundColor($r('app.color.surface_page'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              .borderRadius(应用尺寸.圆角_面板)
              .onClick((): void => { this.onOpenDetails(); })
          }
          Button($r('app.string.official_announcement_acknowledge'))
            .type(ButtonType.Normal)
            .layoutWeight(1)
            .height(应用尺寸.按钮高度)
            .enabled(!this.acknowledging)
            .fontColor($r('app.color.action_on_primary'))
            .backgroundColor(this.主色按钮背景)
            .borderRadius(应用尺寸.圆角_面板)
            .onClick((): void => { this.onAcknowledge(); })
        }
        .width('100%')
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '80%' })
      .padding(应用尺寸.间距_16)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
    .alignContent(Alignment.Center)
  }
}
```

- [ ] **Step 5: Run focused UI/i18n tests**

Run:

```powershell
node --test tools/tests/official-announcement-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the modal**

```powershell
git add -- 'entry/src/main/ets/components/官方公告弹窗.ets' 'entry/src/main/resources/base/element/string.json' 'entry/src/main/resources/en_US/element/string.json' 'tools/tests/official-announcement-flow-contract.test.mjs'
git commit -m "feat: add native official announcement modal"
```

---

### Task 5: Home startup orchestration and external detail action

**Files:**
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `官方公告服务.加载公告(...)`, `是否已确认官方公告(id)`, `标记已确认官方公告(id)`, `当前语言模式()`, `bundleManager.getBundleInfoForSelf(...)`.
- Produces: startup sequence state, `确认官方公告()`, `打开官方公告详情()`, and rendering/wiring of `官方公告弹窗`.

- [ ] **Step 1: Add the failing home-flow contract**

Append:

```js
test('home sequences official announcement before cloud onboarding and welcome', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /官方公告服务实例/);
  assert.match(source, /bundleManager\.getBundleInfoForSelf/);
  assert.match(source, /当前语言模式\(\)/);
  assert.match(source, /是否已确认官方公告/);
  assert.match(source, /标记已确认官方公告/);
  const sequence = source.match(/private async 显示首次弹窗序列\(\)[\s\S]*?private async 显示欢迎弹窗一次/)?.[0] ?? '';
  assert.ok(sequence.indexOf('尝试显示官方公告') < sequence.indexOf('是否已完成云端牌组引导'));
  assert.ok(sequence.indexOf('是否已完成云端牌组引导') < sequence.indexOf('显示欢迎弹窗一次'));
  assert.match(source, /if \(this\.显示官方公告\) \{\s*return true;/);
  assert.match(source, /onAcknowledge:[\s\S]*确认官方公告\(\)/);
  assert.match(source, /onOpenDetails:[\s\S]*打开官方公告详情\(\)/);
  assert.doesNotMatch(source, /onPageShow\(\)[\s\S]{0,300}加载公告/);
});

test('home closes and continues even when acknowledgement persistence fails', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  const method = source.match(/private async 确认官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(method, /await 标记已确认官方公告/);
  assert.match(method, /official_announcement_save_failed/);
  assert.match(method, /this\.显示官方公告 = false/);
  assert.match(method, /await this\.继续首次弹窗序列\(\)/);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run the Task 4 Step 5 command.

Expected: the home-flow tests FAIL.

- [ ] **Step 3: Add imports, service, and state to `首页.ets`**

Update the existing imports without removing unrelated imports:

```ts
import { bundleManager, common } from '@kit.AbilityKit';
import { 官方公告服务 } from '../backend/官方公告服务';
import { 官方公告弹窗 } from '../components/官方公告弹窗';
import type { 官方公告展示项 } from '../model/官方公告模型';
import { 是否已确认官方公告, 标记已确认官方公告 } from '../model/官方公告存储';
import { 当前语言模式 } from '../model/语言存储';
```

Add alongside the existing service/state fields:

```ts
private readonly 官方公告服务实例: 官方公告服务 = new 官方公告服务();
private 首次弹窗序列已启动: boolean = false;
@State private 显示官方公告: boolean = false;
@State private 官方公告数据: 官方公告展示项 | null = null;
@State private 官方公告确认中: boolean = false;
```

- [ ] **Step 4: Replace startup sequencing with explicit announcement-first flow**

Keep `aboutToAppear()` calling `this.显示首次弹窗序列()` and replace only the current sequence method with:

```ts
private async 显示首次弹窗序列(): Promise<void> {
  if (this.首次弹窗序列已启动) return;
  this.首次弹窗序列已启动 = true;
  const displayed: boolean = await this.尝试显示官方公告();
  if (displayed) return;
  await this.继续首次弹窗序列();
}

private async 尝试显示官方公告(): Promise<boolean> {
  try {
    const info: bundleManager.BundleInfo = await bundleManager.getBundleInfoForSelf(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    const announcement: 官方公告展示项 | null = await this.官方公告服务实例.加载公告(
      info.versionName, 当前语言模式(), Date.now());
    if (announcement === null || await 是否已确认官方公告(announcement.id)) return false;
    this.官方公告数据 = announcement;
    this.显示官方公告 = true;
    return true;
  } catch (error) {
    return false;
  }
}

private async 继续首次弹窗序列(): Promise<void> {
  const completed: boolean = await 是否已完成云端牌组引导();
  if (!completed) {
    this.打开云端牌组弹窗();
    return;
  }
  await this.显示欢迎弹窗一次();
}
```

- [ ] **Step 5: Add acknowledgement and detail actions**

Add these methods before the existing welcome helper:

```ts
private async 确认官方公告(): Promise<void> {
  if (this.官方公告确认中 || this.官方公告数据 === null) return;
  this.官方公告确认中 = true;
  const saved: boolean = await 标记已确认官方公告(this.官方公告数据.id);
  if (!saved) {
    this.getUIContext().getPromptAction().showToast({
      message: $r('app.string.official_announcement_save_failed')
    });
  }
  this.显示官方公告 = false;
  this.官方公告数据 = null;
  this.官方公告确认中 = false;
  await this.继续首次弹窗序列();
}

private 打开官方公告详情(): void {
  if (this.官方公告数据 === null || this.官方公告数据.actionUrl.length === 0) return;
  const context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
  context.startAbility({
    action: 'ohos.want.action.viewData',
    uri: this.官方公告数据.actionUrl
  }).catch((_error: Error): void => {
    this.getUIContext().getPromptAction().showToast({
      message: $r('app.string.official_announcement_open_failed')
    });
  });
}
```

- [ ] **Step 6: Wire back handling and rendering**

Insert this guard before the cloud-onboarding guard in `onBackPress()`:

```ts
if (this.显示官方公告) {
  return true;
}
```

Render above the existing cloud-deck and welcome overlays:

```ts
if (this.显示官方公告 && this.官方公告数据 !== null) {
  官方公告弹窗({
    announcement: this.官方公告数据,
    isDark: this.是否深色(),
    acknowledging: this.官方公告确认中,
    onAcknowledge: (): void => { this.确认官方公告(); },
    onOpenDetails: (): void => { this.打开官方公告详情(); }
  })
}
```

- [ ] **Step 7: Run focused and full tests**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-model.test.mjs tools/tests/official-announcement-flow-contract.test.mjs tools/tests/cloud-deck-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
npm test
```

Expected: all focused tests PASS and the full suite reports 0 failures.

- [ ] **Step 8: Commit startup integration**

```powershell
git add -- 'entry/src/main/ets/pages/首页.ets' 'tools/tests/official-announcement-flow-contract.test.mjs'
git commit -m "feat: show official announcement during startup"
```

---

### Task 6: Deployable manifest, operator guide, project map, and release verification

**Files:**
- Create: `hosting/announcement.json`
- Create: `docs/official-announcement-hosting.md`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `.trae/decisions.md`

**Interfaces:**
- Produces the production static artifact consumed by `官方公告地址` and the operating procedure for future announcements.
- Does not add a runtime or server-side API.

- [ ] **Step 1: Add a failing hosted-artifact contract**

Append:

```js
test('hosted announcement manifest starts disabled and matches schema v1', () => {
  const manifest = JSON.parse(read('../../hosting/announcement.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.announcement, null);
});
```

Run:

```powershell
node --test tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: FAIL because `hosting/announcement.json` does not exist.

- [ ] **Step 2: Create the safe initial production manifest**

Create `hosting/announcement.json`:

```json
{
  "schemaVersion": 1,
  "announcement": null
}
```

- [ ] **Step 3: Write the operator guide with an exact active example**

Create `docs/official-announcement-hosting.md` covering:

````markdown
# 官方公告静态托管指南

生产地址：
`https://4001784660.cdn.123clouddisk.com/4001784660/jidecards/announcement.json`

应用只读取公开 JSON；123 云盘 Client ID、Client Secret、Token 只能用于开发电脑或受控发布环境。

## 发布

1. 从 `hosting/announcement.json` 复制工作文件。
2. 发布公告时把 `announcement` 改为完整对象，并为每条新公告生成新 ID。
3. `startsAt` 和 `expiresAt` 使用带时区的 ISO 8601；`actionUrl` 为空或为 HTTPS。
4. 上传到 123 云盘 `/jidecards/announcement.json`，保持父目录直链已启用。
5. 用下面命令验证公开内容；成功后才视为发布完成。

```powershell
$announcementUrl='https://4001784660.cdn.123clouddisk.com/4001784660/jidecards/announcement.json?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$response=Invoke-WebRequest -Uri $announcementUrl -TimeoutSec 20
if ($response.StatusCode -ne 200) { throw "announcement HTTP $($response.StatusCode)" }
$document=$response.Content | ConvertFrom-Json
if ($document.schemaVersion -ne 1) { throw 'announcement schema mismatch' }
$document | ConvertTo-Json -Depth 4
```

## 停用与回滚

发布 `{ "schemaVersion": 1, "announcement": null }` 可立即停用。若回滚到以前的公告文件，旧 ID 已在用户设备的最近 32 项记录中，不会重复展示；需要重新通知时必须发布新 ID。

## 完整公告示例

```json
{
  "schemaVersion": 1,
  "announcement": {
    "id": "20260829-01",
    "enabled": true,
    "titleZh": "官方公告",
    "contentZh": "记得闪卡云端牌组服务现已开放。",
    "titleEn": "Official announcement",
    "contentEn": "Cloud decks are now available.",
    "publishedAt": "2026-08-29T18:00:00+08:00",
    "startsAt": "2026-08-29T18:00:00+08:00",
    "expiresAt": "2026-09-30T23:59:59+08:00",
    "minimumAppVersion": "2.0.0",
    "maximumAppVersion": "",
    "actionUrl": ""
  }
}
```
````

- [ ] **Step 4: Update project architecture routing**

Add a `官方启动公告` row to `PROJECT_CONTEXT.md` module boundaries with these exact responsibilities: pure model validation, two-second NetworkKit read, recent-32 Preferences acknowledgement, non-dismissible native modal, and startup order before cloud onboarding/welcome. Add an extension route pointing to `官方公告模型.ts`, `官方公告配置.ts`, `官方公告服务.ets`, and `docs/official-announcement-hosting.md`. State explicitly that client code never contains 123 management credentials.

- [ ] **Step 5: Run all automated verification**

Run:

```powershell
npm test
npm run doctor
npm run build:app
```

Expected:

- `npm test`: 0 failures.
- `npm run doctor`: all required toolchains found.
- `npm run build:app`: signed HAP produced at `entry/build/default/outputs/default/entry-default-signed.hap`.

- [ ] **Step 6: Upload the disabled production manifest after action-time confirmation**

Immediately before uploading, ask the user to confirm creation/update of `/jidecards/announcement.json` in their 123 Cloud Disk account. After confirmation, use the signed-in 123 Cloud Disk session or developer OpenAPI to create the `/jidecards` directory, upload `hosting/announcement.json`, enable folder direct-link access, and verify the exact production URL from Global Constraints returns HTTP 200 and `announcement: null`.

Do not transmit or print Client Secret, access token, refresh token, phone number, or other credentials.

- [ ] **Step 7: Install without clearing data and perform device checks**

For the active-path test, create the temporary, uncommitted `hosting/announcement-device-test.json`:

```json
{
  "schemaVersion": 1,
  "announcement": {
    "id": "20260829-device-test",
    "enabled": true,
    "titleZh": "公告功能测试",
    "contentZh": "这是记得闪卡官方公告功能的真机测试内容，不是正式公告。",
    "titleEn": "Announcement feature test",
    "contentEn": "This is a device test of the official announcement feature, not a production notice.",
    "publishedAt": "2026-08-29T18:00:00+08:00",
    "startsAt": "2026-08-29T18:00:00+08:00",
    "expiresAt": "2099-12-31T23:59:59+08:00",
    "minimumAppVersion": "2.0.0",
    "maximumAppVersion": "",
    "actionUrl": "https://www.123pan.com/"
  }
}
```

After action-time confirmation, upload it to `/jidecards/announcement-device-test.json`. Change only `官方公告地址` to the exact temporary URL from Global Constraints, build and install the test HAP, run the cases below, then use `apply_patch` to restore the production URL and rebuild the final HAP. Confirm `rg -n "announcement-device-test" entry/src/main/ets` returns no matches before the final commit.

Run:

```powershell
hdc list targets
hdc -t 127.0.0.1:5555 install -r entry\build\default\outputs\default\entry-default-signed.hap
hdc -t 127.0.0.1:5555 shell aa force-stop com.jide.kapian
```

Validate these cases without uninstalling:

1. With production `announcement: null`, cold start proceeds to the existing cloud-deck/welcome sequence without a notice.
2. Against the isolated test manifest containing ID `20260829-device-test`, the notice appears before cloud onboarding, cannot be dismissed by back/backdrop, scrolls on long text, and matches dark/light themes.
3. “查看详情” appears only for HTTPS `actionUrl`; browser failure leaves the notice open and shows the localized toast.
4. “我知道了” closes and continues; the same ID does not appear on the next cold start; a new ID appears once.
5. Offline or 404 startup continues in about two seconds.

After validation, remove the local temporary file. Immediately before deleting the cloud test manifest, ask for action-time confirmation; then delete only `/jidecards/announcement-device-test.json`. The test manifest must never replace the disabled production manifest.

- [ ] **Step 8: Append verification evidence to the decision log**

Replace the decision section’s final verification line with measured test counts, build output, production URL status, target ID, and device observations. Do not claim true device or public-hosting results unless they were actually observed.

- [ ] **Step 9: Commit documentation and verified hosting artifact**

```powershell
git add -- 'hosting/announcement.json' 'docs/official-announcement-hosting.md' 'PROJECT_CONTEXT.md' '.trae/decisions.md' 'tools/tests/official-announcement-flow-contract.test.mjs'
git commit -m "docs: add official announcement hosting workflow"
```

---

## Final Review Gate

- [ ] Review `git diff --stat 2e4dde3...HEAD` and confirm only announcement-related files changed.
- [ ] Run `git diff --check 2e4dde3...HEAD` and resolve every whitespace error.
- [ ] Run `npm test` once more after the final commit.
- [ ] Confirm no secret-like names or values exist:

```powershell
rg -n "clientSecret|clientID|accessToken|refreshToken|Bearer |password" entry/src/main/ets/model/官方公告* entry/src/main/ets/backend/官方公告* hosting docs/official-announcement-hosting.md
```

Expected: no credential values; matches are allowed only in documentation sentences explaining that secrets are forbidden.
- [ ] Request code review using `superpowers:requesting-code-review` before integration.
