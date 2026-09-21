// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { selectTests, SUITES } from '../test-suites.mjs';
import { nodeVersionProblem, checkNodeRuntime } from '../node-runtime.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('all discovers every test once; domain suites are nonempty and invalid suites fail closed', () => {
  const all = selectTests(root);
  assert.equal(all.length, new Set(all).size);
  assert.equal(all.length, readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.test.mjs')).length);
  for (const suite of Object.keys(SUITES)) {
    assert.ok(selectTests(root, suite).every(file => all.includes(file)));
  }
  assert.throws(() => selectTests(root, 'typo'), /Unknown suite/);
  const result = spawnSync(process.execPath, ['tools/test.mjs', 'typo'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Unknown suite/);
});

test('runtime contract agrees with package and CI; unsupported Node fails before tests', () => {
  assert.equal(nodeVersionProblem('v24.18.0'), null);
  for (const version of ['v18.20.0', 'v22.0.0', 'unknown', null]) assert.match(nodeVersionProblem(version), /Node 24/);
  assert.equal(checkNodeRuntime(), null);
  assert.equal(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).engines.node, '24.x');
  assert.match(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'), /node-version: '24'/);
});

test('verification refuses invalid modes instead of reporting partial validation as complete', () => {
  const result = spawnSync(process.execPath, ['tools/verify.mjs', 'typo'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Usage:/);
});
