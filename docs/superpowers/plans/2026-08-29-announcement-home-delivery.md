# Announcement Home Delivery Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Extend the completed official-announcement feature so a supported client checks immediately on cold start and, after returning to the home page, checks immediately or once the ten-minute window expires, while preserving one acknowledgement per announcement ID.

**Architecture:** Keep protocol parsing and timing arithmetic in the pure TypeScript announcement model. The home page owns one in-memory coordinator for visibility, single-flight fetches, one delayed timer, and per-process acknowledgement suppression; every real navigation return enters the same coordinator. The public JSON remains a small anonymous 123 Cloud Disk direct-link resource, but deployment is gated on proving that same-name replacement preserves one stable HTTPS long link.

**Tech Stack:** HarmonyOS ArkTS/ArkUI, NetworkKit HTTP, ArkData Preferences, Node.js `node:test`, PowerShell build tooling, 123 Cloud Disk direct-link CDN.

## Global Constraints

- Implementation baseline is commit `74404e7` on branch `feat/official-announcement` in `D:\Projects\jidecards-announcement`.
- Preserve the already implemented two-second wall-clock request deadline and strict HTTPS detail URL validation from commit `2e6b14b`.
- Cold start always checks immediately; it is not throttled by the ten-minute home-return window.
- A running process may perform at most one actual home-return check per ten minutes, and may own at most one delayed check timer and one network request.
- A delayed check executes once and never turns into continuous polling.
- A confirmed ID is suppressed immediately in memory and persisted in the existing most-recent-32 Preferences record.
- Publishing a different announcement always requires a new ID.
- Published `announcement.json` should remain at or below 5 KiB; the existing 64 KiB parser limit remains a defensive ceiling.
- Client runtime uses only an anonymous public HTTPS GET and contains no 123 Cloud Disk management credential.
- The configured URL must be copied from the actual 123 Cloud Disk long link. Never construct it from UID, folder name, or CDN host.
- Do not upload, replace, or delete cloud files without action-time user confirmation.
- Do not stage `hosting/announcement-device-test.json`; it is an untracked local device-test fixture.
- Treat this as a Structural change: keep `.trae/decisions.md` locally aligned, update `PROJECT_CONTEXT.md`, run `npm test`, run `npm run build:app -- -SkipRust`, and complete device validation before integration.
- Use `apply_patch` for source and documentation edits. Never use `git add .`.

---

## File Structure

| File | Responsibility |
|---|---|
| `entry/src/main/ets/model/官方公告模型.ts` | Ten-minute cache bucket and pure calculation of remaining home-check delay |
| `entry/src/main/ets/pages/首页.ets` | Cold-start gate, page visibility, navigation-return hooks, single-flight request, one delayed timer, in-memory acknowledgement suppression |
| `tools/tests/official-announcement-model.test.mjs` | Runtime tests for ten-minute bucket and delay arithmetic |
| `tools/tests/official-announcement-flow-contract.test.mjs` | Source contracts for all return hooks, one timer, no interval polling, and acknowledgement suppression |
| `entry/src/main/ets/model/官方公告配置.ts` | One public long link; changed only after 123 returns the verified real URL |
| `docs/official-announcement-hosting.md` | Direct-link publishing, stable-link gate, 5 KiB operating limit, ten-minute propagation rule |
| `PROJECT_CONTEXT.md` | Current module boundary and extension route |
| `.trae/decisions.md` | Local ignored decision log; never overwrite the user's main-worktree copy |

---

### Task 1: Pure ten-minute request policy

**Files:**
- Modify: `entry/src/main/ets/model/官方公告模型.ts`
- Modify: `tools/tests/official-announcement-model.test.mjs`

**Interfaces:**
- Consumes: `构建官方公告请求地址(baseUrl: string, nowMs: number): string`
- Produces: `官方公告检查窗口毫秒: number`
- Produces: `官方公告检查延迟毫秒(lastCheckStartedAtMs: number, nowMs: number): number`
- Preserves: `官方公告截止剩余毫秒(startMs: number, nowMs: number): number`

- [ ] **Step 1: Replace the five-minute test with ten-minute bucket and delay tests**

Update the import list in `tools/tests/official-announcement-model.test.mjs`:

