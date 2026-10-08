// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { decodeUndoStatus } from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';

const nativeRoot = new URL('../../native/rsharmony/src/', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('../protocol/private-rpc.json', import.meta.url)));
const nativeService = file => spec[{'collection_history.rs':'CollectionHistory','deck_preview.rs':'DeckPreview'}[file]].id;
test('application native services never shadow another private or upstream service', () => {
  const ids=Object.values(spec).map(service=>service.id);
  assert.equal(new Set(ids).size,5);
  const core=JSON.parse(readFileSync(new URL('../core-protocol-schema.json',import.meta.url)));
  assert.ok(ids.every(id=>!core.services.some(service=>service.id===id)));
});

test('history adapter sends the displayed status to its own native service for undo and redo', async () => {
  const calls = [];
  const status = { undo: '删除牌组', redo: '', lastStep: 19 };
  const Adapter = loadPlatformModule('backend/CollectionHistoryBackend.ts', 'AnkiCollectionHistoryBackend', {
    集合服务: class { async 获取撤销状态() { return status; } },
    协议写入器,
    后端会话: { 获取实例: () => ({ 调用: async (...args) => { calls.push(args); return new Uint8Array(); } }) }
  });
  const backend = new Adapter();
  assert.deepEqual(await backend.status(), status);
  for (const redo of [false, true]) {
    await backend.apply(redo, status);
    const [service, method, input] = calls.at(-1);
    assert.equal(service, nativeService('collection_history.rs'));
    assert.notEqual(service, nativeService('deck_preview.rs'));
    assert.equal(method, redo ? 1 : 0);
    assert.deepEqual(decodeUndoStatus(input), status);
  }
});
