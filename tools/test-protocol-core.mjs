// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs production codecs and generated RPCs against the locked Core in a temp collection.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CoreRpc } from '../entry/src/main/ets/proto/generated/CoreRpc.ts';
import * as messages from '../entry/src/main/ets/proto/generated/CoreMessages.ts';
import * as scheduler from '../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import * as notes from '../entry/src/main/ets/proto/messages/NoteMessages.ts';
import * as search from '../entry/src/main/ets/proto/messages/SearchMessages.ts';
import * as prefs from '../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
import * as media from '../entry/src/main/ets/proto/messages/MediaMessages.ts';
import * as transfer from '../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import * as textExport from '../entry/src/main/ets/proto/messages/TextExportMessages.ts';
import * as cards from '../entry/src/main/ets/proto/messages/CardsMessages.ts';
import * as collection from '../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import * as sync from '../entry/src/main/ets/proto/messages/SyncMessages.ts';
import * as config from '../entry/src/main/ets/proto/messages/ConfigMessages.ts';
import { pack } from './tests/protocol-oracle.mjs';

const child=spawn('cargo',['run','--locked','-p','jidecards_core','--features','anki-core','--example','protocol_probe'],
  {cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','inherit'],windowsHide:true});
const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
const record=[];
const old=new Map();
async function compare(file,entry,args){
  if(!old.has(file))old.set(file,await import('./tests/fixtures/protocol-legacy/proto/messages/'+file+'.ts'));
  const now=await import('../entry/src/main/ets/proto/messages/'+file+'.ts');
  const before=pack(old.get(file)[entry](...args));const after=pack(now[entry](...args));
  // Added SchedulingStates.raw is verified independently, never erases a pre-existing property.
  const comparable=structuredClone(after);
  if(entry==='decodeQueuedCards')for(const card of comparable.cards)delete card.states.raw;
  if(entry==='decodeSchedulingStates')delete comparable.raw;
  assert.deepEqual(comparable,before,`${file}.${entry}: real Core sample`);
  record.push({file,entry,inputs:pack(args),old:before,new:after});
  return now[entry](...args);
}
const transport={调用:async(service,method,input)=>{
  child.stdin.write(JSON.stringify({service,method,input:Buffer.from(input).toString('hex')})+'\n');
  const line=await lines.next();assert.ok(!line.done,'Core probe terminated unexpectedly');const result=JSON.parse(line.value);
  const output=new Uint8Array(Buffer.from(result.output,'hex'));
  if(result.error){await compare('BackendMessages','decodeBackendError',[output]);throw Error('Core returned a protocol error');}
  return output;
}};
try {
  const first=await lines.next();assert.ok(!first.done);const fixture=JSON.parse(first.value);const rpc=new CoreRpc(transport);
  const queued=await compare('SchedulerMessages','decodeQueuedCards',[await rpc.Scheduler_get_queued_cards(
    await compare('SchedulerMessages','encodeGetQueuedCardsRequest',[1,false]))]);
  assert.equal(queued.cards[0].cardId,fixture.cardId);
  const states=queued.cards[0].states;
  const raw=await compare('SchedulerMessages','encodeSchedulingStates',[{current:states.current,again:states.again,hard:states.hard,good:states.good,easy:states.easy}]);
  assert.deepEqual(scheduler.encodeSchedulingStates(states),raw);
  await rpc.Scheduler_describe_next_states(raw);
  const answer={cardId:fixture.cardId,currentState:states.current,newState:states.good,rating:2,answeredAtMillis:Date.now(),millisecondsTaken:1234};
  await rpc.Scheduler_answer_card(await compare('SchedulerMessages','encodeCardAnswer',[answer]));
  const undo=await compare('CollectionMessages','decodeUndoStatus',[await rpc.Collection_get_undo_status()]);assert.ok(undo.undo);
  await compare('CollectionMessages','decodeOpChangesAfterUndo',[await rpc.Collection_undo()]);
  const preferenceBytes=await rpc.Config_get_preferences();
  const edits=[{field:prefs.ReviewPreferenceField.LearnAheadSecs,value:777}];
  const changed=await compare('PreferencesMessages','patchReviewPreferences',[preferenceBytes,edits]);
  await rpc.Config_set_preferences(changed);
  assert.equal((await compare('PreferencesMessages','decodeReviewPreferences',[await rpc.Config_get_preferences()])).learnAheadSecs,777);
  const searchInput={search:'',order:{kind:'none'}};
  const found=await compare('SearchMessages','decodeSearchResponse',[await rpc.Search_search_cards(await compare('SearchMessages','encodeSearchRequest',[searchInput]))]);assert.ok(found.includes(fixture.cardId));
  await compare('CardsMessages','decodeCard',[await rpc.Cards_get_card(await compare('CardsMessages','encodeCardId',[fixture.cardId]))]);
  const note=await compare('NoteMessages','decodeNote',[await rpc.Notes_get_note(await compare('NoteMessages','encodeNoteId',[fixture.noteId]))]);
  const fieldRequest=new messages.NotesFieldNamesForNotesRequest();fieldRequest.setNids([fixture.noteId]);
  const fieldNames=new messages.NotesFieldNamesForNotesResponse(await rpc.Notes_field_names_for_notes(fieldRequest.toBytes())).getFields();
  assert.ok(fieldNames.includes('Front'));assert.ok(fieldNames.includes('Back'));
  const grade=new messages.SchedulerGradeNowRequest();grade.setCardIds([fixture.cardId]);grade.setRating(2);
  const beforeGrade=cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(fixture.cardId)));
  await rpc.Scheduler_grade_now(grade.toBytes());
  const afterGrade=cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(fixture.cardId)));
  assert.equal(afterGrade.reps,beforeGrade.reps+1);
  await rpc.Collection_undo();assert.equal(cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(fixture.cardId))).reps,beforeGrade.reps);
  const browserColumns=new messages.GenericStringList();browserColumns.setVals(['question','answer']);
  await rpc.Search_set_active_browser_columns(browserColumns.toBytes());
  assert.equal(search.decodeBrowserRow(await rpc.Search_browser_row_for_id(search.encodeInt64Request(fixture.cardId))).cells.length,2);
  const browserPreference=new messages.ConfigSetConfigJsonRequest();browserPreference.setKey('jideBrowserPreferences');
  const browserPreferenceJson=JSON.stringify({mode:'cards',sortColumn:'noteFld',sortReverse:false,subtitleIndex:1,cardsColumns:['question','answer'],notesColumns:[],recentSearches:['deck:Default']});
  await rpc.Config_set_config_json(config.encodeSetConfigJsonRequest({key:'jideBrowserPreferences',valueJson:browserPreferenceJson,undoable:false}));
  note.fields[1]='Saved through generated wire 😀';
  await rpc.Notes_update_notes(await compare('NoteMessages','encodeUpdateNotesRequest',[[note]]));
  assert.equal((await compare('NoteMessages','decodeNote',[await rpc.Notes_get_note(notes.encodeNoteId(fixture.noteId))])).fields[1],note.fields[1]);
  const add=new messages.MediaAddMediaFileRequest();add.setDesiredName('probe.txt');add.setData(new Uint8Array([0,128,255]));
  const filename=new messages.GenericString(await rpc.Media_add_media_file(add.toBytes())).getVal();assert.equal(filename,'probe.txt');
  const check=await rpc.Media_check_media();await compare('MediaMessages','decodeCheckMediaResponse',[check]);await compare('MediaMessages','decodeCheckMediaSummary',[check]);
  await rpc.Media_trash_media_files(await compare('MediaMessages','encodeTrashMediaFilesRequest',[[filename]]));await rpc.Media_restore_trash();
  const apkg=path.join(fixture.directory,'probe.apkg');
  await rpc.ImportExport_export_anki_package(await compare('ImportExportMessages','encodeExportAnkiPackageRequest',[apkg,1]));
  const imported=await rpc.ImportExport_import_anki_package(await compare('ImportExportMessages','encodeImportAnkiPackageRequest',[apkg]));
  await compare('ImportExportMessages','decodeImportResponse',[imported]);
  await rpc.ImportExport_export_note_csv(await compare('TextExportMessages','encodeTextExportRequest',[path.join(fixture.directory,'probe.txt'),1,
    {kind:'notes',withHtml:true,withTags:true,withDeck:true,withNotetype:true,withGuid:true}]));
  await assert.rejects(rpc.Cards_get_card(cards.encodeCardId(-1)),/protocol error/);
  await rpc.ImportExport_export_collection_package(await compare('ImportExportMessages','encodeExportCollectionPackageRequest',[path.join(fixture.directory,'probe.colpkg')]));
  await compare('SyncMessages','decodeMediaSyncStatusResponse',[await rpc.Sync_media_sync_status()]);await rpc.Sync_abort_sync();
  await rpc.ImportExport_import_collection_package(await compare('ImportExportMessages','encodeImportCollectionPackageRequest',[{
    colPath:path.join(fixture.directory,'protocol.anki2'),backupPath:path.join(fixture.directory,'probe.colpkg'),
    mediaFolder:path.join(fixture.directory,'media'),mediaDb:path.join(fixture.directory,'media.db')
  }]));
  await rpc.Collection_open_collection(await compare('CollectionMessages','encodeOpenCollectionRequest',[{
    collectionPath:path.join(fixture.directory,'protocol.anki2'),mediaFolderPath:path.join(fixture.directory,'media'),mediaDbPath:path.join(fixture.directory,'media.db')
  }]));
  const restored=await compare('NoteMessages','decodeNote',[await rpc.Notes_get_note(notes.encodeNoteId(fixture.noteId))]);
  assert.equal(restored.id,fixture.noteId);
  assert.deepEqual(JSON.parse(config.decodeJsonResponse(await rpc.Config_get_all_config())).jideBrowserPreferences,JSON.parse(browserPreferenceJson));
  await assert.rejects(rpc.Search_browser_row_for_id(search.encodeInt64Request(fixture.cardId)),/protocol error/);
  await rpc.Search_set_active_browser_columns(browserColumns.toBytes());
  assert.equal(search.decodeBrowserRow(await rpc.Search_browser_row_for_id(search.encodeInt64Request(fixture.cardId))).cells.length,2);
  child.stdin.end();const [code]=await once(child,'exit');assert.equal(code,0);
  mkdirSync('.local',{recursive:true});writeFileSync('.local/protocol-core-evidence.json',JSON.stringify({revision:'26.05-e64c6b1',samples:record,
    scope:'temporary synthetic collection; production codecs + official dispatch + locked Core',
    browser:['field names','grade now and undo','preference persistence','columns lost on reopen and restored'],onlineSync:'not-run'},null,2)+'\n');
  console.log(`[protocol-core] ${record.length} old/new comparisons; study/config/search/cards/notes/media/packages/text/sync control passed`);
} finally { if(child.exitCode===null)child.kill(); }
