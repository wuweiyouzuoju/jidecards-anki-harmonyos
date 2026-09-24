// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';

const 浏览编辑区 = loadComponentLogic('components/browser/浏览编辑区.ets', '浏览编辑区', {
  DialogHeader: class {},
  应用尺寸: {},
  颜色键: {},
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
