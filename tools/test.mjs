// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkNodeRuntime } from './node-runtime.mjs';
import { selectTests, SUITES } from './test-suites.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error('Usage: npm test -- [all|<suite>|--list]');
  if (args[0] === '--list') {
    for (const suite of ['all', ...Object.keys(SUITES)]) console.log(`${suite}: ${selectTests(root, suite).length} files`);
  } else {
    const problem = checkNodeRuntime();
    if (problem) throw new Error(problem);
    const suite = args[0] ?? 'all';
    const files = selectTests(root, suite);
    console.log(`[tests:${suite}] ${files.length} files${suite === 'all' ? '' : ' (focused feedback; final validation requires all)'}`);
    const result = spawnSync(process.execPath, ['--experimental-transform-types', '--import', './tools/tests/register-ts-hook.mjs',
      '--test', ...files], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`[tests:configuration] ${error.message}`);
  process.exitCode = 1;
}
