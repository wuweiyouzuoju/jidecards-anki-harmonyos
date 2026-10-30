// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const HIERARCHY = 'entry/src/main/ets/model/牌组层级.ets';
const MODELS = 'entry/src/main/ets/model/主页模型.ets';
const MAPPER = 'entry/src/main/ets/model/主页快照映射器.ets';
const LIST_ITEM = 'entry/src/main/ets/components/牌组列表项.ets';
const CREATE_PANEL = 'entry/src/main/ets/components/创建牌组面板.ets';

test('hierarchy module normalizes separators and exposes tree metadata', () => {
  assert.equal(existsSync(projectUrl(HIERARCHY)), true, `${HIERARCHY} must exist`);
  const hierarchy = read(HIERARCHY);

  assert.match(hierarchy, /export function 规范化牌组路径/);
  assert.match(hierarchy, /replace\(\/：\/g, '::'\)/);
  assert.match(hierarchy, /replace\(/, 'path normalization must handle separator variants');
  assert.match(hierarchy, /export function 组合牌组路径/);
  assert.match(hierarchy, /export function 平铺牌组树/);
  assert.match(hierarchy, /export function 可见牌组行/);
  assert.match(hierarchy, /段\.length === 0/, 'empty hierarchy segments must be rejected');
});

test('deck summaries retain tree relationships and backend aggregate counts', () => {
  const models = read(MODELS);
  const hierarchy = read(HIERARCHY);
  for (const field of ['fullName', 'depth', 'parentId', 'hasChildren', 'ancestorIds']) {
    assert.match(models, new RegExp(field));
  }
  assert.match(hierarchy, /totalIncludingChildren/, 'parent totals must come from the backend node');
  assert.doesNotMatch(hierarchy, /totalCards\s*\+=/, 'parent totals must not be recalculated from children');
});

test('home mapper flattens the full deck tree rather than only root children', () => {
  const mapper = read(MAPPER);
  assert.match(mapper, /平铺牌组树\(根节点/);
  assert.doesNotMatch(mapper, /主页面列表只展示顶层牌组/);
});

test('deck rows disclose and indent children while creation composes a normalized parent path', () => {
  const listItem = read(LIST_ITEM);
  const panel = read(CREATE_PANEL);

  assert.match(listItem, /expanded/);
  assert.match(listItem, /onToggle/);
  assert.match(listItem, /deck\.depth/);
  assert.match(listItem, /deck\.hasChildren/);
  assert.match(panel, /parentOptions: 牌组汇总\[\]/);
  assert.match(panel, /initialParentId/);
  assert.match(panel, /onConfirm: \(fullName: string\) => void/);
  assert.match(panel, /组合牌组路径/);
});
