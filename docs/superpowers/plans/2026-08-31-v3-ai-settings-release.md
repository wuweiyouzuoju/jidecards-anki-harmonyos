# 记得闪卡 3.0.0 与 AI 配置界面 Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** 发布版本与正式公告统一到 3.0.0，并完成 AI 配置文案、DeepSeek 模型、输入框样式和标题居中的调整。

**Architecture:** 发布元数据只修改当前生效的应用配置、正式公告和直接契约，历史 2.3.3 文档保持不变。AI 配置继续复用现有 ProviderCatalog、AgentSettingsStore 和共享 AI 页面，仅删除无价值的隐私 UI 状态，不改变发送时机、Asset Store 密钥和草稿写入安全边界。

**Tech Stack:** ArkTS、ArkUI、HarmonyOS AppScope/Resource、Preferences、Asset Store、Node contract tests、hvigor。

**执行结果（2026-08-31）：** Tasks 1-4 的产品改动和验证均已完成。按 TDD 先得到预期 RED，再完成 GREEN；定向契约 45/45、全量测试 632/632、完整 Rust+ArkTS 构建成功，签名 HAP 已用 `install -r` 覆盖安装两台模拟器并完成视觉核对。截图异常额外修复为：DeepSeek reasoning 以纯文本续传、HTTP 错误保留状态码、推理区明确显示“思考过程”。工作区原本含大量未提交 Agent 基础改动，因此未执行计划中的批量提交步骤，避免把用户的既有修改混入提交。

## Global Constraints

- 当前发布必须是 `versionName: '3.0.0'` 与 `versionCode: 3000`。
- 正式公告使用新的 3.0.0 ID、标题、日期和 3.0.0 单版本范围；历史设计文档不改写。
- DeepSeek 下拉必须包含 `deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-v4-flash-vision-exp`，默认仍是 Flash。
- 中文提供商选项显示“自定义”，英文显示 `Custom`。
- 删除数据发送提示、Responses/Asset Store 提示、同意复选框和保存/发送隐私前置拦截。
- 自定义 HTTPS 校验、Asset Store 密钥、点击发送才请求、草稿确认和高风险二次确认保持不变。
- 不修改 Anki Rust、protobuf、NAPI ABI 或数据库结构。
- 设备安装只能使用 `hdc install -r`，不得 uninstall。

---

### Task 1: 3.0.0 应用版本与正式公告

**Files:**
- Modify: `AppScope/app.json5:5-6`
- Modify: `hosting/announcement.json:4-16`
- Modify: `tools/tests/cloud-deck-catalog.test.mjs:9-13`
- Modify: `tools/tests/official-announcement-flow-contract.test.mjs:138-153`

**Interfaces:**
- Produces: 应用元数据 `versionCode=3000`、`versionName=3.0.0`。
- Produces: 当前托管公告 `id=20260831-v3.0.0-release`，版本范围固定 3.0.0。

- [ ] **Step 1: 把契约测试改为期望 3.0.0**

```js
test('此次云端牌组引导版本固定为 3.0.0', async () => {
  const 应用配置 = await readFile(new URL('../../AppScope/app.json5', import.meta.url), 'utf8');
  assert.match(应用配置, /versionCode:\s*3000/);
  assert.match(应用配置, /versionName:\s*'3\.0\.0'/);
});

test('hosted announcement manifest publishes the v3.0.0 release notice under 5 KiB', () => {
  const manifest = JSON.parse(read('../../hosting/announcement.json'));
  assert.equal(manifest.announcement.id, '20260831-v3.0.0-release');
  assert.equal(manifest.announcement.minimumAppVersion, '3.0.0');
  assert.equal(manifest.announcement.maximumAppVersion, '3.0.0');
  assert.match(manifest.announcement.contentZh, /AI 制卡/);
  assert.match(manifest.announcement.contentZh, /AI 改卡/);
});
```

