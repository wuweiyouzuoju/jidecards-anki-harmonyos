// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as references from '../../entry/src/main/ets/model/NoteReferences.ts';
import * as links from '../../entry/src/main/ets/model/NoteLinks.ts';
import { richNoteLink, sourceNoteLink } from '../../entry/src/main/ets/model/NoteHtmlTools.ts';
import { parseNoteRichText } from '../../entry/src/main/ets/model/NoteRichText.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { GenericString } from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';
import { NoteEditorWheelSession, noteEditorWheelOuterTools } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';

const anchor=(guid,label)=>`<a href="${references.noteReferenceUrl(guid)}">${label}</a>`;
const note=(guid,fields)=>({id:guid==='a'?1:2,guid,notetypeId:9,mtimeSecs:1,usn:0,tags:[],fields});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {resolve,promise}};

test('inline reference URLs preserve special GUIDs and local labels without nesting or rewriting unknown markup',()=>{
  const guid='中文`#&/"',url=references.noteReferenceUrl(guid);
  assert.equal(references.noteReferenceGuid(url),guid);
  for(const invalid of ['https://example.com','#jide-note:%E0%A4%A','#jide-note:','#jide-note:%00'])assert.equal(references.noteReferenceGuid(invalid),'');
  const source='<img src="a.png"><b>甲😀乙</b>';
  assert.equal(sourceNoteLink(source,0,2,url,'x',true),null);
  const rich=richNoteLink(parseNoteRichText('<b>甲😀乙</b>'),1,3,url,'😀',undefined,true);
  assert.deepEqual(references.noteReferences([rich]),[{guid,label:'😀'}]);
  const renamed=richNoteLink(parseNoteRichText('word'),0,4,url,'local <name>',undefined,true);
  assert.deepEqual(references.noteReferences([renamed]),[{guid,label:'local <name>'}]);
  assert.equal(references.changeNoteReferences([source+rich],guid)[0],source+'<b>甲</b><b>😀</b><b>乙</b>');
  const left=anchor('b','first'),right=anchor('b','second');
  assert.equal(references.changeNoteReferences([left],'b','changed')[0],anchor('b','changed'));
  assert.equal(right,anchor('b','second'),'other references are independent data');
  assert.equal(references.changeNoteReferences([left+right],'b','changed',1)[0],left+anchor('b','changed'));
  assert.equal(references.changeNoteReferences([left+right],'b',undefined,0)[0],'first'+right);
});

test('saving an ordinary note prepares complete metadata without schema changes and removes deleted inline edges',()=>{
  const raw=['Front',anchor('b','A label')],before=structuredClone(raw);
  const saved=references.prepareNoteReferenceFields(raw,'a');
  assert.deepEqual(raw,before);assert.equal(saved.length,2);
  assert.deepEqual(links.parseNoteLinks(saved[1],'a').targets,['b']);
  assert.equal(links.parseNoteLinks(saved[1],'a').alias,'');
  const edit=references.changeNoteReferences(saved,'b');
  const removed=references.prepareNoteReferenceFields(edit,'a',saved);
  assert.deepEqual(links.parseNoteLinks(removed[1],'a').targets,[]);
  const manual=references.stageNoteReferenceFields(saved,'a',['c']);
  const result=references.prepareNoteReferenceFields(references.changeNoteReferences(manual,'b'),'a',saved);
  assert.deepEqual(links.parseNoteLinks(result[1],'a').targets,['c']);
  assert.throws(()=>references.prepareNoteReferenceFields(['x',anchor('a','self')],'a'),/note_links_self/);
  assert.throws(()=>references.prepareNoteReferenceFields(['x',anchor('b','b')+'<!--jide-links:v2:opaque-->'],'a'));
  assert.throws(()=>references.stageNoteReferenceFields(['ml-mirror-row'],'a',[]),/note_links_migrate/);
});

test('production preparation validates new targets but changes no stored notes until the caller performs one Core write',async()=>{
  const stored=note('a',['Front','Back']),original=structuredClone(stored);
  const rpc={调用:async(_service,_method,bytes)=>{
    const request=JSON.parse(new GenericString(bytes).getVal());const response=new GenericString();
    response.setVal(JSON.stringify(request.includes('b')?[{noteId:2,guid:'b',title:'Target',cardIds:[20]}]:[]));return response.toBytes();
  }};
  const Service=loadPlatformModule('backend/NoteLinksService.ts','NoteLinksService',{
    ...links,...references,后端会话:{获取实例:()=>rpc},笔记服务:class {},笔记类型服务:class {},搜索服务:class {}
  });
  const service=new Service(),draft=note('a',['Front',anchor('b','my wording')]);
  await service.prepareNote(draft,stored);
  assert.deepEqual(stored,original);assert.deepEqual(links.parseNoteLinks(draft.fields[1],'a').targets,['b']);
  const missing=note('a',['Front',anchor('missing','missing')]);
  await assert.rejects(service.prepareNote(missing,stored),/note_links_missing/);
  assert.equal(missing.fields[1],anchor('missing','missing'),'failed preparation is not a partial save');
});

test('new note selection confirms only a local draft and rejects stale search and callbacks after disposal',async()=>{
  const search=defer(),tracker=new AppInterfaceTracker(),selected=[];
  const Picker=loadComponentLogic('components/links/NoteReferencePicker.ets','NoteReferencePicker',{
    noteLinksService:{search:()=>search.promise},appInterface:tracker,$r:key=>key,resourceText:(_ctx,key)=>key
  });
  const picker=new Picker();picker.getUIContext=()=>({});picker.selectedText='chosen word';picker.onApply=(...args)=>selected.push(args);
  picker.aboutToAppear();picker.query='target';const work=picker.search();
  picker.aboutToDisappear();search.resolve([{guid:'b',title:'Target',cardIds:[20]}]);await work;
  assert.deepEqual(picker.rows,[]);assert.deepEqual(selected,[]);
  const next=new Picker();next.sourceGuid='a';next.onApply=(...args)=>selected.push(args);next.getUIContext=()=>({});next.aboutToAppear();
  next.choose({guid:'a',title:'Self',cardIds:[1]});assert.equal(next.selected,null);
  next.choose({guid:'b',title:'Target',cardIds:[20]});next.label='local text';next.apply();
  assert.deepEqual(selected,[['b','local text']]);next.aboutToDisappear();next.apply();assert.equal(selected.length,1);
});

