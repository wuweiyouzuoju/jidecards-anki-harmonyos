// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, renameSync, unlinkSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PATH_RULES, collectChangedPaths, planChanges, main } from '../change-impact.mjs';
import { SUITES } from '../test-suites.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jidecards-impact-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('jidecards-impact-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.name', 'Impact Test']);
  git(['config', 'user.email', 'impact@example.invalid']);
  const write = (file, content = file) => {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), content);
  };
  const commit = () => {
    git(['add', '.']);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  };
  return { directory, git, write, commit };
}

test('impact merges domains without downgrading native or HAP requirements', () => {
  const plan = planChanges(['docs/README.md', 'entry/src/main/ets/model/HomeSyncController.ts', 'native/core.rs']);
  assert.deepEqual(plan.requiredCommands, ['npm run verify']);
  assert.ok(plan.focusedCommands.includes('npm test -- home'));
  assert.ok(plan.focusedCommands.includes('npm test -- sync'));
  assert.ok(plan.reads.includes('.agents/rules/paths/native.md'));
  assert.equal(plan.deviceReview, true);
  assert.equal(plan.verificationStatus, 'not-run');
  assert.deepEqual(planChanges(['native/core.rs']).requiredCommands, ['npm run verify -- native']);
  assert.deepEqual(planChanges(['docs/README.md']).requiredCommands, ['npm run verify -- repo']);
});

test('impact covers build configuration, RPC, runtime Agent and source tests', () => {
  for (const file of ['build-profile.json5', 'AppScope/app.json5', 'tools/build-native.ps1', 'tools/patches/core.patch', 'tools/verify.mjs']) {
    assert.deepEqual(planChanges([file]).requiredCommands, ['npm run verify'], file);
  }
  assert.ok(planChanges(['entry/src/main/cpp/bridge.cpp']).reads.includes('.agents/rules/paths/native.md'));
  assert.ok(planChanges(['entry/src/main/ets/pages/AI制卡页.ets']).focusedCommands.includes('npm test -- agent'));
  assert.ok(planChanges(['entry/src/main/ets/pages/AI制卡页.ets']).reads.includes('.agents/adapters/arkts.md'));
  assert.ok(planChanges(['tools/tests/sync-automatic.test.mjs']).focusedCommands.includes('npm test -- sync'));
});

test('impact does not silently accept unknown paths or claim empty changes passed', () => {
  const unknown = planChanges(['future-module/new.ts']);
  assert.deepEqual(unknown.unknownPaths, ['future-module/new.ts']);
  assert.deepEqual(unknown.requiredCommands, ['npm run verify']);
  assert.equal(unknown.reviewRequired, true);
  assert.deepEqual(planChanges([]).requiredCommands, []);
  assert.equal(planChanges([]).verificationStatus, 'not-run');
  for (const file of ['../outside', '/absolute', 'C:/file', 'entry\\file', './entry/file', 'entry//file']) {
    assert.throws(() => planChanges([file]), /repository-relative/);
  }
});

test('impact rule targets and focused suites exist in the actual repository', () => {
  for (const rule of PATH_RULES) {
    for (const file of rule.reads) assert.ok(existsSync(join(root, file)), `${rule.id}: ${file}`);
    for (const suite of rule.suites) assert.ok(Object.hasOwn(SUITES, suite), suite);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.impact, 'node tools/change-impact.mjs');
  assert.ok(SUITES.tooling.test('change-impact.test.mjs'));
});

test('impact collects staged, unstaged, deleted, renamed and Unicode paths without changing Git state', t => {
  const { directory, git, write, commit } = fixture(t);
  for (const file of ['docs/old.md', 'delete.md', 'staged.md', 'unstaged.md', '.gitignore']) write(file);
  write('.gitignore', 'ignored/\n');
  commit();
  mkdirSync(join(directory, 'entry'), { recursive: true });
  renameSync(join(directory, 'docs/old.md'), join(directory, 'entry/renamed.ts'));
  unlinkSync(join(directory, 'delete.md'));
  write('staged.md', 'staged change');
  git(['add', '-A']);
  write('unstaged.md', 'unstaged change');
  write('docs/中文 space.md');
  write('ignored/private.txt');
  const before = git(['status', '--porcelain=v1', '-z']);
  assert.deepEqual(collectChangedPaths(directory), ['delete.md', 'docs/old.md', 'docs/中文 space.md', 'entry/renamed.ts', 'staged.md', 'unstaged.md'].sort());
  assert.equal(git(['status', '--porcelain=v1', '-z']), before);
});

test('impact base uses merge-base and includes branch commits plus working changes', t => {
  const { directory, git, write, commit } = fixture(t);
  write('base.md'); commit();
  git(['branch', 'baseline']);
  write('branch.md'); commit();
  git(['checkout', '-q', 'baseline']);
  write('base-only.md'); commit();
  git(['checkout', '-q', '-']);
  write('working.md');
  assert.deepEqual(collectChangedPaths(directory, 'baseline'), ['branch.md', 'working.md']);
  assert.throws(() => collectChangedPaths(directory, 'missing-ref'));
});

test('impact supports a repository without commits and a clean working tree', t => {
  const { directory, write, commit } = fixture(t);
  write('first.md');
  assert.deepEqual(collectChangedPaths(directory), ['first.md']);
  commit();
  assert.deepEqual(collectChangedPaths(directory), []);
});

test('impact CLI emits parseable planning-only JSON and rejects invalid options', () => {
  const args = ['--json', '--paths', 'docs/README.md'];
  const result = spawnSync(process.execPath, ['tools/change-impact.mjs', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.verificationStatus, 'not-run');
  assert.deepEqual(plan.paths, ['docs/README.md']);
  for (const invalid of [['--typo'], ['--base'], ['--paths'], ['--base', 'HEAD', '--paths', 'docs/a.md'], ['--json', '--json']]) {
    assert.throws(() => main(invalid), /Usage:/);
  }
  const invalid = spawnSync(process.execPath, ['tools/change-impact.mjs', '--typo'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Usage:/);
});