- [ ] **Step 2: 运行发布契约并确认 RED**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs tools/tests/official-announcement-flow-contract.test.mjs`

Expected: FAIL，输出仍包含 2304/2.3.4 和 2.3.3 公告。

- [ ] **Step 3: 更新应用配置与正式公告**

```json5
versionCode: 3000,
versionName: '3.0.0',
```

公告使用：

```json
{
  "id": "20260831-v3.0.0-release",
  "titleZh": "记得闪卡 v3.0.0 更新",
  "titleEn": "What's new in jidecards v3.0.0",
  "publishedAt": "2026-08-31T00:00:00+08:00",
  "startsAt": "2026-08-31T00:00:00+08:00",
  "minimumAppVersion": "3.0.0",
  "maximumAppVersion": "3.0.0"
}
```

双语正文使用以下完整内容：

```text
【新增】AI 制卡升级为应用内智能体。它会读取当前选择的牌组与笔记类型，支持普通题、填空题和导入牌组的自定义笔记类型，并可一次生成多张可编辑草稿。

【新增】加入独立的 AI 改卡。可以从首页、学习中的当前卡片或浏览器选中内容进入，通过对话修改字段、标签和牌组；删除、模板和笔记结构等高风险操作会显示精确影响并要求再次确认。

【新增】支持联网搜索、来源和工具执行过程。AI 只有在你发送要求后才连接所选提供商，应用写入仍由本地受控工具完成。

【优化】DeepSeek、OpenAI 与自定义提供商统一为下拉配置；DeepSeek 提供 Flash、Pro 与视觉实验模型，密钥仍加密保存在本机。

【新增】保留云端牌组下载、官方公告、AnkiWeb 使用引导，以及图片遮罩读取与格式识别修复。更多牌组可加入官方 QQ 群 726837065 获取。
```

```text
[New] AI Card Creation is now an in-app agent. It reads the selected deck and note type, supports basic, cloze, and imported custom note types, and can produce multiple editable drafts in one request.

[New] AI Card Editing is available from Home, the current study card, or selected Browser items. Use conversation to update fields, tags, and decks. Deletions, templates, and note-structure changes show their exact impact and require an additional confirmation.

[New] Web search, sources, and tool activity are visible. The selected provider is contacted only after you send a request, while app writes remain controlled by local tools.

[Improved] DeepSeek, OpenAI, and custom providers share one configuration flow. DeepSeek offers Flash, Pro, and the experimental vision model, while API keys remain encrypted on the device.

[New] This release also retains cloud deck downloads, official announcements, AnkiWeb guidance, and image-occlusion reading and format fixes. Join the official QQ group 726837065 for more decks.
```

- [ ] **Step 4: 运行发布契约并确认 GREEN**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs tools/tests/official-announcement-flow-contract.test.mjs`

Expected: 两个文件全部 PASS。

- [ ] **Step 5: 提交当前任务**

```powershell
git add -- AppScope/app.json5 hosting/announcement.json tools/tests/cloud-deck-catalog.test.mjs tools/tests/official-announcement-flow-contract.test.mjs
git commit -m "release: prepare jidecards 3.0.0"
```

### Task 2: DeepSeek 三模型与无隐私门槛设置模型

**Files:**
- Modify: `entry/src/main/ets/model/agent/ProviderCatalog.ts:17-35`
- Modify: `entry/src/main/ets/backend/agent/AgentSettingsStore.ets:10-132`
- Modify: `tools/tests/ai-agent-settings-contract.test.mjs:10-29`
- Modify: `tools/tests/ai-agent-provider-contract.test.mjs`

**Interfaces:**
- Produces: `DEEPSEEK_PROVIDER.models: string[]` 含三款官方模型。
- Produces: `AgentSettings` 不再包含 `privacyNoticeAccepted`。

- [ ] **Step 1: 添加失败契约**

```js
test('DeepSeek exposes all current models while keeping Flash as default', async () => {
  const { DEEPSEEK_PROVIDER } = await import('../../entry/src/main/ets/model/agent/ProviderCatalog.ts');
  assert.deepEqual(DEEPSEEK_PROVIDER.models, [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash-vision-exp',
  ]);
  assert.equal(DEEPSEEK_PROVIDER.defaultModel, 'deepseek-v4-flash');
});

test('agent settings have no privacy acknowledgement gate', () => {
  const store = read('entry/src/main/ets/backend/agent/AgentSettingsStore.ets');
  assert.doesNotMatch(store, /PRIVACY_NOTICE|privacyNoticeAccepted|ai_agent_privacy_notice_accepted/);
});
```

