# 云端分发版牌组目录与三选上限 Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** 让首次云端牌组引导只展示当前可下载的六个牌组、最多选择三个，并明确提示可从官方 QQ 群免费下载更多牌组文件。

**Architecture:** 保持现有目录协议和网络服务不变，只更新托管 JSON 数据。选择上限由首页统一状态入口和下载入口双重执行；弹窗继续负责纯展示，复用现有 QQ 群号点击复制能力。

**Tech Stack:** ArkTS/ArkUI、JSON 资源、本地化 `string.json`、Node.js `node:test` 契约测试。

## Global Constraints

- `hosting/cloud-decks.json` 保持 `schemaVersion: 1` 和六条公开记录。
- 软件显示名不包含“（分发版）”，该后缀只属于云盘文件名。
- 不包含用户已经删除的 `AI for Science（分发版）.apkg`。
- 中国法律专业版保持现有文件、ID 和版本；其 APKG 不含 MP3 或其他媒体。
- 首次引导至少成功导入一个牌组才能进入软件，最多同时选择三个。
- QQ 群号固定为 `726837065`，点击只复制，不新增 QQ 唤起或外部跳转。
- 不修改 123 云盘文件；本轮只生成并验证本地上传源。
- 保留工作区中与本任务无关的已有修改和未跟踪文件。

---

### Task 1: 更新六牌组托管目录

**Files:**
- Modify: `tools/tests/cloud-deck-catalog.test.mjs`
- Modify: `hosting/cloud-decks.json`

**Interfaces:**
- Consumes: `解析云端牌组目录(text: string): 云端牌组目录`
- Produces: 六条公开目录记录；四个稳定旧 ID、一个新 `it-computer` ID、一个不变法律版 ID。

- [ ] **Step 1: 先把目录契约测试改为新的精确数据**

在 `tools/tests/cloud-deck-catalog.test.mjs` 中将目录断言改为：

```js
[
  { id: 'cet-46-vocabulary', name: 'CET四六级词汇', version: '1.1.0', size: 169033353, cardCount: 14311, accessType: 'public', fileName: 'CET四六级词汇（分发版）.apkg' },
  { id: 'high-school-english-vocabulary', name: '高考英语词汇', version: '1.1.0', size: 89347750, cardCount: 8453, accessType: 'public', fileName: '高考英语词汇（分发版）.apkg' },
  { id: 'middle-school-english-vocabulary', name: '中考英语词汇', version: '1.1.0', size: 44392978, cardCount: 3305, accessType: 'public', fileName: '中考英语词汇（分发版）.apkg' },
  { id: 'ai-machine-learning', name: 'AI机器学习', version: '1.1.0', size: 5526001, cardCount: 1450, accessType: 'public', fileName: 'AI机器学习（分发版）.apkg' },
  { id: 'it-computer', name: 'IT计算机', version: '1.0.0', size: 35303280, cardCount: 3400, accessType: 'public', fileName: 'IT计算机（分发版）.apkg' },
  { id: 'china-law-professional', name: '中国法律专业版', version: '1.0.0', size: 1351898, cardCount: 2500, accessType: 'public', fileName: '中国法律专业版.apkg' },
]
```

映射实际目录时用 `decodeURIComponent(new URL(downloadUrl).pathname.split('/').at(-1))` 得到 `fileName`，并继续断言协议为 HTTPS、主机为 `4001784660.cdn.123clouddisk.com`。

- [ ] **Step 2: 运行目录测试并确认先失败**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs`

Expected: FAIL，旧目录的大小、版本、文件名和第五条 ID 与新断言不一致。

- [ ] **Step 3: 更新本地发布源**

编辑 `hosting/cloud-decks.json`：四个英语/AI 旧条目保留 ID 和显示名，将版本改为 `1.1.0`，URL 改为对应 `（分发版）.apkg`，并写入上表精确字节数；删除 `ai-computer-terms`，增加以下条目：

```json
{
  "id": "it-computer",
  "name": "IT计算机",
  "description": "计算机与信息技术知识牌组",
  "version": "1.0.0",
  "accessType": "public",
  "downloadUrl": "https://4001784660.cdn.123clouddisk.com/4001784660/CET%E5%9B%9B%E5%85%AD%E7%BA%A7/IT%E8%AE%A1%E7%AE%97%E6%9C%BA%EF%BC%88%E5%88%86%E5%8F%91%E7%89%88%EF%BC%89.apkg",
  "size": 35303280,
  "cardCount": 3400
}
```

法律版条目原样保留；不得添加 `AI for Science`。

- [ ] **Step 4: 运行目录测试并确认通过**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交目录数据**

```bash
git add hosting/cloud-decks.json tools/tests/cloud-deck-catalog.test.mjs
git commit -m "fix: align cloud catalog with distribution decks"
```

### Task 2: 限制首次引导最多选择三个牌组

**Files:**
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`

**Interfaces:**
- Consumes: `云端牌组选中ID列表: string[]`、`显示提示(Resource)`、现有 `onToggle(deckId)` 和 `onCopyQQGroup()`。
- Produces: `云端牌组最多选择数量 = 3`；第四次新增选择会提示且不改变数组；下载入口拒绝超过三个 ID。

