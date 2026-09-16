// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const historyPath = path.join(root,
  'entry/src/main/ets/model/agent/AgentConversationStore.ets');

test('local Agent history is resumable and deletable', () => {
  assert.equal(fs.existsSync(historyPath), true);
  const source = fs.readFileSync(historyPath, 'utf8');
  assert.match(source, /loadAgentConversations/);
  assert.match(source, /saveAgentConversation/);
  assert.match(source, /deleteAgentConversation/);
  assert.match(source, /preferences\.getPreferences/);
});

test('history schema keeps visible provider reasoning with reply attribution but no secrets or media', () => {
  const source = fs.readFileSync(historyPath, 'utf8');
  assert.match(source, /AgentHistoryAudit/);
  assert.match(source, /AgentHistoryResult/);
  assert.match(source, /SearchSource/);
  assert.doesNotMatch(source, /apiKey\s*:/);
  assert.match(source, /reasoning\?: string/);
  assert.match(source, /messageId\?: number/);
  assert.match(source, /MAX_REASONING_TEXT_TOTAL/);
  assert.doesNotMatch(source, /media(Bytes|Data)\s*:/i);
  assert.match(source, /sanitizeHistoryText/);
  assert.match(source, /data:/);
  for (const field of [
    'callId', 'providerRound', 'sequence', 'argumentsJson', 'outputJson',
    'errorCode', 'errorPath', 'allowedKeys', 'validTemplateJson', 'repeatCount', 'expanded',
  ]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /sanitizeAgentToolJson/);
  assert.match(source, /MAX_AUDIT_TEXT_TOTAL/);
  assert.match(source, /legacySummary/);
  assert.match(source, /setup:\s*AgentTaskSetup/);
  assert.match(source, /kind:\s*string/);
  assert.match(source, /clarification:\s*AgentClarificationView\s*\|\s*null/);
  assert.match(source, /expanded:\s*boolean/);
  assert.match(source, /function safeSetup/);
  assert.match(source, /function safeClarification/);
  assert.doesNotMatch(source, /confirmationToken\s*:/);
});

test('shared page persists completed turns and renders an in-page clickable history list', () => {
  const page = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/pages/AI制卡页.ets'), 'utf8');
  assert.match(page, /saveAgentConversation/);
  assert.match(page, /打开历史会话/);
  assert.match(page, /private 历史区\(\)/);
  assert.match(page, /ForEach\(this\.历史会话列表/);
  assert.match(page, /this\.恢复历史会话\(item\)/);
  assert.match(page, /this\.删除历史会话\(item\)/);
  assert.doesNotMatch(page, /promptAction\.showActionMenu/);
  assert.doesNotMatch(page, /显示历史菜单页/);
  assert.match(page, /开始新会话/);
});

test('history mode has its own toolbar, returns to chat, and marks selection with theme color only', () => {
  const page = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/pages/AI制卡页.ets'), 'utf8');
  const zh = JSON.parse(fs.readFileSync(
    path.join(root, 'entry/src/main/resources/base/element/string.json'), 'utf8')).string
    .reduce((map, item) => ({ ...map, [item.name]: item.value }), {});
  const top = page.match(/private 顶部条\(\)[\s\S]*?@Builder\s+private 历史区/)?.[0] ?? '';
  const history = page.match(/private 历史区\(\)[\s\S]*?@Builder\s+private 用户气泡/)?.[0] ?? '';
  const build = page.match(/build\(\) \{[\s\S]*?\.hideTitleBar\(true\)/)?.[0] ?? '';

  assert.equal(zh.ai_agent_history_title, '历史对话');
  assert.equal(zh.ai_agent_history_new, '新建对话');
  assert.match(top, /this\.显示历史区 \? \$r\('app\.string\.ai_agent_history_title'\)/);
  assert.match(top, /if \(this\.显示历史区\)[\s\S]*this\.显示历史区 = false;[\s\S]*this\.pathStack\.pop\(\)/);
  assert.match(top,
    /ai_agent_history_new'[\s\S]*字色: this\.动作主色[\s\S]*themeText: true/);
  assert.match(top, /ai_agent_history_new'[\s\S]*this\.开始新会话\(\)/);
  assert.doesNotMatch(history, /ai_agent_history_current/);
  assert.match(history, /item\.id === this\.conversationId \?[\s\S]*this\.选中背景色/);
  assert.match(page, /@StorageProp\(颜色键\.选中背景\) private 选中背景色/);
  assert.match(build, /if \(this\.显示历史区\)[\s\S]*this\.历史区\(\)[\s\S]*else[\s\S]*this\.消息流\(\)/);
});

test('history saves and restores structured clarification without deleting its question', () => {
  const page = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/pages/AI制卡页.ets'), 'utf8');
  assert.match(page, /kind:\s*message\.kind/);
  assert.match(page, /clarification:\s*message\.clarification/);
  assert.match(page, /message\.kind\s*=\s*item\.kind/);
  assert.match(page, /message\.clarification\s*=\s*item\.clarification/);
  assert.match(page, /message\.expanded\s*=\s*item\.expanded/);
  assert.match(page, /message\.kind\s*=\s*'clarification'/);
  assert.match(page, /空消息\('ai', request\.question, false\)/);
});

test('history stores raw assistant output without appending the localized terminal error', () => {
  const page = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/pages/AI制卡页.ets'), 'utf8');
  assert.match(page,
    /text:\s*message\.角色 === 'ai' && message\.providerText\.length > 0\s*\?\s*message\.providerText : message\.正文/);
  assert.match(page, /message\.providerText = item\.text/);
});
