// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentToolSchemaError,
  decodeAgentToolArguments,
  resolveCreateNoteFields,
} from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import {
  AgentScope,
  AgentScopeError,
} from '../../entry/src/main/ets/backend/agent/AgentScope.ets';
import { AgentToolRegistry } from '../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets';

test('semantic tool arguments reject unknown and raw backend fields', () => {
  for (const json of [
    '{"noteIds":[1],"service":25}',
    '{"noteIds":[1],"method":7}',
    '{"noteIds":[1],"protobuf":"AAE="}',
    '{"noteIds":[1],"database":"collection.anki2"}',
    '{"noteIds":[1],"unexpected":true}',
  ]) {
    assert.throws(
      () => decodeAgentToolArguments('propose_delete_notes', json),
      (error) => error instanceof AgentToolSchemaError && error.code === 'unexpected_property',
    );
  }
});

test('tool arguments reject malformed JSON, and invalid IDs', () => {
  assert.throws(() => decodeAgentToolArguments('get_note_context', '{bad'), /invalid_tool_arguments/);
  assert.throws(() => decodeAgentToolArguments('get_note_context', '{"noteIds":[0]}'), /invalid_tool_arguments/);
});

test('tool decoders preserve more than 1000 cards and IDs in one request', () => {
  const cardIds = Array.from({ length: 1001 }, (_, index) => index + 1);
  const cards = cardIds.map(id => ({ fields: [String(id), 'answer'] }));
  const created = decodeAgentToolArguments('create_flashcards', JSON.stringify({ cards })).createNotes;
  assert.deepEqual(created.map(note => note.fields), cards.map(card => card.fields));
  assert.deepEqual(decodeAgentToolArguments('propose_delete_cards', JSON.stringify({ cardIds })).cardIds, cardIds);
});

test('create-flashcards schema accepts content only and rejects model-supplied app context', () => {
  const valid = decodeAgentToolArguments('create_flashcards', JSON.stringify({
    cards: [{ fields: ['front', 'back'] }],
  }));
  assert.deepEqual(valid.createNotes[0].fields, ['front', 'back']);

  assert.throws(
    () => decodeAgentToolArguments('create_flashcards', JSON.stringify({
      cards: [{ fields: ['front', 'back'] }],
      targetDeckId: 1,
    })),
    (error) => {
      assert.equal(error instanceof AgentToolSchemaError, true);
      assert.equal(error.code, 'unexpected_property');
      assert.equal(error.path, 'targetDeckId');
      assert.deepEqual(error.receivedKeys, ['cards', 'targetDeckId']);
      assert.deepEqual(error.allowedKeys, ['cards']);
      const template = JSON.parse(error.validTemplateJson);
      assert.deepEqual(Object.keys(template), ['cards']);
      assert.deepEqual(Object.keys(template.cards[0]), ['fields']);
      return true;
    },
  );
});

test('create-flashcards accepts exact selected field names and normalizes them in note-type order', () => {
  const decoded = decodeAgentToolArguments('create_flashcards', JSON.stringify({
    cards: [{ 正面: '问题', 背面: '答案', 增加翻转的卡片: '' }],
  }));
  assert.deepEqual(decoded.createNotes[0].fields, []);
  assert.deepEqual(resolveCreateNoteFields(decoded.createNotes[0], ['正面', '背面', '增加翻转的卡片']),
    ['问题', '答案', '']);
  assert.throws(
    () => resolveCreateNoteFields(decoded.createNotes[0], ['Front', 'Back']),
    (error) => error instanceof AgentToolSchemaError && error.code === 'missing_property',
  );
});

test('create target and draft identity are generated locally per turn', () => {
  const scope = new AgentScope();
  scope.configureCreateTarget(30, 40);
  assert.equal(scope.createTargetDeckId(), 30);
  assert.equal(scope.createTargetNotetypeId(), 40);
  const first = scope.nextCreateDraftId();
  const second = scope.nextCreateDraftId();
  assert.match(first, /^create-/);
  assert.notEqual(first, second);
  scope.reset();
  assert.throws(() => scope.createTargetDeckId(), /create_target_out_of_scope/);
});

