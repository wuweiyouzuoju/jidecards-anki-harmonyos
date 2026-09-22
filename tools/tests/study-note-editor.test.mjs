import { resolveStudyKey } from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import { loadNoteEditor } from '../../entry/src/main/ets/model/NoteEditorLoader.ts';
import { attachStudySession } from './study-session-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import { uiFeedback } from './ui-feedback-harness.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const names = ['openNoteEditor', 'closeNoteEditor', 'saveNoteEdits', '更多菜单', '处理按键', '显示答案', '评分', '返回', '消费待重渲染', 'invalidateCardWork', 'isCurrentRequest'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});

function harness(phase = 'question') {
  let now = 1000;
  const writes = [], reads = [], toasts = [];
  const note = { id: 42, guid: 'imported-note', notetypeId: 9, mtimeSecs: 3, usn: 4, fields: ['old', '<img src="a.png">'], tags: ['imported'] };
  const context = vm.createContext({ ...uiFeedback, resolveStudyKey, loadNoteEditor, studyKeyName: key => String(key), KeyType: { Down: 0 }, Date: { now: () => now }, $r: key => key, playStudyHaptic: () => {} });
  vm.runInContext(stripTypeScriptTypes(`globalThis.Page = class { ${methods.join('\n')} }`), context);
  const page = new context.Page();
  Object.assign(page, {
    mounted: true, sessionReady: true, foreground: true, 页面已显示: true, requestVersion: 0,
    audioSession: { stop: async () => {} }, playStudyAudio: () => {},
    阶段: phase, 评分中: false, studyGuideVisible: false, noteEditorVisible: false,
    noteEditorBusy: false, noteEditorError: '', editingNote: null, 展示时刻毫秒: 500,
    当前卡片: { cardId: 7, noteId: 42, states: 'original' }, 已渲染: {}, Ctrl按下: false,
    取文案: key => key,
    声音播放器实例: { 停止: async () => {} }, TTS播放器实例: { 停止: async () => {} },
    笔记服务实例: {
      获取笔记: async id => { reads.push(id); return note; },
      更新笔记: async (notes, skipUndo) => { writes.push({ notes, skipUndo }); }
    },
    笔记类型服务实例: { 获取笔记类型: async () => ({ fieldNames: ['Front', 'Back'] }) },
    getUIContext: () => ({ getPromptAction: () => ({ showToast: value => toasts.push(value) }) }),
    加载下一张卡: async () => {
      page.reloads = (page.reloads ?? 0) + 1;
      page.当前卡片 = { cardId: 7, noteId: 42, states: 'fresh' };
      page.阶段 = 'question';
      page.展示时刻毫秒 = now;
    },
    pathStack: { pop: () => { page.popped = true; } }
  });
  attachStudySession(page);
  return { page, note, reads, writes, toasts, advance: ms => { now += ms; } };
}

test('More > Edit opens the current note from either face and is disabled without a ready card', async () => {
  for (const phase of ['question', 'answer']) {
    const { page, reads } = harness(phase);
    const edit = page.更多菜单().find(item => item.value === 'app.string.study_edit_note');
    assert.equal(edit.enabled, true);
    edit.action();
    // The action starts async loading; a second open must be rejected.
    await page.openNoteEditor();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(reads, [42]);
    assert.equal(page.noteEditorVisible, true);
    assert.equal(page.editingNote.id, 42);
    assert.equal(page.阶段, phase);
    assert.equal(page.更多菜单().find(item => item.value === 'app.string.study_edit_note').enabled, false);
  }
  for (const state of [{ 当前卡片: null }, { 评分中: true }, { 阶段: 'loading' }, { 阶段: 'done' }, { 阶段: 'error' }]) {
    const { page, reads } = harness();
    Object.assign(page, state);
    assert.equal(page.更多菜单().find(item => item.value === 'app.string.study_edit_note').enabled, false);
    await page.openNoteEditor();
    assert.equal(reads.length, 0);
  }
});

test('cancel keeps card face and scheduling, excludes editing time, and does not save', async () => {
  const { page, writes, advance } = harness('answer');
  await page.openNoteEditor();
  advance(60000);
  page.返回();
  assert.equal(page.noteEditorVisible, false);
  assert.equal(page.阶段, 'answer');
  assert.equal(page.当前卡片.states, 'original');
  assert.equal(page.展示时刻毫秒, 60500);
  assert.equal(page.评分中, false);
  assert.equal(page.popped, undefined);
  assert.equal(writes.length, 0);
});

test('save preserves note identity and undo, reloads the backend card, and starts fresh question timing', async () => {
  const { page, note, writes, advance } = harness('answer');
  await page.openNoteEditor();
  advance(60000);
  assert.equal(await page.saveNoteEdits(['new', '<img src="a.png">'], ['changed']), true);
  const saved = writes[0];
  assert.equal(saved.skipUndo, false);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.notes[0])), { ...note, fields: ['new', '<img src="a.png">'], tags: ['changed'] });
  assert.deepEqual(note.fields, ['old', '<img src="a.png">']);
  assert.equal(page.reloads, 1);
  assert.equal(page.当前卡片.cardId, 7);
  assert.equal(page.当前卡片.states, 'fresh');
  assert.equal(page.阶段, 'question');
  assert.equal(page.展示时刻毫秒, 61000);
  page.closeNoteEditor(); // Reused editor calls onCancel after successful save.
  assert.equal(page.展示时刻毫秒, 61000);
  assert.equal(page.评分中, false);
});

test('loading failure reports the error and restores study controls without an empty editor', async () => {
  const { page, toasts, advance } = harness();
  page.笔记类型服务实例.获取笔记类型 = async () => { advance(500); throw new Error('read failed'); };
  await page.openNoteEditor();
  assert.equal(page.noteEditorVisible, false);
  assert.equal(page.noteEditorBusy, false);
  assert.equal(page.评分中, false);
  assert.equal(page.展示时刻毫秒, 1000);
  assert.equal(toasts.length, 1);
});

test('failed save keeps the editor and draft available for retry; concurrent saves do not duplicate writes', async () => {
  const { page } = harness();
  await page.openNoteEditor();
  page.笔记服务实例.更新笔记 = async () => { throw new Error('disk full'); };
  assert.equal(await page.saveNoteEdits(['draft'], []), false);
  assert.equal(page.noteEditorVisible, true);
  assert.equal(page.noteEditorBusy, false);
  assert.equal(page.noteEditorError, 'app.string.browser_detail_save_error');
  assert.equal(page.评分中, true);
  let finish, calls = 0;
  page.笔记服务实例.更新笔记 = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = page.saveNoteEdits(['draft'], []);
  assert.equal(await page.saveNoteEdits(['draft'], []), false);
  page.返回();
  assert.equal(page.noteEditorVisible, true);
  finish();
  assert.equal(await pending, true);
  assert.equal(calls, 1);
});

test('typing in the editor cannot trigger study shortcuts, flip the card, or submit ratings', async () => {
  for (const phase of ['question', 'answer']) {
    const { page } = harness(phase);
    await page.openNoteEditor();
    page.Ctrl按下 = true;
    assert.equal(page.处理按键({}), false);
    assert.equal(page.Ctrl按下, false);
    await page.显示答案();
    await page.评分(3);
    assert.equal(page.阶段, phase);
    assert.equal(page.reloads, undefined);
  }
});
