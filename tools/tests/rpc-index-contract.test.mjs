// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as serviceIndex from '../../entry/src/main/ets/backend/服务索引.ts';
import { parseGeneratedBackend, verifyIndex, verifyBaseline } from '../verify-rpc-index.mjs';

const manifest = JSON.parse(readFileSync(new URL('../rpc-index-methods.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('../rpc-index-baseline.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);

test('all source aliases match the checked-in generated dispatch baseline without local Anki artifacts', () => {
  verifyIndex(serviceIndex, manifest, baseline.services);
});

test('swapping valid method IDs fails semantic verification', () => {
  const index = { ...serviceIndex, 同步方法: { ...serviceIndex.同步方法, 同步媒体: 1, 中止媒体同步: 0 } };
  assert.throws(() => verifyIndex(index, manifest, baseline.services), /sync_media/);
});

test('service drift, last-entry drift, unknown aliases and newly unverified tables fail closed', () => {
  const services = clone(baseline.services); services.sync.id = 3;
  assert.throws(() => verifyIndex(serviceIndex, manifest, services), /service id/);
  const last = clone(baseline.services); last.tags.methods[10] = 'wrong_method';
  assert.throws(() => verifyIndex(serviceIndex, manifest, last), /complete_tag/);
  const aliases = clone(manifest); delete aliases.methods.同步方法.同步媒体;
  assert.throws(() => verifyIndex(serviceIndex, aliases, baseline.services), /manifest/);
  assert.throws(() => verifyIndex({ ...serviceIndex, 新方法: {} }, manifest, baseline.services), /unmapped method/);
});

test('format parsing includes last branch and delegated backend methods', () => {
  const generated = `
    1 => self.run_backend_sync_service_method(method, input),
    pub(crate) fn run_backend_sync_service_method(&self, method: u32, input: &[u8]) {
      match method {
        0 => { BackendSyncService::sync_media(self, input)?; }
        2 => { let output = crate::backend::Backend::media_sync_status(self)?; }
        _ => Err(InvalidMethodIndex),
      }
    }`;
  assert.deepEqual(parseGeneratedBackend(generated), { sync: { id: 1, methods: { 0: 'sync_media', 2: 'media_sync_status' } } });
  assert.throws(() => parseGeneratedBackend(generated.replace('BackendSyncService::sync_media', 'unrecognized')), /cannot determine/);
});

test('upstream revision or protocol/generator input drift invalidates the baseline', () => {
  verifyBaseline(baseline, baseline.revision, baseline.fingerprint);
  assert.throws(() => verifyBaseline(baseline, 'new-revision', baseline.fingerprint), /revision/);
  assert.throws(() => verifyBaseline(baseline, baseline.revision, 'changed-proto'), /inputs changed/);
});
