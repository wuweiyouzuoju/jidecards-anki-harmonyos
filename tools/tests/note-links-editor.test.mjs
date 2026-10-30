import * as references from '../../entry/src/main/ets/model/NoteReferences.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { NoteEditorWheelSession } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { noteLinkEditorFields, restoreNoteLinkEditorFields } from '../../entry/src/main/ets/model/NoteLinkEditor.ts';
import { serializeNoteLinks, parseNoteLinks } from '../../entry/src/main/ets/model/NoteLinks.ts';
import { noteDraftChanged, parseNoteTags } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { assertNoteEditorUnchanged } from '../../entry/src/main/ets/model/NoteEditorConflict.ts';
import { APP_INTERFACE_SURFACES } from '../../entry/src/main/ets/model/AppInterface.ts';

const record = targets => serializeNoteLinks({v:1,guid:'a',targets,alias:''});
const mirror = '<!--ml-mirror:start--><div>mirror</div><!--ml-mirror:end-->';
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve}; };

async function fixture() {
  const stored = {id:1,guid:'a',notetypeId:9,mtimeSecs:1,usn:0,tags:['tag'],fields:['Front','Back','user'+record([])]};
  const writes=[],visibility=[],observations=[];
  const session = new NoteEditorSession({note:async()=>structuredClone(stored),card:async()=>({noteId:1}),
    notetype:async()=>({fieldNames:['Front','Back','关联']})},()=>{});
  await session.open(1,true,()=>true);
  const linkService={load:async()=>({view:{outgoing:[],incoming:[]}})};
  const Form=loadComponentLogic('components/browser/浏览编辑区.ets','浏览编辑区',{
    ...noteInterfaceDependencies(),noteDraftChanged,parseNoteTags,
    NoteAudioPreview:class {async stop(){} async dispose(){}},discardNoteRecordings:async()=>{},
    discardNoteDrawingImages:async()=>{},confirmNoteDiscard:async()=>false,
    resourceText:(_context,key)=>key,$r:key=>key,
    noteLinksService:linkService,
    appInterface:{observe:value=>observations.push(value),leave(){}},
  });
  const form=new Form();
  Object.assign(form,{note:structuredClone(stored),fieldNames:['Front','Back','关联'],
    initialFieldValues:stored.fields.slice(),initialTags:'tag',getUIContext:()=>({getHostContext:()=>({filesDir:'/files'})}),
    onLinksVisibility:visible=>visibility.push(visible),
    onSave:(fields,tags)=>session.save(fields,tags,async note=>{
      // Same pre-commit conflict check as the page's AnkiNoteUpdate.
      assertNoteEditorUnchanged(form.note,stored);writes.push(structuredClone(note));return true;
    })});
  form.aboutToAppear();
  return {form,stored,writes,visibility,session,observations,linkService};
}

test('editor projects only user content and restores managed bytes, including unknown/legacy payloads',()=>{
  const baseline=['<b>front</b>','user'+record(['b'])+mirror,'<!--jide-links:v2:opaque-->text'];
  assert.deepEqual(noteLinkEditorFields(baseline),['<b>front</b>','user','text']);
  assert.deepEqual(restoreNoteLinkEditorFields(baseline,noteLinkEditorFields(baseline)),baseline);
  const draft=['edited','<i>changed</i>','changed'];
  const result=restoreNoteLinkEditorFields(baseline,draft);
  assert.equal(result[1],'<i>changed</i>'+record(['b'])+mirror);
  assert.equal(result[2],'changed<!--jide-links:v2:opaque-->');
  assert.deepEqual(draft,['edited','<i>changed</i>','changed']);
});

test('link changes remain in the editor draft with text, tags and attachments until one save',async()=>{
  const h=await fixture(),f=h.form;f.fieldValues[0]='unsaved front';f.tags='tag new';
  f.images=[{id:1,fieldIndex:0,uri:'draft',filename:''}];await f.openProperty('links');
  assert.equal(f.interfaceEnabled('save'),false);assert.deepEqual(h.writes,[]);
  const fields=f.fieldsWithLinks();fields[1]+='<a href="#jide-note:b">my label</a>';
  f.updateLinkDraft(references.prepareNoteReferenceFields(fields,'a'));f.closeLinks();
  assert.equal(f.interfaceEnabled('save'),true);assert.equal(f.fieldValues[0],'unsaved front');
  assert.equal(f.images[0].uri,'draft');assert.deepEqual(h.stored.fields,['Front','Back','user'+record([])]);
  await f.提交();assert.equal(h.writes.length,1);assert.equal(h.writes[0].fields[0],'unsaved front');
  assert.deepEqual(h.writes[0].tags,['tag','new']);assert.deepEqual(parseNoteLinks(h.writes[0].fields[2],'a').targets,['b']);
  assert.deepEqual(h.visibility,[true,false]);
});

