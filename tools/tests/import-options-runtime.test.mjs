// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { ImportOperation, ImportCancelled } from '../../entry/src/main/ets/model/ImportOperation.ts';
import { validateCsvMapping, copyCsvMetadata } from '../../entry/src/main/ets/model/CsvImport.ts';
import { emptyCsvMetadata, decodeCsvMetadata, encodeCsvImport, encodeCsvMetadataRequest } from '../../entry/src/main/ets/proto/messages/CsvImportMessages.ts';
import { decodeImportResponse } from '../../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import { 协议读取器 as Reader } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS } from '../../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import { 后端错误 } from '../../entry/src/main/ets/backend/错误类型.ts';
import { importFileKind, importFileName } from '../../entry/src/main/ets/model/ImportFile.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('package option remounts restore the submitted draft instead of displaying defaults',()=>{
 const Options=loadComponentLogic('components/import/PackageImportOptions.ets','PackageImportOptions',{DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS});
 const panel=new Options();panel.options={withScheduling:true,withDeckConfigs:true,mergeNotetypes:true,updateNotes:2,updateNotetypes:1};
 panel.aboutToAppear();assert.equal(panel.scheduling,true);assert.equal(panel.configs,true);assert.equal(panel.notes,2);
 let published;panel.onChange=value=>{published=value;};panel.notetypes=0;panel.changed();
 assert.deepEqual(published,{...panel.options,updateNotetypes:0});
});
function harness(overrides={}) {
 const states=[],events=[];const backend={pickDeck:async()=>'/deck',pickText:async()=>'/text',discardCsv:async()=>events.push('discard'),
 importDeck:async()=>decodeImportResponse(new Uint8Array()),committed:()=>events.push('committed'),...overrides};
 const session=new DataTransferSession(backend,s=>states.push(s),async()=>events.push('refresh'),()=>events.push('success'));
 return {session,states,events};
}
test('unified picker selects APKG before options and imports its granted URI exactly once',async()=>{
 let picked=0,writes=0;const options={...DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS,withScheduling:true};
 const h=harness({pickImportFile:async()=>{picked++;return {uri:'file://docs/deck%20one.APKG',name:'deck one.APKG'};},
  pickDeck:async()=>assert.fail('must reuse selected URI'),importDeck:async(uri,_p,value)=>{
   writes++;assert.equal(uri,'file://docs/deck%20one.APKG');assert.deepEqual(value,options);return decodeImportResponse(new Uint8Array());}});
 await h.session.startImport();assert.equal(writes,0);assert.equal(h.states.at(-1).mode,'importDeck');
 assert.equal(h.states.at(-1).fileName,'deck one.APKG');assert.equal(h.states.at(-1).phase,'idle');
 await h.session.execute({kind:'importDeck',options});await h.session.execute({kind:'importDeck',options});
 assert.equal(writes,1);assert.equal(picked,1);
});
test('unified picker detects text and loads preview without writing',async()=>{
 const metadata={...emptyCsvMetadata(),columnLabels:['Q','A'],fieldColumns:[1,2],deckId:1,notetypeId:2};
 const h=harness({pickImportFile:async()=>({uri:'file://docs/words.TSV',name:'words.TSV'}),
  prepareCsv:async uri=>{assert.equal(uri,'file://docs/words.TSV');return {metadata,notetypes:[]};}});
 await h.session.startImport();assert.equal(h.states.at(-1).mode,'importText');
 assert.deepEqual(h.states.at(-1).csv.metadata,metadata);assert.deepEqual(h.events,[]);
 h.session.close();assert.deepEqual(h.events,['discard']);
});
test('unified picker reserves occupancy, cancellation closes, and errors allow another selection',async()=>{
 const gate=deferred();let picks=0;const h=harness({pickImportFile:()=>{picks++;return gate.promise;}});
 const pending=h.session.startImport();await h.session.startImport();h.session.close();
 assert.equal(picks,1);assert.equal(h.states.at(-1).phase,'picking');assert.equal(h.states.at(-1).visible,true);
 gate.resolve(null);await pending;assert.equal(h.states.at(-1).visible,false);assert.deepEqual(h.events,[]);
 const bad=harness({pickImportFile:async()=>({uri:'/backup.colpkg',name:'backup.colpkg'})});
 await bad.session.startImport();assert.equal(bad.states.at(-1).error,'transfer_file_unsupported');assert.equal(bad.states.at(-1).mode,'importFile');
 assert.deepEqual(bad.events,[]);
});
test('departed picker results cannot stage or import files',async()=>{
 const gate=deferred();let staged=0;const h=harness({pickImportFile:()=>gate.promise,prepareCsv:async()=>{staged++;}});
 const pending=h.session.startImport();h.session.dispose();const count=h.states.length;
 gate.resolve({uri:'/text.csv',name:'text.csv'});await pending;
 assert.equal(staged,0);assert.equal(h.states.length,count);assert.deepEqual(h.events,[]);
});
test('file classification is case insensitive and never treats a query suffix as its filename',()=>{
 assert.equal(importFileName('file://docs/%E8%AF%8D%E6%B1%87%20one.CSV?token=.apkg'),'词汇 one.CSV');
 for(const name of ['a.CSV','a.tsv','a.TXT'])assert.equal(importFileKind(name),'importText');
 assert.equal(importFileKind('a.APKG'),'importDeck');assert.equal(importFileKind('a.colpkg'),'unsupported');
 assert.equal(importFileKind('a.csv.exe'),'unsupported');
});
test('package settings reach the backend and the result remains visible without resubmission',async()=>{
 const options={mergeNotetypes:true,updateNotes:1,updateNotetypes:2,withScheduling:true,withDeckConfigs:true};
 let imports=0;const result={...decodeImportResponse(new Uint8Array()),newNotes:4,updatedNotes:2,foundNotes:6};
 const h=harness({importDeck:async(_uri,_progress,value)=>{imports++;assert.deepEqual(value,options);return result;}});
 h.session.open('importDeck',0,false);await h.session.execute({kind:'importDeck',options});
 assert.equal(h.states.at(-1).visible,true);assert.deepEqual(h.states.at(-1).result,result);
 await h.session.execute({kind:'importDeck',options});assert.equal(imports,1);
 assert.deepEqual(h.events,['committed','refresh','success']);h.session.close();assert.equal(h.states.at(-1).visible,false);
});
test('external open waits for options, keeps the queue lease, and submits without a second picker',async()=>{
 let imported=0,finished=false;const options={withScheduling:true,withDeckConfigs:false,mergeNotetypes:false,updateNotes:2,updateNotetypes:0};
 const h=harness({pickDeck:async()=>assert.fail('external URI must not reopen picker'),
   importDeck:async(uri,_progress,settings)=>{imported++;assert.equal(uri,'provider://deck');assert.deepEqual(settings,options);return decodeImportResponse(new Uint8Array());}});
 const work=h.session.importUri('provider://deck',true).then(()=>{finished=true;});await Promise.resolve();
 assert.equal(imported,0);assert.equal(finished,false);assert.equal(h.states.at(-1).externalInput,true);
 await h.session.importUri('provider://duplicate',true);assert.equal(imported,0);
 await h.session.execute({kind:'importText'});assert.equal(imported,0);
 await h.session.execute({kind:'importDeck',options});await work;
 assert.equal(imported,1);assert.equal(finished,true);assert.equal(h.states.at(-1).externalInput,false);assert.equal(h.states.at(-1).visible,true);
});
for(const exit of ['close','dispose']) test(`external options ${exit} releases the queued file without writing`,async()=>{
 let imported=0;const h=harness({importDeck:async()=>{imported++;}});const work=h.session.importUri('provider://deck',true);
 h.session[exit]();await work;assert.equal(imported,0);
});
test('cancellation holds occupancy until work settles and does not report a committed success',async()=>{
 const gate=deferred();let operation;
 const h=harness({importDeck:async(_u,_p,_o,op)=>{operation=op;await gate.promise;op.check();}});
 const work=h.session.importUri('/deck');h.session.cancel();h.session.close();
 assert.equal(operation.cancelled,true);assert.equal(h.states.at(-1).phase,'running');
 gate.resolve();await work;assert.equal(h.states.at(-1).cancelled,true);assert.deepEqual(h.events,[]);
});
test('a commit that wins the cancel race is still reported as success',async()=>{
 const gate=deferred();const h=harness({importDeck:()=>gate.promise});const work=h.session.importUri('/deck');
 h.session.cancel();gate.resolve(decodeImportResponse(new Uint8Array()));await work;
 assert.equal(h.states.at(-1).cancelled,false);assert.deepEqual(h.events,['committed','refresh','success']);
});
test('CSV preview does not write, invalid mapping is blocked, accepted mapping is forwarded',async()=>{
 const metadata={...emptyCsvMetadata(),columnLabels:['front','back'],notetypeId:2,deckId:1,fieldColumns:[1,2],preview:[['Q','A']]};
 let writes=0;const h=harness({prepareCsv:async()=>({metadata,notetypes:[]}),importCsv:async(m)=>{writes++;assert.equal(m.dupeResolution,1);return decodeImportResponse(new Uint8Array());}});
 h.session.open('importText',0,false);await h.session.execute({kind:'importText'});assert.equal(writes,0);
 await h.session.execute({kind:'importText',metadata:{...metadata,deckId:0}});assert.equal(writes,0);
 await h.session.execute({kind:'importText',metadata:{...metadata,dupeResolution:1}});assert.equal(writes,1);assert.equal(h.states.at(-1).csv,null);
});
test('CSV preview completion after disposal cleans staging without publishing',async()=>{
 const gate=deferred();const h=harness({prepareCsv:()=>gate.promise});h.session.open('importText',0,false);
 const work=h.session.execute({kind:'importText'});await Promise.resolve();h.session.dispose();const count=h.states.length;
 gate.resolve({metadata:emptyCsvMetadata(),notetypes:[]});await work;assert.equal(h.states.length,count);assert.deepEqual(h.events,['discard']);
});
test('CSV protocol preserves oneofs, headers, packed mappings, explicit tab and false HTML',()=>{
 const mapped=new Writer();mapped.写入64位整数(1,123);mapped.写入打包64位整数(2,[2,1,0]);
 const row=new Writer();row.写入字符串(1,'a,b');row.写入字符串(1,'two\nlines');
 const w=new Writer();w.写入变长整数(1,4);w.写入字符串(3,'tag');w.写入字符串(4,'updated');
 w.写入字符串(5,'Front');w.写入字符串(5,'Back');w.写入变长整数(7,2);w.写入子消息(8,mapped);
 w.写入子消息(13,row);w.写入变长整数(14,1);w.写入变长整数(15,2);w.写入变长整数(16,1);
 const m=decodeCsvMetadata(w.转为字节());assert.deepEqual(m.fieldColumns,[2,1,0]);assert.deepEqual(m.preview,[['a,b','two\nlines']]);
 const r=new Reader(encodeCsvImport('/text',m));r.读取标签();assert.equal(r.读取字符串(),'/text');r.读取标签();
 const round=decodeCsvMetadata(r.读取字节());assert.deepEqual({...round,preview:m.preview},m);
 const request=new Reader(encodeCsvMetadataRequest('/text',0));request.读取标签();request.读取字符串();assert.equal(request.读取标签().字段号,2);assert.equal(request.读取变长整数(),0);
 const copy=copyCsvMetadata(m);copy.fieldColumns[0]=1;assert.equal(m.fieldColumns[0],2);
 assert.equal(validateCsvMapping({...m,fieldColumns:[3]}),false);
});
test('import summary retains every skipped category',()=>{
 const log=new Writer();for(let i=1;i<=8;i++)log.写入子消息(i,new Writer());log.写入变长整数(10,8);
 const response=new Writer();response.写入子消息(2,log);const result=decodeImportResponse(response.转为字节());
 assert.deepEqual(result,{newNotes:1,updatedNotes:1,duplicateNotes:1,conflictingNotes:1,firstFieldMatches:1,missingNotetypeNotes:1,missingDeckNotes:1,emptyFirstFieldNotes:1,foundNotes:8});
});
test('progress polling is drained and maps only actual Core interruption to cancellation',async()=>{
 const gate=deferred(),timers=[];let cancelCalls=0;
 const api=loadPlatformModule('backend/ImportProgressService.ts','withImportProgress',{
  后端会话:{获取实例:()=>({调用进度控制:async method=>{if(method===5)cancelCalls++;return new Uint8Array();}})},
  集合方法:{最新进度:4,设置中止请求:5},协议读取器:Reader,ImportCancelled,后端错误,
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}
 });
 const op=new ImportOperation(()=>{});const work=api(op,()=>gate.promise);op.cancel();timers.shift()();
 for(let i=0;i<5;i++)await Promise.resolve();assert.equal(cancelCalls,1);
 gate.reject(new 后端错误('interrupted',2,'',3));await assert.rejects(work,ImportCancelled);
});