```js
import {
  解析可展示官方公告,
  构建官方公告请求地址,
  追加已确认官方公告ID,
  官方公告截止剩余毫秒,
  官方公告检查窗口毫秒,
  官方公告检查延迟毫秒,
} from '../../entry/src/main/ets/model/官方公告模型.ts';
```

Replace the current cache-key test and add the delay test:

```js
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
```

- [ ] **Step 2: Run the model tests and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-model.test.mjs
```

Expected: FAIL because `官方公告检查窗口毫秒` and `官方公告检查延迟毫秒` are not exported, and the existing cache bucket still changes at five minutes.

- [ ] **Step 3: Implement the pure policy**

Add beside the existing model constants:

```ts
export const 官方公告检查窗口毫秒: number = 10 * 60 * 1000;
```

Change the cache bucket in `构建官方公告请求地址`:

```ts
export function 构建官方公告请求地址(baseUrl: string, nowMs: number): string {
  const bucketMs: number = Math.floor(nowMs / 官方公告检查窗口毫秒) * 官方公告检查窗口毫秒;
  const date: Date = new Date(bucketMs);
  const key: string = `${date.getUTCFullYear()}${两位(date.getUTCMonth() + 1)}${两位(date.getUTCDate())}` +
    `${两位(date.getUTCHours())}${两位(date.getUTCMinutes())}`;
  return `${baseUrl}${baseUrl.indexOf('?') >= 0 ? '&' : '?'}v=${key}`;
}
```

Add after `构建官方公告请求地址`:

```ts
/** 返回主页后距离下一次允许检查还剩多少毫秒；0 表示现在即可检查。 */
export function 官方公告检查延迟毫秒(lastCheckStartedAtMs: number, nowMs: number): number {
  if (lastCheckStartedAtMs <= 0) return 0;
  const elapsed: number = nowMs - lastCheckStartedAtMs;
  if (elapsed < 0) return 官方公告检查窗口毫秒;
  if (elapsed >= 官方公告检查窗口毫秒) return 0;
  return 官方公告检查窗口毫秒 - elapsed;
}
```

- [ ] **Step 4: Run the model tests and verify GREEN**

Run the Step 2 command.

Expected: all announcement model tests PASS, including `?v=202608291800` through `18:09:59`, a new bucket at `18:10:00`, and the exact 600000 ms check window.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- 'entry/src/main/ets/model/官方公告模型.ts' 'tools/tests/official-announcement-model.test.mjs'
git diff --cached --check
git commit -m "feat: add ten-minute announcement policy"
```

---

### Task 2: Home-return announcement coordinator

**Files:**
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `官方公告检查延迟毫秒(lastCheckStartedAtMs: number, nowMs: number): number`
- Consumes: existing `官方公告服务.加载公告`, `是否已确认官方公告`, and `标记已确认官方公告`
- Produces: `请求主页官方公告检查(): void`
- Produces: `暂停主页官方公告检查(): void`
- Produces: `返回主页后刷新(): void`
- Preserves: cold-start sequence `官方公告 → 云端牌组引导 → 版本欢迎弹窗`

- [ ] **Step 1: Write failing flow-contract tests**

In `tools/tests/official-announcement-flow-contract.test.mjs`, import no new runtime dependencies. Replace the old assertion that forbids `onPageShow` checks with these two tests:

