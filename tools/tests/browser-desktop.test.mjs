// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSearchSession } from '../../entry/src/main/ets/model/BrowserSearchSession.ts';
import { selectBrowserRange, resolveBrowserRepresentativeCard } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { browserKeyCommand } from '../../entry/src/main/ets/model/BrowserKeyboard.ts';
import { defaultBrowserPreferences, updateBrowserPreferences, parseBrowserPreferences, browserActiveColumns } from '../../entry/src/main/ets/model/BrowserPreferences.ts';
import { inspectBrowserReposition } from '../../entry/src/main/ets/model/BrowserReposition.ts';
const query = { filesDir: '/files', notes: false, text: '', filter: 'all', sortColumn: '', sortReverse: false };
function sharedBackend() {
  let notes = false, active = false;
  const backend = { open: async () => {}, setNotesMode: async value => { notes = value; },
    columns: async () => ({columns: []}), activateColumns: async () => { active = true; },
    buildSearch: async node => node.kind === 'card_state' ? 'suspended' : '',
    search: async req => req.search === 'suspended' ? [] : Array.from({length:303}, (_, i) => i+1),
    row: async id => { if (!active) throw Error('No active columns'); return {cells:[`${notes?'note':'card'}:${id}`],color:0}; } };
  return {backend, reopen: () => { active = false; notes = false; }};
}
test('collection reopen and two interleaved browser sessions restore mode and columns before every batch', async () => {
  const h=sharedBackend(), cards=new BrowserSearchSession(h.backend), notes=new BrowserSearchSession(h.backend);
  await cards.search(query,()=>true); h.reopen();
  assert.equal((await cards.search(query,()=>true)).rows[0].cells[0],'card:1');
  await notes.search({...query,notes:true},()=>true);
  assert.equal((await cards.more(()=>true)).rows[200].cells[0],'card:201');
  assert.equal((await notes.more(()=>true)).rows[200].cells[0],'note:201');
  h.reopen(); assert.equal((await cards.more(()=>true)).rows.at(-1).cells[0],'card:303');
});
test('systemic row failure is visible and preserves pagination for retry', async () => {
  const h=sharedBackend(), session=new BrowserSearchSession(h.backend); await session.search(query,()=>true);
  const row=h.backend.row; h.backend.row=async()=>{throw Error('collection unavailable');};
  await assert.rejects(session.more(()=>true),/collection unavailable/);
  h.backend.row=row; const recovered=await session.more(()=>true);
  assert.equal(recovered.consumed,300); assert.equal(recovered.rows[200].id,201);
});
test('accepted columns are frozen and refresh failure retains the old pagination context', async () => {
  const h=sharedBackend(), session=new BrowserSearchSession(h.backend), calls=[];
  h.backend.activateColumns=async keys=>{calls.push(keys.slice());};
  h.backend.row=async id=>({cells:[id],color:0});
  const keys=['question','answer']; await session.search({...query,activeColumns:keys},()=>true); keys.push('deck');
  const open=h.backend.open;h.backend.open=async()=>{throw Error('offline');};
  await assert.rejects(session.search({...query,notes:true,activeColumns:['deck']},()=>true,true));h.backend.open=open;
  await session.more(()=>true);assert.deepEqual(calls.at(-1),['question','answer']);
});
test('range selection includes unloaded IDs in search order and does not retain hidden selections',()=>{
  const ids=Array.from({length:1000},(_,i)=>1000-i);
  assert.equal(selectBrowserRange(ids,[2000],990,690).length,301);
  assert.deepEqual(selectBrowserRange(ids,[1000],0,998),[1000,998]);
  assert.deepEqual(selectBrowserRange(ids,[1000],999,2000),[1000]);
});
test('note information and preview resolve a real card, handle empty notes and propagate failures',async()=>{
  assert.equal(await resolveBrowserRepresentativeCard(11,'notes',async()=>[101,102]),101);
  assert.equal(await resolveBrowserRepresentativeCard(11,'notes',async()=>[]),null);
  assert.equal(await resolveBrowserRepresentativeCard(11,'cards',async()=>{throw Error('unexpected');}),11);
  await assert.rejects(resolveBrowserRepresentativeCard(11,'notes',async()=>{throw Error('lookup');}),/lookup/);
});
test('desktop keyboard commands use exact modifiers and leave input, overlays and busy writes alone',()=>{
  const input={key:'a',ctrl:true,alt:false,shift:false,editable:false,blocked:false,busy:false};
  assert.equal(browserKeyCommand(input),'select_all');
  assert.equal(browserKeyCommand({...input,shift:true}),'tags');
  assert.equal(browserKeyCommand({...input,alt:true}),'');
  for(const key of ['editable','blocked','busy']) assert.equal(browserKeyCommand({...input,[key]:true}),'');
  assert.equal(browserKeyCommand({...input,key:'ArrowDown',ctrl:false,shift:true}),'range_down');
  assert.equal(browserKeyCommand({...input,key:'0'}),'flag_0');
  assert.equal(browserKeyCommand({...input,key:'Delete',ctrl:false}),'delete');
});
test('preferences retain independent ordered column sets and bounded deduplicated recent searches',()=>{
  let value=updateBrowserPreferences(defaultBrowserPreferences(),{mode:'notes',cardsColumns:['answer','question'],notesColumns:['noteFld'],subtitleIndex:4,sortColumn:'noteFld'});
  for(let i=0;i<40;i++) value=updateBrowserPreferences(value,{recentSearch:`deck:${i}`});
  value=updateBrowserPreferences(value,{recentSearch:'deck:20'});
  assert.equal(value.recentSearches.length,30);assert.equal(value.recentSearches[0],'deck:20');
  assert.deepEqual(parseBrowserPreferences(JSON.stringify(value),false),value);
  assert.deepEqual(browserActiveColumns(value,true),['question','deck','cardDue','flags','answer','noteFld']);
  assert.throws(()=>updateBrowserPreferences(value,{cardsColumns:['question','question']}));
  assert.throws(()=>parseBrowserPreferences('null',false));
});
test('reposition inspects new type or queue, uses filtered original positions and fails before any partial write',async()=>{
  const cards=new Map([[1,{ctype:0,queue:-1,due:99,originalDeckId:3,originalDue:7}],
    [2,{ctype:2,queue:0,due:12,originalDeckId:0}], [3,{ctype:2,queue:2,due:400,originalDeckId:0}]]);
  const scope=await inspectBrowserReposition([1,2,3],async id=>cards.get(id));
  assert.deepEqual(scope,{ids:[1,2],unsupported:1,minimum:7,maximum:12});
  await assert.rejects(inspectBrowserReposition([1,2],async id=>{if(id===2)throw Error('missing');return cards.get(id);}),/missing/);
});