- [ ] **Step 2: 运行设置/Provider 契约并确认 RED**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-settings-contract.test.mjs tools/tests/ai-agent-provider-contract.test.mjs`

Expected: FAIL，模型数组只有 Flash，设置仍含 privacy key。

- [ ] **Step 3: 最小化修改 ProviderCatalog 与 AgentSettingsStore**

```ts
models: [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash-vision-exp'
],
defaultModel: 'deepseek-v4-flash',
```

从 `AgentSettings`、默认值、加载、保存和 Preferences key 中删除 `privacyNoticeAccepted`；旧 Preferences 中遗留 key 由 Preferences 自然忽略，不添加兼容分支。

- [ ] **Step 4: 运行设置/Provider 契约并确认 GREEN**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-settings-contract.test.mjs tools/tests/ai-agent-provider-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5: 提交当前任务**

```powershell
git add -- entry/src/main/ets/model/agent/ProviderCatalog.ts entry/src/main/ets/backend/agent/AgentSettingsStore.ets tools/tests/ai-agent-settings-contract.test.mjs tools/tests/ai-agent-provider-contract.test.mjs
git commit -m "feat: expand DeepSeek model choices"
```

### Task 3: AI 配置文案、输入框与居中标题

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets:160-220,490-510,813-880,1001-1175`
- Modify: `entry/src/main/ets/components/settings/AIAgent设置分组.ets:18-160`
- Modify: `entry/src/main/resources/base/element/string.json:1642-1704`
- Modify: `entry/src/main/resources/en_US/element/string.json:1038-1099`
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs`
- Modify: `tools/tests/ai-agent-high-risk-ui-contract.test.mjs`
- Modify: `tools/tests/i18n-contract.test.mjs`

**Interfaces:**
- Consumes: Task 2 的三模型 ProviderCatalog 与无隐私字段 AgentSettings。
- Produces: 本地化“自定义/Custom”、短标题“配置”、无提示/复选框配置 UI、统一 TextInput 样式、屏幕中线标题。

- [ ] **Step 1: 添加失败 UI/i18n 契约**

```js
test('AI configuration is localized, uncluttered and has no acknowledgement gate', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const settings = read('entry/src/main/ets/components/settings/AIAgent设置分组.ets');
  assert.match(page + settings, /ai_agent_provider_custom/);
  assert.doesNotMatch(page + settings, /ai_agent_privacy_notice|ai_agent_privacy_accept|privacyAccepted|隐私已确认/);
  assert.doesNotMatch(page, /ai_card_config_hint/);
});

test('AI page title uses equal side regions around a centered title', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const top = page.match(/private 顶部条\(\)[\s\S]*?@Builder\s+private 选择区/)?.[0] ?? '';
  assert.equal((top.match(/\.width\('35%'\)/g) ?? []).length, 2);
  assert.match(top, /\.width\('30%'\)[\s\S]*\.textAlign\(TextAlign\.Center\)/);
});
```

同时在 i18n 契约中要求：

```js
assert.equal(zh.ai_card_config, '配置');
assert.equal(zh.ai_agent_provider_custom, '自定义');
assert.equal(en.ai_agent_provider_custom, 'Custom');
```

- [ ] **Step 2: 运行 UI/i18n 契约并确认 RED**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-high-risk-ui-contract.test.mjs tools/tests/i18n-contract.test.mjs`

Expected: FAIL，仍含 Custom、提示、privacy state，顶部栏仍按内容权重分配。

- [ ] **Step 3: 删除隐私提示状态和拦截**

从共享 AI 页面和设置分组删除：

```ts
@State private 隐私已确认: boolean = false;
@State private privacyAccepted: boolean = false;
```

删除发送/保存时对 `ai_agent_privacy_required` 的检查、配置读写以及提示 Text/Checkbox。保留自定义 HTTPS/模型校验与 API key/model 必填校验。

- [ ] **Step 4: 本地化提供商并统一输入框**

在两个 locale 增加：

```json
{ "name": "ai_agent_provider_custom", "value": "自定义" }
```

