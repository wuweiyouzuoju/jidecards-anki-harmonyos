// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadPlatformModule } from './platform-module-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('one disclosure component owns the conversation arrow and animation', () => {
  const disclosure = read('entry/src/main/ets/components/agent/AgentDisclosureCard.ets');
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  assert.match(disclosure, /DisclosureChevron\(/);
  assert.match(disclosure, /expanded\s*\?\s*90\s*:\s*0/);
  assert.match(disclosure, /duration:\s*150/);
  assert.match(disclosure, /Curve\.EaseOut/);
  assert.doesNotMatch(disclosure, /animateTo\(/);
  assert.match(page, /AgentDisclosureCard/);
  assert.doesNotMatch(page, /private 切换工具详情[\s\S]*animateTo\(/);
});

test('create setup is an assistant-side local card instead of a fixed top form', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  const setup = read('entry/src/main/ets/components/agent/AgentSetupCard.ets');
  assert.match(page, /AgentSetupCard/);
  assert.doesNotMatch(page, /private 选择区\(\)/);
  assert.doesNotMatch(page, /this\.选择区\(\)/);
  assert.match(page, /evaluateAgentReadiness/);
  assert.match(page, /buildAgentTaskProviderText/);
  assert.match(page, /buildAgentTaskVisibleText/);
  assert.doesNotMatch(setup, /AgentDisclosureCard/);
  assert.doesNotMatch(setup, /ai_agent_setup_title_create|ai_agent_setup_instruction|readinessText|onToggle/);
  assert.match(setup, /backgroundColor\(\$r\('app\.color\.surface_card'\)\)/);
  assert.match(setup, /border\(SurfaceBorder\.options\(\)\)/);
  assert.match(setup, /borderRadius\(应用尺寸\.圆角_面板\)/);
  assert.match(setup, /padding\(应用尺寸\.卡片内边距\)/);
  assert.doesNotMatch(page, /setupExpanded|ai_agent_target_settings/);
});

test('edit setup exposes explicit deck and note-type search scope selectors', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  const setup = read('entry/src/main/ets/components/agent/AgentSetupCard.ets');
  assert.match(setup, /if \(this\.mode === 'create'\)[\s\S]*else \{[\s\S]*Select\(this\.editDeckOptions\(\)\)/);
  assert.match(setup, /Select\(this\.editNotetypeOptions\(\)\)/);
  assert.match(setup, /this\.onDeckSelected\(0\)/);
  assert.match(setup, /this\.onNotetypeSelected\(0\)/);
  assert.match(page, /allDecksLabel:/);
  assert.match(page, /allNotetypesLabel:/);
  assert.doesNotMatch(page, /configureCardSearchPrefix\(/);
});

test('local setup is excluded while the task snapshot is sent', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  assert.match(page, /buildAgentTaskProviderText\((?:snapshot|providerSnapshot)\)/);
  assert.match(page, /message\.kind === 'normal'|message\.kind === 'clarification'/);
  assert.doesNotMatch(page, /role:\s*'assistant'.*local_setup/);
});

test('clarification is a separate assistant bubble with explicit continuation', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  const card = read('entry/src/main/ets/components/agent/AgentClarificationCard.ets');
  assert.match(page, /result\.status === 'awaiting_clarification'/);
  assert.match(page, /appendClarificationMessage/);
  assert.match(page, /continueClarification/);
  assert.match(page, /buildClarificationAnswerText/);
  assert.match(page, /state = 'submitting'/);
  assert.match(page, /state = 'resolved'/);
  assert.match(page, /state = 'submit_failed'/);
  assert.doesNotMatch(card, /AgentDisclosureCard|onToggle|statusText|expanded/);
  assert.doesNotMatch(page, /toggleClarification|clarificationStatusText/);
  assert.match(card, /if \(this\.isEditable\(\)\) \{ this\.answerControls\(\); \}/);
  assert.match(card, /parseAgentBoldRuns\(this\.clarification\.request\.question\)/);
  assert.match(page, /buildClarificationAnswerVisibleText\(answer\)/);
  assert.match(card, /ai_agent_clarification_continue/);
});

test('composer readiness and clarification lifecycle remain controlled by the page', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  assert.match(page, /private canSubmit\(\): boolean/);
  assert.match(page, /return this\.readinessReason\(\) === 'ready'/);
  assert.match(page, /\.enabled\(this\.interfaceEnabled\('submit'\)\)/);
  assert.match(page, /canSubmit: this\.canSubmit\(\)/);
  assert.match(read('entry/src/main/ets/model/AppInterface.ts'), /context\.processing \|\| context\.canSubmit/);
  assert.match(page, /hasPendingClarification\(\)/);
  assert.match(page, /answerMessageId/);
  assert.match(page, /existingUserMessageId/);
  assert.match(page, /continueClarification/);
});