```js
test('home coordinates one delayed ten-minute announcement check without polling', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /官方公告检查延迟毫秒/);
  assert.match(source, /private 上次官方公告检查开始时间: number = 0/);
  assert.match(source, /private 官方公告检查中: boolean = false/);
  assert.match(source, /private 官方公告延迟检查任务: number = -1/);
  assert.match(source, /private 主页允许公告检查: boolean = true/);
  assert.match(source, /private 主页公告检查已激活: boolean = false/);
  assert.match(source, /private 待展示官方公告数据: 官方公告展示项 \| null = null/);
  assert.match(source, /private 请求主页官方公告检查\(\): void/);
  assert.match(source, /官方公告检查延迟毫秒\(this\.上次官方公告检查开始时间, Date\.now\(\)\)/);
  assert.match(source, /this\.官方公告延迟检查任务 = setTimeout/);
  assert.match(source, /clearTimeout\(this\.官方公告延迟检查任务\)/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test('every real home return enters the shared refresh and announcement path', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /onPageShow\(\): void \{\s*this\.返回主页后刷新\(\);/);
  assert.match(source, /onPageHide\(\): void \{\s*this\.暂停主页官方公告检查\(\);/);
  assert.match(source, /name: 'StudyPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'StatsPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'SettingsPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'ReminderPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.ok((source.match(/this\.返回主页后刷新\(\)/g) ?? []).length >= 8);
});

test('acknowledgement suppresses the same id immediately in the current process', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /private 当前进程已确认官方公告ID集合: Set<string> = new Set<string>\(\)/);
  const load = source.match(/private async 尝试显示官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(load, /当前进程已确认官方公告ID集合\.has\(announcement\.id\)/);
  const acknowledge = source.match(/private async 确认官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(acknowledge, /当前进程已确认官方公告ID集合\.add\(id\)/);
  assert.ok(acknowledge.indexOf('当前进程已确认官方公告ID集合.add(id)') <
    acknowledge.indexOf('await 标记已确认官方公告(id)'));
});
```

Keep the existing cold-start ordering, modal, storage-failure, i18n, service-deadline, and disabled-manifest tests.

- [ ] **Step 2: Run flow-contract tests and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: FAIL because the coordinator fields/methods and Settings/Reminder `onPop` hooks do not exist.

- [ ] **Step 3: Import the pure scheduling helper and add coordinator fields**

Change the announcement-model import in `首页.ets` to:

```ts
import { 官方公告检查延迟毫秒 } from '../model/官方公告模型';
import type { 官方公告展示项 } from '../model/官方公告模型';
```

Add next to the existing announcement state:

```ts
  private 主页公告检查已激活: boolean = false;
  private 主页允许公告检查: boolean = true;
  private 上次官方公告检查开始时间: number = 0;
  private 官方公告检查中: boolean = false;
  private 官方公告延迟检查任务: number = -1;
  private 当前进程已确认官方公告ID集合: Set<string> = new Set<string>();
  private 待展示官方公告数据: 官方公告展示项 | null = null;
```

Do not convert these coordination fields to `@State`; only rendered announcement/modal values remain reactive.

- [ ] **Step 4: Make the existing loader single-flight and activate return checks after startup**

Replace `尝试显示官方公告` with:

```ts
  /** 执行一次真实网络检查；所有入口共用本方法，禁止并发。 */
  private async 尝试显示官方公告(): Promise<boolean> {
    if (this.官方公告检查中) return false;
    this.官方公告检查中 = true;
    this.上次官方公告检查开始时间 = Date.now();
    try {
      const info: bundleManager.BundleInfo = await bundleManager.getBundleInfoForSelf(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      const announcement: 官方公告展示项 | null = await this.官方公告服务实例.加载公告(
        info.versionName, 当前语言模式(), Date.now());
      if (announcement === null || this.当前进程已确认官方公告ID集合.has(announcement.id) ||
        await 是否已确认官方公告(announcement.id)) return false;
      if (!this.主页允许公告检查 || this.显示云端牌组弹窗 || this.显示欢迎弹窗) {
        this.待展示官方公告数据 = announcement;
        return true;
      }
      this.官方公告数据 = announcement;
      this.显示官方公告 = true;
      return true;
    } catch (error) {
      return false;
    } finally {
      this.官方公告检查中 = false;
    }
  }
```

Change `显示首次弹窗序列` so return checks activate only after the startup announcement decision:

```ts
  private async 显示首次弹窗序列(): Promise<void> {
    if (this.首次弹窗序列已启动) return;
    this.首次弹窗序列已启动 = true;
    const displayed: boolean = await this.尝试显示官方公告();
    if (displayed) return;
    this.主页公告检查已激活 = true;
    await this.继续首次弹窗序列();
  }
```

- [ ] **Step 5: Add the single delayed-check coordinator**

Add before `继续首次弹窗序列`:

