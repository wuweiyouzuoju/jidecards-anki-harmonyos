// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLocalSigning, applyLocalSigning } from './signing-config.ts';
import JSON5 from 'json5';

const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const path = resolve(root, process.env.JIDECARDS_SIGNING_CONFIG || '.local/signing.json');
  if (!existsSync(path)) throw new Error('Create .local/signing.json from config/signing.example.json, or set JIDECARDS_SIGNING_CONFIG');
  const local = parseLocalSigning(readFileSync(path, 'utf8'));
  const profile = applyLocalSigning(JSON5.parse(readFileSync(resolve(root, 'build-profile.json5'), 'utf8')), local);
  if (!profile.app.products.some(product => product.name === 'default' && product.signingConfig)) throw new Error('Default product has no signing configuration');
  for (const config of local.signingConfigs) {
    for (const key of ['certpath', 'profile', 'storeFile']) {
      if (!existsSync(resolve(root, config.material[key]))) throw new Error(`Signing material file missing: ${key}`);
    }
  }
  console.log('Local signing configuration and material files verified.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
