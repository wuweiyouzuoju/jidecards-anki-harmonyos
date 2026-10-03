// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { NoteDraftPreviewSession } from '../../entry/src/main/ets/model/NoteDraftPreview.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { creationPageHarness } from './note-creation-harness.mjs';
import { noteDraftChanged, parseNoteTags } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { editorPageHarness } from './editor-page-harness.mjs';
import { readFileSync } from 'node:fs';

const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
const note = () => ({id:42,guid:'keep',notetypeId:123,mtimeSecs:99,usn:8,fields:['saved','answer'],tags:['saved']});
const input = () => ({notetypeId:123,note:note(),fields:['draft <img src="existing.png">','[sound:existing.mp3]'],tags:['draft'],
  images:[{id:1,fieldIndex:0,uri:'photo://one',filename:''}],audios:[]});
function fixture({cloze=false}={}) {
  const calls=[],states=[];
  const backend={
    wait:async()=>{}, newNote:async()=>note(),
    notetypeJson:async()=>JSON.stringify({type:cloze?1:0,css:'.card{}',flds:[{name:'Front'},{name:'Back'}],
      tmpls:[{ord:0,name:'Forward',qfmt:'{{Front}}',afmt:'{{Back}}'},{ord:1,name:'Reverse',qfmt:'{{Back}}',afmt:'{{Front}}'}]}),
    clozeFields:async()=>[0],
    clozeNumbers:async value=>{calls.push(['numbers',structuredClone(value)]);return [1,6];},
    prepareMedia:async value=>{calls.push(['media',structuredClone(value)]);value.images[0]&&(value.images[0].filename='preview.png');
      return {fields:value.fields.map(s=>s),directory:'/cache/owned',filenames:['preview.png']};},
    releaseMedia:async()=>{calls.push(['release']);},
    render:async (...args)=>{calls.push(['render',structuredClone(args)]);return {questionNodes:[],answerNodes:[],css:args[3],latexSvg:false,isEmpty:false};}
  };
  const session=new NoteDraftPreviewSession(backend,state=>states.push(state));
  return {backend,calls,states,session};
}

test('uncommitted fields, tags, identities and attachments are frozen before waiting; every normal template is available',async()=>{
  const h=fixture(),gate=deferred();h.backend.wait=()=>gate.promise;const draft=input();
  const pending=h.session.open(draft);draft.fields[0]='late';draft.note.guid='late';draft.images[0].uri='late';gate.resolve();await pending;
  const args=h.calls.find(c=>c[0]==='render')[1];
  assert.equal(args[0].id,42);assert.equal(args[0].guid,'keep');assert.equal(args[0].mtimeSecs,99);assert.equal(args[0].usn,8);
  assert.match(args[0].fields[0],/draft/);assert.deepEqual(args[0].tags,['draft']);assert.equal(args[4],false);
  assert.equal(draft.images[0].filename,'');assert.equal(h.calls.find(c=>c[0]==='media')[1].images[0].uri,'photo://one');
  assert.deepEqual(h.states.at(-1).options.map(o=>o.ordinal),[0,1]);
  await h.session.select(1);assert.equal(h.states.at(-1).selected,1);
  assert.equal(JSON.parse(h.calls.filter(c=>c[0]==='render').at(-1)[1][2]).ord,1);
  await h.session.dispose();assert.equal(h.calls.at(-1)[0],'release');
});

test('Core Cloze numbers use only Core cloze fields and target c1/c6 independently of existing c1',async()=>{
  const h=fixture({cloze:true});await h.session.open(input());
  assert.deepEqual(h.calls.find(c=>c[0]==='numbers')[1].fields,[input().fields[0],'']);
  assert.deepEqual(h.states.at(-1).options.map(o=>[o.name,o.ordinal]),[['c1',0],['c6',5]]);
  await h.session.select(1);const args=h.calls.filter(c=>c[0]==='render').at(-1)[1];
  assert.equal(args[1],5);assert.equal(JSON.parse(args[2]).ord,5);assert.equal(args[4],false);
});

test('sample rendering is explicit, uses draft template metadata and CSS and empty Cloze fails visibly',async()=>{
  const h=fixture({cloze:true});const draft=input();draft.sample=true;draft.css='draft css';
  draft.templateJson=JSON.stringify({ord:null,name:'New',qfmt:'draft {{cloze:Front}}',afmt:'{{FrontSide}}',did:7,future:{keep:true}});
  await h.session.open(draft);assert.equal(h.calls.some(c=>c[0]==='numbers'),false);
  const args=h.calls.find(c=>c[0]==='render')[1];assert.equal(args[3],'draft css');assert.equal(args[4],true);
  assert.deepEqual(JSON.parse(args[2]).future,{keep:true});
  const empty=fixture({cloze:true});empty.backend.clozeNumbers=async()=>[];await empty.session.open(input());
  assert.equal(empty.states.at(-1).error,'note_preview_no_cloze');assert.equal(empty.calls.some(c=>c[0]==='render'),false);
});

