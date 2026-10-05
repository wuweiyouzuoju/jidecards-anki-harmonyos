// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

function resourceKeys(relativePath) {
  return JSON.parse(read(relativePath)).string.map((item) => item.name).sort();
}

function etsFiles(relativeDirectory) {
  const directory = join(root, relativeDirectory);
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.ets'))
    .map((entry) => join(relativeDirectory, entry));
}

test('Chinese and English resources expose identical keys', () => {
  const english = 'entry/src/main/resources/en_US/element/string.json';
  assert.equal(existsSync(join(root, english)), true, 'English resources must exist');
  assert.deepEqual(resourceKeys(english), resourceKeys('entry/src/main/resources/base/element/string.json'));
});

test('localized strings preserve placeholder arguments and have unique keys', () => {
  const base = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const english = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string;
  const byKey = new Map(english.map(item => [item.name, item.value]));
  for (const entries of [base, english]) {
    assert.equal(new Set(entries.map(item => item.name)).size, entries.length, 'duplicate resource key');
  }
  const argumentsOf = value => [...value.matchAll(/%(?:(\d+)\$)?([ds])/g)]
    .map((match, index) => `${match[1] ?? index + 1}:${match[2]}`).sort();
  for (const item of base) {
    assert.deepEqual(argumentsOf(item.value), argumentsOf(byKey.get(item.name)), item.name);
  }
});

test('source and manifest string references survive resource cleanup', () => {
  const names = new Set([...resourceKeys('entry/src/main/resources/base/element/string.json'),
    ...resourceKeys('AppScope/resources/base/element/string.json')]);
  const directory = join(root, 'entry/src/main');
  for (const file of readdirSync(directory, { recursive: true })) {
    if (!/\.(ets|ts|json|json5|xml)$/.test(file)) continue;
    const source = readFileSync(join(directory, file), 'utf8');
    for (const match of source.matchAll(/(?:app\.string\.|\$string:)([a-zA-Z][a-zA-Z0-9_]*)/g)) {
      // Comments may document whole resource families using a trailing wildcard.
      if (source[match.index + match[0].length] === '*') continue;
      assert.ok(names.has(match[1]), `${file}: missing ${match[1]}`);
    }
  }
  // These two callers assemble names, so literal-reference scanning cannot find them.
  for (const suffix of ['none', 'red', 'orange', 'green', 'blue']) {
    assert.ok(names.has(`browser_action_flag_${suffix}`));
  }
  for (const suffix of ['aurora', 'forest', 'midnight', 'lagoon', 'sunset', 'lemon', 'minimal_gray', 'iridescent']) {
    assert.ok(names.has(`theme_color_${suffix}`));
  }
});

test('English resources are translated and contain no Chinese copy', () => {
  const english = 'entry/src/main/resources/en_US/element/string.json';
  assert.equal(existsSync(join(root, english)), true, 'English resources must exist');
  const zhItems = new Map(JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .map((item) => [item.name, item.value]));
  const allowedIdenticalValues = new Set(['working_name', 'entry_ability_desc', 'feedback_email', 'app_about_copyright', 'field_help_button', 'image_occlusion_c_label', 'stats_retention_rate', 'reminder_edit_time_colon', 'stats_range_p50', 'stats_range_p95', 'stats_range_p100', 'stats_retrievability_average_value', 'ai_agent_file_parsing']);
  for (const item of JSON.parse(read(english)).string) {
    assert.doesNotMatch(item.value, /[\u4e00-\u9fff]/, `${item.name} must be English`);
    // AI 是用户指定的跨语言入口名称，精确值另有入口回归约束。
    const markingSymbols = new Set(['card_mark_star_symbol', 'card_mark_flag_symbol', 'card_mark_selected_symbol']);
    if (!allowedIdenticalValues.has(item.name) && !markingSymbols.has(item.name) && item.name !== 'ai_agent_title') {
      assert.notEqual(item.value, zhItems.get(item.name), `${item.name} must not copy the base translation`);
    }
  }
});

