// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  SearchEvidenceError,
  SearchExecutionError,
  enforceSearchEvidence,
  enforceSearchExecution,
  normalizeBatchLimit,
  explicitSourceEvidenceRequested,
  explicitWebSearchForbidden,
  explicitWebSearchRequested,
  registerToolCallId,
  splitAffectedCardIds,
  toolRiskOf,
} from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import {
  DEEPSEEK_PROVIDER,
  OPENAI_PROVIDER,
  customProviderDefaults,
} from '../../entry/src/main/ets/model/agent/ProviderCatalog.ts';

test('DeepSeek is the built-in default and built-in endpoints are fixed', () => {
  assert.equal(DEEPSEEK_PROVIDER.id, 'deepseek');
  assert.equal(DEEPSEEK_PROVIDER.isDefault, true);
  assert.equal(DEEPSEEK_PROVIDER.baseUrl, 'https://api.deepseek.com');
  assert.equal(DEEPSEEK_PROVIDER.models[0], 'deepseek-flash');
  assert.equal(OPENAI_PROVIDER.baseUrl, 'https://api.openai.com/v1');
  assert.equal(OPENAI_PROVIDER.isDefault, false);
  assert.deepEqual(OPENAI_PROVIDER.models, [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ]);
  assert.equal(OPENAI_PROVIDER.defaultModel, 'gpt-5.6-luna');
});

test('custom provider starts with conservative capabilities and editable coordinates', () => {
  const provider = customProviderDefaults();
  assert.equal(provider.id, 'custom');
  assert.equal(provider.baseUrl, '');
  assert.deepEqual(provider.models, []);
  assert.deepEqual(provider.capabilities, {
    text: true,
    image: false,
    audio: false,
    streaming: true,
    toolCalls: true,
    reasoning: false,
    webSearch: false,
  });
});

test('tool risks keep reads automatic, ordinary writes draft-only, and structural writes high-risk', () => {
  assert.equal(toolRiskOf('get_note_context'), 'read');
  assert.equal(toolRiskOf('web_search'), 'read');
  assert.equal(toolRiskOf('create_flashcards'), 'write');
  assert.equal(toolRiskOf('propose_create_notes'), 'blocked');
  assert.equal(toolRiskOf('propose_update_notes'), 'write');
  assert.equal(toolRiskOf('remove_notes'), 'high_risk');
  assert.equal(toolRiskOf('update_note_type_templates'), 'high_risk');
  assert.equal(toolRiskOf('arbitrary_rpc'), 'blocked');
});

test('batch limit defaults to 100, clamps at 1000, and splits without losing order', () => {
  assert.equal(DEFAULT_BATCH_LIMIT, 100);
  assert.equal(MAX_BATCH_LIMIT, 1000);
  assert.equal(normalizeBatchLimit(0), DEFAULT_BATCH_LIMIT);
  assert.equal(normalizeBatchLimit(1500), MAX_BATCH_LIMIT);
  const ids = Array.from({ length: 205 }, (_, index) => index + 1);
  const batches = splitAffectedCardIds(ids, 100);
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
  assert.deepEqual(batches.flat(), ids);
});

test('tool-call ids are accepted once per turn', () => {
  const seen = new Set();
  assert.equal(registerToolCallId(seen, 'call-1'), true);
  assert.equal(registerToolCallId(seen, 'call-1'), false);
  assert.equal(registerToolCallId(seen, ''), false);
});

test('requested web search must have a real source event', () => {
  assert.doesNotThrow(() => enforceSearchEvidence(false, []));
  assert.doesNotThrow(() => enforceSearchEvidence(true, [{
    kind: 'search_source',
    url: 'https://example.com/source',
    title: 'Source',
  }]));
  assert.throws(
    () => enforceSearchEvidence(true, [{ kind: 'text_delta', text: 'I searched the web.' }]),
    (error) => error instanceof SearchEvidenceError && error.code === 'web_search_sources_missing',
  );
});

test('required web search distinguishes execution from source-link evidence', () => {
  assert.doesNotThrow(() => enforceSearchExecution(true, true));
  assert.throws(() => enforceSearchExecution(true, false),
    (error) => error instanceof SearchExecutionError && error.code === 'web_search_not_executed');
  assert.equal(explicitSourceEvidenceRequested('请联网查一下最新资料'), false);
  assert.equal(explicitSourceEvidenceRequested('请联网查并给出来源链接'), true);
  assert.equal(explicitSourceEvidenceRequested('search the web and cite sources'), true);
});

test('explicit web-search intent is detected without treating local card search as web access', () => {
  assert.equal(explicitWebSearchRequested('请联网搜索最新资料并标注来源'), true);
  assert.equal(explicitWebSearchRequested('请上网查一下这些资料'), true);
  assert.equal(explicitWebSearchRequested('去有道词典网站查这些单词'), true);
  assert.equal(explicitWebSearchRequested('search the web and cite sources'), true);
  assert.equal(explicitWebSearchRequested('搜索卡库里带 biology 标签的卡片'), false);
  assert.equal(explicitWebSearchRequested('不要上网，只修改本地这 5 张卡'), false);
  assert.equal(explicitWebSearchForbidden('不要联网，只用本地内容'), true);
  assert.equal(explicitWebSearchForbidden('请上网查资料'), false);
});