test('disposal rejects late reads and releases partial temporary media only after preparation finishes',async()=>{
  const h=fixture(),gate=deferred();h.backend.prepareMedia=async()=>{await gate.promise;return {fields:['late'],directory:'owned',filenames:['a']};};
  const pending=h.session.open(input());await new Promise(r=>setImmediate(r));const count=h.states.length;
  const cleanup=h.session.dispose();assert.equal(h.session.dispose(),cleanup);assert.equal(h.calls.some(c=>c[0]==='release'),false);
  gate.resolve();await pending;await cleanup;assert.equal(h.states.length,count);assert.equal(h.calls.at(-1)[0],'release');
  assert.equal(h.calls.some(c=>c[0]==='render'),false);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
  const failure=fixture();failure.backend.prepareMedia=async()=>{throw new Error('short read');};await failure.session.open(input());
  assert.equal(failure.states.at(-1).error,'short read');await failure.session.dispose();assert.equal(failure.calls.at(-1)[0],'release');
});

test('selection busy guard prevents parallel render and disposal during render never publishes a stale card',async()=>{
  const h=fixture();await h.session.open(input());const gate=deferred(),count=h.states.length;
  h.backend.render=async()=>{await gate.promise;return {css:'late'};};const selection=h.session.select(1);await h.session.select(0);
  const cleanup=h.session.dispose();gate.resolve();await selection;await cleanup;
  assert.equal(h.states.length,count+1);assert.equal(h.states.at(-1).busy,true);
});

test('disposal immediately rejects late results and waits for Web/audio release before deleting preview media',async()=>{
  const h=fixture();await h.session.open(input());const mediaGate=deferred(),count=h.states.length;
  const cleanup=h.session.dispose(mediaGate.promise);await new Promise(r=>setImmediate(r));
  assert.equal(h.calls.some(c=>c[0]==='release'),false);await h.session.select(1);assert.equal(h.states.length,count);
  mediaGate.resolve();await cleanup;assert.equal(h.calls.at(-1)[0],'release');
});

test('new-note preview pushes a frozen draft and pop returns to the retained editor without saving',async()=>{
  const h=creationPageHarness();await h.ready;h.page.字段值列表=['unsaved','answer'];h.page.标签='draft';
  const paths=[];h.page.pathStack.pushPath=path=>paths.push(path);
  h.page.fieldImages=[{id:1,fieldIndex:0,uri:'photo://draft',filename:''}];
  h.page.openDraftPreview();assert.equal(paths[0].name,'NoteDraftPreviewPage');
  assert.deepEqual(paths[0].param.input.fields,['unsaved','answer']);
  assert.deepEqual(paths[0].param.input.tags,['draft']);
  h.page.fieldImages[0].uri='photo://changed';assert.equal(paths[0].param.input.images[0].uri,'photo://draft');
  h.page.openDraftPreview();assert.equal(paths.length,1,'repeated taps do not push duplicate pages');
  assert.equal(h.page.onBackPress(),true);await h.page.requestExit();await h.page.提交();
  assert.equal(h.page.draftPreview,paths[0].param.input);assert.deepEqual(h.pops,[]);assert.deepEqual(h.writes,[]);
  paths[0].onPop();assert.equal(h.page.draftPreview,null);
  assert.deepEqual(h.page.字段值列表,['unsaved','answer']);assert.equal(h.page.标签,'draft');
  h.page.openDraftPreview();assert.equal(paths.length,2);
});

test('existing-note preview navigates through its page host and pop retains unsaved fields and attachments',async()=>{
  let saves=0,closes=0;
  const Form=loadComponentLogic('components/browser/浏览编辑区.ets','浏览编辑区',{
    ...noteInterfaceDependencies(),PAGE_SURFACE_KEY:'surface',DECK_LIST_NARROW_KEY:'narrow',颜色键:{},
    NoteAudioPreview:class{async stop(){}},noteDraftChanged,parseNoteTags,discardNoteRecordings:async()=>{},confirmNoteDiscard:async()=>false
  });
  const form=new Form();form.note=note();form.fieldNames=['Front','Back'];form.initialFieldValues=['saved','answer'];
  form.fieldValues=['draft','answer'];form.tags='draft';form.onSave=async()=>{saves++;};form.onCancel=()=>closes++;
  form.audios=[{id:1,fieldIndex:1,uri:'/cache/draft.mp3',filename:''}];
  const host=editorPageHarness();const paths=[];host.page.pathStack.pushPath=path=>paths.push(path);
  form.onPreview=(input,returned)=>host.page.openPreview(input,returned);
  form.openPreview();assert.equal(paths[0].name,'NoteDraftPreviewPage');
  assert.equal(paths[0].param.input.note.id,42);assert.deepEqual(paths[0].param.input.fields,['draft','answer']);
  form.note.tags.push('changed');assert.deepEqual(paths[0].param.input.note.tags,['saved']);
  form.openPreview();assert.equal(paths.length,1);
  await form.提交();await form.requestClose();assert.equal(saves,0);assert.equal(closes,0);assert.notEqual(form.preview,null);
  paths[0].onPop();assert.equal(form.preview,null);assert.deepEqual(form.fieldValues,['draft','answer']);
  assert.equal(form.audios[0].uri,'/cache/draft.mp3');
  await form.提交();assert.equal(saves,1,'the retained editor can save after return');
});

