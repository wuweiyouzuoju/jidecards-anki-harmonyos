// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
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
    writeFileSync(join(tools, 'verify-build-warnings.mjs'), `import { readFileSync } from 'node:fs';
      const log = readFileSync(process.argv[2], 'utf8');
      process.exit(log.includes('WARN: fixture warning') && !log.includes('new diagnostic') ? 0 : 1);`);
    writeFileSync(join(devEco, 'tools/ohpm/bin/ohpm.bat'), '@echo off\r\nexit /b 0\r\n');
    const signed = join(output, 'entry-default-signed.hap');
    for (const scenario of ['warning', 'new-warning', 'unsigned', 'failure', 'missing']) {
      writeFileSync(signed, 'fixture');
      if (scenario === 'missing') rmSync(signed);
      const warning = scenario === 'unsigned' ? 'No signingConfig found for product default' :
        scenario === 'new-warning' ? 'WARN: new diagnostic' : 'WARN: fixture warning';
      writeFileSync(join(devEco, 'tools/hvigor/bin/hvigorw.bat'), `@echo off\r\necho ${warning} 1>&2\r\necho ARGS=%*>>"${join(root, 'hvigor-args.log')}"\r\n` +
        `exit /b ${scenario === 'failure' ? 7 : 0}\r\n`);
      const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(tools, 'build-app.ps1'), '-SkipRust'], {
        cwd: root, env: { ...process.env, DEVECO_HOME: devEco }, encoding: 'utf8'
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, scenario === 'warning', `${scenario}: ${result.stdout}\n${result.stderr}`);
      assert.doesNotMatch(result.stdout + result.stderr, /Cannot convert null|ActionPreference/);
      assert.equal(JSON.parse(readFileSync(join(root, '.hvigor/build-warning-report.json'), 'utf8')).status, 'not-run',
        'each invocation clears previous gate status; this fixture verifier does not publish a report');
      if (scenario === 'warning') {
        assert.match(readFileSync(join(root, 'hvigor-args.log'), 'utf8'), /ARGS=.*(?:^| )assembleHap(?: |$)/,
          'Hvigor must receive assembleHap as one argument');
      }
    }
  });
