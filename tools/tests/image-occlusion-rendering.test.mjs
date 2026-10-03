// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { 构建卡片HTML } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';

function renderer(groups = {}, loaded = true, properties = {}) {
  const calls = [], stack = [];
  const ctx = { measureText: text => ({ width: text.length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }) };
  for (const name of ['clearRect', 'translate', 'rotate', 'scale', 'fillRect', 'strokeRect', 'beginPath', 'ellipse', 'closePath', 'fill', 'stroke', 'moveTo', 'lineTo', 'fillText']) {
    ctx[name] = (...args) => calls.push({ name, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, width: ctx.lineWidth, font: ctx.font });
  }
  ctx.save = () => stack.push({ fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, font: ctx.font });
  ctx.restore = () => Object.assign(ctx, stack.pop());
  const canvas = { getContext: () => ctx }, listeners = [];
  const img = { complete: loaded, naturalWidth: 1000, naturalHeight: 500, dataset: {}, addEventListener: (name, call) => listeners.push({ name, call }) };
  const button = { style: {} };
  const document = {
    getElementById: id => id === 'toggle' ? button : id === 'image-occlusion-canvas' ? canvas : null,
    querySelector: () => img,
    querySelectorAll: selector => (groups[selector] ?? []).map(dataset => ({ tagName: 'DIV', dataset }))
  };
  const window = { getComputedStyle: () => ({ getPropertyValue: key => properties[key] ?? '' }) };
  const nodes = [{ text: '<div></div>', replacement: null }];
  const html = 构建卡片HTML({ css: '', questionNodes: nodes, answerNodes: nodes, latexSvg: false, isEmpty: false }, 'question', false);
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const script = scripts.find(script => script.includes('window.anki.imageOcclusion ='));
  assert.ok(script, 'the actual study/preview document must include the renderer');
  vm.runInNewContext(script, { window, document });
  return { calls, stack, img, listeners, canvas, api: window.anki.imageOcclusion, button };
}
const shape = (kind, props = {}) => ({ shape: kind, left: '.1', top: '.2', ...props });
const named = (r, name) => r.calls.filter(call => call.name === name);

test('ellipses use upstream radii and angles use ten-thousandths of a turn', () => {
  const r = renderer({ '.cloze': [shape('ellipse', { rx: '.2', ry: '.1', angle: '2500' })] });
  r.api.setup();
  assert.deepEqual(named(r, 'translate')[0].args, [100, 100]);
  assert.deepEqual(named(r, 'ellipse')[0].args, [200, 50, 200, 50, 0, 0, Math.PI * 2]);
  assert.equal(named(r, 'rotate')[0].args[0], Math.PI / 2);
  assert.equal(named(r, 'fill')[0].fill, '#ff8e8e');
  assert.equal(r.stack.length, 0);
});

test('polygon points are placed relative to their minima, including negative points', () => {
  const r = renderer({ '.cloze': [shape('polygon', { points: '-.2,.1 .1,.1 -.1,.4' })] });
  r.api.setup();
  assert.deepEqual(named(r, 'translate')[0].args, [300, 50]);
  assert.deepEqual(named(r, 'moveTo')[0].args, [-200, 50]);
  assert.deepEqual(named(r, 'lineTo').map(call => call.args), [[100, 50], [-100, 200]]);
  assert.equal(named(r, 'fill').length, 1);
});

test('hide-one skips inactive masks; hide-all uses inactive fill and template CSS borders', () => {
  const r = renderer({ '.cloze-inactive': [
    shape('rect', { width: '.2', height: '.1', occludeinactive: '0' }),
    shape('rect', { width: '.3', height: '.2', occludeinactive: '1', fill: '#123456' })
  ] }, true, { '--inactive-shape-border': '3px #654321' });
  r.api.setup();
  assert.deepEqual(named(r, 'fillRect').map(call => call.args), [[0, 0, 300, 100]]);
  assert.equal(named(r, 'fillRect')[0].fill, '#123456');
  assert.equal(named(r, 'strokeRect')[0].stroke, '#654321');
  assert.equal(named(r, 'strokeRect')[0].width, 3);
});

test('answer highlights reveal the image and retain their outline', () => {
  const r = renderer({ '.cloze-highlight': [shape('rect', { width: '.2', height: '.1' })] });
  r.api.setup();
  assert.equal(named(r, 'fillRect')[0].fill, '#ff8e8e00');
  assert.equal(named(r, 'strokeRect')[0].stroke, '#ff8e8e');
});

test('text annotations remain visible in both modes and after toggling masks', () => {
  const r = renderer({ '.cloze-inactive': [shape('text', { text: 'A\n中文', scale: '2', fontSize: '.04', fill: '#123456', angle: '2500' })],
    '.cloze': [shape('rect', { width: '.2', height: '.1' })] });
  r.api.setup();
  assert.deepEqual(named(r, 'fillText').map(call => call.args), [['A', 0, 0], ['中文', 0, 18]]);
  assert.equal(named(r, 'fillText')[0].font, '20px Arial');
  assert.equal(named(r, 'fillText')[0].fill, '#123456');
  assert.deepEqual(named(r, 'scale')[0].args, [2, 2]);
  r.calls.length = 0; r.api.toggle();
  assert.equal(named(r, 'fillText').length, 2);
  assert.equal(named(r, 'fillRect').length, 1, 'only annotation background remains');
  assert.equal(r.stack.length, 0);
});

test('pending image load binds once and redraws at the actual image dimensions', () => {
  const r = renderer({ '.cloze': [shape('rect', { width: '.2', height: '.1' })] }, false);
  r.api.setup(); r.api.setup();
  assert.equal(r.calls.length, 0); assert.equal(r.listeners.length, 1);
  r.img.complete = true; r.listeners[0].call();
  assert.equal(r.canvas.width, 1000); assert.equal(r.canvas.height, 500);
  assert.deepEqual(named(r, 'fillRect')[0].args, [0, 0, 200, 50]);
});

test('bad shape dimensions and polygon points cannot poison subsequent canvas state', () => {
  const r = renderer({ '.cloze': [
    shape('ellipse', { rx: '-.1', ry: '.2' }), shape('polygon', { points: '0,0 bad .1,.1' }),
    shape('rect', { width: '.2', height: '.1' })
  ] });
  r.api.setup();
  assert.equal(named(r, 'fillRect').length, 1); assert.equal(r.stack.length, 0);
});

test('large source photographs keep aspect ratio within the upstream canvas pixel budget', () => {
  const r = renderer({ '.cloze': [shape('rect', { width: '.2', height: '.1' })] });
  r.img.naturalWidth = 12000; r.img.naturalHeight = 8000;
  r.api.setup();
  assert.ok(r.canvas.width * r.canvas.height <= 4096 * 4096);
  assert.ok(Math.abs(r.canvas.width / r.canvas.height - 1.5) < .001);
  assert.deepEqual(named(r, 'fillRect')[0].args, [0,0,Math.round(r.canvas.width * .2),Math.round(r.canvas.height * .1)]);
});

test('stock inactive fill preserves CSS overrides, while custom imported fill is retained', () => {
  const r = renderer({ '.cloze-inactive': [shape('rect', { width: '.2', height: '.1', occludeinactive: '1', fill: '#ffeba2' })] },
    true, { '--inactive-shape-color': '#abcdef' });
  r.api.setup(); assert.equal(named(r, 'fillRect')[0].fill, '#abcdef');
});
