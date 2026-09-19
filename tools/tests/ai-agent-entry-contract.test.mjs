// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('developer debug key persistently unlocks every hidden Agent channel through one runtime gate', () => {
  const features = read('entry/src/main/ets/model/ReleaseFeatures.ets');
  const entryAbility = read('entry/src/main/ets/entryability/EntryAbility.ets');
  const settings = read('entry/src/main/ets/components/设置面板.ets');
  const developerGroup = read('entry/src/main/ets/components/settings/开发者调试分组.ets');
  assert.match(features, /AI_AGENT_CHANNELS_APP_STORAGE_KEY:\s*string\s*=\s*'aiAgentChannelsEnabled'/);
  assert.match(features, /DEVELOPER_DEBUG_KEY_NORMALIZED:\s*string\s*=\s*'jidecardsdeveloperdebug3\.0\.0'/);
  assert.match(features, /isDeveloperDebugKeyValid/);
  assert.match(features, /store\.put\(AI_AGENT_CHANNELS_PREFERENCE_KEY, true\)/);
  assert.match(features, /await store\.flush\(\)/);
  assert.match(features, /AppStorage\.setOrCreate<boolean>\(AI_AGENT_CHANNELS_APP_STORAGE_KEY, true\)/);
  assert.match(entryAbility, /initializeAiAgentChannels\(\)/);
  assert.match(developerGroup, /InputType\.Password/);
  assert.match(developerGroup, /enableAiAgentChannels\(this\.开发者密钥\)/);
  assert.match(developerGroup, /app\.string\.settings_developer_debug_qq_hint/);
  assert.match(developerGroup,
    /if \(this\.Agent入口已启用\) \{[\s\S]*?settings_developer_debug_enabled[\s\S]*?\.maxLines\(1\)/);
  assert.doesNotMatch(developerGroup, /settings_developer_debug_enabled_hint|settings_developer_debug_success/,
    'successful activation must use the existing single-line settings status style');
  assert.match(settings, /开发者调试分组\(/);
  assert.match(settings,
    /启用成功回调:[\s\S]*?this\.openSection\('ai'\);/,
    'successful activation must collapse developer debug and reveal the Agent settings group');
  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string;
  assert.equal(zh.find((item) => item.name === 'settings_developer_debug_enable')?.value, '启用开发者功能');
  assert.equal(en.find((item) => item.name === 'settings_developer_debug_enable')?.value, 'Enable Developer Features');
  assert.equal(zh.find((item) => item.name === 'settings_developer_debug_qq_hint')?.value,
    '加入官方 QQ 群 726837065，获取开发者调试资格。');
  assert.equal(en.find((item) => item.name === 'settings_developer_debug_qq_hint')?.value,
    'Join the official QQ group 726837065 to request developer debug access.');

  for (const relative of [
    'entry/src/main/ets/components/主页操作面板.ets',
    'entry/src/main/ets/pages/学习页.ets',
    'entry/src/main/ets/components/browser/批量操作栏.ets',
    'entry/src/main/ets/components/设置面板.ets',
  ]) {
    const source = read(relative);
    assert.match(source, /AI_AGENT_CHANNELS_APP_STORAGE_KEY/);
    assert.match(source,
      /@StorageLink\(AI_AGENT_CHANNELS_APP_STORAGE_KEY\)[^\n]*Agent入口已启用:\s*boolean\s*=\s*false/);
    assert.match(source, /if \(this\.Agent入口已启用\) \{/);
  }
});

test('home exposes Agent create directly and routes Agent edit through Browser selection', () => {
  const panel = read('entry/src/main/ets/components/主页操作面板.ets');
  const home = read('entry/src/main/ets/pages/首页.ets');
  assert.match(panel, /AI制卡回调/);
  assert.match(panel, /AI改卡回调/);
  assert.match(home, /打开AI制卡/);
  assert.match(home, /打开AI改卡/);
  assert.match(home, /mode:\s*'create'/);
  const editEntry = home.match(/private async 打开AI改卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(editEntry, /selectForAgentEdit:\s*true/);
  assert.match(editEntry, /name:\s*'BrowserPage'/);
  assert.doesNotMatch(editEntry, /name:\s*'AiCardPage'|mode:\s*'edit'/);
  assert.match(home, /pageSelectForAgentEdit:\s*\(param as 浏览页参数\)\.selectForAgentEdit \?\? false/);
});

test('Agent create and edit labels and page background use the themed shell', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const byName = new Map(zh.map((item) => [item.name, item.value]));
  assert.equal(byName.get('ai_card_title'), 'AI 制卡');
  assert.equal(byName.get('ai_card_edit'), 'AI 改卡');
  assert.equal(byName.get('ai_agent_history_create_title'), 'AI 制卡');
  assert.equal(byName.get('ai_agent_history_edit_title'), 'AI 改卡');
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string;
  const enByName = new Map(en.map((item) => [item.name, item.value]));
  assert.equal(enByName.get('ai_card_title'), 'AI Cards');
  assert.equal(enByName.get('ai_card_edit'), 'AI Edit Cards');
  assert.equal(enByName.get('ai_agent_history_create_title'), 'AI Card Creation');
  assert.equal(enByName.get('ai_agent_history_edit_title'), 'AI Card Editing');
  assert.match(page, /@StorageProp\(PAGE_SURFACE_KEY\)[^\n]*页面底色微染值/);
  assert.match(page, /private 顶部条\(\)[\s\S]*?backgroundColor\(this\.页面底色微染值\)/);
  assert.match(page, /build\(\)[\s\S]*?height\('100%'\)[\s\S]*?backgroundColor\(this\.页面底色微染值\)/);
});

test('shared Agent page has explicit mode and sends no provider request while appearing', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /mode\?:\s*AgentMode/);
  assert.match(page, /pageMode:\s*AgentMode/);
  assert.match(page, /AgentRunner/);
  assert.match(page, /run\(/);
  const appear = page.match(/async aboutToAppear\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.doesNotMatch(appear, /\.run\(|请求AI生成卡片/);
  assert.doesNotMatch(page, /请求AI生成卡片/);
  assert.match(page, /ai_agent_edit_search_welcome/);
});

test('AI composer uses resize keyboard avoidance so the whole input row stays visible', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /import \{ KeyboardAvoidMode \} from '@kit\.ArkUI'/);
  assert.match(page,
    /aboutToAppear\(\)[\s\S]*getKeyboardAvoidMode\(\)[\s\S]*setKeyboardAvoidMode\(KeyboardAvoidMode\.RESIZE\)/,
    'the keyboard must resize the page instead of lifting only the focused TextArea');
  assert.match(page,
    /aboutToDisappear\(\)[\s\S]*setKeyboardAvoidMode\(this\.上一键盘避让模式\)/,
    'leaving the Agent page must restore the previous window-level keyboard mode');
});

