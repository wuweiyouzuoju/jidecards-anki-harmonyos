// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAgentNoteFields } from '../../entry/src/main/ets/model/agent/AgentNoteValidation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(
  path.join(root, 'entry/src/main/ets/backend/agent/CardAgentTools.ets'), 'utf8',
);

test('card Agent tools register the read tools and model-facing draft tools', () => {
  for (const name of [
    'get_note_type_capabilities', 'get_note_context', 'search_cards', 'search_notes',
    'list_decks', 'list_notetypes', 'list_tags', 'get_notetype_details',
    'get_card_statistics', 'search_images',
  ]) {
    assert.match(source, new RegExp(`registerRead\\('${name}'`));
  }
  for (const name of ['create_flashcards', 'propose_update_notes', 'propose_move_cards']) {
    assert.match(source, new RegExp(`registerDraft\\('${name}'`));
  }
  assert.doesNotMatch(source, /registerDraft\('propose_create_notes'/);
});

test('read tools use official services and register discovered IDs as read-only', () => {
  assert.match(source, /笔记服务/);
  assert.match(source, /卡片服务/);
  assert.match(source, /笔记类型服务/);
  assert.match(source, /搜索服务/);
  assert.match(source, /牌组服务/);
  assert.match(source, /标签服务/);
  assert.match(source, /统计服务/);
  assert.match(source, /获取笔记的卡片/);
  assert.match(source, /registerReadableCardIds/);
  assert.match(source, /registerReadableNoteIds/);
  assert.match(source, /registerReadableDeckIds/);
  assert.match(source, /registerReadableNotetypeIds/);
  assert.match(source, /search_cards[\s\S]*registerReadableCardIds/);
  assert.match(source, /search_notes[\s\S]*registerReadableNoteIds/);
});

test('ordinary tools validate scope and create before/after drafts without writes', () => {
  assert.match(source, /assertReadableNoteIds/);
  assert.match(source, /assertReadableCardIds/);
  assert.match(source, /before:/);
  assert.match(source, /after:/);
  assert.match(source, /affectedCardIds/);
  assert.doesNotMatch(source, /\.添加笔记\(|\.更新笔记\(|\.设置牌组\(/);
});

test('search and deck listing apply bounded deterministic result limits', () => {
  assert.match(source, /Math\.min\(1000/);
  assert.match(source, /slice\(args.offset, args.offset \+ limit\)/);
  assert.match(source, /flattenDeckTree/);
  assert.doesNotMatch(source, /scopedCardSearchQuery/);
  assert.match(source, /retrieval.next/);
  assert.match(source, /nextCursor/);
});

test('one create proposal can carry many notes without merging their fields', () => {
  const catalog = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/model/agent/AgentToolCatalog.ts'), 'utf8',
  );
  const executor = fs.readFileSync(
    path.join(root, 'entry/src/main/ets/backend/agent/AgentDraftExecutor.ets'), 'utf8',
  );
  assert.match(catalog, /"cards"/);
  assert.match(source, /parseCreateNotes/);
  assert.match(source, /const noteId:\s*number\s*=\s*-\(index \+ 1\)/);
  assert.match(executor, /groupCreateOperations/);
  assert.match(source, /assertCreateTarget/);
  assert.match(source, /createTargetDeckId/);
  assert.match(source, /nextCreateDraftId/);
  assert.match(source, /validateAgentNoteFields\(capability/);
});

test('create proposals enforce note-type-specific cloze placement before becoming drafts', () => {
  const cloze = {
    notetypeId: 7, name: '填空题', kind: 1,
    fieldNames: ['文字', '背面额外'], clozeFieldOrds: [0],
  };
  assert.equal(validateAgentNoteFields(cloze, [
    '中华人民共和国成立于 {{c1::1949年10月1日}}。', '',
  ]), '');
  assert.equal(validateAgentNoteFields(cloze, ['zhongguoxiandaishi', '1949年']), 'missing_valid_cloze');
  assert.equal(validateAgentNoteFields(cloze, ['中国现代史', '{{c1::1949年}}']),
    'cloze_in_disallowed_field');
  assert.equal(validateAgentNoteFields({ ...cloze, kind: 0, clozeFieldOrds: [] }, [
    '{{c1::错误}}标记', '',
  ]), 'cloze_in_normal_notetype');
  assert.match(source, /validateAgentNoteFields/);
});

test('explicit year-cloze validation requires a four-digit year in every proposed note', () => {
  const cloze = {
    notetypeId: 7, name: '填空题', kind: 1,
    fieldNames: ['文字', '背面额外'], clozeFieldOrds: [0],
  };
  assert.equal(validateAgentNoteFields(cloze, [
    '中华人民共和国成立于 {{c1::1949年}}。', '',
  ], { requireYearCloze: true }), '');
  assert.equal(validateAgentNoteFields(cloze, [
    '中华人民共和国成立于 {{c1::十月一日}}。', '',
  ], { requireYearCloze: true }), 'missing_year_cloze');
  assert.equal(validateAgentNoteFields(cloze, [
    '答案是 {{c1::42}}。', '',
  ], { requireYearCloze: true }), 'missing_year_cloze');
  assert.equal(validateAgentNoteFields(cloze, [
    '答案是 {{c1::十月一日}}。', '',
  ]), '');
});
