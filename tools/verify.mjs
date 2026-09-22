// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkNodeRuntime } from './node-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] ?? 'all';
function run(stage, command, args) {
  console.log(`[verify:${stage}] starting`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${stage} failed (${result.status ?? result.error?.message}).`);
  console.log(`[verify:${stage}] passed`);
}
try {
  if (!['all', 'repo', 'native'].includes(mode) || process.argv.length > 3) throw new Error('Usage: npm run verify -- [all|repo|native]');
  const problem = checkNodeRuntime();
  if (problem) throw new Error(problem);
  if (mode !== 'repo') {
    if (process.platform !== 'win32') throw new Error('Native/HAP validation requires the Windows DevEco host; use repo for portable checks.');
    run('environment', process.execPath, ['tools/doctor.mjs']);
  }
  run('repository', process.execPath, ['tools/test.mjs', 'all']);
  if (mode !== 'repo') {
    run('native', 'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/build-native.ps1', '-Target', 'host-test']);
    run('rpc-index', process.execPath, ['tools/verify-rpc-index.mjs']);
  }
  if (mode === 'all') {
    run('hap', 'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/build-app.ps1', '-Clean']);
  }
  console.log(`[verify] ${mode} passed. ${mode === 'all' ? 'Device behavior remains a separate acceptance step.' : 'This does not certify HAP/device behavior.'}`);
} catch (error) {
  console.error(`[verify] ${error.message}`);
  process.exitCode = 1;
}
