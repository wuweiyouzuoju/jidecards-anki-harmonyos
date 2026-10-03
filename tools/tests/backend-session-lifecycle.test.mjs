// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { 服务号, 集合方法, 原生状态 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { 后端错误, 映射原生错误 } from '../../entry/src/main/ets/backend/错误类型.ts';
import { encodeBackendInit } from '../../entry/src/main/ets/proto/messages/BackendMessages.ts';
import { encodeCloseCollectionRequest, encodeOpenCollectionRequest } from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';

function harness(recover = async () => {}) {
  const pending = []; let closes = 0;
  class Client {
    open = false;
    打开() { this.open = true; }
    是否已打开() { return this.open; }
    关闭() { this.open = false; closes++; }
    调用原始() { return new Promise((resolve, reject) => pending.push({resolve, reject})); }
  }
  // Execute the complete production class with only its native transport replaced.
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/后端会话.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/export /g, '').replace("await import('./TransferRecovery')", '({ recoverInterruptedReplacement })');
  const Session = new Function('后端客户端', '集合方法', '服务号', '原生状态', '后端错误', '映射原生错误',
    'encodeBackendInit', 'encodeCloseCollectionRequest', 'encodeOpenCollectionRequest', 'recoverInterruptedReplacement',
    stripTypeScriptTypes(source) + '; return 后端会话;')(
      Client, 集合方法, 服务号, 原生状态, 后端错误, 映射原生错误,
      encodeBackendInit, encodeCloseCollectionRequest, encodeOpenCollectionRequest, recover);
  return { session: new Session(), pending, closes: () => closes };
}

test('concurrent opens share work; a closed opening cannot resurrect the session', async () => {
  const h = harness(); const opening = h.session.确保已打开('/files'); await Promise.resolve();
  assert.equal(h.session.确保已打开('/files'), opening);
  h.session.关闭(); h.pending[0].resolve(new Uint8Array());
  await assert.rejects(opening, /closed while opening/);
  assert.equal(h.session.是否就绪(), false);
});

for (const failure of [false, true]) test(`old opening settlement cannot close or clear a newer opening (${failure})`, async () => {
  const h = harness(); const old = h.session.确保已打开('/files'); await Promise.resolve();
  const rejected = assert.rejects(old);
  h.session.关闭(); const current = h.session.确保已打开('/files'); await Promise.resolve();
  if (failure) h.pending[0].reject(new Error('old failure')); else h.pending[0].resolve(new Uint8Array());
  await rejected;
  assert.equal(h.session.确保已打开('/files'), current);
  assert.equal(h.closes(), 1);
  h.pending[1].resolve(new Uint8Array()); await current;
  assert.equal(h.session.是否就绪(), true);
});

test('late collection close cannot overwrite a reopened backend', async () => {
  const h = harness(); const first = h.session.确保已打开('/files'); await Promise.resolve();
  h.pending[0].resolve(new Uint8Array()); await first;
  const close = h.session.关闭集合(); h.session.关闭();
  const next = h.session.确保已打开('/files'); await Promise.resolve(); h.pending[2].resolve(new Uint8Array()); await next;
  h.pending[1].resolve(new Uint8Array()); await close;
  assert.equal(h.session.是否就绪(), true);
});

test('failed rollback blocks ordinary reopening until recovery succeeds; validation bypass is explicit', async () => {
  let fail = false, recoveries = 0;
  const h = harness(async () => { recoveries++; if (fail) throw new Error('restore failed'); });
  const first = h.session.确保已打开('/files'); await Promise.resolve();
  h.pending[0].resolve(new Uint8Array()); await first;
  const close = h.session.关闭集合(); h.pending[1].resolve(new Uint8Array()); await close;
  fail = true;
  await assert.rejects(h.session.确保已打开('/files'), /restore failed/);
  assert.equal(h.pending.length, 2); assert.equal(h.session.是否就绪(), false);
  fail = false;
  const retry = h.session.确保已打开('/files'); await Promise.resolve();
  h.pending[2].resolve(new Uint8Array()); await retry; assert.equal(recoveries, 3);
  const closeAgain = h.session.关闭集合(); h.pending[3].resolve(new Uint8Array()); await closeAgain;
  const validate = h.session.确保已打开('/files', true);
  h.pending[4].resolve(new Uint8Array()); await validate; assert.equal(recoveries, 3);
});
