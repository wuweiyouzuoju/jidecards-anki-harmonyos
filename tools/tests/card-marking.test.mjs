// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_FLAGS, validateCardFlag, noteIsMarked, readCardMarking, setMarkedNotes, setCardFlags, saveCardFlagLabels, parseFlagLabels, customFlagLabel, browserRowFlag } from '../../entry/src/main/ets/model/CardMarking.ts';
import { BrowserRowColor, SearchNodeFlag, encodeSearchNode, decodeSearchNode } from '../../entry/src/main/ets/proto/messages/SearchMessages.ts';
import { BROWSER_QUICK_FILTERS, browserFilterNode } from '../../entry/src/main/ets/model/BrowserQuickFilter.ts';
const note = (id, tags) => ({ id, guid:'guid'+id, notetypeId:4,mtimeSecs:3,usn:-1,fields:['front','back'],tags });
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('all eight flags use the correct independent card, search and row values',()=>{
 assert.deepEqual(CARD_FLAGS.map(x=>x.value),[0,1,2,3,4,5,6,7]);
 assert.deepEqual(CARD_FLAGS.map(x=>x.searchFlag),[0,2,3,4,5,6,7,8]);
 for(let flag=0;flag<=7;flag++)validateCardFlag(flag);
 for(const flag of [-1,8,1.1,NaN,Infinity])assert.throws(()=>validateCardFlag(flag));
 assert.equal(browserRowFlag(BrowserRowColor.COLOR_MARKED),0);
 assert.equal(browserRowFlag(BrowserRowColor.COLOR_FLAG_PURPLE),7);
 const decoded=decodeSearchNode(encodeSearchNode({kind:'flag',flag:SearchNodeFlag.FLAG_NONE}).转为字节());
 assert.equal(decoded.kind,'flag');assert.equal(decoded.flag,0);
 for(let f=0;f<=7;f++)assert.equal(BROWSER_QUICK_FILTERS.find(x=>x.id==='flag_'+f).query,'flag:'+f);
 assert.equal(browserFilterNode('deck:a OR deck:b','marked').group.nodes[1].text,'tag:re:^marked$');
});
test('star reads the exact case insensitive note tag and masks only low flag bits',async()=>{
 assert.equal(noteIsMarked(['MaRkEd']),true);assert.equal(noteIsMarked(['marked::child','unmarked']),false);
 assert.deepEqual(await readCardMarking({card:async()=>({noteId:3,flags:0xaF}),note:async()=>note(3,['MARKED'])},5),{flag:7,marked:true});
});
test('bulk unmark preserves descendants, fields and identity, deduplicates notes and commits once',async()=>{
 const input=new Map([[1,note(1,['MaRkEd','marked::child','topic'])],[2,note(2,['marked::child'])]]);
 const read=[],writes=[];const backend={note:async id=>{read.push(id);return input.get(id);},updateNotes:async notes=>writes.push(notes)};
 await setMarkedNotes(backend,[1,1,2],false);
 assert.deepEqual(read,[1,2]);assert.equal(writes.length,1);
 assert.deepEqual(writes[0],[{...input.get(1),fields:['front','back'],tags:['marked::child','topic']}]);
 await setMarkedNotes(backend,[2],false);assert.equal(writes.length,1);
 await setMarkedNotes(backend,[2],true);assert.deepEqual(writes[1][0].tags,['marked::child','marked']);
});
test('failed reads do not commit a partial batch and the write queue recovers',async()=>{
 let writes=0;const backend={note:async id=>{if(id===2)throw Error('read');return note(id,[]);},updateNotes:async()=>writes++};
 await assert.rejects(setMarkedNotes(backend,[1,2],true),/read/);assert.equal(writes,0);
 await setMarkedNotes(backend,[1],true);assert.equal(writes,1);
});
test('accepted marker writes are serialized, keep input snapshots, and flag zero clears',async()=>{
 const gate=deferred(),calls=[];const ids=[1,1,2];
 const backend={setFlag:async(ids,flag)=>{calls.push([ids,flag]);if(flag===7)await gate.promise;}};
 const first=setCardFlags(backend,ids,7);ids[0]=99;
 const second=setCardFlags(backend,[2],0);await new Promise(setImmediate);
 assert.deepEqual(calls,[[[1,2],7]]);gate.resolve();await Promise.all([first,second]);
 assert.deepEqual(calls,[[[1,2],7],[[2],0]]);
 assert.throws(()=>setCardFlags(backend,[0],1));assert.throws(()=>setCardFlags(backend,[1],8));
});
test('labels reread current config, preserve unknown values and unedited colors, restore only the selected key',async()=>{
 let json='{"1":"old","2":"synced","future":{"a":[true,2]},"7":7}';const writes=[];
 const backend={labels:async()=>json,saveLabels:async value=>{writes.push(value);json=value;}};
 const changes=[{flag:1,name:'  check  '},{flag:3,name:''}];const save=saveCardFlagLabels(backend,changes);changes[0].name='mutated';
 const labels=await save;assert.deepEqual(labels,{'1':'check','2':'synced',future:{a:[true,2]},'7':7});
 assert.equal(customFlagLabel(labels,7),'');assert.equal(customFlagLabel(labels,0),'');
 await saveCardFlagLabels(backend,[{flag:1,name:' '}]);assert.equal('1' in JSON.parse(json),false);
 assert.equal(writes.length,2);assert.throws(()=>saveCardFlagLabels(backend,[{flag:0,name:'zero'}]));
 for(const json of ['null','[]','broken'])assert.throws(()=>parseFlagLabels(json));
 json='{"__proto__":{"future":true},"2":"two"}';await saveCardFlagLabels(backend,[{flag:1,name:'one'}]);
 assert.equal(Object.hasOwn(JSON.parse(json),'__proto__'),true);assert.deepEqual(JSON.parse(json).__proto__,{future:true});
});
