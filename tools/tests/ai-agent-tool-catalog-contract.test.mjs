// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';

test('every Agent tool exposes one parseable schema, template and forbidden-rules contract', () => {
  const tools = agentFunctionTools(25, 'edit');
  assert.ok(tools.length >= 10);
  for (const tool of tools) {
    const schema = JSON.parse(tool.parametersJson);
    const example = JSON.parse(tool.exampleArgumentsJson);
    assert.equal(schema.type, 'object', tool.name);
    assert.equal(typeof tool.rules, 'string', tool.name);
    assert.ok(tool.rules.length > 0, tool.name);
    assert.deepEqual(
      Object.keys(example).filter((key) => !(key in schema.properties)),
      [],
      `${tool.name} template contains undeclared properties`,
    );
    for (const required of schema.required) {
      assert.ok(required in example, `${tool.name} template misses required ${required}`);
    }
  }
});

test('create-flashcards tool accepts only card content and keeps app-owned context out of model arguments', () => {
  const tool = agentFunctionTools(5, 'create').find((item) => item.name === 'create_flashcards');
  assert.ok(tool);
  const schema = JSON.parse(tool.parametersJson);
  const example = JSON.parse(tool.exampleArgumentsJson);
  assert.deepEqual(schema.required, ['cards']);
  assert.deepEqual(Object.keys(schema.properties), ['cards']);
  assert.deepEqual(Object.keys(example), ['cards']);
  assert.deepEqual(Object.keys(example.cards[0]), ['fields']);
  assert.doesNotMatch(tool.parametersJson, /targetDeckId|targetNotetypeId|draftId|reason/);
  assert.deepEqual(schema.properties.cards.items.additionalProperties, { type: 'string' });
  assert.match(tool.rules, /application supplies/i);
});

test('create mode no longer exposes propose_create_notes', () => {
  const names = agentFunctionTools(5, 'create').map((item) => item.name);
  assert.ok(names.includes('create_flashcards'));
  assert.ok(!names.includes('propose_create_notes'));
});

test('both modes expose complete semantic reads while only edit exposes write proposals', () => {
  const requiredReads = [
    'get_note_type_capabilities', 'get_note_context', 'search_cards', 'search_notes',
    'list_decks', 'list_notetypes', 'list_tags', 'get_notetype_details',
    'get_card_statistics', 'search_images',
  ];
  const createNames = agentFunctionTools(5, 'create').map((item) => item.name);
  const editNames = agentFunctionTools(5, 'edit').map((item) => item.name);
  for (const name of requiredReads) {
    assert.ok(createNames.includes(name), `create is missing ${name}`);
    assert.ok(editNames.includes(name), `edit is missing ${name}`);
  }
  assert.ok(!createNames.includes('propose_update_notes'));
  for (const name of ['propose_create_deck', 'propose_create_note_type', 'propose_memory_change', 'propose_analysis']) {
    assert.ok(createNames.includes(name)); assert.ok(editNames.includes(name));
  }
  assert.ok(editNames.includes('propose_update_notes'));
});

test('provider sends schema plus the standard template and rules without unsupported strict mode', () => {
  const functionTools = agentFunctionTools(5, 'create');
  const payload = JSON.parse(buildResponsesPayload({
    apiKey: 'not-serialized', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
    instructions: 'test', input: [], functionTools, searchMode: 'off',
    requiresWebSearch: false, requiresSearchEvidence: false,
    requiresDraft: true, expectedDraftCount: 5,
    reasoningEffort: 'low', maxOutputTokens: 1000,
  }));
  for (const sent of payload.tools) {
    const source = functionTools.find((item) => item.name === sent.name);
    assert.ok(source);
    assert.match(sent.description, /Standard arguments template:/);
    assert.match(sent.description, /Rules:/);
    assert.equal(sent.description.split(source.exampleArgumentsJson).length - 1, 1);
    assert.equal('strict' in sent, false);
  }
});
