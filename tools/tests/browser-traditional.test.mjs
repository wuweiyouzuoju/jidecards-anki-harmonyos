// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {defaultBrowserPreferences, updateBrowserPreferences, parseBrowserPreferences, browserActiveColumns, browserDisplayKeys, replaceBrowserColumn, browserPreferencePatch, BROWSER_TRADITIONAL_CARD_COLUMNS, BROWSER_TRADITIONAL_NOTE_COLUMNS} from '../../entry/src/main/ets/model/BrowserPreferences.ts';
import {AppInterfaceTracker, browserToolbarItems} from '../../entry/src/main/ets/model/AppInterface.ts';
import {loadComponentLogic} from './platform-module-harness.mjs';

function harness() {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets',import.meta.url),'utf8');
  const names=['toggleTraditionalMode','saveDisplayColumns','openColumnOptions','replaceDisplayColumn','行点击处理','openInitialWideEditor','viewControlsAvailable'];
  const methods=names.map(name=>{
    const start=source.search(new RegExp(`  private (?:async )?${name}\\(`));
    assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n  }',start)+4);
  });
  let stored=defaultBrowserPreferences();const calls=[];let saveError=null;
  const save=async patch=>{if(saveError)throw saveError;stored=updateBrowserPreferences(stored,patch);return stored;};
  const Page=new Function('saveBrowserPreferences','browserDisplayKeys','replaceBrowserColumn',stripTypeScriptTypes(`class Page {${methods.join('\n')}}`,{mode:'transform'})+';return Page;')(save,browserDisplayKeys,replaceBrowserColumn);
  const page=new Page();Object.assign(page,{browserPreferences:stored,operations:{isAlive:()=>true},阶段:'list',浏览模式值:'cards',keyboardBlocked:()=>false,publishInterface:()=>calls.push(['observe']),执行搜索:async()=>calls.push(['search']),打开预览:id=>calls.push(['preview',id]),openEditPage:(id,note)=>calls.push(['edit',id,note])});
  return {page,calls,stored:()=>stored,fail:error=>{saveError=error;}};
}

test('old preferences migrate without changing the original layout or original column choices',()=>{
  const old={...defaultBrowserPreferences(),cardsColumns:['deck','question'],notesColumns:['noteFld']};
  delete old.traditionalMode;delete old.traditionalCardsColumns;delete old.traditionalNotesColumns;
  const migrated=parseBrowserPreferences(JSON.stringify(old),false);
  assert.equal(migrated.traditionalMode,false);assert.deepEqual(browserDisplayKeys(migrated,false),['deck','question']);
  const traditional=updateBrowserPreferences(migrated,{traditionalMode:true});
  assert.deepEqual(browserDisplayKeys(traditional,false),BROWSER_TRADITIONAL_CARD_COLUMNS);
  assert.deepEqual(browserDisplayKeys(traditional,true),BROWSER_TRADITIONAL_NOTE_COLUMNS);
  const changed=updateBrowserPreferences(traditional,{traditionalCardsColumns:['answer','tags'],traditionalNotesColumns:['noteFld']});
  assert.deepEqual(browserDisplayKeys(changed,false),['answer','tags']);assert.deepEqual(browserDisplayKeys(changed,true),['noteFld']);
  assert.deepEqual(browserActiveColumns(changed,false),['question','deck','cardDue','flags','answer','tags']);
  assert.deepEqual(browserDisplayKeys(updateBrowserPreferences(changed,{traditionalMode:false}),false),old.cardsColumns);
  assert.deepEqual(parseBrowserPreferences(JSON.stringify(changed),false),changed);
});
test('traditional columns reject empty, duplicate and invalid proposals before saving',()=>{
  for(const patch of [{traditionalCardsColumns:[]},{traditionalNotesColumns:[]},{traditionalCardsColumns:['question','question']},{traditionalMode:'yes'},{traditionalNotesColumns:'question'}])
    assert.throws(()=>browserPreferencePatch(JSON.stringify(patch)));
  assert.deepEqual(browserPreferencePatch('{"traditionalMode":true}'),{traditionalMode:true});
  assert.deepEqual(replaceBrowserColumn(['question','answer'],'question','tags'),['tags','answer']);
  assert.throws(()=>replaceBrowserColumn(['question','answer'],'question','answer'));
  assert.throws(()=>replaceBrowserColumn(['question','answer'],'missing','tags'));
});
test('wide and traditional rows edit with the correct identity; regular narrow rows preview',()=>{
  const {page,calls}=harness();
  for(const width of [320,800,1400])for(const notes of [false,true]){
    page.browserWidth=width;page.浏览模式值=notes?'notes':'cards';page.browserPreferences.traditionalMode=false;page.行点击处理(42);assert.deepEqual(calls.pop(),width>=1000?['edit',42,notes]:['preview',42]);
    page.browserPreferences.traditionalMode=true;page.行点击处理(42);assert.deepEqual(calls.pop(),['edit',42,notes]);
  }
  page.mutationBusy=true;page.行点击处理(5);assert.equal(calls.length,0);
  page.mutationBusy=false;page.多选模式值=true;page.行点击处理(5);assert.equal(calls.length,0);
});
test('initial wide editor requires a visible list with a focused result and opens once', () => {
  const { page, calls } = harness();
  Object.assign(page, { browserWidth: 999, browserVisible: true, focusedRowId: 21, 浏览模式值: 'notes' });
  page.openInitialWideEditor();
  page.browserWidth = 1000;
  page.显示预览 = true;
  page.openInitialWideEditor();
  assert.deepEqual(calls, []);
  page.显示预览 = false;
  page.openEditPage = (id, notes) => { calls.push(['edit', id, notes]); page.wideEditorOpened = true; };
  page.openInitialWideEditor();
  page.openInitialWideEditor();
  assert.deepEqual(calls, [['edit', 21, true]]);
});

