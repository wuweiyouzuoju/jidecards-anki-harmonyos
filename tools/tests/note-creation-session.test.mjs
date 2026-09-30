// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import { NoteTypeCatalog, standardNoteTypes } from '../../entry/src/main/ets/model/NoteTypeCatalog.ts';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
test('note initialization exposes every type and falls back when the default was deleted',async()=>{
  const types=[{id:1,name:'Image Occlusion'},{id:2,name:'Custom'}],states=[],loads=[];
  const session=new NoteCreationSession({initialize:async()=>({types,defaultId:99,warning:''}),
    loadType:async id=>{loads.push(id);return {id,name:'type',fieldNames:['Front']};}},s=>states.push(s));
  await session.initialize('/'); assert.deepEqual(states.at(-1).types,types);assert.deepEqual(loads,[1]);assert.equal(states.at(-1).busy,false);
});
test('note type races and disposal suppress stale success and failure',async()=>{
  const pending=[],states=[]; const session=new NoteCreationSession({loadType:()=>{const d=deferred();pending.push(d);return d.promise;}},s=>states.push(s));
  const old=session.loadType(1),fresh=session.loadType(2);pending[1].resolve({id:2});await fresh;
  pending[0].reject(Error('old'));await old;assert.equal(states.at(-1).view.id,2);assert.equal(states.at(-1).error,'');
  const leaving=session.loadType(3);const before=states.length;session.dispose();pending[2].resolve({id:3});await leaving;assert.equal(states.length,before);
});
test('accepted note saves retain captured inputs, finish after disposal and never duplicate commits',async()=>{
  const gate=deferred(),states=[],writes=[];let commits=0;
  const session=new NoteCreationSession({importImage:()=>gate.promise,saveNote:async input=>writes.push(input),committed:()=>commits++,errorMessage:e=>e.message},s=>states.push(s));
  const input={deckId:1,notetypeId:2,fields:['front'],tags:['tag'],images:[{id:1,fieldIndex:0,uri:'image',filename:''}]};
  const saving=session.save(input);await session.save(input);input.fields[0]='changed';input.tags.length=0;input.deckId=9;
  const before=states.length;session.dispose();gate.resolve('media.png');await saving;await session.save(input);
  assert.equal(commits,1);assert.equal(writes.length,1);assert.equal(writes[0].deckId,1);assert.deepEqual(writes[0].tags,['tag']);
  assert.equal(writes[0].fields[0],'front<br><img src="media.png">');assert.equal(states.length,before);
});
function adapterHarness(options={}) {
  const events=[],names=options.names??[];
  const Adapter=loadPlatformModule('backend/AnkiNoteCreation.ets','AnkiNoteCreation',{
    NoteTypeCatalog,standardNoteTypes,后端会话:{获取实例:()=>({确保已打开:async()=>{}})},
    笔记服务:class{
      async 获取添加默认值(){return {notetypeId:99};}
      async 新建笔记(id){events.push(['new',id]);return {fields:['','','',''],tags:[]};}
      async 添加笔记(note,deck){events.push(['save',note,deck]);if(options.saveFailure)throw Error('save');}
    },
    笔记类型服务:class{async 获取笔记类型名列表(){return names;}async 获取标准笔记类型JSON(kind){events.push(kind);return kind;}
      async 添加笔记类型旧版(kind){if(kind===options.failKind)throw Error('stock failure');}},
    图片遮罩服务:class{async 添加图片遮罩笔记类型(){events.push('occlusion-type');}
      async 获取图片遮罩字段(id){events.push(['indices',id]);if(options.indexFailure)throw Error('indices');return {遮罩:0,图片:1,标题:2,额外:3};}},
    prepareNoteImageFields,importNoteImage:async uri=>{events.push(['import',uri]);if(options.importFailure)throw Error('import');return 'permanent.png';}
  });return {adapter:new Adapter(),events};
}
test('stock restore uses all five Core stock kinds, keeps existing aliases, and tolerates one failed restore',async()=>{
  const h=adapterHarness({failKind:1});const initial=await h.adapter.initialize('/');
  assert.deepEqual(h.events,[0,4,1,2,3,'occlusion-type']);assert.match(initial.warning,/stock failure/);
  const existing=adapterHarness({names:[...standardNoteTypes().map((type,i)=>({id:i,name:type.names.at(-1)})),{id:6,name:'影像遮擋'}]});
  await existing.adapter.initialize('/');assert.deepEqual(existing.events,[]);
});
test('occlusion backend imports permanent media and writes the explicit deck; failures never report success',async()=>{
  for(const options of [{},{indexFailure:true},{importFailure:true},{saveFailure:true}]) {
    const h=adapterHarness(options), input={deckId:123,uri:'photo://one',occlusions:'masks',header:'head',backExtra:'back',tags:['t'],notetypeId:7};
    const saving=h.adapter.saveOcclusion(input);
    if(Object.keys(options).length)await assert.rejects(saving);else await saving;
    const writes=h.events.filter(e=>e[0]==='save');
    if(options.indexFailure||options.importFailure){assert.equal(writes.length,0);continue;}
    assert.deepEqual(writes,[['save',{fields:['masks','<img src="permanent.png">','head','back'],tags:['t']},123]]);
  }
  // Short reads, format conversion and resource release remain exercised through
  // the actual shared importer by note-image-media.test.mjs.
});

test('accepted IO saves freeze target deck and tags, finish after disposal and reject duplicate submits',async()=>{
  const gate=deferred(),writes=[],states=[];let commits=0;
  const session=new NoteCreationSession({saveOcclusion:async input=>{writes.push(input);await gate.promise;},
    committed:()=>commits++,errorMessage:e=>e.message},s=>states.push(s));
  const input={deckId:123,notetypeId:7,uri:'photo://one',occlusions:'masks',header:'head',backExtra:'back',tags:['t']};
  const saving=session.saveOcclusion(input);await session.saveOcclusion(input);
  input.deckId=999;input.tags.push('late');session.dispose();const count=states.length;
  gate.resolve();await saving;assert.equal(commits,1);assert.equal(writes.length,1);
  assert.equal(writes[0].deckId,123);assert.deepEqual(writes[0].tags,['t']);assert.equal(states.length,count);
});
