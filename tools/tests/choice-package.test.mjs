// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareChoicePackage, readChoiceSource, CHOICE_MODEL_ID } from '../choice-package.mjs';
import { jideChoiceQuestionFromNote, parseJideChoiceDeck } from '../../entry/src/main/ets/model/JideChoice.ts';

const samplePath = fileURLToPath(new URL('../../docs/examples/choice-demo.json', import.meta.url));
const source = JSON.parse(readFileSync(samplePath, 'utf8'));
const cli = fileURLToPath(new URL('../choice-package.mjs', import.meta.url));

test('packaging preparation uses runtime fields and stable deck identity across content edits', () => {
  const deck = readChoiceSource(samplePath);
  const pack = prepareChoicePackage(deck);
  assert.equal(pack.modelId, CHOICE_MODEL_ID);
  assert.equal(pack.notes.length, 3);
  for (let i = 0; i < pack.notes.length; i++) {
    assert.deepEqual(jideChoiceQuestionFromNote(pack.notes[i].fields, pack.fields), deck.questions[i]);
  }
  assert.equal(pack.deckId, prepareChoicePackage({ ...deck, title: 'Renamed' }).deckId);
  assert.notEqual(pack.deckId, prepareChoicePackage({ ...deck, id: 'independent.deck' }).deckId);
});

test('source validator rejects typos, missing IDs, duplicate option IDs and Anki field separators', () => {
  for (const change of [
    d => { delete d.id; },
    d => { d.questions[0].feedbakSeconds = 3; },
    d => { d.questions[0].options[1].id = d.questions[0].options[0].id; },
    d => { d.questions[0].prompt = 'a\x1fb'; },
    d => { d.questions[0].prompt = '  '; },
    d => { d.questions[1].answer = ['red']; }
  ]) {
    const changed = structuredClone(source); change(changed);
    assert.throws(() => parseJideChoiceDeck(JSON.stringify(changed)));
  }
});

test('public CLI validates without Python and returns nonzero for invalid or malformed UTF-8 sources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'choice-cli-test-'));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, JIDECARDS_CHOICE_PYTHON: 'no-python-needed' }
  });
  try {
    assert.equal(run('validate', samplePath).status, 0);
    const invalid = join(directory, 'bad.json');
    writeFileSync(invalid, '{');
    assert.notEqual(run('validate', invalid).status, 0);
    writeFileSync(invalid, Buffer.from([0xff, 0xfe]));
    assert.notEqual(run('validate', invalid).status, 0);
    writeFileSync(invalid, '中'.repeat(800000));
    assert.match(run('validate', invalid).stderr, /package_too_large/);
    assert.notEqual(run('build', samplePath, join(directory, 'not-a-package.json')).status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('public schema and authoring sample agree on the released version and supported option range', () => {
  const schema = JSON.parse(readFileSync(new URL('../../docs/schemas/choice-source-v1.schema.json', import.meta.url)));
  assert.equal(schema.properties.format.const, source.format);
  assert.equal(schema.properties.version.const, source.version);
  assert.equal(schema.$defs.question.properties.options.minItems, 2);
  assert.equal(schema.$defs.question.properties.options.maxItems, 10);
  assert.equal(source.questions[2].options.length, 10);
});