test('manual toggle saves, searches once and reports persistence failure without changing the live mode',async()=>{
  const h=harness();await h.page.toggleTraditionalMode();assert.equal(h.stored().traditionalMode,true);assert.equal(h.page.browserPreferences.traditionalMode,true);
  assert.equal(h.calls.filter(c=>c[0]==='search').length,1);assert.equal(h.page.displayBusy,false);
  h.fail(Error('disk full'));await h.page.toggleTraditionalMode();assert.equal(h.page.browserPreferences.traditionalMode,true);assert.equal(h.page.refreshError,'disk full');assert.equal(h.page.displayBusy,false);
});
test('heading replacement preserves order and writes only the current layout and card/note set',async()=>{
  const h=harness();await h.page.toggleTraditionalMode();h.page.openColumnOptions('noteFld',false);assert.equal(h.page.displayDialog,'replace');
  const pending=[];const save=h.page.saveDisplayColumns.bind(h.page);h.page.saveDisplayColumns=keys=>{const p=save(keys);pending.push(p);return p;};
  h.page.replaceDisplayColumn('question');await Promise.all(pending);
  assert.deepEqual(h.stored().traditionalCardsColumns,['question','template','cardDue','deck']);assert.deepEqual(h.stored().traditionalNotesColumns,BROWSER_TRADITIONAL_NOTE_COLUMNS);assert.deepEqual(h.stored().cardsColumns,[]);assert.equal(h.page.displayDialog,'');
  h.page.浏览模式值='notes';await h.page.saveDisplayColumns(['tags']);assert.deepEqual(h.stored().traditionalNotesColumns,['tags']);
  h.page.openColumnOptions('tags',true);assert.equal(h.page.displayDialog,'columns');
  await h.page.saveDisplayColumns([]);assert.deepEqual(h.stored().traditionalNotesColumns,['tags']);
});
test('busy state rejects heading and mode changes, and a late save cannot update a destroyed page',async()=>{
  const h=harness();h.page.displayBusy=true;h.page.openColumnOptions('noteFld',false);await h.page.toggleTraditionalMode();assert.equal(h.page.displayDialog,undefined);assert.equal(h.stored().traditionalMode,false);
  h.page.displayBusy=false;h.page.operations.isAlive=()=>false;await h.page.toggleTraditionalMode();assert.equal(h.page.browserPreferences.traditionalMode,false);assert.equal(h.calls.length,0);
});
test('replacement dialog and browser toolbar publish real identities, labels, mode and selected columns to JIDE',()=>{
  assert.ok(!browserToolbarItems(false,false).some(i=>i.id==='traditional')); 
  const tracker=new AppInterfaceTracker();const Dialog=loadComponentLogic('components/browser/BrowserDisplayDialog.ets','BrowserDisplayDialog',{appInterface:tracker,namedResourceText:(_c,k)=>k,visibleInterfaceItems:()=>[{id:'column',titleKey:'browser_replace_column'},{id:'close',titleKey:'browser_detail_cancel'}]});
  const dialog=new Dialog();Object.assign(dialog,{kind:'replace',notes:true,replacementColumn:'question',selectedColumns:['question','answer'],columns:[{key:'question',notesModeLabel:'Front',cardsModeLabel:'Question'},{key:'answer',notesModeLabel:'Back',cardsModeLabel:'Answer'}],getUIContext:()=>({})});
  dialog.aboutToAppear();const view=tracker.snapshot()[0];assert.equal(view.surface,'browser_column_replace');assert.deepEqual(view.optionLabels,[]);assert.ok(view.values.some(v=>v.id==='replacement_column'&&v.value==='question'));dialog.aboutToDisappear();assert.deepEqual(tracker.snapshot(),[]);
});

