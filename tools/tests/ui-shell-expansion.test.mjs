// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const read = file => readFileSync(new URL('../../entry/src/main/ets/' + file, import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
function harness() {
  const scrolls = [];
  const Reveal = loadPlatformModule('utils/ExpansionReveal.ets', 'ExpansionReveal', {
    Scroller: class { scrollEdge(edge) { scrolls.push(edge); } }, Edge: { Bottom: 'bottom' }
  });
  return { Reveal, reveal: new Reveal(), scrolls };
}

test('expansion waits for measurable content, scrolls once, and leaves later layout changes alone', () => {
  const { reveal, scrolls } = harness();
  reveal.revealAfterLayout(true, 100);
  assert.deepEqual(scrolls, [], 'initial render must not move the viewport');
  reveal.request(true);
  for (const height of [0, -1, NaN, Infinity]) reveal.revealAfterLayout(true, height);
  assert.deepEqual(scrolls, [], 'unmeasured content must not consume the request');
  reveal.revealAfterLayout(true, 180);
  for (const height of [200, 120, 180]) reveal.revealAfterLayout(true, height);
  assert.deepEqual(scrolls, ['bottom'], 'typing, keyboard and width changes must not keep pulling down');
  reveal.request(false);
  reveal.revealAfterLayout(false, 180);
  reveal.request(true);
  reveal.revealAfterLayout(true, 180);
  assert.deepEqual(scrolls, ['bottom', 'bottom'], 'reopening permits one new reveal');
});

test('collapse and teardown cancel a pending reveal before late layout arrives', () => {
  for (const cancel of [r => r.request(false), r => r.cancel(), r => r.revealAfterLayout(false, 180)]) {
    const { reveal, scrolls } = harness();
    reveal.request(true); cancel(reveal); reveal.revealAfterLayout(true, 180);
    assert.deepEqual(scrolls, []);
  }
});

test('nested tag picker expansion shares the form scroller but owns its reveal request', () => {
  const { Reveal, reveal, scrolls } = harness();
  const Field = loadComponentLogic('components/common/NoteTagsField.ets', 'NoteTagsField', {
    Scroller: class {}, ExpansionReveal: Reveal
  });
  const field = new Field();
  field.scroller = reveal.scroller;
  field.text = 'keep draft tags';
  field.aboutToAppear();
  const source = read('components/common/NoteTagsField.ets');
  const callback = source.match(/\.onAreaChange\((\(_oldArea: Area, newArea: Area\): void => \{[^]*?\n\s*\})\)/)[1];
  const layout = new Function('return ' + stripTypeScriptTypes(callback, { mode: 'transform' }).trim()).call(field);
  layout({}, { height: 100 });
  assert.deepEqual(scrolls, []);
  reveal.request(true); reveal.revealAfterLayout(true, 120);
  field.togglePicker();
  assert.equal(field.expanded, true);
  assert.equal(field.pickerReveal.scroller, reveal.scroller);
  reveal.revealAfterLayout(true, 420);
  assert.deepEqual(scrolls, ['bottom'], 'outer layout must not consume the picker request');
  layout({}, { height: 0 });
  layout({}, { height: 420 });
  layout({}, { height: 460 });
  assert.deepEqual(scrolls, ['bottom', 'bottom']);
  field.togglePicker(); field.togglePicker(); field.togglePicker();
  layout({}, { height: 420 });
  assert.equal(field.expanded, false);
  assert.equal(scrolls.length, 2, 'collapse cancels a pending reveal');
  field.isInteractive = false; field.togglePicker();
  assert.equal(field.expanded, false, 'disabled late clicks cannot expand');
  field.isInteractive = true; field.togglePicker(); layout({}, { height: 420 });
  assert.equal(scrolls.length, 3, 'reopening permits one new reveal');
  field.togglePicker(); field.togglePicker(); field.aboutToDisappear();
  layout({}, { height: 420 });
  assert.equal(scrolls.length, 3, 'teardown cancels late layout');
  assert.equal(field.text, 'keep draft tags');
  assert.match(source, /onSelect: [^]*?this\.togglePicker\(\)/);
});

test('every manual tag field receives its containing form scroller', () => {
  for (const file of ['pages/添加笔记页.ets', 'components/browser/浏览编辑区.ets', 'components/添加笔记面板.ets']) {
    const source = read(file);
    assert.match(source, /Scroll\(this\.tagsReveal\.scroller\)/, file);
    assert.match(source, /NoteTagsField\(\{[^]*?scroller: this\.tagsReveal\.scroller/, file);
  }
});

function method(source, name) {
  const start = source.indexOf(`  private ${name}(): void {`);
  assert.ok(start >= 0, name);
  const code = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Host = new Function(stripTypeScriptTypes(`class Host { ${code} }`, { mode: 'transform' }) + '; return Host;')();
  return Host.prototype[name];
}

test('tags and deck More connect their real toggles and post-layout callbacks to the same scroller', () => {
  for (const [file, owner, expanded, toggle] of [
    ['pages/添加笔记页.ets', 'tagsReveal', '高级已展开', 'toggleTags'],
    ['components/添加笔记面板.ets', 'tagsReveal', '高级已展开', 'toggleTags'],
    ['components/牌组详情面板.ets', 'moreReveal', '显示更多', 'toggleMore']
  ]) {
    const source = read(file), { reveal, scrolls } = harness();
    assert.match(source, new RegExp(`Scroll\\(this\\.${owner}\\.scroller\\)`));
    assert.match(source, new RegExp(`this\\.${toggle}\\(\\)`));
    assert.match(source, new RegExp(`aboutToDisappear\\(\\): void \\{[^]*?this\\.${owner}\\.cancel\\(\\)`));
    assert.doesNotMatch(source, /scrollEdge\(|scrollToMorePending/);
    const state = { [owner]: reveal, [expanded]: false, 标签: 'draft tag', 字段值列表: ['front', 'back'] };
    const toggleAction = method(source, toggle);
    const callback = source.match(/\.onAreaChange\((\(_oldArea: Area, newArea: Area\): void => \{[^]*?\n\s*\})\)/)[1];
    const layout = new Function('return ' + stripTypeScriptTypes(callback, { mode: 'transform' }).trim()).call(state);
    for (const height of [80, 180]) {
      toggleAction.call(state); assert.equal(state[expanded], true);
      assert.equal(scrolls.length, height === 80 ? 0 : 1, 'toggle itself cannot scroll before layout');
      layout({}, { height }); layout({}, { height: height + 40 });
      toggleAction.call(state); layout({}, { height: 0 });
      assert.equal(state[expanded], false);
    }
    assert.deepEqual(scrolls, ['bottom', 'bottom']);
    assert.equal(state.标签, 'draft tag'); assert.deepEqual(state.字段值列表, ['front', 'back']);
    if (toggle === 'toggleTags') {
      for (const guard of file === 'components/添加笔记面板.ets' ? ['busy'] :
        ['处理中', 'pickingFieldImage', 'audioBusy', 'confirmingDiscard']) {
        state[guard] = true; toggleAction.call(state); state[guard] = false;
        assert.equal(state[expanded], false, `${guard}: disabled expansion`);
      }
    } else {
      toggleAction.call(state); method(source, 'closeMore').call(state); layout({}, { height: 100 });
      assert.equal(state[expanded], false); assert.equal(scrolls.length, 2);
      assert.match(source, /DisclosureChevron\(\)/);
    }
  }
});