- [ ] **Step 1: 写失败的选择上限和文案契约**

在 `tools/tests/cloud-deck-flow-contract.test.mjs` 新增断言，锁定：

```js
assert.match(source, /const 云端牌组最多选择数量: number = 3;/);
assert.match(toggleMethod, /index >= 0[\s\S]*云端牌组选中ID列表\.length >= 云端牌组最多选择数量[\s\S]*cloud_deck_selection_limit[\s\S]*concat\(\[deckId\]\)/);
assert.match(downloadMethod, /云端牌组选中ID列表\.length > 云端牌组最多选择数量/);
assert.equal(zhMap.get('cloud_deck_selection_limit'), '最多只能选择 %d 个牌组');
assert.equal(zhMap.get('cloud_deck_qq_group_entry'), '更多牌组文件可前往官方 QQ 群 %s 免费下载（点击复制）');
assert.match(zhMap.get('cloud_deck_onboarding_message'), /最多选择 3 个/);
```

把 `cloud_deck_selection_limit` 加入中英文必需键列表，并继续验证两份资源键完全一致、英文值不含中文。

- [ ] **Step 2: 运行交互契约并确认先失败**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-flow-contract.test.mjs`

Expected: FAIL，缺少上限常量、第四项保护和新资源键。

- [ ] **Step 3: 在首页统一执行选择上限**

在 `首页.ets` 的云端牌组状态常量附近增加：

```ts
const 云端牌组最多选择数量: number = 3;
```

将新增选择分支改为：

```ts
if (index >= 0) {
  this.云端牌组选中ID列表 = this.云端牌组选中ID列表.filter(
    (id: string): boolean => id !== deckId);
  return;
}
if (this.云端牌组选中ID列表.length >= 云端牌组最多选择数量) {
  this.显示提示($r('app.string.cloud_deck_selection_limit', 云端牌组最多选择数量));
  return;
}
this.云端牌组选中ID列表 = this.云端牌组选中ID列表.concat([deckId]);
```

在 `下载选中云端牌组()` 开头保留空选择判断，并增加 `length > 云端牌组最多选择数量` 的防御判断；异常时显示同一提示后返回，不创建下载任务。

- [ ] **Step 4: 更新顶部小字和中英文资源**

中文：

```json
{ "name": "cloud_deck_onboarding_message", "value": "首次进入至少选择 1 个、最多选择 3 个牌组，下载后将自动导入。本次选择机会仅有一次，请按需选择。" },
{ "name": "cloud_deck_qq_group_entry", "value": "更多牌组文件可前往官方 QQ 群 %s 免费下载（点击复制）" },
{ "name": "cloud_deck_selection_limit", "value": "最多只能选择 %d 个牌组" }
```

英文：

```json
{ "name": "cloud_deck_onboarding_message", "value": "On first launch, choose 1 to 3 decks. Downloads are imported automatically. This selection is available only once, so choose carefully." },
{ "name": "cloud_deck_qq_group_entry", "value": "Download more deck files for free from the official QQ group: %s (tap to copy)" },
{ "name": "cloud_deck_selection_limit", "value": "You can select up to %d decks" }
```

- [ ] **Step 5: 运行交互契约并确认通过**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-flow-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 6: 提交选择上限**

```bash
git add entry/src/main/ets/pages/首页.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/cloud-deck-flow-contract.test.mjs
git commit -m "feat: limit initial cloud decks to three"
```

### Task 3: 同步托管说明并完成验证

**Files:**
- Modify: `docs/cloud-deck-hosting.md`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: Task 1 的六牌组目录与 Task 2 的三选上限。
- Produces: 后续 Agent 可检索的当前发布规则和用户体验历史。

- [ ] **Step 1: 更新说明和项目历史**

将托管指南的“六牌组目录”说明更新为当前六项，明确显示名与云盘文件名可不同、替换 APKG 时必须同步精确 `size`。在 `PROJECT_CONTEXT.md` 历史中记录：2026-08-31 起首次引导最多选择 3 个；更多牌组从官方 QQ 群免费下载；目录使用四个分发替换版、IT计算机和无媒体的中国法律专业版，不包含 AI for Science。

- [ ] **Step 2: 验证公开文件地址和精确大小**

对目录中的六个 `downloadUrl` 逐项发送只读请求，断言 HTTP 2xx；核对 `Content-Length` 与 JSON 的 `size`。若 CDN 尚未刷新，只报告具体 URL 和状态，不上传、删除或替换任何云端文件。

- [ ] **Step 3: 运行完整测试和格式检查**

Run: `npm test`

Expected: 全部测试 PASS。

Run: `git diff --check HEAD~2..HEAD`

Expected: 无输出、退出码 0。

- [ ] **Step 4: 提交文档**

```bash
git add docs/cloud-deck-hosting.md PROJECT_CONTEXT.md
git commit -m "docs: record distribution deck onboarding rules"
```

- [ ] **Step 5: 交付上传文件**

向用户提供可点击的 `D:\Projects\jidecards\hosting\cloud-decks.json`，明确只需在 123 云盘删除旧 `cloud-decks.json` 后上传该同名文件；不要改动六个 APKG。
