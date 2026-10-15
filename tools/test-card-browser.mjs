// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const script of ['appearance', 'colors', 'template', 'flip', 'authorization']) {
  console.log(`Card browser regression: ${script}`);
  const result = spawnSync(process.execPath, ['--experimental-transform-types',
    '--import', './tools/tests/register-ts-hook.mjs', `tools/test-card-${script}-browser.mjs`],
  {cwd: root, stdio: 'inherit', env: process.env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