test('unconfigured home AI entries route to the expanded AI settings group', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const home = read('entry/src/main/ets/pages/首页.ets');
  const browser = read('entry/src/main/ets/pages/浏览页.ets');
  const study = read('entry/src/main/ets/pages/学习页.ets');
  const settingsPage = read('entry/src/main/ets/pages/设置页.ets');
  const settingsPanel = read('entry/src/main/ets/components/设置面板.ets');
  assert.doesNotMatch(page, /private 配置区\(|ai_card_config|配置密钥输入|保存配置/);
  assert.doesNotMatch(page, /openAISettings\(|name:\s*'SettingsPage'/);
  const createEntry = home.match(/private async 打开AI制卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  const editEntry = home.match(/private async 打开AI改卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(createEntry, /if \(!(?:await this\.isAIConfigured\(\)|configured)\)[\s\S]*?this\.openAISettings\(\)/);
  assert.match(editEntry, /if \(!(?:await this\.isAIConfigured\(\)|configured)\)[\s\S]*?this\.openAISettings\(\)/);
  assert.match(home, /设置页参数\s*=\s*\{ openAiSettings:\s*true \}/);
  assert.match(home, /name:\s*'SettingsPage'/);
  assert.match(home,
    /设置页\(\{[\s\S]*?openAiSettings:\s*\(param as 设置页参数\)\.openAiSettings \?\? false/);
  assert.match(settingsPage,
    /设置面板\(\{[\s\S]*?openAiSettings:\s*this\.openAiSettings/);
  assert.match(settingsPanel,
    /if \(this\.openAiSettings\) \{ this\.openSection\('ai'\); \}/);
  // 跳转后必须直接定位到 AI 智能体分组（无动画），并弹悬浮 Toast「请先完善AI配置」
  assert.match(settingsPanel, /scroller:\s*this\.内容滚动器/);
  assert.match(settingsPanel, /scrollToIndex\(0\)/);
  assert.match(settingsPanel,
    /private openSection\(id: string\): void[\s\S]*?this\.activeSection = id;/);
  const aiToast = settingsPanel.match(/if \(this\.openAiSettings\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.match(aiToast, /showToast\(\{[\s\S]*?ai_agent_config_required[\s\S]*?\}\)/,
    'the hint must be a floating toast, not inline layout copy');
  assert.doesNotMatch(settingsPanel, /if \(this\.显示AI配置提示\) \{/,
    'no inline hint text may be embedded in the group layout');
  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  assert.equal(zh.ai_agent_config_required, '请先完善AI配置');
  assert.equal(en.ai_agent_config_required, 'Complete AI configuration first');
});

test('unconfigured browser and study AI edit entries route to the same AI settings jump', () => {
  const browser = read('entry/src/main/ets/pages/浏览页.ets');
  const study = read('entry/src/main/ets/pages/学习页.ets');
  for (const [name, source] of [['browser', browser], ['study', study]]) {
    const entry = source.match(/private async 打开AI改卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
    assert.match(entry, /if \(!(?:await this\.isAIConfigured\(\)|configured)\)[\s\S]*?this\.openAISettings\(\)/,
      `${name} edit entry must gate on AI configuration before pushing AiCardPage`);
    assert.match(source, /设置页参数\s*=\s*\{ openAiSettings:\s*true \}/, name);
    assert.match(source, /name:\s*'SettingsPage'/, name);
    assert.match(source, /loadAgentSettings/, name);
    assert.match(source, /loadAgentSecret/, name);
  }
  // 浏览页跳设置不丢多选：未配置分支不得退出多选
  const browserEntry = browser.match(/private async 打开AI改卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  const gateIndex = browserEntry.indexOf('this.openAISettings()');
  const exitIndex = browserEntry.indexOf('this.退出多选()');
  assert.ok(gateIndex >= 0 && exitIndex > gateIndex,
    'the unconfigured jump must not exit multi-select; it is only exited on the real edit push');
});

test('study current-card entry passes stable context and reconciles the queue on return', () => {
  const study = read('entry/src/main/ets/pages/学习页.ets');
  assert.match(study, /ai_card_edit/);
  assert.match(study, /cardIds:\s*\[this\.当前卡片\.cardId\]/);
  assert.match(study, /noteIds:\s*\[this\.当前卡片\.noteId\]/);
  assert.match(study, /templateIdx:\s*this\.当前卡片\.templateIdx/);
  assert.match(study, /刷新编辑后当前卡/);
  const refresh = study.match(/private async 刷新编辑后当前卡\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(refresh, /await this\.加载下一张卡\(\)/);
  assert.match(refresh, /await this\.显示答案\(\)/);
  assert.doesNotMatch(refresh, /回答卡片|埋藏|暂停/);
});

test('browser edit entry passes selected IDs and preserves the active search', () => {
  const browser = read('entry/src/main/ets/pages/浏览页.ets');
  assert.match(browser, /打开AI改卡/);
  assert.match(browser, /mode:\s*'edit'/);
  assert.match(browser, /this\.浏览模式值 === 'cards'/);
  assert.match(browser, /cardIds/);
  assert.match(browser, /noteIds/);
  assert.match(browser, /onPop:[\s\S]*this\.执行搜索\(\)/);
});

test('preselected edit hides selectors, keeps global reads, and proposes discovered objects for confirmation', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const cardTools = read('entry/src/main/ets/backend/agent/CardAgentTools.ets');
  assert.match(page,
    /private hasFixedEditSelection\(\): boolean[\s\S]*this\.pageCardIds\.length > 0[\s\S]*this\.pageNoteIds\.length > 0/);
  assert.match(page,
    /if \(this\.hasFixedEditSelection\(\)\) \{[\s\S]*if \(this\.消息列表\.length === 0\)[\s\S]*Text\(this\.selectedEditContext\(\)\)[\s\S]*\} else \{[\s\S]*AgentSetupCard\(/);
  assert.match(page,
    /private providerFunctionToolsForTurn\(\): ProviderFunctionTool\[\][\s\S]*return agentFunctionTools\(this\.agentSettings\.batchLimit, this\.pageMode\)/);
  assert.match(page, /functionTools:\s*this\.providerFunctionToolsForTurn\(\)/);
  const instructions = read('entry/src/main/ets/model/agent/AgentSessionContext.ts');
  assert.match(instructions, /用户审核具体范围后才能保存/);
  assert.match(instructions, /修改搜索发现的对象只生成草稿/);
  assert.match(cardTools, /search_cards[\s\S]*registerReadableCardIds/);
  assert.match(cardTools, /assertReadableNoteIds/);
  assert.match(cardTools, /assertReadableCardIds/);
  assert.match(page, /ai_agent_edit_selected_cards/);
  assert.match(page, /ai_agent_edit_selected_notes/);
});

test('tool traces translate stable provider IDs into detailed localized display names', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const strings = read('entry/src/main/resources/base/element/string.json');
  for (const toolName of [
    'search_cards', 'search_notes', 'list_decks', 'list_notetypes', 'list_tags',
    'get_notetype_details', 'get_card_statistics', 'propose_update_notes',
  ]) {
    assert.match(page, new RegExp(`case '${toolName}'`));
  }
  assert.match(page, /工具显示名\(this\.消息列表\[消息索引\]\.工具过程\[追踪索引\]\.toolName\)/);
  assert.match(strings, /"name": "ai_agent_tool_name_search_cards", "value": "在整个卡库中搜索闪卡"/);
  assert.match(strings, /"name": "ai_agent_tool_name_card_statistics", "value": "读取卡片统计与最近复习历史"/);
});

test('shared page rebuilds stable ID scope and batch policy for every user turn', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /private 重建本轮AgentScope\(\)/);
  assert.match(page, /runAgentTurn[\s\S]*this\.重建本轮AgentScope\(\)/);
  assert.match(page, /this\.agentScope\.beginTurn\(\)/);
  assert.match(page, /configureBatchLimit\(this\.agentSettings\.batchLimit\)/);
  assert.match(page, /providerFunctionToolsForTurn\(\)/);
});

test('create mode exposes only create tools while edit mode enables edit and high-risk proposals', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const catalog = read('entry/src/main/ets/model/agent/AgentToolCatalog.ts');
  assert.match(page, /register\(registry, this\.pageMode\)/);
  assert.match(page, /if \(this\.pageMode === 'edit'\)[\s\S]*HighRiskAgentTools/);
  assert.match(catalog, /mode:\s*AgentMode/);
  assert.match(catalog, /mode === 'edit'/);
  assert.match(page, /create_flashcards/);
  assert.doesNotMatch(page, /propose_create_notes/);
});

test('reasoning is visibly labelled and HTTP failures keep their status code', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /ai_agent_reasoning_process/);
  assert.match(page, /AgentTransportError/);
  assert.match(page, /ai_agent_http_error/);
  assert.match(page, /statusCode/);
  assert.match(page, /getStringSync\(资源\.id, \.\.\.参数\)/);
  assert.doesNotMatch(page, /\.replace\('%s'/);
  assert.match(page, /message\.正文\.length > 0\s*\? `\$\{message\.正文\}\\n\\n\$\{错误文案\}`\s*:\s*错误文案/,
    'a failure after partial model text must remain visible instead of only tinting the bubble red');
  assert.doesNotMatch(page, /message\.正文\s*\+=\s*event\.errorCode/,
    'raw provider codes must not be duplicated before the localized catch message');
});

test('page does not implement hidden draft-correction reply recycling', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.doesNotMatch(page, /draft_correction/,
    'a no-draft response must terminate instead of silently recycling the same AI bubble');
  assert.match(read('entry/src/main/ets/model/agent/AgentSessionContext.ts'), /如果无法完成，明确解释原因/,
    'the provider must be told that refusal is a valid terminal response');
});

test('partial AI output remains in live provider history after terminal validation failure', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page,
    /event\.kind === 'text_delta'[\s\S]*message\.正文 \+= event\.text;[\s\S]*message\.providerText \+= event\.text/,
    'raw streamed model text must be retained separately from the visible localized error');
  assert.match(page,
    /const text:\s*string = message\.providerText\.length > 0 \? message\.providerText : message\.正文/,
    'the next provider turn must receive retained raw model text');
  assert.match(page, /构建消息草稿上下文\(message\)/,
    'draft state must be replayed as bounded semantic context on the next provider turn');
  assert.match(page, /限制Provider输入\(values\)/,
    'provider history must be bounded before every stateless request');
  assert.match(page,
    /message\.kind = message\.providerText\.length > 0 \? 'normal' : 'error'/,
    'a terminal validation error with model text must remain a replayable conversation message');
});

test('search preference never turns an ordinary card draft into a mandatory-evidence failure', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /requiresWebSearch:\s*explicitWebSearchRequested\(intentText\)/,
    'an explicit web-search request must require real search execution');
  assert.match(page, /requiresSearchEvidence:\s*explicitSourceEvidenceRequested\(intentText\)/,
    'only an explicit source request may require HTTPS evidence');
  assert.doesNotMatch(page,
    /requiresSearchEvidence:\s*this\.agentSettings\.searchMode\s*===\s*'always'/,
    'the always-search preference must not discard a successful local draft without sources');
  assert.match(page, /searchMode:\s*'off'/,
    'web search is permanently disabled: every provider turn must run with search off');
});

test('AI configuration is localized and only lives in the settings group', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const settings = read('entry/src/main/ets/components/settings/AIAgent设置分组.ets');
  assert.match(settings, /ai_agent_provider_custom/);
  assert.doesNotMatch(page, /ai_agent_provider_custom|ai_card_save_config/);
  assert.doesNotMatch(page + settings,
    /ai_agent_privacy_notice|ai_agent_privacy_accept|privacyAccepted|隐私已确认|ai_card_config_hint/);

  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  assert.equal(zh.ai_agent_provider_custom, '自定义');
  assert.equal(en.ai_agent_provider_custom, 'Custom');
});

test('AI page title uses equal side regions around the screen midpoint', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const top = page.match(/private 顶部条\(\)[\s\S]*?@Builder\s+private 历史区/)?.[0] ?? '';
  assert.equal((top.match(/\.width\('35%'\)/g) ?? []).length, 2);
  assert.match(top, /\.width\('30%'\)[\s\S]*\.textAlign\(TextAlign\.Center\)/);
  assert.match(top, /\.justifyContent\(FlexAlign\.End\)/);
  assert.equal((top.match(/按下态按钮\(\{/g) ?? []).length, 3,
    'back, history and new conversation must share the home toolbar button component');
});

test('settings API key, custom endpoint and custom model inputs share one visual style', () => {
  const settings = read('entry/src/main/ets/components/settings/AIAgent设置分组.ets');
  assert.ok((settings.match(/backgroundColor\(\$r\('app\.color\.surface_card'\)\)/g) ?? []).length >= 3);
  assert.ok((settings.match(/app\.color\.border_input/g) ?? []).length >= 3);
});

test('an in-flight Agent turn is cancellable from the send button and exposes localized failures', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /private 取消当前请求\(\): void/);
  assert.match(page, /this\.agentRunner\.cancel\(\)/);
  assert.match(page, /this\.处理中\s*\?\s*\$r\('app\.string\.ai_agent_cancel'\)/);
  assert.match(page, /if \(this\.处理中\) \{ this\.取消当前请求\(\); \}/);
  assert.match(page, /ai_agent_web_search_unsupported/);
  assert.match(page, /ai_agent_turn_cancelled/);
});

test('all successful and failed tool calls use one typed detail view collapsed by default', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /工具过程:\s*AgentToolTrace\[\]/);
  assert.match(page, /event\.toolTrace/);
  assert.match(page, /callId/);
  assert.match(page, /private 工具过程项/);
  assert.match(page, /argumentsJson/);
  assert.match(page, /outputJson/);
  assert.match(page, /errorPath/);
  assert.match(page, /allowedKeys/);
  assert.match(page, /validTemplateJson/);
  assert.match(page, /repeatCount/);
  assert.match(page, /expanded/);
  assert.doesNotMatch(page, /工具过程:\s*string\[\]/);
  assert.doesNotMatch(page, /item\.indexOf\(':'\)/);

  const bubble = page.match(/private AI气泡\(消息索引: number\)[\s\S]*?@Builder\s+private 消息流/)?.[0] ?? '';
  const reasoningIndex = bubble.indexOf("ai_agent_reasoning_process");
  const bodyIndex = bubble.indexOf('parseAgentBoldRuns(this.消息列表[消息索引].正文)');
  const toolsIndex = bubble.indexOf("ai_agent_tool_process");
  const sourcesIndex = bubble.indexOf("来源列表.length > 0");
  const cardsIndex = bubble.indexOf("卡片列表.length > 0");
  const draftsIndex = bubble.indexOf("变更草稿列表.length > 0");
  assert.ok(reasoningIndex >= 0 && bodyIndex > reasoningIndex,
    'normal output must render below the reasoning section');
  assert.ok(toolsIndex > bodyIndex && sourcesIndex > toolsIndex);
  assert.ok(cardsIndex > sourcesIndex, 'card drafts must render after reasoning, tools, and sources');
  assert.ok(draftsIndex > sourcesIndex, 'change drafts must render after reasoning, tools, and sources');

  const disclosure = read('entry/src/main/ets/components/agent/AgentDisclosureCard.ets');
  assert.match(disclosure, /Text\('▼'\)/);
  assert.match(disclosure, /expanded\s*\?\s*0\s*:\s*-90/);
  assert.doesNotMatch(page, /切换工具详情[\s\S]*?animateTo\(/);
  assert.match(page,
    /trace\.expanded\s*=\s*message\.工具过程\[existingIndex\]\.expanded[\s\S]*?message\.工具过程\[existingIndex\]\s*=\s*trace/,
    'completion events must preserve a user-expanded running trace');

  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  for (const key of [
    'ai_agent_tool_round', 'ai_agent_tool_arguments', 'ai_agent_tool_output',
    'ai_agent_tool_error_path', 'ai_agent_tool_allowed_keys', 'ai_agent_tool_template',
    'ai_agent_tool_repeat_count', 'ai_agent_tool_truncated', 'ai_agent_repeated_tool_failure',
  ]) {
    assert.equal(typeof zh[key], 'string', key);
    assert.equal(typeof en[key], 'string', key);
  }
});

test('Agent writes broadcast both refresh ticks with disjoint scopes', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const block = page.match(/private 记录执行结果\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.ok(block.length > 0, '记录执行结果 must exist');
  assert.match(block, /if \(result\.succeeded > 0\)/, 'only successful writes may broadcast');
  assert.match(block, /AppStorage\.setOrCreate<number>\('noteAddedTick', Date\.now\(\)\)/,
    'home counts refresh on every successful Agent write');
  assert.match(block,
    /if \(this\.pageMode === 'edit'\) \{\s*AppStorage\.setOrCreate<number>\('cardContentChangedTick', Date\.now\(\)\);\s*\}/,
    'card content tick is edit-only: creating notes must not re-render the study card');
  assert.doesNotMatch(block, /cardContentChangedTick[\s\S]{0,80}pageMode !== 'edit'/);

  const saveBlock = page.match(/private async 保存单卡\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(saveBlock, /cardContentChangedTick/,
    'the legacy create path must not raise the card content tick');
});
