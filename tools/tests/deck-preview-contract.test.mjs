// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('deck detail preview queries all cards and mounts the existing read-only preview', () => {
  const panel = read('entry/src/main/ets/components/牌组详情面板.ets');
  const home = read('entry/src/main/ets/pages/首页.ets');
  const preview = read('entry/src/main/ets/components/browser/卡片预览页.ets');
  const browser = read('entry/src/main/ets/pages/浏览页.ets');
  assert.match(panel, /app\.string\.deck_preview/);
  assert.match(panel, /预览: \(\) => void/);
  assert.match(home, /打开牌组预览/);
  assert.match(home, /deckHistorySearch\(/);
  assert.match(home, /搜索服务实例\.搜索卡片/);
  assert.match(home, /卡片预览页\(\{/);
  assert.doesNotMatch(home, /调度器服务/);
  assert.doesNotMatch(home, /previewInitialSide/, 'preview always starts on the question, like Anki');
  assert.doesNotMatch(home, /显示编辑字段|显示更多菜单: true/, 'top bar is shared by both preview entries');
  assert.match(home, /onPositionChanged: \(index: number\): void => \{/);
  assert.match(home, /onEditField: \(卡片ID: number\): void => \{ this\.关闭预览并编辑\(卡片ID\); \}/);
  assert.match(home, /onCreateWithAgent: \(\): void => \{ this\.关闭预览并进入Agent制卡\(\); \}/);
  assert.doesNotMatch(preview, /@Prop 初始面/, 'preview always starts on the question, like Anki');
  assert.match(preview, /构建卡片HTML\(this\.已渲染, 'answer', this\.isDark\)/);
  assert.match(preview, /预览更多菜单/);
  assert.match(preview, /app\.string\.study_edit_note/);
  assert.match(preview, /app\.string\.ai_card_title/);
  assert.match(preview, /bindMenu\(this\.预览更多菜单\(\)\)/);
  assert.match(browser, /editCardId\?: number/);
  assert.match(browser, /pageEditCardId: number = -1/);
  assert.match(browser, /if \(this\.pageEditCardId > 0\)/);
});

test('deck preview resources exist in both base and en_US', () => {
  const zh = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .map((entry) => entry.name);
  const en = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .map((entry) => entry.name);
  for (const key of ['deck_preview', 'deck_preview_empty', 'deck_preview_error']) {
    assert.ok(zh.includes(key), `zh ${key}`);
    assert.ok(en.includes(key), `en ${key}`);
  }
  const zhValue = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string
    .find((entry) => entry.name === 'browser_preview_position').value;
  const enValue = JSON.parse(read('entry/src/main/resources/en_US/element/string.json')).string
    .find((entry) => entry.name === 'browser_preview_position').value;
  assert.equal(zhValue, '%d/%d');
  assert.notEqual(enValue, zhValue);
});
