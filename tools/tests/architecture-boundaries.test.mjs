// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(join(dir, entry.name)) : /\.(ts|ets)$/.test(entry.name) ? [join(dir, entry.name)] : []);
}
test('resolved relative module graph has no cycles; models and backends never import pages', () => {
  const files = walk(root), graph = new Map(), violations = [];
  for (const file of files) {
    const edges = [];
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:import|export)\s+(?:type\s+)?[^;]*?from\s*['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const base = resolve(dirname(file), match[1]);
      const target = [base, base + '.ts', base + '.ets', join(base, 'index.ts')].find(p => files.includes(p));
      if (!target) continue;
      edges.push(target);
      if (/^(model|backend)[\\/]/.test(relative(root, file)) && /^pages[\\/]/.test(relative(root, target))) {
        violations.push(`${relative(root, file)} -> ${relative(root, target)}`);
      }
    }
    graph.set(file, edges);
  }
  const visiting = new Set(), done = new Set();
  function visit(file, stack = []) {
    if (visiting.has(file)) { violations.push([...stack, file].map(p => relative(root, p)).join(' -> ')); return; }
    if (done.has(file)) return;
    visiting.add(file);
    for (const next of graph.get(file) ?? []) visit(next, [...stack, file]);
    visiting.delete(file); done.add(file);
  }
  for (const file of files) visit(file);
  assert.deepEqual(violations, []);
  assert.ok(existsSync(join(root, 'model/navigation/PageParams.ts')));
});
