// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {editorPageHarness} from './editor-page-harness.mjs';
import {parseNoteRichText,serializeNoteRichText} from '../../entry/src/main/ets/model/NoteRichText.ts';
const deferred=()=>{let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
test('dedicated editor saves identity and undo exactly once, then pops after its form unmounts',async()=>{
 const h=editorPageHarness(); await h.page.load();
 assert.equal(await h.page.save(['edited','back'],['changed'],[]),true);
 assert.deepEqual(h.writes,[{notes:[{...h.note,fields:['edited','back'],tags:['changed']}],undo:false}]);
 assert.deepEqual(h.note.fields,['old','answer']);assert.equal(h.pops.length,1);
 assert.equal(h.page.editor.note,null);assert.ok(h.store.get('cardContentChangedTick'));
});
test('failed write retains editor and imported media for retry without duplicating the import',async()=>{
 const h=editorPageHarness();await h.page.load(); const images=[{id:1,fieldIndex:0,uri:'photo://one',filename:''}];
 h.io.write=async()=>{throw Error('disk full')};
 assert.equal(await h.page.save(['draft','b'],[],images),false);
 assert.equal(h.page.editor.error,'save');assert.equal(h.pops.length,0);assert.equal(h.scheduler.canSync(),true);
 h.io.write=async notes=>h.writes.push(notes);assert.equal(await h.page.save(['draft','b'],[],images),true);
 assert.equal(h.imports.length,1);assert.equal(h.writes[0][0].fields[0],'draft<br><img src="saved.png">');
});
test('editor freezes fields, protects media and write from sync, and finishes accepted save after disposal',async()=>{
 const h=editorPageHarness();await h.page.load();const gate=deferred();h.io.image=async()=>{await gate.promise;return 'a.png'};
 const fields=['draft'],tags=['t'];const work=h.page.save(fields,tags,[{id:1,fieldIndex:0,uri:'one',filename:''}]);
 fields[0]='late';tags.push('late');await settle();assert.equal(h.scheduler.canSync(),false);
 assert.equal(await h.page.save(['duplicate'],[],[]),false);h.page.requestBack();assert.equal(h.pops.length,0);
 h.page.aboutToDisappear();gate.resolve();assert.equal(await work,true);
 assert.deepEqual(h.writes[0].notes[0].fields,['draft<br><img src="a.png">','']);assert.deepEqual(h.writes[0].notes[0].tags,['t']);
 assert.equal(h.scheduler.canSync(),true);assert.ok(h.store.get('cardContentChangedTick'));assert.equal(h.pops.length,0);
});
test('load failure supports retry and departed loading cannot revive a page',async()=>{
 const h=editorPageHarness();h.io.note=async()=>{throw Error('read')};await h.page.load();assert.equal(h.page.editor.error,'load');
 h.io.note=async()=>h.note;await h.page.load();assert.equal(h.page.editor.note.id,42);
 const gate=deferred();h.io.note=()=>gate.promise;const work=h.page.load();h.page.aboutToDisappear();gate.resolve(h.note);await work;
 assert.equal(h.page.editor.note,null);assert.equal(h.pops.length,0);
});
test('rich text preserves nested cloze numbers, hints, incomplete markers and explicit highlight',()=>{
 const html='😀 {{c1::中<b>{{c2::文}}</b>::提示}} x {{c3::unfinished';const runs=parseNoteRichText(html);
 assert.equal(runs.map(x=>x.text).join(''),'😀 {{c1::中{{c2::文}}::提示}} x {{c3::unfinished');
 assert.equal(serializeNoteRichText(runs),html);
 const highlighted='{{c1::<mark>亮</mark>}}';const marked=parseNoteRichText(highlighted);
 assert.deepEqual(marked,[{text:'{{c1::',format:0},{text:'亮',format:8},{text:'}}',format:0}]);
 assert.equal(serializeNoteRichText(marked),highlighted);
 assert.deepEqual(parseNoteRichText(''),[]);
});


test('source and format actions share exact button geometry, with permanent gaps independent of active state',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../entry/src/main/ets/components/common/NoteFieldEditor.ets',import.meta.url),'utf8');
 assert.equal((source.match(/\bButton\(/g)||[]).length,1);
 assert.match(source,/this.tool\('source'/);
 assert.match(source,/space: \{ main: LengthMetrics.vp\(8\), cross: LengthMetrics.vp\(8\) \}/);
 assert.match(source,/left: 应用尺寸.间距_10, right: 应用尺寸.间距_10/);
 assert.match(source,/placeholder\(this.placeholderText\(\), \{ fontColor: \$r\('app.color.text_tertiary'\)/);
});