```ts
  /** 请求结束时若主页不可安全展示，返回主页后先消费这个待展示结果。 */
  private 尝试展示待展示官方公告(): boolean {
    if (!this.主页允许公告检查 || this.待展示官方公告数据 === null || this.显示官方公告 ||
      this.显示云端牌组弹窗 || this.显示欢迎弹窗) return false;
    if (this.当前进程已确认官方公告ID集合.has(this.待展示官方公告数据.id)) {
      this.待展示官方公告数据 = null;
      return false;
    }
    this.官方公告数据 = this.待展示官方公告数据;
    this.待展示官方公告数据 = null;
    this.显示官方公告 = true;
    return true;
  }

  /** 返回主页时按十分钟窗口立即检查或只安排一个延迟检查。 */
  private 请求主页官方公告检查(): void {
    if (this.尝试展示待展示官方公告()) return;
    if (!this.主页公告检查已激活 || !this.主页允许公告检查 || this.官方公告检查中 ||
      this.显示官方公告 || this.显示云端牌组弹窗 || this.显示欢迎弹窗) return;
    if (this.官方公告延迟检查任务 >= 0) return;
    const delayMs: number = 官方公告检查延迟毫秒(this.上次官方公告检查开始时间, Date.now());
    if (delayMs === 0) {
      this.尝试显示官方公告().catch((): void => {});
      return;
    }
    this.官方公告延迟检查任务 = setTimeout((): void => {
      this.官方公告延迟检查任务 = -1;
      if (!this.主页允许公告检查 || this.显示官方公告 || this.显示云端牌组弹窗 ||
        this.显示欢迎弹窗) return;
      this.尝试显示官方公告().catch((): void => {});
    }, delayMs);
  }

  /** 离开主页或进入后台时取消尚未执行的延迟检查。 */
  private 暂停主页官方公告检查(): void {
    this.主页允许公告检查 = false;
    if (this.官方公告延迟检查任务 >= 0) {
      clearTimeout(this.官方公告延迟检查任务);
      this.官方公告延迟检查任务 = -1;
    }
  }

  /** 所有真正返回主页的入口都调用这里，避免遗漏公告检查。 */
  private 返回主页后刷新(): void {
    this.主页允许公告检查 = true;
    this.加载主页数据();
    this.请求主页官方公告检查();
  }
```

This intentionally schedules only one check. Do not call `请求主页官方公告检查()` again after a completed request and do not introduce `setInterval`.

- [ ] **Step 6: Wire app visibility and every navigation return**

Replace the lifecycle method with:

```ts
  onPageShow(): void {
    this.返回主页后刷新();
  }

  onPageHide(): void {
    this.暂停主页官方公告检查();
  }
```

Before each of the following `pushPath` calls, call `this.暂停主页官方公告检查();`:

- `StudyPage`
- both `BrowserPage` entry methods
- `StatsPage`
- `AddNotePage`
- inline `SettingsPage`
- inline `ReminderPage`

For Study, both Browser routes, Stats, and Add Note, replace each existing `onPop` body with:

```ts
onPop: (): void => {
  this.返回主页后刷新();
}
```

Replace the Settings and Reminder pushes with:

```ts
this.暂停主页官方公告检查();
this.页面栈.pushPath({
  name: 'SettingsPage',
  onPop: (): void => { this.返回主页后刷新(); }
});
```

```ts
this.暂停主页官方公告检查();
this.页面栈.pushPath({
  name: 'ReminderPage',
  onPop: (): void => { this.返回主页后刷新(); }
});
```

- [ ] **Step 7: Suppress an acknowledgement immediately in memory**

Replace the start of `确认官方公告` through its storage call with:

```ts
  private async 确认官方公告(): Promise<void> {
    if (this.官方公告确认中 || this.官方公告数据 === null) return;
    this.官方公告确认中 = true;
    const id: string = this.官方公告数据.id;
    this.当前进程已确认官方公告ID集合.add(id);
    const saved: boolean = await 标记已确认官方公告(id);
```

Keep the existing failure toast and close/continue behavior. Immediately before `await this.继续首次弹窗序列()`, add:

```ts
    this.主页公告检查已激活 = true;
```

