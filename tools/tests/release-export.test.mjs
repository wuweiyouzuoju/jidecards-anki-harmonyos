// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import JSON5 from 'json5';
import { stripTypeScriptTypes } from 'node:module';
import { exportSource, validateDestination, sanitizeSigning } from '../strip-for-release.mjs';

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'jidecards-export-test-'));
  const source = join(base, 'source'), output = join(base, 'output');
  mkdirSync(source);
  execFileSync('git', ['init', '-q', source]);
  t.after(() => {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()));
    assert.ok(base.includes('jidecards-export-test-'));
    rmSync(base, { recursive: true, force: true });
  });
  return { base, source, output };
}

test('export preserves code, comments, binary bytes and validation docs; excludes ignored and experimental data', t => {
  const { source, output } = fixture(t);
  mkdirSync(join(source, 'tools/experimental'), { recursive: true });
  mkdirSync(join(source, 'docs'));
  const code = [
    '// explanation',
    String.raw`const url: string = input.replace(/^https:\/\//i, '');`,
    'const template = `http://example/*x*/${url}`;'
  ].join('\n');
  writeFileSync(join(source, 'code.ts'), code);
  writeFileSync(join(source, 'image.bin'), Buffer.from([0, 255, 13, 10, 128]));
  writeFileSync(join(source, 'docs/README.md'), 'validation docs');
  writeFileSync(join(source, '.gitignore'), 'private.txt\n');
  writeFileSync(join(source, 'private.txt'), 'private');
  writeFileSync(join(source, 'tools/experimental/probe.mjs'), 'probe');
  writeFileSync(join(source, 'build-profile.json5'), '{ signingConfigs: [{ material: { storeFile: "local", keyPassword: "encrypted" } }], compatibleSdkVersion: \'6.0.1(21)\' }');
  mkdirSync(join(source, '.local'));
  writeFileSync(join(source, '.local/signing.json'), 'private signing material');
  execFileSync('git', ['-C', source, 'add', '-f', '.local/signing.json']);
  exportSource(source, output);
  const copied = readFileSync(join(output, 'code.ts'), 'utf8');
  assert.equal(copied, code);
  assert.equal(new Function('input', stripTypeScriptTypes(copied) + '; return url;')('https://example'), 'example');
  assert.deepEqual(readFileSync(join(output, 'image.bin')), readFileSync(join(source, 'image.bin')));
  assert.ok(existsSync(join(output, 'docs/README.md')));
  assert.equal(existsSync(join(output, 'private.txt')), false);
  assert.equal(existsSync(join(output, '.local')), false, 'even accidentally tracked local data is excluded');
  assert.equal(existsSync(join(output, 'tools/experimental/probe.mjs')), false);
  assert.equal(JSON5.parse(readFileSync(join(output, 'build-profile.json5'), 'utf8')).signingConfigs[0].material.keyPassword, '');
  assert.match(readFileSync(join(source, 'build-profile.json5'), 'utf8'), /encrypted/);
});

test('same directory, descendants, ancestors and existing destinations fail without deleting anything', t => {
  const { base, source, output } = fixture(t);
  writeFileSync(join(source, 'sentinel'), 'keep');
  mkdirSync(output); writeFileSync(join(output, 'sentinel'), 'keep output');
  for (const target of [source, join(source, 'child'), base, output]) {
    assert.throws(() => exportSource(source, target));
  }
  assert.equal(readFileSync(join(source, 'sentinel'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(output, 'sentinel'), 'utf8'), 'keep output');
});

test('destination through junction/symlink into source is rejected', t => {
  const { base, source } = fixture(t);
  const alias = join(base, 'alias');
  symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validateDestination(source, join(alias, 'copy')), /inside source/);
  assert.equal(existsSync(join(source, 'copy')), false);
});

test('signing sanitizer understands JSON5 escaped strings and fails closed on unsupported field values', () => {
  const input = String.raw`{ certpath: 'C:\\x\\a.cer', "keyPassword": "a\\\"b//c", profile: 'https://example/x', other: "certpath: 'do not edit'" }`;
  assert.deepEqual(JSON5.parse(sanitizeSigning(input)), { certpath: '', keyPassword: '', profile: '', other: "certpath: 'do not edit'" });
  assert.throws(() => sanitizeSigning('{storePassword: 123}'), /Cannot sanitize/);
  assert.throws(() => sanitizeSigning('{storePassword:'), /JSON5/);
});
