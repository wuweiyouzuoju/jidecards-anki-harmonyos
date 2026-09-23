// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as serviceIndex from '../../entry/src/main/ets/backend/服务索引.ts';
import { parseGeneratedBackend, verifyIndex, verifyBaseline, protocolFingerprint, verifyGenerationCheckout } from '../verify-rpc-index.mjs';

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

test('baseline generation rejects locally modified inputs instead of blessing a machine-specific lockfile', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'rpc-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  for (const file of ['Cargo.lock', 'rslib/rust_interface.rs', 'proto/test.proto', 'rslib/proto/build.rs', 'rslib/proto_gen/Cargo.toml']) write(file, 'original\n');
  assert.throws(() => verifyGenerationCheckout(root, '1234567'), /independent locked/);
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('-c', 'user.name=RPC test', '-c', 'user.email=rpc-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  const revision = git('rev-parse', '--short=7', 'HEAD');
  verifyGenerationCheckout(root, revision);
  assert.throws(() => verifyGenerationCheckout(root, '1234567'), /locked Anki revision/);
  const original = protocolFingerprint(root);
  write('Cargo.lock', 'original\r\n');
  assert.equal(protocolFingerprint(root), original, 'checkout line endings do not change the protocol fingerprint');
  write('Cargo.lock', 'locally trimmed workspace\n');
  assert.notEqual(protocolFingerprint(root), original);
  assert.throws(() => verifyGenerationCheckout(root, revision), /modified.*inputs[\s\S]*Cargo\.lock/);
  git('add', 'Cargo.lock');
  assert.throws(() => verifyGenerationCheckout(root, revision), /Cargo\.lock/, 'staging changes does not authorize a new baseline');
  git('reset', '--quiet', 'HEAD', '--', 'Cargo.lock');
  write('Cargo.lock', 'original\n');
  write('proto/extra.proto', 'new protocol\n');
  assert.throws(() => verifyGenerationCheckout(root, revision), /extra\.proto/);
  rmSync(path.join(root, 'proto/extra.proto'));
  write('rslib/import_export/mod.rs', 'application patch outside generator inputs\n');
  verifyGenerationCheckout(root, revision);
});
