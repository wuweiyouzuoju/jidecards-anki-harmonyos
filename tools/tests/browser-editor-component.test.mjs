// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { parseOcclusionMasks, serializeOcclusionDocument } from '../../entry/src/main/ets/model/图片遮罩模型.ts';
import { noteMediaParts, noteImagePreviewSource } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
import { noteDraftChanged, parseNoteTags } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';

const 浏览编辑区 = loadComponentLogic('components/browser/浏览编辑区.ets', '浏览编辑区', {
  ...noteInterfaceDependencies(),
  parseOcclusionMasks, serializeOcclusionDocument, noteMediaParts, noteImagePreviewSource,
  resourceText: (_ctx, key) => key,
  $r: key => key,
  noteDraftChanged, parseNoteTags,
  DialogHeader: class {},
  应用尺寸: {},
  颜色键: {},
  NoteAudioPreview: class { async dispose() {} }, discardNoteRecordings: async () => {},
});

test('现有 IO 笔记按 Core 字段位置编辑，只更新遮罩草稿并走原保存入口', async () => {
  const source = '<p>Keep</p>{{c6::image-occlusion:ellipse:left=0.1:top=0.1:rx=0.1:ry=0.1:custom=kept}}';
  const editor = new 浏览编辑区();
  editor.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/files' }) });
  editor.fieldNames = ['Image renamed', 'Extra renamed', 'Masks renamed', 'Header renamed'];
  editor.initialFieldValues = ['<img src="saved.png">', '<b>extra</b>', source, 'Header'];
  editor.imageOcclusionFields = [2,0,3,1];
  editor.aboutToAppear();
  editor.openMasks();
  assert.equal(editor.showingMasks, true);
  assert.match(editor.maskImageSource, /collection\.media\/saved\.png$/);
  const untouched = editor.fieldValues.slice();
  editor.maskDraft[0].左 = 0.3;
  assert.deepEqual(editor.fieldValues, untouched, 'drawing does not write the note');
  let writes = 0;
  editor.onSave = async () => { writes++; };
  await editor.提交(); assert.equal(writes, 0, 'parent cannot save while graphic draft is open');
  await editor.requestClose();
  assert.equal(editor.showingMasks, true, 'Back is delivered to child discard protection');
  assert.equal(editor.masksBackRequest, 1);
  editor.confirmMasks(editor.maskDraft);
  assert.equal(editor.showingMasks, false);
  assert.equal(editor.fieldValues[0], untouched[0]);
  assert.equal(editor.fieldValues[1], untouched[1]);
  assert.equal(editor.fieldValues[3], untouched[3]);
  assert.match(editor.fieldValues[2], /c6::.*left=0.3.*custom=kept/);
  let saved;
  editor.onSave = async fields => { saved = fields; };
  await editor.提交();
  assert.deepEqual(saved, editor.fieldValues);
});

test('普通类型没有遮罩能力，缺失图片保留原字段并提供错误', () => {
  const editor = new 浏览编辑区();
  editor.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/files' }) });
  editor.fieldNames = ['Fields']; editor.initialFieldValues = ['keep']; editor.aboutToAppear();
  editor.openMasks(); assert.equal(editor.showingMasks, false);
  editor.imageOcclusionFields = [0,1,2,3];
  editor.openMasks(); assert.equal(editor.showingMasks, false);
  assert.deepEqual(editor.fieldValues, ['keep']); assert.ok(editor.本地错误);
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('浏览编辑区关闭后才完成的保存不会关闭新弹层', async () => {
  const gate = deferred();
  const events = [];
  const editor = new 浏览编辑区();
  editor.getUIContext = () => ({});
  editor.fieldNames = ['Front'];
  editor.initialFieldValues = ['old'];
  editor.onSave = async () => { await gate.promise; return true; };
  editor.onCancel = () => events.push('cancel');
  editor.aboutToAppear();

  const pending = editor.提交();
  editor.aboutToDisappear();
  gate.resolve();
  await pending;

  assert.deepEqual(events, []);
});
