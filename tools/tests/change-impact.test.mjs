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

test('new settings components and shared interface contracts route development to JIDE cognition checks', () => {
  for(const file of ['entry/src/main/ets/components/settings/future/NewOption.ets',
    'entry/src/main/ets/components/设置面板.ets','entry/src/main/ets/model/SettingsStructure.ts',
    'entry/src/main/ets/model/SettingsNavigation.ts','entry/src/main/ets/model/AppInterface.ts',
    'entry/src/main/ets/model/navigation/AppNavigation.ts','entry/src/main/ets/utils/SettingsStructureText.ets']) {
    const plan=planChanges([file],{kind:'behavior'});
    assert.ok(plan.reads.includes('docs/development/agent.md'),file);
    assert.ok(plan.reads.includes('docs/development/coding-agent.md'),file);
    assert.ok(plan.requiredCommands.includes('npm test -- agent'),file);
    assert.equal(plan.validationMode,'focused');
  }
});

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

test('impact merges related checks without attaching full repository or HAP validation', () => {
  const plan = planChanges(['docs/README.md', 'entry/src/main/ets/model/HomeSyncController.ts', 'native/core.rs']);
  assert.ok(plan.requiredCommands.includes('npm test -- home'));
  assert.ok(plan.requiredCommands.includes('npm test -- sync'));
  assert.ok(plan.requiredCommands.includes('node --test tools/tests/documentation-contract.test.mjs'));
  assert.ok(plan.requiredCommands.some(command => command.includes('build-native.ps1 -Target host-test')));
  assert.equal(plan.requiredCommands.some(command => /verify|build:app/.test(command)), false);
  assert.ok(plan.focusedCommands.includes('npm test -- home'));
  assert.ok(plan.focusedCommands.includes('npm test -- sync'));
  assert.ok(plan.reads.includes('.agents/rules/paths/native.md'));
  assert.equal(plan.deviceReview, true);
  assert.equal(plan.verificationStatus, 'not-run');
  assert.equal(plan.validationMode, 'native');
  assert.deepEqual(planChanges(['native/core.rs']).requiredCommands,
    ['powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-native.ps1 -Target host-test']);
  assert.deepEqual(planChanges(['docs/README.md']).requiredCommands,
    ['node --test tools/tests/documentation-contract.test.mjs']);
  for (const file of ['native/agent-sandbox/README.md', 'entry/src/main/ets/components/common/README.md',
    'tools/patches/README.md']) {
    const docs = planChanges([file]);
    assert.equal(docs.changeKind, 'cosmetic');
    assert.deepEqual(docs.requiredCommands, ['node --test tools/tests/documentation-contract.test.mjs']);
  }
});

test('impact covers build configuration, RPC, runtime Agent and source tests', () => {
  for (const file of ['build-profile.json5', 'AppScope/app.json5', 'tools/build-native.ps1', 'tools/patches/core.patch',
    'tools/verify.mjs', 'entry/oh-package-lock.json5', 'package-lock.json', 'UPSTREAM.lock', 'Cargo.lock',
    'tools/rpc-index-methods.json', 'tools/generate-rpc-index.mjs', 'native/rsharmony/src/rpc_ids.rs',
    'native/napi_bridge/src/bridge.cpp', 'entry/src/main/ets/proto/messages/StudyMessages.ts']) {
    assert.deepEqual(planChanges([file]).requiredCommands, ['npm run verify'], file);
    assert.deepEqual(planChanges([file], { kind: 'cosmetic' }).requiredCommands, ['npm run verify'], file);
  }
  assert.ok(planChanges(['entry/src/main/cpp/bridge.cpp']).reads.includes('.agents/rules/paths/native.md'));
  assert.ok(planChanges(['entry/src/main/ets/pages/AI制卡页.ets']).focusedCommands.includes('npm test -- agent'));
  assert.ok(planChanges(['entry/src/main/ets/pages/AI制卡页.ets']).reads.includes('.agents/adapters/arkts.md'));
  assert.ok(planChanges(['tools/tests/sync-automatic.test.mjs']).focusedCommands.includes('npm test -- sync'));
});

