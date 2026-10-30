// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogHierarchy } from '../../entry/src/main/ets/model/DialogHierarchy.ts';

test('nested surfaces expose parent edges on both phone and capped tablet widths', () => {
  const hierarchy = new DialogHierarchy();
  const sizes = [hierarchy.enter(88, 480), hierarchy.enter(88, 480), hierarchy.enter(88, 480)];
  for (const viewport of [320, 400, 800, 1400]) {
    const widths = sizes.map(size => Math.min(viewport * size.widthPercent / 100, size.maximumWidth));
    assert.ok(widths[0] > widths[1] && widths[1] > widths[2], `${viewport}: ${widths}`);
    assert.ok((widths[0] - widths[1]) / 2 >= 12);
    assert.ok((widths[1] - widths[2]) / 2 >= 12);
  }
});

test('closing and reopening a child restores its tier without shrinking the parent', () => {
  const hierarchy = new DialogHierarchy();
  const parent = hierarchy.enter(90, 560);
  const child = hierarchy.enter(88, 480);
  hierarchy.leave(child.id);
  hierarchy.leave(child.id);
  const reopened = hierarchy.enter(88, 480);
  assert.equal(reopened.widthPercent, child.widthPercent);
  assert.equal(reopened.maximumWidth, child.maximumWidth);
  assert.deepEqual(parent, {id: 1, widthPercent: 90, maximumWidth: 560});
  hierarchy.leave(parent.id);
  hierarchy.leave(reopened.id);
  assert.equal(hierarchy.enter(88, 480).widthPercent, 88);
});

test('out-of-order removal preserves retained tiers and explicit compact limits', () => {
  const hierarchy = new DialogHierarchy();
  const parent = hierarchy.enter(88, 480);
  const child = hierarchy.enter(88, 420);
  hierarchy.leave(parent.id);
  const help = hierarchy.enter(88, 480);
  assert.equal(help.widthPercent, 72);
  assert.equal(help.maximumWidth, 372);
  hierarchy.leave(child.id);
  hierarchy.leave(help.id);
  assert.equal(hierarchy.enter(88, 480).maximumWidth, 480);
});

test('deep nesting keeps a bounded reading area and never exceeds the requested width', () => {
  const hierarchy = new DialogHierarchy();
  for (let depth = 0; depth < 20; depth++) {
    const size = hierarchy.enter(88, 480);
    assert.ok(size.widthPercent >= 64 && size.widthPercent <= 88);
    assert.ok(size.maximumWidth >= 280 && size.maximumWidth <= 480);
  }
});

test('backdrop lifecycle owns one entry and releases exactly its own surface', async () => {
  const {loadComponentLogic} = await import('./platform-module-harness.mjs');
  const hierarchy = new DialogHierarchy();
  const Backdrop = loadComponentLogic('components/common/DialogBackdrop.ets', 'DialogBackdrop', {
    dialogHierarchy: hierarchy, 应用尺寸: { dialogWidth: '88%', dialogMaxWidth: 480 }
  });
  const events = [];
  const parent = new Backdrop();
  parent.onSize = (width, maximumWidth) => events.push([width, maximumWidth]);
  parent.aboutToAppear();
  const child = new Backdrop();
  child.onSize = parent.onSize;
  child.aboutToAppear();
  assert.deepEqual(events, [['88%', 480], ['80%', 432]]);
  child.aboutToDisappear();
  child.aboutToDisappear();
  const reopened = new Backdrop();
  reopened.onSize = parent.onSize;
  reopened.aboutToAppear();
  assert.deepEqual(events.at(-1), ['80%', 432]);
  parent.aboutToDisappear();
  reopened.aboutToDisappear();
  assert.equal(hierarchy.enter(88, 480).widthPercent, 88);
});

test('every custom backdrop feeds its hierarchy size back into the visible surface', async () => {
  const {readFileSync, readdirSync} = await import('node:fs');
  const root = new URL('../../entry/src/main/ets/', import.meta.url);
  let count = 0;
  for (const file of readdirSync(root, {recursive: true}).filter(file => file.endsWith('.ets'))) {
    const source = readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8');
    const calls = [...source.matchAll(/\bDialogBackdrop\(/g)];
    if (calls.length === 0) continue;
    count += calls.length;
    assert.equal([...source.matchAll(/onSize:\s*\(width: string, maximumWidth: number\)/g)].length, calls.length, file);
    assert.match(source, /\.width\(this\.surfaceWidth\)/, file);
    assert.match(source, /maxWidth:\s*this\.surfaceMaximumWidth/, file);
  }
  assert.ok(count >= 10, 'audit must include shared frames and legacy surfaces');
});
