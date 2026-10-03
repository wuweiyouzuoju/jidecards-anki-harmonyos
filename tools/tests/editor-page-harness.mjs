// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { prepareNoteAudioFields } from '../../entry/src/main/ets/model/NoteAudioDraft.ts';
import { assertNoteMediaResolved } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
export function editorPageHarness() {
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity(), store = new Map(), writes = [], pops = [], imports = [];
  const note = { id: 42, guid: 'g', notetypeId: 9, mtimeSecs: 3, usn: 4, fields: ['old', 'answer'], tags: ['tag'] };
  const io = { card: async id => ({noteId:42}), note: async () => note,
    notetype: async () => ({fieldNames:['Front','Back']}),
    write: async (notes, undo) => { writes.push({notes:structuredClone(notes),undo}); },
    image: async uri => { imports.push(uri); return 'saved.png'; },
    audio: async uri => { imports.push(uri); return 'saved.mp3'; } };
  const AppStorage = {setOrCreate:(k,v)=>store.set(k,v)};
  const Writer = loadPlatformModule('backend/AnkiNoteUpdate.ets','AnkiNoteUpdate',{
    笔记服务:class { 更新笔记(...args) { return io.write(...args); } },
    importNoteImage:uri=>io.image(uri), prepareNoteImageFields, AppStorage,
    importNoteAudio:uri=>io.audio(uri),prepareNoteAudioFields,discardNoteRecordings:async()=>{},assertNoteMediaResolved
  });
  const Page = loadComponentLogic('pages/EditNotePage.ets','EditNotePage',{
    ...noteInterfaceDependencies(),
    NoteEditorSession,initialNoteEditorState,AnkiNoteUpdate:Writer,
    AnkiNoteEditor:class {card(id){return io.card(id)} note(id){return io.note(id)} notetype(id){return io.notetype(id)}},
    BrowserOperationController:class extends BrowserOperationController {
      execute(context,write,effects){return super.execute(context,write,effects,scheduler,activity)}
    },
    NavPathStack:class{},PAGE_SURFACE_KEY:'surface',加载主题模式:async()=>'system',
    CustomTransition:{getInstance:()=>({注册NavParam(){},注销NavParam(){}})}
  });
  const page = new Page(); page.active=true; page.targetId=42; page.isNote=true;
  page.pathStack={pop:()=>pops.push(true)};
  return {page,io,note,scheduler,activity,store,writes,pops,imports};
}
