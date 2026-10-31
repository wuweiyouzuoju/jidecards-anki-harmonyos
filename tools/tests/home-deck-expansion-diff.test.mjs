// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { 牌组列表数据源 } from '../../entry/src/main/ets/model/主页模型.ets';
import { readFileSync } from 'node:fs';
import { loadPlatformSource } from './platform-module-harness.mjs';

globalThis.DataOperationType = { ADD: 'add', DELETE: 'delete', RELOAD: 'reload' };

test('visible descendants are inserted and removed as one batch, retaining siblings and suppressing identical updates', () => {
  const parent = { id: 'a' }, child = { id: 'a1' }, grandchild = { id: 'a11' }, sibling = { id: 'b' };
  const source = new 牌组列表数据源([parent, sibling]);
  const changes = []; let reloads = 0;
  source.registerDataChangeListener({ onDatasetChange: ops => changes.push(ops), onDataReloaded: () => reloads++ });
  source.replaceVisible([parent, child, grandchild, sibling]);
  assert.deepEqual(changes.pop(), [{ type: 'add', index: 1, count: 2 }]);
  assert.equal(source.getData(0), parent); assert.equal(source.getData(3), sibling);
  source.replaceVisible([parent, child, grandchild, sibling]); assert.equal(changes.length, 0);
  source.replaceVisible([parent, sibling]);
  assert.deepEqual(changes.pop(), [{ type: 'delete', index: 1, count: 2 }]);
  assert.equal(source.getData(1), sibling); assert.equal(reloads, 0);
});

test('legacy observers still receive a truthful reload and normal content refresh remains explicit', () => {
  const source = new 牌组列表数据源([]); let reloads = 0;
  source.registerDataChangeListener({ onDataReloaded: () => reloads++ });
  source.replaceVisible([{ id: 'a' }]); assert.equal(reloads, 1);
  source.replaceAll([{ id: 'a', name: 'changed' }]); assert.equal(reloads, 2);
});

test('rapid expansion extends capture settling while preserving independent scroll and modal guards', () => {
  const code = readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets', import.meta.url), 'utf8');
  const timers = new Map(); let next = 0;
  const api = loadPlatformSource(code.slice(code.indexOf('const frozenSources:')),
    '({settleGlassSourceLayout,sourceCaptureAllowed,setGlassSourceScrolling})', {
      captureAllowed: () => true, setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id)
    });
  api.settleGlassSourceLayout('home'); assert.equal(api.sourceCaptureAllowed('home'), false);
  api.settleGlassSourceLayout('home'); assert.equal(timers.size, 1);
  assert.equal(api.sourceCaptureAllowed('other'), true);
  api.setGlassSourceScrolling('home', true); [...timers.values()][0]();
  assert.equal(api.sourceCaptureAllowed('home'), false);
  api.setGlassSourceScrolling('home', false); assert.equal(api.sourceCaptureAllowed('home'), true);
});


test('startup, expansion, refresh and reorder consistently use the same batch notification protocol', () => {
 const a={id:'a'},b={id:'b'},child={id:'a1'};
 const source=new 牌组列表数据源([]);const calls=[];
 source.registerDataChangeListener({onDatasetChange:ops=>calls.push(ops),onDataReloaded:()=>{throw Error('mixed notification protocol');}});
 source.replaceAll([a,b]);source.replaceVisible([a,child,b]);source.replaceVisible([a,b]);source.moveItem(0,1);source.replaceAll([a,b]);
 assert.deepEqual(calls.map(ops=>ops[0].type),['reload','add','delete','reload','reload']);
});
