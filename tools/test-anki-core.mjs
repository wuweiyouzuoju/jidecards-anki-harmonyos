// SPDX-License-Identifier: AGPL-3.0-or-later
// Portable CI/local entry; Windows DevEco users may also run build-native.ps1 host-test.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.status}`);
}
try {
  const lock = Object.fromEntries(readFileSync(new URL('../UPSTREAM.lock', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => line.split('=')));
  // Archives are verified by protocol fingerprint. Never mistake the parent repo for Anki.
  run(process.execPath, ['tools/verify-rpc-index.mjs']);
  if (existsSync(new URL('../third_party/anki/.git', import.meta.url))) {
    const revision = spawnSync('git', ['-C', 'third_party/anki', 'rev-parse', '--short=7', 'HEAD'], {cwd: root, encoding: 'utf8'});
    if (revision.status !== 0 || revision.stdout.trim() !== lock.ANKI_RELEASE_COMMIT) throw new Error('Prepare the locked Anki checkout first');
    run('git', ['-C', 'third_party/anki', 'submodule', 'update', '--init', '--depth', '1', '--', 'ftl/core-repo', 'ftl/qt-repo']);
  } else {
    for (const name of ['core-repo', 'qt-repo']) {
      const folder = new URL(`../third_party/anki/ftl/${name}/`, import.meta.url);
      if (!existsSync(folder) || readdirSync(folder).length === 0) throw new Error(`Anki archive lacks ftl/${name}; prepare translations from the locked checkout`);
    }
  }
  const base = ['apply', '--recount', '--ignore-space-change', '--ignore-whitespace', '--directory=third_party/anki'];
  for (const name of ['anki-compact-import-log.patch', 'anki-deck-preview.patch', 'anki-fsrs-workload-params.patch', 'anki-marking-sync-conflicts.patch']) {
    const patch = `tools/patches/${name}`;
    const reverse = spawnSync('git', [...base, '--check', '--reverse', patch], {cwd: root, stdio: 'ignore'});
    if (reverse.status !== 0) { run('git', [...base, '--check', patch]); run('git', [...base, patch]); }
  }
  run('cargo', ['test', '-p', 'jidecards_core', '--features', 'anki-core', '--locked']);
  run(process.execPath, ['tools/verify-rpc-index.mjs']);
  run(process.execPath, ['tools/generate-rpc-index.mjs', '--check']);
} catch (error) { console.error(error.message); process.exitCode = 1; }
