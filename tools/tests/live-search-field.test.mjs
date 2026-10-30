// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic } from './platform-module-harness.mjs';

function input() {
  const timers=new Map(),changes=[],searches=[];let id=0;
  const Field=loadComponentLogic('components/common/LiveSearchField.ets','LiveSearchField',{
    setTimeout:callback=>{timers.set(++id,callback);return id;},clearTimeout:id=>timers.delete(id)
  });
  const field=new Field();field.onChange=value=>changes.push(value);field.onSearch=value=>searches.push(value);field.aboutToAppear();
  return {field,timers,changes,searches,flush(){for(const callback of [...timers.values()])callback();}};
}
test('live search immediately reports typing, coalesces queries, clears and submits once',()=>{
  const h=input();h.field.changed('h');h.field.changed('hy');h.field.changed('hydrogen');
  assert.deepEqual(h.changes,['h','hy','hydrogen']);assert.deepEqual(h.searches,[]);assert.equal(h.timers.size,1);
  h.flush();assert.deepEqual(h.searches,['hydrogen']);assert.equal(h.timers.size,0);
  h.field.changed('target');h.field.submit();h.flush();assert.deepEqual(h.searches,['hydrogen','target']);
  h.field.changed('');assert.deepEqual(h.searches,['hydrogen','target','']);assert.equal(h.timers.size,0);
});
test('disabled or disposed inputs cannot run delayed work; local deck search remains immediate',()=>{
  const h=input();h.field.changed('x');h.field.isEnabled=false;h.flush();assert.deepEqual(h.searches,[]);
  h.field.changed('blocked');assert.deepEqual(h.changes,['x']);h.field.isEnabled=true;
  h.field.changed('late');h.field.aboutToDisappear();h.flush();assert.deepEqual(h.searches,[]);
  const local=input();local.field.debounceMs=0;local.field.changed('deck');assert.deepEqual(local.searches,['deck']);assert.equal(local.timers.size,0);
});
test('deck, history and every note link entry reuse the same clearable search field',()=>{
  const paths=['home/HomeDeckSearchDialog','agent/AgentHistoryList','agent/AgentMemoryPanel','common/DirectoryTree','common/TagPicker','设置面板','links/NoteReferencePicker','links/NoteLinksDraftPanel','links/NoteLinksPanel'];
  for(const path of paths) {
    const source=readFileSync(`entry/src/main/ets/components/${path}.ets`,'utf8');
    const header=['home/HomeDeckSearchDialog','links/NoteReferencePicker','links/NoteLinksDraftPanel','links/NoteLinksPanel'].includes(path);
    assert.match(source,header?/DialogSearchHeader\(\{/:/LiveSearchField\(\{/);assert.doesNotMatch(source,/TextInput\(\{ text: this\.query/);
  }
});

test('search headers keep one gap after their divider; selected row text has its own inset',()=>{
  const header=readFileSync('entry/src/main/ets/components/common/DialogSearchHeader.ets','utf8');
  assert.match(header,/Column\(\{ space: 应用尺寸\.间距_12 \}\)[\s\S]*DialogHeader\([\s\S]*LiveSearchField\(/);
  const tree=readFileSync('entry/src/main/ets/components/common/DirectoryTree.ets','utf8');
  assert.match(tree,/\}\.width\('100%'\)\.padding\(\{ left: 应用尺寸\.间距_12, right: 应用尺寸\.间距_12 \}\)\s*\}\.layoutWeight\(1\)\.height\(44\)\s*\.padding\(0\)/);
  const picker=readFileSync('entry/src/main/ets/components/links/NoteReferencePicker.ets','utf8');
  assert.match(picker,/SettingsActionRow\([\s\S]*?\.padding\(\{ left: 应用尺寸\.间距_12, right: 应用尺寸\.间距_12 \}\)\s*\.backgroundColor\(this\.selected/);
  assert.match(picker,/showFooter: this\.selected !== null, footer: \(\) => \{ this\.footer\(\); \}/);
});
