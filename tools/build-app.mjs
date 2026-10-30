// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, unlinkSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
// Windows 沿用已有入口，Mac 使用同一锁定源码与原生目标。
if (process.platform === 'win32') {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/build-app.ps1', ...args], { cwd: root, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const unsigned = args.includes('--unsigned');
const allowed = new Set(['--unsigned', '--skip-rust', '--release', '--clean']);
if (args.some(a => !allowed.has(a))) throw Error('Options: --unsigned --skip-rust --release --clean');
const studio = process.env.DEVECO_STUDIO_HOME || '/Applications/DevEco-Studio.app/Contents';
const java = process.env.JAVA_HOME || path.join(studio, 'jbr/Contents/Home');
const env = { ...process.env, DEVECO_STUDIO_HOME: studio, JAVA_HOME: java, DEVECO_SDK_HOME: path.join(studio, 'sdk') };
if (unsigned) env.HARMONY_UNSIGNED = '1';
const release = args.includes('--release');
function run(cmd, argv, options = {}) {
  const r = spawnSync(cmd, argv, { cwd: root, env, stdio: 'inherit', ...options });
  if (r.error || r.status !== 0) throw r.error || Error(`${cmd} failed (${r.status})`);
}
mkdirSync(path.join(root, '.hvigor'), { recursive: true });
const lock = path.join(root, '.hvigor/mac-build.lock');
const fd = openSync(lock, 'wx');
try {
  if (!unsigned) run(process.execPath, ['tools/check-signing.mjs']);
  run(process.execPath, ['tools/generate-agent-sandbox-notices.mjs', '--check']);
  const patches = ['anki-compact-import-log.patch', 'anki-deck-preview.patch', 'anki-fsrs-workload-params.patch', 'anki-marking-sync-conflicts.patch', 'anki-peer-progress.patch'];
  for (const patch of patches) {
    const flags = ['--recount', '--ignore-space-change', '--ignore-whitespace', '--directory=third_party/anki', `tools/patches/${patch}`];
    const reverse = spawnSync('git', ['apply', '--check', '--reverse', ...flags], { cwd: root, stdio: 'ignore' });
    if (reverse.status !== 0) { run('git', ['apply', '--check', ...flags]); run('git', ['apply', ...flags]); }
  }
  for (const target of ['aarch64-unknown-linux-ohos', 'x86_64-unknown-linux-ohos']) {
    run('cargo', ['build', '--manifest-path', 'native/agent-sandbox/Cargo.toml', '--locked', '--release', '--lib', '--target', target]);
    if (!args.includes('--skip-rust')) run('cargo', ['build', '--locked', '-p', 'jidecards_core', '--features', 'anki-core', '--target', target, ...(release ? ['--release'] : [])]);
  }
  run(process.execPath, [path.join(studio, 'tools/ohpm/bin/pm-cli.js'), 'install', '--all']);
  const buildLog = path.join(root, '.hvigor/last-build.log');
  const r = spawnSync(process.execPath, [path.join(studio, 'tools/hvigor/bin/hvigorw.js'), ...(args.includes('--clean') ? ['clean'] : []), 'assembleHap', '--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default', '-p', `buildMode=${release ? 'release' : 'debug'}`, '--no-daemon'], { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(buildLog, (r.stdout || '') + (r.stderr || ''));
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error || r.status !== 0) throw r.error || Error('HAP build failed');
  const hap = path.join(root, `entry/build/default/outputs/default/entry-default-${unsigned ? 'unsigned' : 'signed'}.hap`);
  if (!existsSync(hap)) throw Error('Expected HAP was not produced');
  run(process.execPath, ['tools/verify-build-warnings.mjs', buildLog, ...(args.includes('--clean') ? ['--require-clean'] : [])]);
} finally { closeSync(fd); unlinkSync(lock); }
