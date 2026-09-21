// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export function loadPlatformModule(path, exportName, dependencies) {
  const source = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, { mode: 'transform' }) + ';return ' + exportName + ';')(...Object.values(dependencies));
}