test('preview returns through the topmost overlay and underlying save/preview stays blocked',async()=>{
  const h=await fixture(),f=h.form;let closed=0,back=0;
  f.onCancel=()=>closed++;await f.openProperty('links');
  f.openLinkedPreview([20,21]);f.linkedPreviewBack=()=>{back++;return true};
  await f.requestClose();assert.equal(back,1);assert.equal(closed,0);assert.equal(f.propertyBack,0);
  await f.提交();f.openPreview();assert.equal(h.writes.length,0);assert.equal(f.preview,null);
  f.linkedPreviewIds=[];await f.requestClose();assert.equal(f.propertyBack,1);assert.equal(closed,0);
  assert.deepEqual(f.fieldValues,['Front','Back','user']);
});

test('external text/tags/type changes cannot be silently accepted by closing the draft panel',async()=>{
  for(const mutate of [n=>n.fields[0]='external',n=>n.tags.push('external'),n=>n.notetypeId=11]) {
    const h=await fixture(),f=h.form;f.fieldValues[0]='my draft';await f.openProperty('links');
    mutate(h.stored);f.closeLinks();await f.提交();
    assert.equal(f.fieldValues[0],'my draft');assert.equal(h.writes.length,0);
  }
});

test('late counts and draft panel callbacks cannot revive a disposed editor',async()=>{
  const h=await fixture(),count=deferred();h.linkService.load=()=>count.promise;
  const read=h.form.loadLinkCount();h.form.aboutToDisappear();count.resolve({view:{outgoing:[{}],incoming:[]}});await read;
  assert.equal(h.form.linkCount,0);h.form.updateLinkDraft(['late']);assert.equal(h.form.linkDraftTargets,null);
});

test('JIDE discovers the editor link entry and observes real blocking and counts without draft content',async()=>{
  assert.equal(APP_INTERFACE_SURFACES.find(s=>s.id==='edit_note_form').items.find(i=>i.id==='links').opens,'note_links_draft');
  const h=await fixture(),f=h.form;f.fieldValues[0]='private draft text';f.updateLinkCount({view:{outgoing:[{}],incoming:[{},{}]}});
  f.publishInterface();let observation=h.observations.at(-1);
  assert.equal(observation.items.find(i=>i.id==='links').enabled,true);
  assert.ok(observation.values.some(v=>v.id==='link_count'&&v.value==='3'));
  await f.openProperty('links');f.publishInterface();observation=h.observations.at(-1);
  assert.equal(observation.items.find(i=>i.id==='save').enabled,false);
  assert.equal(JSON.stringify(observation).includes('private draft text'),false);
});

test('managed-only field is replaced by the link entry while ordinary field indices and user content stay editable',async()=>{
  const h=await fixture(),f=h.form;f.linksBaseline.fields[2]=record([])+mirror;
  assert.equal(f.fieldVisible(2),false);f.publishInterface();
  assert.deepEqual(h.observations.at(-1).optionIds,['field-0','field-1']);
  f.linksBaseline.fields[2]='user'+record([]);assert.equal(f.fieldVisible(2),true);
  f.fieldValues[2]='';assert.equal(f.fieldVisible(2),true,'clearing custom content must not remove the focused editor');
});

test('wide browser editor blocks sibling mutations while drafting links and cancelling performs no writes',()=>{
  let commits=0,closes=0,refreshes=0;const busy=[],wheel=[];
  const Pane=loadComponentLogic('components/browser/BrowserEditorPane.ets','BrowserEditorPane',{
    ...noteInterfaceDependencies(),NoteEditorSession,initialNoteEditorState,NoteEditorWheelSession,
    AnkiNoteUpdate:class {committed(){commits++}},AnkiNoteEditor:class {},
    BrowserOperationController:class {},NavPathStack:class {},
  });
  const pane=new Pane();Object.assign(pane,{active:true,visible:true,onBusy:v=>busy.push(v),
    wheelSession:{setVisible:v=>wheel.push(v)},onClose:()=>closes++,onSaved:()=>refreshes++});
  pane.setLinksVisible(true);assert.equal(busy.at(-1),true);assert.equal(wheel.at(-1),false);
  pane.setVisible();assert.equal(wheel.at(-1),false,'returning to the browser cannot reactivate the covered wheel');
  pane.setLinksVisible(false);assert.equal(busy.at(-1),false);assert.equal(wheel.at(-1),true);
  pane.cancel();assert.equal(closes,1);assert.equal(refreshes,0);
  assert.equal(commits,0);assert.equal(refreshes,0);
});