- [ ] **Step 8: Run focused tests and build type checking**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-model.test.mjs tools/tests/official-announcement-flow-contract.test.mjs
npm run build:app -- -SkipRust
```

Expected: all focused tests PASS and hvigor reports `TYPE CHECK SUCCESSFUL` and `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- 'entry/src/main/ets/pages/首页.ets' 'tools/tests/official-announcement-flow-contract.test.mjs'
git diff --cached --check
git commit -m "feat: check announcements after home returns"
```

---

### Task 3: Align hosting and project documentation

**Files:**
- Modify: `docs/official-announcement-hosting.md`
- Modify: `PROJECT_CONTEXT.md`
- Modify locally only: `.trae/decisions.md`
- Test: `tools/tests/official-announcement-flow-contract.test.mjs`

**Interfaces:**
- Consumes: the verified ten-minute scheduling behavior from Tasks 1 and 2
- Produces: an operator workflow that fails closed until one stable actual 123 HTTPS long link is proven

- [ ] **Step 1: Add failing operational-contract assertions**

Extend the hosted-manifest test:

```js
test('hosted announcement manifest starts disabled, is small, and matches schema v1', () => {
  const text = read('../../hosting/announcement.json');
  const manifest = JSON.parse(text);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.announcement, null);
  assert.ok(Buffer.byteLength(text, 'utf8') <= 5 * 1024);
});
```

Add:

```js
test('hosting guide requires an actual stable long link and ten-minute delivery window', () => {
  const guide = read('../../docs/official-announcement-hosting.md');
  assert.match(guide, /实际生成的 HTTPS 长链/);
  assert.match(guide, /同名替换/);
  assert.match(guide, /原长链仍返回新内容/);
  assert.match(guide, /10 分钟/);
  assert.match(guide, /5 KiB/);
  assert.match(guide, /不得.*自行拼接/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-flow-contract.test.mjs
```

Expected: FAIL because the existing guide still describes static hosting and the old deployment assumptions.

- [ ] **Step 3: Replace the hosting guide with the approved direct-link workflow**

Write `docs/official-announcement-hosting.md` with these exact sections and rules:

```markdown
# 官方公告直链发布指南

应用通过 123 云盘为 `announcement.json` 实际生成的公开 HTTPS 长链读取公告。不得根据 UID、目录名或 CDN 主域名自行拼接地址，客户端不得包含 Client ID、Client Secret、Token 或上传凭据。

## 首次接入：验证长链稳定性

1. 在已开启直链的文件夹上传一个临时 JSON，并复制控制台实际生成的 HTTPS 长链。
2. 使用同名替换上传内容不同的第二版文件。
3. 再次请求第一步记录的原长链；只有原长链返回第二版内容，才证明它适合作为可更新公告源。
4. 如果同名替换后长链变化，停止接入，改用已配置自定义域名的静态网页托管或其他稳定 URL 服务。

任何上传、替换或删除操作都必须先取得操作时确认。

## 发布

1. 从 `hosting/announcement.json` 复制工作文件；正式文件保持在 5 KiB 以内。
2. 每条不同公告使用全新的 `id`，配置开始/结束时间和应用版本范围。
3. 普通直链模式下 `actionUrl` 保持为空；只有已配置自定义域名和 HTTPS 静态页面托管时才发布详情页。
4. 同名替换生产 `announcement.json`，不要创建新的客户端 URL。
5. 使用客户端配置的同一长链追加当前 10 分钟时间桶参数读回，确认 HTTP 200、`schemaVersion: 1` 和预期公告 ID。
6. 若控制台提供直链缓存刷新，执行刷新后仍必须重新读回验证。
7. 查看直链流量余额；公告拉取失败时客户端会静默降级。

## 停用与回滚

发布 `{ "schemaVersion": 1, "announcement": null }` 可停用公告。不得用旧 ID 表达另一条内容；需要再次通知时发布新 ID。同一设备确认过的最近 32 个 ID 不再展示。

## 送达语义

冷启动立即检查。发布后用户返回主页时，客户端立即检查或在上次检查满 10 分钟时补做一次；不会在主页持续轮询。离线、旧版 App、直链流量耗尽或 123 服务异常时不保证送达，恢复条件后需要再次冷启动或返回主页。
```

- [ ] **Step 4: Update project maps and local decision log**

In `PROJECT_CONTEXT.md`, change the official-announcement module row to state:

```text
NetworkKit 匿名 GET 使用 10 分钟 CDN 时间桶和独立 2 秒墙钟截止；冷启动立即检查，回到前台或各导航目标返回主页时进入单请求/单延迟任务协调器，10 分钟内不重复请求且不持续轮询；Preferences 保存最近 32 个已确认 ID，当前进程即时抑制已确认 ID；公开地址必须来自 123 实际生成且经同名替换验证的稳定 HTTPS 长链。
```

Update the “发布/停用官方公告” route to point to the direct-link stable-address gate and the 5 KiB operating target.

Append to the ignored worktree-local `.trae/decisions.md`:

```markdown
- **主页送达窗口**: 冷启动立即检查；发布后回到前台或从导航目标返回主页时，按 10 分钟窗口立即检查或只安排一次延迟检查。禁止持续轮询。
- **流量边界**: 正式 manifest 目标不超过 5 KiB；公告和云端牌组共享直链流量预算。
- **地址前提**: 只接受 123 控制台实际生成、经同名替换后原链接仍返回新内容的 HTTPS 长链；验证失败则不发布。
```

Do not stage `.trae/decisions.md` because this worktree copy is ignored and the main worktree has a separate user-owned file.

- [ ] **Step 5: Run focused tests and commit Task 3**

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/official-announcement-flow-contract.test.mjs
git add -- 'docs/official-announcement-hosting.md' 'PROJECT_CONTEXT.md' 'tools/tests/official-announcement-flow-contract.test.mjs'
git diff --cached --check
git commit -m "docs: define announcement home delivery operations"
```

Expected: focused tests PASS; staged files contain only the guide, project map, and contract test.

---

### Task 4: Full verification and 123 stable-link/device gate

**Files:**
- Conditionally modify after receiving the real URL: `entry/src/main/ets/model/官方公告配置.ts`
- Conditionally modify after receiving the real URL: `tools/tests/official-announcement-flow-contract.test.mjs`
- Use but do not commit: `hosting/announcement-device-test.json`
- Verify: all files changed since `74404e7`

**Interfaces:**
- Consumes: all implementation from Tasks 1–3
- Produces: a verified production URL, completed home-return device matrix, and a final production HAP

- [ ] **Step 1: Run fresh repository verification before cloud work**

```powershell
npm test
npm run build:app -- -SkipRust
git diff --check 74404e7...HEAD
git status --short
```

Expected:

- `npm test` reports zero failures.
- hvigor reports `TYPE CHECK SUCCESSFUL` and `BUILD SUCCESSFUL`.
- diff check has no whitespace errors.
- the only untracked file is `hosting/announcement-device-test.json`.

- [ ] **Step 2: Obtain action-time confirmation for a temporary stability test**

Ask the user to confirm all three exact operations together:

1. Create `/jidecards/announcement-link-stability-test.json` in the user's 123 Cloud Disk direct-link folder.
2. Replace that same file once with different JSON content.
3. Delete only `/jidecards/announcement-link-stability-test.json` after verification.

Do not proceed without confirmation. Do not request or expose account credentials.

- [ ] **Step 3: Prove same-name replacement preserves the original long link**

Upload version A:

```json
{"version":"A","checkedAt":"2026-08-29T00:00:00Z"}
```

Copy the actual HTTPS long link shown by 123 and fetch it with a unique query parameter. Confirm HTTP 200 and `version` equals `A`.

Replace the same filename with version B:

```json
{"version":"B","checkedAt":"2026-08-29T00:10:00Z"}
```

Fetch the original version-A long link with a new query parameter. Continue only if that same original URL now returns `version` equal to `B`. If it does not, stop: ordinary direct link is not a valid announcement backend under the approved design.

- [ ] **Step 4: Confirm and publish the disabled production manifest**

Ask for action-time confirmation to create or replace exactly `/jidecards/announcement.json` with the committed `hosting/announcement.json` content. Upload it, copy its actual HTTPS long link, and verify HTTP 200 with:

```json
{"schemaVersion":1,"announcement":null}
```

Compare the real long link with the current `官方公告地址`. If they differ, update only `官方公告配置.ts` and the exact URL assertion in `official-announcement-flow-contract.test.mjs`, run focused tests, and commit:

```powershell
git add -- 'entry/src/main/ets/model/官方公告配置.ts' 'tools/tests/official-announcement-flow-contract.test.mjs'
git diff --cached --check
git commit -m "config: use verified announcement direct link"
```

- [ ] **Step 5: Confirm and upload the temporary device-test manifest**

Ask for action-time confirmation to create or replace exactly `/jidecards/announcement-device-test.json` using the untracked local fixture. Copy the actual HTTPS long link.

Temporarily change only `官方公告地址` to that device-test long link with `apply_patch`; do not commit the temporary URL.

- [ ] **Step 6: Run the device matrix**

Build and install with `install -r` without clearing app data. Verify:

1. Cold start displays the test announcement before cloud onboarding/welcome.
2. Back and backdrop do not close it.
3. “我知道了” closes it; the same ID does not reappear after another cold start.
4. Change the temporary manifest to a new ID, return from Study, Browser, Stats, Settings, Reminder, and Add Note; each route reaches the shared home-return path.
5. For a return inside the 10-minute window, confirm one delayed task is scheduled and repeated returns do not create parallel GETs. Use hilog/network logs to count requests.
6. After the ten-minute boundary, confirm the new ID appears without continuous five/ten-minute polling afterward.
7. Background and foreground the app while the home page is current; confirm the same ten-minute rule.
8. Disable network or serve a non-2xx response; confirm the single check ends within about two seconds and the home page remains usable.
9. Confirm an acknowledged ID stays suppressed in the same process and after restart; if Preferences write is deliberately failed, it remains suppressed in-process but may return after restart.

- [ ] **Step 7: Restore production configuration and clean only confirmed temporary cloud data**

Use `apply_patch` to restore `官方公告地址` to the verified production long link. Confirm:

```powershell
rg -n "announcement-device-test|announcement-link-stability-test" entry/src/main/ets
```

Expected: no matches.

Immediately before deletion, ask for confirmation to delete only:

- `/jidecards/announcement-device-test.json`
- `/jidecards/announcement-link-stability-test.json`

Never delete `/jidecards/announcement.json`.

- [ ] **Step 8: Run final verification and review**

```powershell
npm test
npm run build:app -- -SkipRust
git diff --check 74404e7...HEAD
git diff --stat 74404e7...HEAD
git status --short
```

Expected: all tests and build pass; production config contains only the verified production long link; temporary filenames are absent from source; the untracked device fixture may be removed locally only after explicitly verifying its absolute path is `D:\Projects\jidecards-announcement\hosting\announcement-device-test.json`.

Review every requirement in `docs/superpowers/specs/2026-08-29-official-announcement-design.md` and report:

- implementation commits;
- fresh test/build counts;
- exact production URL without credentials;
- stable-link replacement result;
- device results for every home-return path;
- remaining limitations: offline clients, old app versions, cleared data/reinstallation, exhausted direct-link traffic, and 123 service failure.

Do not merge into `main` while `D:\Projects\jidecards` contains the user's unrelated uncommitted UI changes. Offer a separate integration step after the user decides how to preserve those changes.

---

## Final Review Gate

- [ ] `git log --oneline 74404e7..HEAD` contains small task-focused commits.
- [ ] `git diff --name-only 74404e7...HEAD` contains only announcement policy, home orchestration, tests, configuration, and documentation.
- [ ] No committed source contains `announcement-device-test` or `announcement-link-stability-test`.
- [ ] No committed source contains a 123 Client ID, Client Secret, access token, refresh token, password, signed URL secret, or management API credential.
- [ ] Cache bucket and home check window are both exactly 600000 ms.
- [ ] Cold start remains immediate and retains startup modal order.
- [ ] Every real navigation return uses `返回主页后刷新()`.
- [ ] There is no `setInterval`; one timer and one request are the maximum.
- [ ] Same-ID acknowledgement is suppressed in memory before Preferences I/O.
- [ ] `announcement.json` is disabled by default and at most 5 KiB.
- [ ] The production URL was copied from and verified against 123, not inferred.
- [ ] `npm test` and `npm run build:app -- -SkipRust` pass in the final tree.
