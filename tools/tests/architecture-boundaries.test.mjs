// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(join(dir, entry.name)) : /\.(ts|ets)$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

// Checks literal module dependencies, not runtime data flow or computed imports. HAP remains the compiler gate.
function imports(source) {
  return [...source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^;'"`]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(match => match[1] ?? match[2]);
}

function checkBoundaries(sources) {
  const graph = new Map(), violations = [];
  for (const [file, source] of sources) {
    const edges = [];
    for (const specifier of imports(source)) {
      if (!specifier.startsWith('.')) {
        edges.push(specifier);
        continue;
      }
      const base = posix.normalize(posix.join(posix.dirname(file), specifier));
      const target = [base, base + '.ts', base + '.ets', base + '.d.ts',
        posix.join(base, 'index.ts'), posix.join(base, 'index.ets')].find(p => sources.has(p));
      if (!target) { violations.push(`unresolved: ${file} -> ${specifier}`); continue; }
      edges.push(target);
      if (/^(model|backend|proto|stores|utils|components)\//.test(file) && /^pages\//.test(target)) {
        violations.push(`page dependency: ${file} -> ${target}`);
      }
      if (/^(model|backend|proto|stores|utils)\//.test(file) && /^components\//.test(target)) {
        violations.push(`UI dependency: ${file} -> ${target}`);
      }
    }
    graph.set(file, edges);
  }
  const visiting = new Set(), done = new Set();
  function visit(file, stack = []) {
    if (visiting.has(file)) { violations.push(`cycle: ${[...stack, file].join(' -> ')}`); return; }
    if (done.has(file)) return;
    visiting.add(file);
    for (const next of graph.get(file) ?? []) visit(next, [...stack, file]);
    visiting.delete(file); done.add(file);
  }
  function reachable(file, seen = new Set()) {
    for (const next of graph.get(file) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next); reachable(next, seen);
    }
    return seen;
  }
  for (const file of sources.keys()) {
    visit(file);
    if (/^(model|proto)\/.*\.ts$/.test(file)) {
      for (const dependency of reachable(file)) {
        if (!sources.has(dependency) || !/^(model|proto)\/.*\.ts$/.test(dependency)) {
          violations.push(`pure model dependency: ${file} -> ${dependency}`);
        }
      }
    }
    if (/backend\/agent\/(?:AgentRunner|AgentToolRegistry|.*Tools)\.ets$/.test(file)) {
      for (const dependency of reachable(file)) {
        if (/Agent(?:Draft|Action)Executor\.ets$/.test(dependency)) {
          violations.push(`tool reaches confirmation executor: ${file} -> ${dependency}`);
        }
      }
    }
  }
  return violations;
}

test('literal imports include re-exports, side effects and dynamic literals', () => {
  assert.deepEqual(imports(`import type { X } from './types';
import './side-effect';
export { X } from './barrel';
const later = import('./later');`), ['./types', './side-effect', './barrel', './later']);
});

test('architecture gate rejects missing imports, reverse dependencies, cycles and indirect platform access', () => {
  const sources = new Map([
    ['model/Policy.ts', "import './Helper'; import './Missing';"],
    ['model/Helper.ts', "export { value } from '../backend/Adapter';"],
    ['backend/Adapter.ets', "import '@kit.ArkData'; import '../components/Widget';"],
    ['components/Widget.ets', "import '../pages/Page';"],
    ['pages/Page.ets', "import '../model/Policy';"],
  ]);
  const errors = checkBoundaries(sources);
  for (const expected of ['unresolved:', 'UI dependency:', 'page dependency:', 'cycle:',
    'pure model dependency: model/Policy.ts -> @kit.ArkData']) {
    assert.ok(errors.some(error => error.startsWith(expected)), expected);
  }
});

test('tool layer cannot acquire a confirmation executor through a barrel', () => {
  assert.ok(checkBoundaries(new Map([
    ['backend/agent/AgentRunner.ets', "import './Shared';"],
    ['backend/agent/Shared.ets', "export * from './AgentActionExecutor';"],
    ['backend/agent/AgentActionExecutor.ets', ''],
  ])).some(error => error.startsWith('tool reaches confirmation executor:')));
  assert.deepEqual(checkBoundaries(new Map([
    ['model/Policy.ts', "import type { Value } from '../proto/Value';"],
    ['proto/Value.ts', ''],
    ['model/Preferences.ets', "import '@kit.ArkData';"],
  ])), []);
});

test('repository has resolved acyclic imports, pure TS models, and isolated UI and confirmation executors', () => {
  const sources = new Map(walk(root).map(file =>
    [relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')]));
  assert.deepEqual(checkBoundaries(sources), []);
  assert.ok(existsSync(join(root, 'model/navigation/PageParams.ts')));
});
