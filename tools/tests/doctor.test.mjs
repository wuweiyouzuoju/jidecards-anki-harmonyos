// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateEnvironment, projectToolchainCommands } from '../doctor.mjs';

test('resolves the workspace-local Rust toolchain without changing global PATH', () => {
  const commands = projectToolchainCommands('C:/workspace/work/toolchains');
  const exe = process.platform === 'win32' ? '\\.exe' : '';

  assert.match(commands.rustc, new RegExp(`work[\\\\/]toolchains[\\\\/]cargo[\\\\/]bin[\\\\/]rustc${exe}$`));
  assert.match(commands.cargo, new RegExp(`work[\\\\/]toolchains[\\\\/]cargo[\\\\/]bin[\\\\/]cargo${exe}$`));
});

test('reports required and optional toolchain gaps separately', () => {
  const result = evaluateEnvironment({
    node: '24.18.0',
    protoc: 'libprotoc 31.1', ankiCheckout: '/anki/rslib/Cargo.toml', rustfmt: 'rustfmt', clippy: 'clippy',
    git: '2.50.0',
    devEcoRoot: 'C:/DevEco',
    harmonyApi: 23,
    java: '21.0.0',
    rustc: null,
    cargo: null,
    ohosClang: 'C:/DevEco/clang.exe',
    cmake: 'C:/DevEco/cmake.exe',
    ninja: 'C:/DevEco/ninja.exe',
    hvigor: 'C:/DevEco/hvigorw.bat'
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ['rustc', 'cargo']);
  assert.deepEqual(result.missingOptional, []);
});

test('rejects a compile SDK below the locked API 23 baseline', () => {
  const result = evaluateEnvironment({
    node: '24.18.0',
    protoc: 'libprotoc 31.1', ankiCheckout: '/anki/rslib/Cargo.toml', rustfmt: 'rustfmt', clippy: 'clippy',
    git: '2.50.0',
    devEcoRoot: 'C:/DevEco',
    harmonyApi: 18,
    java: '21.0.0',
    rustc: '1.92.0',
    cargo: '1.92.0',
    ohosClang: 'clang',
    cmake: 'cmake',
    ninja: 'ninja',
    hvigor: 'hvigor'
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /compile SDK API 23/);
});

test('accepts the fully pinned toolchain', () => {
  const result = evaluateEnvironment({
    node: '24.18.0',
    protoc: 'libprotoc 31.1', ankiCheckout: '/anki/rslib/Cargo.toml', rustfmt: 'rustfmt', clippy: 'clippy',
    git: '2.50.0',
    devEcoRoot: 'C:/DevEco',
    harmonyApi: 23,
    java: '21.0.0',
    rustc: '1.92.0',
    cargo: '1.92.0',
    ohosClang: 'clang',
    cmake: 'cmake',
    ninja: 'ninja',
    hvigor: 'hvigor'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('requires the bundled Java runtime used to package HAP files', () => {
  const result = evaluateEnvironment({
    node: '24.18.0',
    protoc: 'libprotoc 31.1', ankiCheckout: '/anki/rslib/Cargo.toml', rustfmt: 'rustfmt', clippy: 'clippy',
    git: '2.50.0',
    devEcoRoot: 'C:/DevEco',
    harmonyApi: 23,
    java: null,
    rustc: '1.92.0',
    cargo: '1.92.0',
    ohosClang: 'clang',
    cmake: 'cmake',
    ninja: 'ninja',
    hvigor: 'hvigor'
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ['java']);
});

test('diagnoses actual host test prerequisites before starting native validation', () => {
  const probe = { node: '24.18.0', git: 'git', devEcoRoot: 'DevEco', harmonyApi: 23,
    java: 'java', rustc: '1.92.0', cargo: 'cargo', ohosClang: 'clang', cmake: 'cmake', ninja: 'ninja', hvigor: 'hvigor',
    protoc: 'protoc', ankiCheckout: 'anki', rustfmt: 'fmt', clippy: 'clippy', hostTestMode: 'installed-msvc' };
  assert.equal(evaluateEnvironment(probe).ok, true, 'installed MSVC does not require Zig');
  for (const field of ['protoc', 'ankiCheckout', 'rustfmt', 'clippy']) {
    assert.deepEqual(evaluateEnvironment({ ...probe, [field]: null }).missingRequired, [field]);
  }
  assert.deepEqual(evaluateEnvironment({ ...probe, hostTestMode: 'bundled-gnu' }).missingRequired, ['cargoZigbuild', 'zig']);
  assert.equal(evaluateEnvironment({ ...probe, node: '18.20.0' }).ok, false);
});