test('preview navigation failure releases the editor guard and keeps its draft',async()=>{
  const h=creationPageHarness();await h.ready;h.page.字段值列表=['draft','answer'];
  h.page.pathStack.pushPath=()=>{throw new Error('navigation failed');};h.page.openDraftPreview();
  assert.equal(h.page.draftPreview,null);assert.deepEqual(h.page.字段值列表,['draft','answer']);
  assert.equal(h.page.错误信息,'app.string.browser_preview_load_error');assert.deepEqual(h.writes,[]);
  const host=editorPageHarness();host.page.active=false;
  assert.equal(host.page.openPreview(input(),()=>{}),false);
  host.page.active=true;host.page.editor.busy=true;
  assert.equal(host.page.openPreview(input(),()=>{}),false);
});

test('showing the retained editor clears preview guards even when the pop callback was not delivered',async()=>{
  const h=creationPageHarness();await h.ready;h.page.字段值列表=['retained','answer'];
  h.page.pathStack.pushPath=()=>{};h.page.openDraftPreview();assert.notEqual(h.page.draftPreview,null);
  h.page.restoreEditorAfterPreview();assert.equal(h.page.draftPreview,null);
  assert.deepEqual(h.page.字段值列表,['retained','answer']);h.page.openDraftPreview();assert.notEqual(h.page.draftPreview,null);
  const Form=loadComponentLogic('components/browser/浏览编辑区.ets','浏览编辑区',{
    ...noteInterfaceDependencies(),PAGE_SURFACE_KEY:'surface',DECK_LIST_NARROW_KEY:'narrow',颜色键:{},
    NoteAudioPreview:class{async stop(){}},noteDraftChanged,parseNoteTags,discardNoteRecordings:async()=>{},confirmNoteDiscard:async()=>false
  });
  const form=new Form();form.preview=input();form.fieldValues=['retained','answer'];form.restoreAfterPreview();
  assert.equal(form.preview,null);assert.deepEqual(form.fieldValues,['retained','answer']);
  const host=editorPageHarness();const initial=host.page.previewReturnRequest;
  host.page.restoreEditorAfterPreview();assert.equal(host.page.previewReturnRequest,initial+1);
});

test('draft preview is a registered destination and editor headers open it outside the form Scroll',()=>{
  const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
  const destinations=read('pages/navigation/HomeDestinations.ets');
  assert.match(destinations,/name === 'NoteDraftPreviewPage'[\s\S]*NoteDraftPreviewPage\(/);
  const page=read('pages/NoteDraftPreviewPage.ets');assert.match(page,/NavDestination\(\)/);assert.match(page,/fullScreen: true/);
  assert.match(page,/onBackPressed\(\(\): boolean => \{ this.close\(\); return true;/);
  for(const path of ['pages/添加笔记页.ets','components/browser/浏览编辑区.ets']) {
    const source=read(path);assert.doesNotMatch(source,/NoteDraftPreview\(\{/,'forms must not mount the preview dialog');
    const header=source.match(/NoteEditorHeader\(\{[\s\S]*?\}\)/)[0];
    assert.match(header,/actionLabel: \$r\('app.string.note_draft_preview'\)/);
    assert.match(header,/onSave:[\s\S]*this.open(?:DraftPreview|Preview)\(\)/);
    assert.doesNotMatch(source.slice(source.indexOf('Scroll(')),/文案: \$r\('app.string.note_draft_preview'\)/);
    assert.doesNotMatch(source,/\.enabled\(this\.(draftPreview|preview) === null\)/,'navigation owns hiding; a stale preview must not disable the whole editor');
  }
  assert.match(read('pages/添加笔记页.ets'),/onShown\([\s\S]*restoreEditorAfterPreview\(\)/);
  assert.match(read('pages/EditNotePage.ets'),/onShown\([\s\S]*restoreEditorAfterPreview\(\)/);
  const header=read('components/common/NoteEditorHeader.ets');
  assert.match(header,/accent: ResourceColor = \$r\('app.color.text_primary'\)/);
  assert.doesNotMatch(header,/themeText: true/,'preview actions use the same text color as Back');
});
