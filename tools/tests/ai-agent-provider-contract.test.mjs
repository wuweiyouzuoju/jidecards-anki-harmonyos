// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildResponsesPayload,
  buildResponsesUrl,
} from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { DEEPSEEK_PROVIDER, normalizeDeepSeekModel } from '../../entry/src/main/ets/model/agent/ProviderCatalog.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function baseRequest(searchMode = 'auto') {
  return {
    apiKey: 'must-not-enter-body',
    baseUrl: 'https://api.deepseek.com/',
    model: 'deepseek-flash',
    instructions: 'Only use declared tools.',
    input: [{
      kind: 'message', role: 'user', content: 'make cards',
      callId: '', name: '', argumentsJson: '', output: '',
    }],
    functionTools: [{
      name: 'search_cards', description: 'Search cards',
      parametersJson: '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}',
      exampleArgumentsJson: '{"query":"example"}',
      rules: 'Search only the local collection.',
    }],
    searchMode,
    requiresWebSearch: false,
    requiresSearchEvidence: false,
    requiresDraft: true,
    expectedDraftCount: 5,
    reasoningEffort: 'high',
    maxOutputTokens: 2048,
  };
}

test('DeepSeek exposes all current models while keeping Flash as default', () => {
  assert.deepEqual(DEEPSEEK_PROVIDER.models, [
    'deepseek-flash',
    'deepseek-v4-pro',
  ]);
  assert.equal(DEEPSEEK_PROVIDER.defaultModel, 'deepseek-flash');
});

test('retired DeepSeek selections use current Flash while valid Pro selection is preserved', () => {
  for (const model of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-chat', 'deepseek-reasoner', '']) {
    assert.equal(normalizeDeepSeekModel(model), 'deepseek-flash', model);
  }
  assert.equal(normalizeDeepSeekModel(' deepseek-flash '), 'deepseek-flash');
  assert.equal(normalizeDeepSeekModel(' deepseek-v4-pro '), 'deepseek-v4-pro');
});

test('Responses URL normalization preserves fixed provider prefixes', () => {
  assert.equal(buildResponsesUrl('https://api.deepseek.com/'), 'https://api.deepseek.com/responses');
  assert.equal(buildResponsesUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/responses');
  assert.equal(buildResponsesUrl('https://gateway.example/v1/responses'), 'https://gateway.example/v1/responses');
});

test('Responses payload includes semantic function tools and auto web search without the API key', () => {
  const request = baseRequest('auto');
  const text = buildResponsesPayload(request);
  const body = JSON.parse(text);

  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.deepEqual(body.include, ['web_search_call.action.sources']);
  assert.deepEqual(body.tools.map((tool) => tool.type), ['function', 'web_search']);
  assert.equal(body.tool_choice, 'auto');
  assert.equal(body.tools[0].name, 'search_cards');
  assert.deepEqual(body.tools[0].parameters.required, ['query']);
  assert.equal(text.includes(request.apiKey), false);
});

test('DeepSeek tool continuation sends reasoning content as typed content parts', () => {
  const request = baseRequest('off');
  request.input.push({
    kind: 'reasoning', role: '', content: '检查笔记类型后继续调用工具',
    callId: '', name: '', argumentsJson: '', output: '',
  });
  request.input.push({
    kind: 'function_call', role: '', content: '', callId: 'call_1',
    name: 'get_note_type_capabilities', argumentsJson: '{"notetypeId":7}', output: '',
  });
  request.input.push({
    kind: 'function_call_output', role: '', content: '', callId: 'call_1',
    name: '', argumentsJson: '', output: '{"kind":"cloze"}',
  });

  const body = JSON.parse(buildResponsesPayload(request));
  assert.deepEqual(body.input[1], {
    type: 'reasoning',
    content: [{ type: 'reasoning_text', text: '检查笔记类型后继续调用工具' }],
  });
});

test('provider continuation safely replays only a whitelisted built-in output item', () => {
  const request = baseRequest('auto');
  request.input.push({
    kind: 'output_item', role: '',
    content: JSON.stringify({ type: 'web_search_call', id: 'ws_1', status: 'completed' }),
    callId: '', name: '', argumentsJson: '', output: '',
  });
  const body = JSON.parse(buildResponsesPayload(request));
  assert.deepEqual(body.input.at(-1), {
    type: 'web_search_call', id: 'ws_1', status: 'completed',
  });

  request.input.at(-1).content = JSON.stringify({
    type: 'reasoning', id: 'rs_1',
    content: [{ type: 'reasoning_text', text: '检查字段' }],
  });
  assert.deepEqual(JSON.parse(buildResponsesPayload(request)).input.at(-1), {
    type: 'reasoning', id: 'rs_1',
    content: [{ type: 'reasoning_text', text: '检查字段' }],
  });

  request.input.at(-1).content = JSON.stringify({ type: 'computer_call', id: 'dangerous' });
  assert.throws(() => buildResponsesPayload(request), /invalid_provider_input/);
});

test('Always search forces real server web search while Off omits it', () => {
  const always = JSON.parse(buildResponsesPayload(baseRequest('always')));
  assert.deepEqual(always.tool_choice, { type: 'web_search' });
  assert.equal(always.tools.some((tool) => tool.type === 'web_search'), true);

  const off = JSON.parse(buildResponsesPayload(baseRequest('off')));
  assert.equal(off.tools.some((tool) => tool.type === 'web_search'), false);
  assert.equal(off.tool_choice, 'auto');
});

test('invalid tool parameter JSON is rejected before network access', () => {
  const request = baseRequest();
  request.functionTools[0].parametersJson = '{bad';
  assert.throws(() => buildResponsesPayload(request), /invalid_tool_schema/);
});

test('Harmony transport uses streaming bytes, status classification and destroy cancellation', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentTransport.ets');
  assert.match(source, /requestInStream\(/);
  assert.match(source, /on\(['"]dataReceive['"]/);
  assert.match(source, /on\(['"]dataEnd['"]/);
  assert.match(source, /responseCode\s*<\s*200|statusCode\s*<\s*200/);
  assert.match(source, /\.destroy\(\)/);
  assert.match(source, /Authorization/);
  assert.match(source, /http_\$\{statusCode\}/);
  assert.doesNotMatch(source, /console\.|hilog\./);
  assert.match(source, /parseProviderErrorDetail/);
  assert.match(source, /detailMessage/);
  assert.match(source, /65536/);
  assert.match(source, /request content omitted/);
  assert.match(source, /slice\(0, 240\)/);
});

test('provider adapters use Responses and built-in web search without silent provider switching', () => {
  const deepSeek = read('entry/src/main/ets/backend/agent/DeepSeekAdapter.ets');
  const openAI = read('entry/src/main/ets/backend/agent/OpenAIAdapter.ets');
  const custom = read('entry/src/main/ets/backend/agent/CustomAdapter.ets');

  assert.match(deepSeek, /https:\/\/api\.deepseek\.com/);
  assert.match(openAI, /https:\/\/api\.openai\.com\/v1/);
  assert.match(deepSeek, /buildResponsesPayload/);
  assert.match(openAI, /buildResponsesPayload/);
  assert.match(custom, /buildResponsesUrl/);
  assert.doesNotMatch(deepSeek + openAI + custom, /switchProvider|fallbackProvider|fakeReasoning/);
});
