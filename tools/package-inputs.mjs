// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function sourceClosure(root, entries) {
  const collected = new Set();
  function visit(relative) {
    if (collected.has(relative)) return;
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep) || !existsSync(absolute)) throw Error('Invalid source: ' + relative);
    collected.add(relative);
    for (const match of readFileSync(absolute, 'utf8').matchAll(/\b(?:import|export)\s+[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const base = path.resolve(path.dirname(absolute), match[1]);
      const dependency = ['', '.ts', '.ets'].map(extension => base + extension)
        .find(file => existsSync(file) && statSync(file).isFile());
      if (!dependency) throw Error('Unresolved shared dependency: ' + match[1]);
      visit(path.relative(root, dependency).replaceAll('\\', '/'));
    }
  }
  entries.forEach(visit);
  return [...collected].sort();
}

export function packageInputs(root) {
  const files = new Set(['oh-package.json5', 'build-profile.json5', 'hvigorfile.ts', 'LICENSE', 'src/main/module.json5',
    ...sourceClosure(root, ['Index.ets'])]);
  const resources = path.join(root, 'src/main/resources');
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.add(path.relative(root, file).replaceAll('\\', '/'));
    }
  }
  if (existsSync(resources)) visit(resources);
  const native=path.join(root,'src/main/cpp');
  if(existsSync(native)) visit(native);
  return [...files].sort();
}
