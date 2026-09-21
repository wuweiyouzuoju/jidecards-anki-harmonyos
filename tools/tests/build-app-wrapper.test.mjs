// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Windows PowerShell build wrapper tolerates stderr warnings but rejects unsigned output and failed commands',
  { skip: process.platform !== 'win32' }, t => {
    const root = mkdtempSync(join(tmpdir(), 'jidecards-build-wrapper-'));
    t.after(() => {
      assert.equal(dirname(resolve(root)), resolve(tmpdir()));
      assert.ok(root.includes('jidecards-build-wrapper-'));
      rmSync(root, { recursive: true, force: true });
    });
    const tools = join(root, 'tools'), devEco = join(root, 'sdk');
    mkdirSync(tools);
    for (const path of ['tools/ohpm/bin', 'tools/hvigor/bin']) mkdirSync(join(devEco, path), { recursive: true });
    const output = join(root, 'entry/build/default/outputs/default'); mkdirSync(output, { recursive: true });
    copyFileSync(new URL('../build-app.ps1', import.meta.url), join(tools, 'build-app.ps1'));
    writeFileSync(join(tools, 'check-signing.mjs'), 'process.exit(0);');
    writeFileSync(join(devEco, 'tools/ohpm/bin/ohpm.bat'), '@echo off\r\nexit /b 0\r\n');
    const signed = join(output, 'entry-default-signed.hap');
    for (const scenario of ['warning', 'unsigned', 'failure', 'missing']) {
      writeFileSync(signed, 'fixture');
      if (scenario === 'missing') rmSync(signed);
      const warning = scenario === 'unsigned' ? 'No signingConfig found for product default' : 'WARN: fixture warning';
      writeFileSync(join(devEco, 'tools/hvigor/bin/hvigorw.bat'), `@echo off\r\necho ${warning} 1>&2\r\nexit /b ${scenario === 'failure' ? 7 : 0}\r\n`);
      const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(tools, 'build-app.ps1'), '-SkipRust'], {
        cwd: root, env: { ...process.env, DEVECO_HOME: devEco }, encoding: 'utf8'
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, scenario === 'warning', `${scenario}: ${result.stdout}\n${result.stderr}`);
      assert.doesNotMatch(result.stdout + result.stderr, /Cannot convert null|ActionPreference/);
    }
  });