test('cosmetic edits retain resource checks without automatically testing or building the app', () => {
  const plan = planChanges(['entry/src/main/resources/base/element/string.json',
    'entry/src/main/resources/en_US/element/string.json', 'entry/src/main/resources/base/media/ic_study_flag.svg']);
  assert.equal(plan.changeKind, 'cosmetic');
  assert.equal(plan.validationMode, 'focused');
  assert.deepEqual(plan.requiredCommands, ['node --test tools/tests/i18n-contract.test.mjs']);
  assert.deepEqual(plan.focusedCommands, []);
  const page = 'entry/src/main/ets/pages/学习页.ets';
  assert.deepEqual(planChanges([page], { kind: 'cosmetic' }).requiredCommands, []);
  assert.ok(planChanges([page]).requiredCommands.includes('npm test -- study'));
  assert.equal(planChanges([page]).requiredCommands.some(command => /verify|build:app/.test(command)), false);
  assert.equal(planChanges(['entry/src/main/resources/rawfile/card.js']).changeKind, 'behavior');
  assert.ok(planChanges([page], { kind: 'cosmetic' }).notes.some(note => /resource\/reference review/.test(note)));
});

test('compilation and integration kinds explicitly select the extra validation they need', () => {
  const page = 'entry/src/main/ets/pages/学习页.ets';
  const compile = planChanges([page], { kind: 'compile' });
  assert.ok(compile.requiredCommands.includes('npm run build:app'));
  assert.equal(compile.requiredCommands.some(command => /Clean|SkipRust|verify/.test(command)), false);
  for (const kind of ['integration', 'release']) {
    assert.deepEqual(planChanges([page], { kind }).requiredCommands, ['npm run verify']);
  }
  assert.deepEqual(planChanges(['native/core.rs'], { kind: 'cosmetic' }).requiredCommands,
    ['powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-native.ps1 -Target host-test']);
  assert.deepEqual(planChanges(['native/agent-sandbox/src/lib.rs']).requiredCommands,
    ['npm test -- agent', 'powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-agent-sandbox.ps1 -Target host']);
  assert.ok(planChanges(['native/core.rs'], { kind: 'compile' }).requiredCommands.includes('npm run build:app'));
  assert.throws(() => planChanges([page], { kind: 'skip' }), /Unknown change kind/);
});

test('impact requires review for unknown paths and never claims empty changes passed', () => {
  const unknown = planChanges(['future-module/new.ts']);
  assert.deepEqual(unknown.unknownPaths, ['future-module/new.ts']);
  assert.deepEqual(unknown.requiredCommands, []);
  assert.equal(unknown.reviewRequired, true);
  assert.ok(unknown.notes.some(note => /choose checks before delivery/.test(note)));
  assert.deepEqual(planChanges(['future-module/new.ts'], { kind: 'integration' }).requiredCommands, ['npm run verify']);
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
  assert.equal(plan.changeKind, 'cosmetic');
  assert.deepEqual(plan.paths, ['docs/README.md']);
  const compile = JSON.parse(main(['--json', '--kind', 'compile', '--paths', 'entry/src/main/ets/pages/学习页.ets']));
  assert.ok(compile.requiredCommands.includes('npm run build:app'));
  assert.match(main(['--kind', 'cosmetic', '--paths', 'entry/src/main/ets/pages/学习页.ets']), /Selected checks:/);
  for (const invalid of [['--typo'], ['--base'], ['--paths'], ['--base', 'HEAD', '--paths', 'docs/a.md'],
    ['--json', '--json'], ['--kind'], ['--kind', 'skip'], ['--kind', 'behavior', '--kind', 'behavior'],
    ['--paths', 'docs/a.md', '--kind', 'cosmetic']]) {
    assert.throws(() => main(invalid), /Usage:/);
  }
  const invalid = spawnSync(process.execPath, ['tools/change-impact.mjs', '--typo'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Usage:/);
});
