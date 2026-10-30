// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildClarificationAnswerText,
  buildClarificationAnswerVisibleText,
  cloneAgentClarificationView,
  decodeAgentClarificationRequest,
} from '../../entry/src/main/ets/model/agent/AgentClarification.ts';
import { AgentToolSchemaError } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { AgentToolRegistry } from '../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import {
  buildAgentTaskProviderText,
  buildAgentTaskVisibleText,
  evaluateAgentReadiness,
} from '../../entry/src/main/ets/model/agent/AgentTaskContext.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const validJson = JSON.stringify({
  clarificationId: 'scope-1',
  question: '每个知识点单独制卡，还是按章节归纳？',
  options: [
    { id: 'one-per-fact', label: '每个知识点一张', description: '便于逐项复习' },
    { id: 'chapter-summary', label: '按章节归纳', description: '卡片数量更少' },
  ],
  recommendedOptionId: 'one-per-fact',
  allowFreeText: true,
});

test('clarification schema is available in create and edit modes', () => {
  for (const mode of ['create', 'edit']) {
    const tool = agentFunctionTools(100, mode)
      .find((item) => item.name === 'request_clarification');
    assert.ok(tool);
    const schema = JSON.parse(tool.parametersJson);
    assert.equal(schema.properties.options.minItems, 0);
    assert.equal(schema.properties.options.maxItems, 4);
    assert.equal(schema.additionalProperties, false);
  }
  assert.equal(toolRiskOf('request_clarification'), 'read');
});

test('registry returns clarification without an Anki handler or draft', async () => {
  const result = await new AgentToolRegistry().execute({
    id: 'call-1', name: 'request_clarification', argumentsJson: validJson,
  });
  assert.equal(result.draft, null);
  assert.equal(result.clarification?.id, 'scope-1');
  assert.match(result.outputJson, /awaiting_user/);
});

test('runner exposes clarification as a legal pause before no-draft termination', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /AgentRunStatus\s*=\s*'completed'\s*\|\s*'awaiting_clarification'/);
  assert.match(source, /clarification:\s*AgentClarificationRequest\s*\|\s*null/);
  assert.match(source, /result\.clarification\s*!==\s*null/);
  assert.match(source, /status:\s*'awaiting_clarification'/);
  assert.match(source, /clarification_must_be_only_tool/);
  assert.ok(source.indexOf("status: 'awaiting_clarification'") <
    source.indexOf('agent_no_valid_draft'));
  assert.doesNotMatch(source, /draft_correction/);
});

test('clarification decoder trims accepted values and clones nested options', () => {
  const request = decodeAgentClarificationRequest(JSON.stringify({
    clarificationId: ' scope-1 ',
    question: ' choose a scope ',
    options: [
      { id: ' one ', label: ' One ', description: ' focused ' },
      { id: ' two ', label: ' Two ', description: ' broader ' },
    ],
    recommendedOptionId: ' one ',
    allowFreeText: false,
  }));
  assert.deepEqual(request, {
    id: 'scope-1', question: 'choose a scope',
    options: [
      { id: 'one', label: 'One', description: 'focused' },
      { id: 'two', label: 'Two', description: 'broader' },
    ],
    recommendedOptionId: 'one', allowFreeText: false,
  });
  const view = cloneAgentClarificationView({
    request, selectedOptionId: 'one', supplementalText: 'because', state: 'pending',
  });
  view.request.options[0].label = 'changed';
  assert.equal(request.options[0].label, 'One');
});

test('clarification decoder reports stable schema failures', () => {
  const cases = [
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [{ id: 'one', label: 'One' }], recommendedOptionId: '', allowFreeText: true }),
      'invalid_value', 'options',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [
        { id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' }, { id: 'five', label: 'Five' },
      ], recommendedOptionId: '', allowFreeText: true }),
      'invalid_value', 'options',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [{ id: 'same', label: 'One' }, { id: 'same', label: 'Two' }], recommendedOptionId: '', allowFreeText: true }),
      'invalid_value', 'options[1].id',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], recommendedOptionId: 'missing', allowFreeText: true }),
      'invalid_value', 'recommendedOptionId',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q'.repeat(601), options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], recommendedOptionId: '', allowFreeText: true }),
      'invalid_value', 'question',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [{ id: 'one', label: 'One', unexpected: true }, { id: 'two', label: 'Two' }], recommendedOptionId: '', allowFreeText: true }),
      'unexpected_property', 'options[0].unexpected',
    ],
    [
      JSON.stringify({ clarificationId: 'scope-1', question: 'q', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], recommendedOptionId: '', allowFreeText: true, unexpected: true }),
      'unexpected_property', 'unexpected',
    ],
  ];
  for (const [json, code, path] of cases) {
    assert.throws(
      () => decodeAgentClarificationRequest(json),
      (error) => error instanceof AgentToolSchemaError && error.code === code && error.path === path,
    );
  }
});

test('clarification answer text contains the question, selected option and supplement', () => {
  const request = decodeAgentClarificationRequest(validJson);
  const answer = {
    clarificationId: 'scope-1', optionId: 'one-per-fact', optionLabel: '每个知识点一张', supplementalText: '请包含例题',
  };
  const text = buildClarificationAnswerText(request, answer);
  assert.match(text, /scope-1/);
  assert.match(text, /one-per-fact/);
  assert.match(text, /每个知识点一张/);
  assert.match(text, /请包含例题/);
  assert.equal(buildClarificationAnswerVisibleText(answer), '每个知识点一张\n请包含例题');
  assert.equal(buildClarificationAnswerVisibleText({ ...answer, supplementalText: '' }), '每个知识点一张');
});

test('conversation readiness requires text and provider; targets are resolved before generation', () => {
  const base = { mode: 'create', deckId: 0, deckName: '', notetypeId: 0,
    notetypeName: '', fieldNames: [], noteTypeKind: 0, clozeFieldOrds: [], expanded: true };
  assert.equal(evaluateAgentReadiness(base, '', true), 'missing_input');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1 }, '', true), 'missing_input');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1, notetypeId: 2,
    fieldNames: ['文字'] }, '', true), 'missing_input');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1, notetypeId: 2,
    fieldNames: ['文字'] }, '请制卡', false), 'missing_provider');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1, notetypeId: 2,
    fieldNames: ['文字'] }, '请制卡', true, true), 'busy');
});

test('task payload preserves stable capability while visible text omits IDs', () => {
  const snapshot = {
    mode: 'create', deckId: 11, deckName: '世界史', notetypeId: 22,
    notetypeName: '填空题', fieldNames: ['文字'], noteTypeKind: 1,
    clozeFieldOrds: [0], userText: '提取年份', localContext: '无预选卡片',
    omittedMedia: true, batchLimit: 20,
  };
  const provider = buildAgentTaskProviderText(snapshot);
  assert.match(provider, /"deckId":11/);
  assert.match(provider, /"notetypeId":22/);
  assert.match(provider, /提取年份/);
  assert.match(provider, /二进制媒体未发送/);
  const visible = buildAgentTaskVisibleText(snapshot);
  assert.match(visible, /世界史/);
  assert.match(visible, /填空题/);
  assert.match(visible, /提取年份/);
  assert.doesNotMatch(visible, /11|22|deckId|notetypeId/);
});