test('language store uses the HarmonyOS preferred-language API', () => {
  const relativePath = 'entry/src/main/ets/model/语言存储.ets';
  assert.equal(existsSync(join(root, relativePath)), true, '语言存储 must exist');
  const source = read(relativePath);
  assert.match(source, /export type 语言模式 = 'zh-Hans' \| 'en'/);
  assert.match(source, /i18n\.System\.getAppPreferredLanguage/);
  assert.match(source, /i18n\.System\.setAppPreferredLanguage/);
  assert.doesNotMatch(source, /'system'/);
});

test('pages and components do not embed translated copy in Text, Button, or placeholders', () => {
  const rawCopy = /(?<![A-Za-z])(?:Text|Button)\(\s*(['"])(?![›▼✓⌄⌃×⚠≡]\1)[\s\S]*?\1\s*\)|placeholder:\s*(['"])[\s\S]*?\2/;
  const violations = [...etsFiles('entry/src/main/ets/components'), ...etsFiles('entry/src/main/ets/pages')]
    .filter((relativePath) => rawCopy.test(read(relativePath)));
  assert.deepEqual(violations, [], `resourceize user-facing literals: ${violations.join(', ')}`);
});

const translatedStatePatterns = [
    /(?:accessibilityDescription|accessibilityText)\s*\(\s*(['"`])[^'"`\n]+\1/,
    /showToast\s*\(\s*(['"`])[^'"`\n]+\1/,
    /showToast\s*\(\s*\{[^}]*?\bmessage\s*:\s*(['"`])[^'"`\n]+\1/,
    /this\.\w*(?:Error|Notice|Hint|Detail|Label|Title|Message)\s*=\s*(['"])[^'"\n]+\1/,
    /(?:const|let)\s+\w*(?:LABELS|Labels|Options|OPTIONS)\w*\s*:\s*string\[\]\s*=\s*\[[^\]]*(['"])[^'"\n]+\1/,
    /(?:getStringSync|format)\(\s*(['"])[^'"\n]+\1/
];
const embedsTranslatedState = source => translatedStatePatterns.some(pattern => pattern.test(source));

test('dynamic copy audit accepts resource-based accessibility and toast messages but rejects literal copy', () => {
  for (const source of [
    "Text().accessibilityText($r('app.string.today_recall_rate')).fontColor($r('app.color.text_secondary'))",
    "Text().accessibilityDescription(resourceText(context, $r('app.string.today_recall_rate')))",
    "promptAction.showToast({ message: resourceText(context, $r('app.string.today_recall_rate')), duration: 2000 })",
    "promptAction.showToast({\n message: resourceText(context, $r('app.string.today_recall_rate'))\n})"
  ]) assert.equal(embedsTranslatedState(source), false, source);
  for (const source of [
    "Text().accessibilityText('今日答对率')", "Text().accessibilityDescription('Recall rate')",
    "promptAction.showToast({ message: '保存成功', duration: 2000 })",
    "promptAction.showToast({ duration: 2000, message: 'Saved' })",
    "promptAction.showToast({\n duration: 2000,\n message: 'Saved'\n})",
    "this.errorMessage = 'Failed'"
  ]) assert.equal(embedsTranslatedState(source), true, source);
});

test('pages and components do not embed translated state, toast, a11y, select, or format copy', () => {
  const violations = [];
  for (const relativePath of [...etsFiles('entry/src/main/ets/components'), ...etsFiles('entry/src/main/ets/pages')]) {
    const source = read(relativePath);
    if (embedsTranslatedState(source)) {
      violations.push(relativePath);
    }
  }
  assert.deepEqual(violations, [], `resourceize user-facing state and dynamic copy: ${violations.join(', ')}`);
});

test('localized fallback errors do not dereference a missing ability context', () => {
  const source = read('entry/src/main/ets/pages/学习页.ets');
  assert.doesNotMatch(source, /if \(context === null\) \{[^}]*context\.resourceManager/);
});
