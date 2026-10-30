// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ignoredDirectories = new Set([
  '.cxx', '.git', '.hvigor', '.idea', 'build', 'node_modules', 'oh_modules', 'target',
  'third_party', 'work'
]);
const textExtensions = /\.(ets|ts|mjs|js|json5?|md|txt|toml|rs|c|cpp|h|ps1|cmd)$/i;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : walk(absolute);
    }
    return [relative];
  });
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

test('owned paths and text use only the jidecards brand', () => {
  const legacy = Buffer.from('43617264427269646765', 'hex').toString('utf8');
  const forbidden = [legacy, legacy.toLowerCase()];
  const files = walk(root);
  const badPaths = files.filter((file) => forbidden.some((name) => file.includes(name)));
  const badText = files.filter((file) => textExtensions.test(file))
    .filter((file) => forbidden.some((name) => read(file).includes(name)));

  assert.deepEqual(badPaths, []);
  assert.deepEqual(badText, []);
});

test('Harmony and native identifiers agree on jidecards', () => {
  assert.match(read('AppScope/app.json5'), /"bundleName":\s*"com\.jide\.kapian"/);
  assert.match(read('native/napi_bridge/oh-package.json5'), /"name":\s*"libjidecards\.so"/);
  assert.match(read('native/napi_bridge/src/native_module.cpp'), /\.nm_modname\s*=\s*"jidecards"/);
  assert.match(read('entry/src/main/ets/backend/后端客户端.ts'), /from 'libjidecards\.so'/);
  assert.match(read('AppScope/resources/base/element/string.json'), /"value":\s*"记得闪卡"/);
});
