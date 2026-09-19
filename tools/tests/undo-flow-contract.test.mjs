// SPDX-License-Identifier: AGPL-3.0-or-later

// 撤销链路契约测试（T2）：
// - 集合服务 只经 后端会话 走 后端集合(3) 的 7/8/9 方法索引；
// - UndoStatus/OpChangesAfterUndo 解码器字段符合 collection.proto；
// - StudyPage 撤销按钮真实接线 撤销()，撤销后重新取卡，失败走 errorDetail；
// - 重做 仅服务层封装备用，UI 不暴露（上游移动端惯例）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { 集合方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';
import {
  decodeOpChangesAfterUndo,
  decodeUndoStatus
} from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const COLLECTION_SERVICE = 'entry/src/main/ets/backend/集合服务.ts';
const STUDY_PAGE = 'entry/src/main/ets/pages/学习页.ets';
const STRINGS = 'entry/src/main/resources/base/element/string.json';

test('collection service method indexes map to GetUndoStatus/Undo/Redo 7/8/9', () => {
  assert.equal(服务号.后端集合, 3, 'collection service id');
  assert.equal(集合方法.获取撤销状态, 7);
  assert.equal(集合方法.撤销, 8);
  assert.equal(集合方法.重做, 9);
});

test('collection service wraps undo trio through 后端会话 only', () => {
  const service = read(COLLECTION_SERVICE);

  assert.match(service, /后端会话\.获取实例\(\)/);
  assert.doesNotMatch(service, /new 后端客户端/, 'must go through 后端会话');

  assert.match(service, /async 获取撤销状态\(\): Promise<UndoStatus>/);
  assert.match(service, /服务号\.后端集合, 集合方法\.获取撤销状态, new Uint8Array\(0\)/);
  assert.match(service, /decodeUndoStatus\(响应字节\)/);

  assert.match(service, /async 撤销\(\): Promise<OpChangesAfterUndo>/);
  assert.match(service, /服务号\.后端集合, 集合方法\.撤销, new Uint8Array\(0\)/);
  assert.match(service, /decodeOpChangesAfterUndo\(响应字节\)/);

  assert.match(service, /async 重做\(\): Promise<OpChangesAfterUndo>/);
  assert.match(service, /服务号\.后端集合, 集合方法\.重做, new Uint8Array\(0\)/);
});

test('undo status decoder reads labels and last step', () => {
  const w = new 协议写入器();
  w.写入字符串(1, '复习卡片');
  w.写入字符串(2, '');
  w.写入变长整数(3, 12);
  const status = decodeUndoStatus(w.转为字节());
  assert.deepEqual(status, { undo: '复习卡片', redo: '', lastStep: 12 });

  assert.deepEqual(decodeUndoStatus(new Uint8Array(0)), { undo: '', redo: '', lastStep: 0 },
    'empty wire means nothing to undo/redo');
});

test('op changes after undo decoder reads nested changes and new status', () => {
  const changes = new 协议写入器();
  changes.写入布尔(1, true);
  changes.写入布尔(10, true);
  const newStatus = new 协议写入器();
  newStatus.写入字符串(1, '复习卡片');
  newStatus.写入变长整数(3, 7);
  const w = new 协议写入器();
  w.写入子消息(1, changes);
  w.写入字符串(2, '复习卡片');
  w.写入64位整数(3, 1720000000);
  w.写入子消息(4, newStatus);
  w.写入变长整数(5, 3);

  const out = decodeOpChangesAfterUndo(w.转为字节());
  assert.equal(out.operation, '复习卡片');
  assert.equal(out.revertedToTimestamp, 1720000000);
  assert.equal(out.counter, 3);
  assert.equal(out.changes?.card, true);
  assert.equal(out.changes?.studyQueues, true);
  assert.equal(out.changes?.note, false);
  assert.equal(out.newStatus?.undo, '复习卡片');
  assert.equal(out.newStatus?.lastStep, 7);
});

test('study page refreshes undo availability on entry and after rating', () => {
  const page = read(STUDY_PAGE);

  assert.match(page, /import \{ 集合服务 \} from '\.\.\/backend\/集合服务'/);
  assert.match(page, /this\.可撤销 = snapshot\.canUndo/);
  const adapter = read('entry/src/main/ets/backend/StudySessionBackend.ts');
  assert.match(adapter, /await this\.collection\.获取撤销状态\(\)/);
  assert.match(adapter, /undo\.length > 0/, 'empty undo label means unavailable');
  // loadNextCard 同时覆盖「页面进入」与「评分成功后」两条路径（startSession/rate 均汇入）
  // 入口、评分后与撤销后的刷新由 study-lifecycle 行为测试验证。
});

test('study page undo button is wired to undo then refetch', () => {
  const page = read(STUDY_PAGE);

  // 2026-07-28：撤销按钮从顶部条独立 Button 改为「更多」菜单项。
  // 菜单项 enabled 跟随 可撤销 状态（无可撤销时灰色不可点），点击触发 撤销上次()。
  assert.match(page, /更多菜单\(\): MenuElement\[\]/, 'more menu builder exists');
  assert.match(page, /\$r\('app\.string\.study_undo'\)/, 'undo string still referenced');
  assert.match(page, /enabled: this\.可撤销/, 'undo menu item enabled follows 可撤销');
  assert.match(page, /this\.撤销上次\(\);/, 'menu item taps into undo handler');

  assert.match(page, /if \(this\.评分中 \|\| !this\.可撤销\)/, 'undo reuses reentrancy guard');
  assert.match(page, /await this\.studySession\.undo\(\);\s*await this\.加载下一张卡\(\);/,
    'undone card returns to queue front, refetch required');
  const undoBody = page.match(/撤销上次\(\): Promise<void> \{[\s\S]*?\n  \}/);
  assert.notEqual(undoBody, null);
  assert.match(undoBody[0], /this\.阶段 = 'error';/);
  assert.match(undoBody[0], /this\.错误详情 = error instanceof Error \? error\.message : `\$\{error\}`;/,
    'undo failure surfaces through existing error state');
});

test('redo stays service-only and undo strings are resourced', () => {
  const page = read(STUDY_PAGE);
  assert.doesNotMatch(page, /集合服务实例\.重做\(/, 'redo must not be exposed in study UI');

  const strings = read(STRINGS);
  assert.match(strings, /"name": "study_undo"/);
});
