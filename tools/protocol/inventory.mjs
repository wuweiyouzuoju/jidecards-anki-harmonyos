// SPDX-License-Identifier: AGPL-3.0-or-later
// Discovery report, not a permission catalogue. Protocol generation never registers JIDE tools.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { methodNames } from '../verify-rpc-index.mjs';
const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
function walk(directory) {
  // Directory enumeration differs across platforms; generated reports use code-unit path order.
  return readdirSync(new URL(directory, root), {withFileTypes:true}).flatMap(entry => entry.isDirectory()
    ? walk(directory+'/'+entry.name) : /\.(ts|ets|mjs)$/.test(entry.name) ? [directory+'/'+entry.name] : []).sort();
}
const className = name => name.replace(/^anki\./,'').split(/[._]/).map(part => part[0].toUpperCase()+part.slice(1)).join('');
export function inventory(schema) {
  const app=walk('entry/src/main/ets').filter(file=>!file.includes('/proto/generated/'));
  const texts=new Map(app.map(file=>[file,read(file)]));
  const tests=walk('tools/tests').filter(file=>file.endsWith('.test.mjs'));
  const testTexts=new Map(tests.map(file=>[file,read(file)]));
  const corpus=JSON.parse(read('tools/tests/fixtures/protocol-legacy/corpus.json'));
  const serviceCases=JSON.parse(read('tools/tests/fixtures/protocol-service-cases.json')).cases;
  const messages=new Map(schema.messages.map(message=>[className(message.name),message.name]));
  const aliases=JSON.parse(read('tools/rpc-index-methods.json'));
  const modules=new Map();
  for(const file of app.filter(file=>file.includes('/proto/messages/'))){const text=texts.get(file);
    const functions=new Map([...(text+'\nexport __END').matchAll(/^(?:export )?function ([\w\u0080-\uffff]+)\([^]*?(?=^(?:export |function |const |interface |type ))/gm)].map(match=>[match[1],match[0]]));
    const imports=new Map();
    for(const match of text.matchAll(/import \{([^}]+)\} from '(\.\/[^']+)';/g))for(const symbol of match[1].split(','))imports.set(symbol.trim(),path.posix.normalize(path.posix.join(path.posix.dirname(file),match[2]+'.ts')));
    modules.set(file,{functions,imports});
  }
  function sources(file,entry,seen=new Set()) {
    const key=file+'#'+entry;if(seen.has(key))return [];seen.add(key);
    const module=modules.get(file),body=module?.functions.get(entry)??'';
    const result=[...body.matchAll(/(?:new (\w+)\(|\b(\w+)\.FIELD_)/g)].map(match=>messages.get(match[1]??match[2])).filter(Boolean);
    for(const name of module?.functions.keys()??[])if(name!==entry&&body.includes(name+'('))result.push(...sources(file,name,seen));
    for(const[name,target]of module?.imports??[])if(body.includes(name+'('))result.push(...sources(target,name,seen));
    return [...new Set(result)].sort();
  }
  const migrations=[];
  for(const[file,module]of modules)for(const[entry,body]of module.functions){if(!body.startsWith('export '))continue;
    const vectors=corpus.filter(row=>row.file===path.posix.basename(file)&&row.entry===entry);
    migrations.push({entry,old:'tools/tests/fixtures/protocol-legacy/proto/messages/'+path.posix.basename(file),adapter:file,
      generatedSources:sources(file,entry),callers:app.filter(caller=>caller!==file&&texts.get(caller).includes(entry)),
      evidence:{oracleInputs:vectors.length,successfulInputs:vectors.filter(row=>!row.outcome.error).length,
        tests:tests.filter(test=>testTexts.get(test).includes(entry)),differential:'tools/tests/protocol-generation.test.mjs',
        expandedDifferential:'tools/tests/protocol-equivalence.test.mjs',
        serviceDifferential:serviceCases.filter(row=>row.encoder.file===path.posix.basename(file)&&row.encoder.entry===entry)
          .map(row=>({caller:'entry/src/main/ets/backend/'+row.file,method:row.method,test:'tools/tests/protocol-service-forwarders.test.mjs'}))
          .filter((row,index,rows)=>rows.findIndex(item=>item.caller===row.caller&&item.method===row.method)===index)}});
  }
  const rpc=schema.services.flatMap(service=>service.methods.map(method=>{
    const wrapper=service.name.replace(/^Backend/,'').replace(/Service$/,'')+'_'+method.name;
    const wrapperCallers=app.filter(file=>texts.get(file).includes('.'+wrapper+'('));
    // Session state gates and independent progress control deliberately retain the generated aliases.
    const serviceKey=service.name.replace(/^Backend/,'').replace(/Service$/,'').replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase();
    const table=[...methodNames].find(([,name])=>name===serviceKey)?.[0];
    const contractCallers=[...new Set(Object.entries(aliases.methods[table]??{}).filter(([,name])=>name===method.name)
      .flatMap(([alias])=>app.filter(file=>!file.includes('/proto/')&&!file.endsWith('/服务索引.ts')&&texts.get(file).includes(table+'.'+alias))))];
    const callers=[...new Set([...wrapperCallers,...contractCallers])];
    return{service:service.name,method:method.name,id:[service.id,method.id],input:method.input,output:method.output,
      wrapper,status:wrapperCallers.length?'领域 Service 已调用':contractCallers.length?'生命周期/控制契约已调用':'未接入',callers,wrapperCallers,contractCallers};
  }));
  return {revision:schema.revision,counts:{files:schema.files.length,upstreamMessages:schema.messages.filter(m=>m.name.startsWith('anki.')).length,
    privateMessages:schema.messages.filter(m=>m.name.startsWith('jide.')).length,enums:schema.enums.length,backendServices:schema.services.length,
    backendMethods:rpc.length,domainMethods:rpc.filter(m=>m.wrapperCallers.length).length,
    contractMethods:rpc.filter(m=>!m.wrapperCallers.length&&m.contractCallers.length).length,
    unconnectedMethods:rpc.filter(m=>!m.callers.length).length,migrations:migrations.length},
    capabilityPolicy:'生成覆盖不等于产品接入；无领域调用为未接入。有调用也须经过原有 UI/JIDE 能力目录、权限与确认流程。',
    migrations,rpc,privateRpc:JSON.parse(read('tools/protocol/private-rpc.json')),
    nativeMessages:JSON.parse(read('tools/protocol/native-messages.json')),
    schedulingNodes:JSON.parse(read('tools/protocol/scheduling-nodes.json')),
    nativeMigrations:[
      {old:'native/media_snapshot.rs',adapter:'native/rsharmony/src/media_snapshot.rs',source:['jide.MediaRequest','jide.MediaPage','anki.media.CheckMediaResponse','anki.tags.NoteIdsAndTagsRequest','anki.collection.OpChangesWithCount','anki.generic.StringList'],callers:['媒体服务.ts'],evidence:'native/rsharmony/src/protocol_legacy_tests.rs'},
      {old:'native/deck_preview.rs',adapter:'native/rsharmony/src/deck_preview.rs',source:['jide.DeckPreviewRequest','jide.DeckPreviewResponse','anki.backend.BackendError'],callers:['DeckPreviewService.ts'],evidence:'native/rsharmony/src/protocol_legacy_tests.rs'},
      {old:'native/note_duplicates.rs',adapter:'native/rsharmony/src/note_duplicates.rs',source:['jide.NoteDuplicateRequest','jide.DuplicateField','jide.NoteDuplicateResponse','anki.backend.BackendError'],callers:['AnkiNoteDuplicates.ts'],evidence:'native/rsharmony/src/protocol_legacy_tests.rs'},
      {old:'native/collection_history.rs',adapter:'native/rsharmony/src/collection_history.rs',source:['anki.collection.UndoStatus','anki.backend.BackendError'],callers:['CollectionHistoryBackend.ts'],evidence:'native/rsharmony/src/protocol_legacy_tests.rs'},
      {old:'native/custom_scheduling.rs',adapter:'native/rsharmony/src/custom_scheduling.rs',source:['jide.CustomSchedulingRequest','anki.generic.String','tools/protocol/scheduling-nodes.json'],callers:['CustomSchedulingService.ts'],evidence:'native/rsharmony/src/custom_scheduling.rs#generated_schema_matches_legacy_json_patch_bytes_and_errors'}]
      .map(row=>({...row,old:'tools/tests/fixtures/protocol-legacy/'+row.old,callers:row.callers.map(file=>'entry/src/main/ets/backend/'+file)})),
    contractMigrations:rpc.filter(m=>!m.wrapperCallers.length&&m.contractCallers.length).map(m=>({
      method:m.method,old:m.contractCallers.map(file=>'tools/tests/fixtures/protocol-legacy/backend/'+path.posix.basename(file)),
      callers:m.contractCallers,generatedSources:[m.input,m.output],dispatchSource:'entry/src/main/ets/backend/服务索引.ts',
      reason:'保留后端会话状态门控、关闭集合导入和独立进度取消通道；字段与编号均来自统一生成',
      evidence:['tools/tests/backend-session-lifecycle.test.mjs','tools/tests/backend-session-contract.test.mjs','tools/tests/data-transfer-contract.test.mjs']})),
    inlineMigrations:[
      {old:'backend/错误类型.ts#规范化后端错误种类',adapter:'entry/src/main/ets/backend/错误类型.ts',source:['anki.backend.BackendError.Kind'],evidence:'tools/tests/protocol-services.test.mjs'},
      {old:'backend/媒体服务.ts#encodeAddMediaFileRequest,decodeString',adapter:'entry/src/main/ets/backend/媒体服务.ts',source:['anki.media.AddMediaFileRequest','anki.generic.String'],evidence:'tools/tests/protocol-services.test.mjs'},
      {old:'backend/笔记服务.ts#clozeNumbersInNote',adapter:'entry/src/main/ets/backend/笔记服务.ts',source:['anki.notes.ClozeNumbersInNoteResponse'],evidence:'tools/tests/protocol-services.test.mjs'},
      {old:'backend/笔记类型服务.ts#restoreNotetypeToStock',adapter:'entry/src/main/ets/backend/笔记类型服务.ts',source:['anki.notetypes.RestoreNotetypeToStockRequest'],evidence:'tools/tests/protocol-services.test.mjs'},
      {old:'backend/ImportProgressService.ts#importProgressText',adapter:'entry/src/main/ets/backend/ImportProgressService.ts',source:['anki.collection.Progress'],evidence:'tools/tests/protocol-services.test.mjs'},
      {old:'backend/CollectionHistoryBackend.ts#apply',adapter:'entry/src/main/ets/backend/CollectionHistoryBackend.ts',source:['anki.collection.UndoStatus'],evidence:'tools/tests/collection-history-backend.test.mjs'}]
      .map(row=>({...row,old:'tools/tests/fixtures/protocol-legacy/'+row.old}))};
}
