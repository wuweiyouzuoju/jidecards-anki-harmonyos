// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSON5 from 'json5';
import { parseLocalSigning, applyLocalSigning } from '../signing-config.ts';

const local = () => ({ signingConfigs: [{ name: 'local', type: 'HarmonyOS', material: {
  certpath: 'certificate.cer', profile: 'profile.p7b', storeFile: 'keystore.p12',
  storePassword: 'secret-store', keyAlias: 'original', keyPassword: 'secret-key', signAlg: 'SHA256withECDSA'
} }], products: [{ name: 'default', signingConfig: 'local' }] });

test('local signing preserves identity and every non-signing build option without mutating public config', () => {
  const profile = { app: { products: [{ name: 'default', compatibleSdkVersion: 21, targetSdkVersion: 23 }], buildModeSet: ['debug'] }, modules: [{ name: 'entry' }] };
  const before = structuredClone(profile), settings = parseLocalSigning(JSON.stringify(local()));
  const merged = applyLocalSigning(profile, settings);
  assert.deepEqual(profile, before);
  assert.deepEqual(merged.app.signingConfigs, settings.signingConfigs);
  assert.deepEqual(merged.app.products[0], { ...profile.app.products[0], signingConfig: 'local' });
  assert.deepEqual(merged.modules, profile.modules);
});

test('invalid signing fails with field-only diagnostics and unknown products cannot be silently unsigned', () => {
  assert.throws(() => parseLocalSigning('secret broken JSON'), error => !error.message.includes('secret'));
  for (const key of Object.keys(local().signingConfigs[0].material)) {
    const value = local(); delete value.signingConfigs[0].material[key];
    assert.throws(() => parseLocalSigning(JSON.stringify(value)), error => error.message.includes(key) && !error.message.includes('secret'));
  }
  const duplicate = local(); duplicate.products.push(duplicate.products[0]);
  assert.throws(() => parseLocalSigning(JSON.stringify(duplicate)), /duplicate/);
  assert.throws(() => applyLocalSigning({ app: { products: [{ name: 'other' }] } }, local()), /absent/);
});

test('tracked build config has no personal signing materials; template validates using the shared parser', () => {
  const profile = JSON5.parse(readFileSync(new URL('../../build-profile.json5', import.meta.url), 'utf8'));
  assert.equal(profile.app.signingConfigs, undefined);
  assert.ok(profile.app.products.every(product => !product.signingConfig));
  assert.equal(parseLocalSigning(readFileSync(new URL('../../config/signing.example.json', import.meta.url), 'utf8')).products[0].name, 'default');
  assert.match(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8'), /^\/\.local\/$/m);
});
