// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  parseJideChoiceDeck, jideChoiceNoteFields, jideChoiceQuestionFromNote,
  JIDE_CHOICE_MAX_BYTES, JIDE_CHOICE_NOTETYPE_FIELDS, JIDE_CHOICE_NOTETYPE_NAME,
  JIDE_CHOICE_FRONT, JIDE_CHOICE_BACK, JIDE_CHOICE_CSS
} from '../entry/src/main/ets/model/JideChoice.ts';

// 这个 ID 与 v1 字段和模板绑定；结构升级必须另开版本，不能生成随机类型。
export const CHOICE_MODEL_ID = 1865040927;

export function readChoiceSource(path) {
  const bytes = readFileSync(path);
  if (bytes.length > JIDE_CHOICE_MAX_BYTES) throw new Error('package_too_large');
  return parseJideChoiceDeck(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function prepareChoicePackage(deck) {
  const deckId = Number.parseInt(createHash('sha256').update(`jidecards.choice.deck:${deck.id}`).digest('hex').slice(0, 12), 16) + 1;
  return {
    namespace: deck.id, deckId, title: deck.title,
    modelId: CHOICE_MODEL_ID, modelName: JIDE_CHOICE_NOTETYPE_NAME,
    fields: JIDE_CHOICE_NOTETYPE_FIELDS, qfmt: JIDE_CHOICE_FRONT, afmt: JIDE_CHOICE_BACK, css: JIDE_CHOICE_CSS,
    notes: deck.questions.map(question => ({ id: question.id, fields: jideChoiceNoteFields(question) }))
  };
}

function python(args) {
  const command = process.env.JIDECARDS_CHOICE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(command, [fileURLToPath(new URL('./choice-package.py', import.meta.url)), ...args],
    { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, windowsHide: true });
  if (result.error) throw new Error(`Cannot run Python (${command}): ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Python exited with ${result.status}`);
  return result.stdout;
}

export function inspectChoicePackage(path) {
  const archive = JSON.parse(python(['inspect', resolve(path)]));
  if (archive.notes.length === 0) throw new Error('empty_choice_package');
  const guids = new Set();
  for (const note of archive.notes) {
    if (guids.has(note.guid)) throw new Error('duplicate_note_guid');
    guids.add(note.guid);
    const question = jideChoiceQuestionFromNote(note.fields, note.fieldNames);
    if (question === null) throw new Error('unrecognized_choice_note');
    // 检查打包器实际写出的模板，防止隐藏答案或把 JSON 泄露到普通客户端。
    if (note.qfmt !== JIDE_CHOICE_FRONT || note.afmt !== JIDE_CHOICE_BACK) throw new Error('choice_template_mismatch');
  }
  return archive;
}

export function buildChoicePackage(sourcePath, outputPath) {
  if (extname(outputPath).toLowerCase() !== '.apkg') throw new Error('output_must_end_in_apkg');
  const deck = readChoiceSource(sourcePath);
  const temporary = mkdtempSync(join(tmpdir(), 'jidecards-choice-'));
  try {
    const manifestPath = join(temporary, 'package.json');
    const stagedPath = join(temporary, 'deck.apkg');
    writeFileSync(manifestPath, JSON.stringify(prepareChoicePackage(deck)), 'utf8');
    python(['build', manifestPath, stagedPath]);
    const inspected = inspectChoicePackage(stagedPath);
    if (inspected.notes.length !== deck.questions.length) throw new Error('package_note_count_mismatch');
    // 默认不覆盖已有题库；打包失败也不会留下半成品作为交付文件。
    copyFileSync(stagedPath, resolve(outputPath), constants.COPYFILE_EXCL);
    return inspected.notes.length;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function main(args) {
  if (args.length === 2 && args[0] === 'validate') {
    const deck = readChoiceSource(args[1]);
    console.log(`Valid choice source: ${deck.questions.length} questions (${deck.id})`);
  } else if (args.length === 3 && args[0] === 'build') {
    console.log(`Built and checked ${buildChoicePackage(args[1], args[2])} questions: ${resolve(args[2])}`);
  } else if (args.length === 2 && args[0] === 'inspect') {
    console.log(`Valid generated APKG: ${inspectChoicePackage(args[1]).notes.length} choice notes`);
  } else {
    throw new Error('Usage: node tools/choice-package.mjs validate source.json | build source.json output.apkg | inspect output.apkg');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`[choice-package] ${error.message}`);
    process.exitCode = 1;
  }
}
