// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = read('entry/src/main/ets/pages/学习页.ets');
const names = ['openStudyMenu', 'closeStudyMenu', 'selectStudyMenu', '处理按键'];
const methods = names.map(name => {
  const start = source.indexOf('  private ' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('KeyType', 'studyKeyName',
  stripTypeScriptTypes('class Page {' + methods.join('\n') + '}') + '; return Page;')(
  { Down: 0 }, key => key);

function harness() {
  const page = new Page();
  const events = [];
  Object.assign(page, { studyMenuOpen: false, Ctrl按下: true,
    stopStudyTimers: () => events.push('stop'), clearChoiceAutoAdvance: () => events.push('cancel'),
    startStudyTimers: () => events.push('resume'), scheduleChoiceAutoAdvance: () => events.push('schedule') });
  return { page, events };
}

test('opening pauses both timers; dismissing resumes exactly once', () => {
  const { page, events } = harness();
  page.openStudyMenu();
  assert.equal(page.studyMenuOpen, true);
  assert.equal(page.Ctrl按下, false);
  assert.deepEqual(events, ['stop', 'cancel']);
  page.closeStudyMenu(); page.closeStudyMenu();
  assert.equal(page.studyMenuOpen, false);
  assert.deepEqual(events, ['stop', 'cancel', 'resume', 'schedule']);
});

test('disabled actions do nothing; selection establishes action state before timer recovery', () => {
  const { page, events } = harness();
  page.openStudyMenu(); events.length = 0;
  const action = () => { assert.equal(page.studyMenuOpen, false); events.push('action'); };
  page.selectStudyMenu({ enabled: false, action });
  assert.deepEqual(events, []);
  assert.equal(page.studyMenuOpen, true);
  page.selectStudyMenu({ enabled: true, action });
  page.selectStudyMenu({ enabled: true, action });
  assert.deepEqual(events, ['action', 'resume', 'schedule']);
});

test('open menu consumes study shortcuts and Escape dismisses without leaving the page', () => {
  const { page } = harness();
  page.openStudyMenu();
  for (const keyCode of ['space', '1', 'delete', 'b', 'r']) {
    assert.equal(page.处理按键({ keyCode, type: 0 }), true);
    assert.equal(page.studyMenuOpen, true);
  }
  page.处理按键({ keyCode: 'escape', type: 0 });
  assert.equal(page.studyMenuOpen, false);
  assert.match(source, /onBackPressed\([\s\S]*?if \(this.studyMenuOpen\) \{ this.closeStudyMenu\(\); return true; \}/);
});

test('card menus reuse home menu geometry and rows instead of native menu defaults', () => {
  for (const path of ['pages/学习页.ets', 'components/browser/卡片预览页.ets']) {
    const page = read('entry/src/main/ets/' + path);
    assert.match(page, /CardActionMenu\(\{/);
    assert.doesNotMatch(page, /\.bindMenu\(/);
  }
  const menu = read('entry/src/main/ets/components/common/CardActionMenu.ets');
  assert.match(menu, /AnchoredMenu\(\{/);
  assert.match(menu, /AnchoredMenuItem\(\{/);
  assert.match(menu, /contentMaxWidth: this.contentWidth/);
  assert.match(menu, /this.contentWidth = cardViewportWidth\(Number\(area.width\), Number\(area.height\)\)/);
  assert.doesNotMatch(menu, /@Builder|CardViewport\(/, 'menu content must mount directly without nesting a Builder through custom layout');
  assert.match(menu, /topOffset: 应用尺寸\.pageContentTop\(this\.statusBarHeight, this\.narrowDeckLayout\)/);
  const shell = read('entry/src/main/ets/components/common/AnchoredMenu.ets');
  assert.match(shell, /Scroll\(\)/);
  assert.match(shell, /this.viewportHeight - this.topOffset - 应用尺寸\.页面底部间距\(this\.narrowDeckLayout\)/);
});