英文对应 `Custom`；`ai_card_config` 中文改为“配置”、英文改为 `Settings`。两个 UI 的 Select 使用资源值，不硬编码 `Custom`。

三个输入框统一应用：

```ts
.width('100%')
.height(应用尺寸.按钮高度)
.fontSize(应用尺寸.字号_正文)
.fontColor($r('app.color.text_primary'))
.placeholderColor($r('app.color.text_tertiary'))
.backgroundColor($r('app.color.surface_card'))
.border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
.borderRadius(应用尺寸.圆角_面板)
.padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
```

- [ ] **Step 5: 把顶部栏改为等宽三区**

```ts
Row() {
  Row() { Button($r('app.string.study_back')) }
    .width('35%')
  Text(this.pageMode === 'create' ? $r('app.string.ai_card_title') : $r('app.string.ai_card_edit'))
    .width('30%')
    .textAlign(TextAlign.Center)
    .maxLines(1)
    .textOverflow({ overflow: TextOverflow.Ellipsis })
  Row({ space: 应用尺寸.间距_8 }) {
    Button($r('app.string.ai_agent_history'))
    Button($r('app.string.ai_card_config'))
  }
    .width('35%')
    .justifyContent(FlexAlign.End)
}
```

- [ ] **Step 6: 删除双语孤儿资源并运行契约 GREEN**

删除 `ai_card_config_hint`、`ai_agent_privacy_notice`、`ai_agent_privacy_accept`、`ai_agent_privacy_required`，确保 base/en_US key 完全一致。

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-*.test.mjs tools/tests/i18n-contract.test.mjs`

Expected: Agent 与 i18n 聚焦测试全部 PASS。

- [ ] **Step 7: 提交当前任务**

```powershell
git add -- entry/src/main/ets/pages/AI制卡页.ets entry/src/main/ets/components/settings/AIAgent设置分组.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-high-risk-ui-contract.test.mjs tools/tests/i18n-contract.test.mjs
git commit -m "feat: simplify AI provider settings"
```

### Task 4: 项目记录、完整验证与模拟器证据

**Files:**
- Modify: `PROJECT_CONTEXT.md`
- Modify: `.trae/decisions.md`
- Modify: `docs/superpowers/plans/2026-08-31-v3-ai-settings-release.md`

**Interfaces:**
- Consumes: Tasks 1-3 的最终工作树。
- Produces: 可审计的 3.0.0 构建、测试、HAP 与模拟器证据。

- [ ] **Step 1: 更新项目记录**

在 `PROJECT_CONTEXT.md` 当前发布记录和 `.trae/decisions.md` 追加 3.0.0 决策：版本号、公告 ID、三款 DeepSeek 模型、删除隐私 UI、输入框统一与标题中线；明确安全写入边界未变。

- [ ] **Step 2: 运行完整测试**

Run: `npm test`

Expected: 0 failures。

- [ ] **Step 3: 运行完整 Rust + ArkTS 构建**

Run: `npm run build:app`

Expected: Rust crates finish、`TYPE CHECK SUCCESSFUL`、`BUILD SUCCESSFUL`，生成 `entry/build/default/outputs/default/entry-default-signed.hap`。

- [ ] **Step 4: 核验 native 边界**

```powershell
git status --short -- third_party/anki native
git status --short | Select-String -Pattern '\.rs$|\.proto$|CMakeLists\.txt$|rsharmony'
```

Expected: 两条命令都没有 Agent/3.0.0 相关输出。

- [ ] **Step 5: 覆盖安装并目视检查**

```powershell
hdc list targets
hdc -t 127.0.0.1:5555 install -r entry\build\default\outputs\default\entry-default-signed.hap
hdc -t 127.0.0.1:5557 install -r entry\build\default\outputs\default\entry-default-signed.hap
```

检查 AI 制卡与 AI 改卡：标题位于屏幕中线；右上角为“历史/配置”；DeepSeek 有三款模型；自定义显示中文；三个输入框样式一致；没有提示和隐私复选框。

- [ ] **Step 6: 提交项目记录**

```powershell
git add -- PROJECT_CONTEXT.md .trae/decisions.md docs/superpowers/plans/2026-08-31-v3-ai-settings-release.md
git commit -m "docs: record jidecards 3.0.0 verification"
```