test('draft manager never writes: renaming stays local and removing preserves text while dropping the edge',async()=>{
  const changes=[];const fields=references.prepareNoteReferenceFields(['Front',anchor('b','local')],'a');
  const Panel=loadComponentLogic('components/links/NoteLinksDraftPanel.ets','NoteLinksDraftPanel',{
    ...references,appInterface:new AppInterfaceTracker(),resourceText:(_ctx,key)=>key,$r:key=>key,
    noteLinksService:{resolve:async()=>[{guid:'b',title:'Target',noteId:2,cardIds:[20]}],load:async()=>({view:{incoming:[]}})}
  });
  const panel=new Panel();Object.assign(panel,{fields,sourceGuid:'a',getUIContext:()=>({}),onChange:value=>changes.push(value)});
  panel.aboutToAppear();for(let i=0;i<15;i++)await Promise.resolve();
  assert.equal(panel.displayLabel(panel.rows[0]),'local');
  panel.remove('b');assert.equal(changes.length,1);assert.ok(changes[0][1].startsWith('local'));
  assert.deepEqual(links.parseNoteLinks(changes[0][1],'a').targets,[]);
  assert.deepEqual(links.parseNoteLinks(fields[1],'a').targets,['b'],'caller still owns the original baseline');
});

test('wheel exposes reference separately from URL links and hides it for non-note rich text controls',()=>{
  const state={cloze:false,source:false,expanded:false,activeIds:[],referencesEnabled:true};
  const tools=noteEditorWheelOuterTools(state);
  assert.ok(tools.some(tool=>tool.id==='note_reference'));assert.ok(tools.some(tool=>tool.id==='link'));
  assert.equal(noteEditorWheelOuterTools({...state,referencesEnabled:false}).some(tool=>tool.id==='note_reference'),false);
});

test('field owner supplies the picker without coupling the common editor to reference screens',()=>{
  const applied=[],dialogs=[];
  const Card=loadComponentLogic('components/editor/NoteFieldCard.ets','NoteFieldCard',{
    NoteAudioPreview:class {},NoteReferencePicker:value=>value,noteReferenceUrl:references.noteReferenceUrl,
    CustomDialogController:class {constructor(options){this.options=options;dialogs.push(this);}}
  });
  const card=new Card();card.referenceSourceGuid='a';
  const presentation={width:'100%',height:'100%',autoCancel:false,customStyle:true,alignment:1,maskColor:'transparent',openAnimation:{duration:250},closeAnimation:{duration:250}};
  const request={selectedText:'word',presentation,dismiss(){},onClose(){},onBackHandlerChange(){},onApply:(...args)=>applied.push(args)};
  card.createReferencePicker(request);
  for(const [key,value] of Object.entries(presentation))assert.equal(dialogs[0].options[key],value,key);
  assert.equal(dialogs[0].options.onWillDismiss,request.dismiss);
  const picker=dialogs[0].options.builder;assert.equal(picker.sourceGuid,'a');assert.equal(picker.selectedText,'word');
  picker.onApply('a','self');assert.deepEqual(applied,[]);
  picker.onApply('b','local');assert.deepEqual(applied,[[references.noteReferenceUrl('b'),'local']]);
  card.disabled=true;picker.onApply('c','disabled');card.disabled=false;card.disposed=true;picker.onApply('d','late');
  assert.equal(applied.length,1);
});

test('read-only reference previews cannot invoke the old immediate-write editor',async()=>{
  let writes=0;
  const Panel=loadComponentLogic('components/links/NoteLinksPanel.ets','NoteLinksPanel',{
    NoteEditorWheelSession,noteLinksService:{change:async()=>writes++}
  });
  const panel=new Panel();Object.assign(panel,{mounted:true,readOnly:true,snapshot:{guid:'a'},busy:false});
  await panel.change('b','add');assert.equal(writes,0);
});

test('all live reference searches invalidate old results as soon as input changes and allow typing during reads',async()=>{
  for(const [file,name,resultKey] of [['NoteReferencePicker','NoteReferencePicker','rows'],['NoteLinksDraftPanel','NoteLinksDraftPanel','results'],['NoteLinksPanel','NoteLinksPanel','results']]) {
    const pending=defer(),requests=[];
    const Panel=loadComponentLogic(`components/links/${file}.ets`,name,{
      ...references,NoteEditorWheelSession,appInterface:new AppInterfaceTracker(),resourceText:(_ctx,key)=>key,$r:key=>key,
      noteLinksService:{search:(query)=>{requests.push(query);return pending.promise;}}
    });
    const panel=new Panel();Object.assign(panel,{mounted:true,sourceGuid:'a',snapshot:{guid:'a'},getUIContext:()=>({})});
    panel.queryChanged('old');const read=panel.search();assert.deepEqual(requests,['old']);
    panel.queryChanged('new');pending.resolve([{guid:'b',title:'Old',cardIds:[20]}]);await read;
    assert.deepEqual(panel[resultKey],[],file);assert.equal(panel.query,'new');
    panel.queryChanged('');await panel.search();assert.deepEqual(requests,['old']);
  }
});