test('every assistant reply bubble ends with the AI-generated disclaimer', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  const bubble = page.match(/private AI气泡\(ctx: AgentMessageViewContext\) \{([\s\S]*?)\n  \}/)?.[0] ?? '';
  assert.ok(bubble.length > 0, 'AI气泡 builder must exist');
  // 声明必须位于气泡内容末尾（批次结果之后、Column 收尾之前），覆盖整轮 AI 产物
  const disclaimerIndex = bubble.indexOf('ai_agent_generated_disclaimer');
  const batchResultIndex = bubble.indexOf('批次结果');
  assert.ok(disclaimerIndex > batchResultIndex && batchResultIndex >= 0,
    'the disclaimer must be the last element of the AI bubble');
  assert.match(bubble, /ai_agent_generated_disclaimer[\s\S]*?text_tertiary/);
  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  assert.equal(zh.ai_agent_generated_disclaimer, '（回复由AI生成，请谨慎判断）');
  assert.equal(en.ai_agent_generated_disclaimer, '(AI-generated reply. Please verify.)');
});

// 工具轨迹保留在发起问题的回复中，问题气泡本身没有工具外壳。
test('clarification traces remain visible while question bubbles stay conversational', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  assert.doesNotMatch(page, /toolName !== 'request_clarification'/);
  assert.match(page, /else if \(this\.hasVisibleAssistantContent\(this\.消息列表\[消息索引\]\)\)/);
  assert.match(page, /audit\.messageId = message\.id/);
  assert.match(page, /messagePositions\.get\(audit\.messageId\)/);
  assert.match(page, /trace\.expanded = false/);
});

test('reasoning opens by default while tool details stay collapsed independently of simple mode', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets') + read('entry/src/main/ets/model/agent/AgentConversationView.ts');
  assert.doesNotMatch(page, /applyToolPresentationMode|!this.simpleMode/);
  assert.match(page, /if \(existingIndex < 0\) \{ trace\.expanded = false/);
  assert.match(page, /trace\.expanded = message\.工具过程\[existingIndex\]\.expanded/);
  assert.match(page, /expandedReasoningIds: 角色 === 'ai' \? \[-1\] : \[\]/);
  assert.match(page, /this\.取本地化文案\(\$r\('app.string.ai_agent_history_unassigned_tools'\)\),\s*false, this.sessionController/);
  assert.match(page, /toggleLocked: false/);
  assert.doesNotMatch(page, /simpleMode[\s\S]{0,100}reasoningEffort/);
});

test('tool details use compact framed rows; reasoning is gray and independently bounded', () => {
  const disclosure = read('entry/src/main/ets/components/agent/AgentDisclosureCard.ets');
  assert.match(disclosure, /backgroundColor\(\$r\('app.color.surface_card'\)\)/);
  assert.match(disclosure, /borderRadius\(应用尺寸.圆角_面板\)/);
  assert.match(disclosure, /SymbolGlyph\(/);
  assert.match(disclosure, /constraintSize\(\{ maxHeight: 240 \}\)/);
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const resource = key => key;
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: dimensions, $r: resource
  });
  // 执行实际边框参数，兼容公共 helper 和直接对象写法，仍检查分隔线与完整外框。
  const borders = [...disclosure.matchAll(/\.border\(([^\n]+)\)/g)].map(([, expression]) =>
    new Function('SurfaceBorder', '应用尺寸', '$r', `return (${expression});`)(SurfaceBorder, dimensions, resource));
  assert.deepEqual(borders, [
    { width: { top: dimensions.卡片边框 }, color: 'app.color.surface_border' },
    { width: dimensions.卡片边框, color: 'app.color.surface_border' }
  ]);
  const reasoning = read('entry/src/main/ets/components/agent/AgentReasoning.ets');
  assert.match(reasoning, /constraintSize\(\{ maxHeight: 200 \}\)/);
  assert.match(reasoning, /AgentMarkdownText\(\{ text: this.text,[\s\S]*text_secondary/);
  assert.match(reasoning, /Text\(this.text\)[\s\S]*text_secondary/);
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const timeline = page.slice(page.indexOf('  private agentTimelineItem('), page.indexOf('  private agentTimelineKey('));
  const tool = timeline.slice(0, timeline.indexOf(".kind === 'draft'"));
  assert.doesNotMatch(tool, /orderedAgentText/, 'unvalidated tool parameters are not card results');
  assert.match(page, /AgentReasoning\(\{[\s\S]*expandedReasoningIds/);
});