test('persistent defaults match the pinned AnkiDroid BrowserConfig rather than loading placeholders',()=>{
  const baseline=JSON.parse(readFileSync(new URL('./fixtures/ankidroid-browser-columns.json',import.meta.url),'utf8'));
  assert.deepEqual(BROWSER_TRADITIONAL_CARD_COLUMNS,baseline.cardsDefault);
  assert.deepEqual(BROWSER_TRADITIONAL_NOTE_COLUMNS,baseline.notesDefault);
});

test('traditional column manager can retain more than sixteen available Core columns',()=>{
  const keys=Array.from({length:20},(_,i)=>'core-column-'+i);
  const value=updateBrowserPreferences(defaultBrowserPreferences(),{traditionalMode:true,traditionalCardsColumns:keys});
  assert.deepEqual(browserDisplayKeys(value,false),keys);
  assert.throws(()=>updateBrowserPreferences(value,{traditionalCardsColumns:Array.from({length:65},(_,i)=>'column-'+i)}));
});

test('traditional rows use a full-width table, Core background state and selection priority',()=>{
  const Table=loadComponentLogic('components/browser/卡片表格.ets','卡片表格',{$r:key=>key,SurfaceBorder:{options:width=>({width})},CARD_FLAGS:[{color:'transparent'},{color:'#D92D20'}],browserRowFlag:color=>color===3?1:0,BrowserRowColor:{COLOR_MARKED:1,COLOR_SUSPENDED:2,COLOR_BURIED:10}});
  const table=new Table();table.tableLayout=true;table.displayKeys=['question','answer'];assert.equal(table.tableWidth(),500);
  table.traditionalLayout=true;assert.equal(table.tableWidth(),'100%');
  assert.equal(table.rowBackground({id:1,color:1}),'app.color.browser_row_marked');
  assert.equal(table.rowBackground({id:1,color:2}),'app.color.browser_row_suspended');
  assert.equal(table.rowBackground({id:1,color:10}),'app.color.browser_row_buried');
  assert.equal(table.rowBackground({id:1,color:3}),'#33D92D20');
  table.选中IDs=[1];assert.equal(table.rowBackground({id:1,color:3}),'app.color.surface_selected');assert.deepEqual(table.rowBorder({id:1,color:3}),{width:{bottom:0.5}});
});

test('virtualized rendering invalidates old cell snapshots when content or column context changes',()=>{
 const Table=loadComponentLogic('components/browser/卡片表格.ets','卡片表格',{});const table=new Table();
 const row={id:17,cells:[{text:'front'}],color:0,hasSuspendedCards:false};const initial=table.renderedRowKey(row);
 assert.equal(table.renderedRowKey(structuredClone(row)),initial);
 assert.notEqual(table.renderedRowKey({...row,cells:[{text:'changed'}]}),initial);
 assert.notEqual(table.renderedRowKey({...row,cells:row.cells.concat([{text:'template'}])}),initial);
 table.activeKeys=['question','template'];const activated=table.renderedRowKey(row);assert.notEqual(activated,initial);
 table.displayKeys=['template','question'];const ordered=table.renderedRowKey(row);assert.notEqual(ordered,activated);
 table.traditionalLayout=true;assert.notEqual(table.renderedRowKey(row),ordered);
});
