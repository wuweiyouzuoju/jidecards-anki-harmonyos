// SPDX-License-Identifier: AGPL-3.0-or-later
// 显式运行：需要 Python + genanki；不让便携的 npm test 隐式依赖本机 Python。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChoicePackage, inspectChoicePackage } from './choice-package.mjs';

const directory = mkdtempSync(join(tmpdir(), 'choice-package-integration-'));
try {
  const sample = fileURLToPath(new URL('../docs/examples/choice-demo.json', import.meta.url));
  const fixture = fileURLToPath(new URL('../docs/examples/choice-demo.apkg', import.meta.url));
  const first = join(directory, 'first.apkg');
  assert.equal(buildChoicePackage(sample, first), 3);
  const original = inspectChoicePackage(first);
  assert.deepEqual(original, inspectChoicePackage(fixture));
  const modified = JSON.parse(readFileSync(sample, 'utf8'));
  modified.title = '重命名示例';
  modified.questions[0].prompt = 'Updated prompt: <literal> & 中文 😀';
  const sourcePath = join(directory, 'modified.json');
  writeFileSync(sourcePath, JSON.stringify(modified));
  const second = join(directory, 'second.apkg');
  buildChoicePackage(sourcePath, second);
  const updated = inspectChoicePackage(second);
  assert.deepEqual(original.notes.map(n => n.guid), updated.notes.map(n => n.guid));
  assert.notEqual(original.notes[0].fields[0], updated.notes[0].fields[0]);
  assert.match(updated.notes[0].fields[0], /&lt;literal&gt; &amp; 中文 😀/);
  const before = readFileSync(first);
  assert.throws(() => buildChoicePackage(sourcePath, first), /EEXIST/);
  assert.deepEqual(readFileSync(first), before);
  modified.questions[0].answer = ['missing'];
  writeFileSync(sourcePath, JSON.stringify(modified));
  const invalid = join(directory, 'invalid.apkg');
  assert.throws(() => buildChoicePackage(sourcePath, invalid), /answer_option_invalid/);
  assert.equal(existsSync(invalid), false);
  writeFileSync(invalid, 'not a zip');
  assert.throws(() => inspectChoicePackage(invalid));
  console.log('Choice APKG integration passed: ZIP/SQLite, single/multiple/ten-option examples, Unicode, stable GUIDs, no overwrite, invalid inputs.');
} finally { rmSync(directory, { recursive: true, force: true }); }
