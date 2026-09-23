// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native wrapper applies a pristine patch, tolerates repeated builds, and rejects conflicts',
  { skip: process.platform !== 'win32' }, t => {
    const root = mkdtempSync(join(tmpdir(), 'jidecards-native-wrapper-'));
    t.after(() => {
      assert.equal(dirname(resolve(root)), resolve(tmpdir()));
      assert.ok(root.includes('jidecards-native-wrapper-'));
      rmSync(root, { recursive: true, force: true });
    });
    for (const folder of ['tools/patches', 'third_party/anki', 'bin']) {
      mkdirSync(join(root, folder), { recursive: true });
    }
    copyFileSync(new URL('../build-native.ps1', import.meta.url), join(root, 'tools/build-native.ps1'));
    const input = join(root, 'third_party/anki/input.txt');
    writeFileSync(input, 'before\n');
    writeFileSync(join(root, 'tools/patches/anki-compact-import-log.patch'),
      'diff --git a/input.txt b/input.txt\n--- a/input.txt\n+++ b/input.txt\n@@ -1 +1 @@\n-before\n+after\n');
    const calls = join(root, 'calls.txt');
    writeFileSync(join(root, 'bin/cargo.cmd'), `@echo off\r\necho %*>>"${calls}"\r\nexit /b 0\r\n`);
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'path' || key === 'JIDECARDS_TOOLCHAINS') delete env[key];
    }
    env.PATH = join(root, 'bin') + delimiter + (process.env.PATH ?? process.env.Path);
    const build = () => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', join(root, 'tools/build-native.ps1'), '-Target', 'host-test'], { cwd: root, env, encoding: 'utf8' });
    for (let run = 0; run < 2; run++) {
      const result = build();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(readFileSync(input, 'utf8').replaceAll('\r\n', '\n'), 'after\n');
    }
    const beforeConflict = readFileSync(calls, 'utf8');
    assert.equal(beforeConflict.trim().split(/\r?\n/).length, 6, 'both invocations reach fmt, clippy, test');
    writeFileSync(input, 'conflicting upstream\n');
    const conflict = build();
    assert.notEqual(conflict.status, 0);
    assert.equal(readFileSync(input, 'utf8'), 'conflicting upstream\n');
    assert.equal(readFileSync(calls, 'utf8'), beforeConflict, 'conflict never reaches compilation');
  });