test('schema diagnostics retain precise root, array and scalar paths', () => {
  const cases = [
    ['{bad', 'invalid_json', '$'],
    ['[]', 'invalid_type', '$'],
    ['{"noteIds":[1],"service":25}', 'unexpected_property', 'service'],
    ['{"noteIds":[0]}', 'invalid_value', 'noteIds[0]'],
  ];
  for (const [json, code, path] of cases) {
    assert.throws(
      () => decodeAgentToolArguments('get_note_context', json),
      (error) => error instanceof AgentToolSchemaError && error.code === code && error.path === path,
    );
  }
});

test('scope accepts only stable positive IDs registered in the current turn', () => {
  const scope = new AgentScope();
  scope.registerCardIds([10, 11]);
  scope.registerNoteIds([20]);
  scope.registerDeckIds([30]);
  scope.registerNotetypeIds([40]);

  assert.doesNotThrow(() => scope.assertCardIdsInScope([11]));
  assert.doesNotThrow(() => scope.assertNoteIdsInScope([20]));
  assert.throws(
    () => scope.assertCardIdsInScope([12]),
    (error) => error instanceof AgentScopeError && error.code === 'id_out_of_scope',
  );
  assert.throws(() => scope.registerNoteIds([0]), /invalid_stable_id/);
});

test('read-only discoveries never grant write authorization', () => {
  const scope = new AgentScope();
  scope.registerReadableCardIds([12]);
  scope.registerReadableNoteIds([22]);
  scope.registerReadableDeckIds([32]);
  scope.registerReadableNotetypeIds([42]);

  assert.doesNotThrow(() => scope.assertReadableCardIds([12]));
  assert.doesNotThrow(() => scope.assertReadableNoteIds([22]));
  assert.doesNotThrow(() => scope.assertReadableDeckIds([32]));
  assert.doesNotThrow(() => scope.assertReadableNotetypeIds([42]));
  assert.throws(() => scope.assertCardIdsInScope([12]), /id_out_of_scope/);
  assert.throws(() => scope.assertNoteIdsInScope([22]), /id_out_of_scope/);
});

test('edit search scope is applied locally and reset between turns', () => {
  const scope = new AgentScope();
  scope.configureCardSearchPrefix('deck:"Chinese" note:"Basic"');
  assert.equal(scope.scopedCardSearchQuery('tag:hard'),
    'deck:"Chinese" note:"Basic" (tag:hard)');
  assert.equal(scope.scopedCardSearchQuery(''), 'deck:"Chinese" note:"Basic"');
  scope.reset();
  assert.equal(scope.scopedCardSearchQuery('tag:hard'), 'tag:hard');
});

test('draft IDs can be registered only once per turn', () => {
  const scope = new AgentScope();
  assert.equal(scope.registerDraftId('draft-1'), true);
  assert.equal(scope.registerDraftId('draft-1'), false);
  assert.equal(scope.registerDraftId(''), false);
  scope.reset();
  assert.equal(scope.registerDraftId('draft-1'), true);
});

test('high-risk proposal schemas accept only their declared semantic fields', () => {
  const args = decodeAgentToolArguments(
    'propose_change_note_type',
    '{"noteIds":[7],"targetNotetypeId":9,"fieldMappingJson":"[0,1]","templateMappingJson":"[0]","draftId":"d7"}',
  );
  assert.deepEqual(args.noteIds, [7]);
  assert.equal(args.targetNotetypeId, 9);
  assert.equal(args.draftId, 'd7');
  assert.throws(
    () => decodeAgentToolArguments('propose_update_note_type_templates', '{"notetypeIds":[9],"url":"file:///x"}'),
    /invalid_tool_arguments/,
  );
});

test('high-risk registry handlers can only return drafts and expose no commit API', async () => {
  const registry = new AgentToolRegistry();
  registry.registerHighRiskDraft('propose_delete_notes', {
    async propose() {
      return {
        id: 'danger-1', risk: 'high_risk', summary: 'delete one note',
        affectedNoteIds: [7], affectedCardIds: [70], operations: [],
      };
    },
  });
  const result = await registry.execute({
    id: 'call-1', name: 'propose_delete_notes', argumentsJson: '{"noteIds":[7]}',
  });
  assert.equal(result.draft.risk, 'high_risk');
  assert.equal(typeof registry.commit, 'undefined');
  assert.equal(typeof registry.executeDraft, 'undefined');
});
