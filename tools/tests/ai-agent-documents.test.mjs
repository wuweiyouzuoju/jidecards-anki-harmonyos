// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AgentDocumentAccess, agentDocumentTools } from '../../entry/src/main/ets/model/agent/AgentDocuments.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { providerSupportsImages } from '../../entry/src/main/ets/model/agent/ProviderCatalog.ts';
import { decodeAgentToolArguments } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { safeAgentSessionState, compactAgentToolOutputs } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { normalizeAgentDocumentText } from '../../entry/src/main/ets/model/agent/AgentDocumentText.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const info = (id='doc',extra={}) => ({id,name:'教材.pdf',extension:'.pdf',byteSize:3,pageCount:140,warningCode:'',...extra});
function accessHarness() {
  const calls=[]; const notes=new Map();
  const repository={list:c=>c==='chat'?[info()]:[],
    async read(c,id,p,mode){calls.push({c,id,p,mode});if(p===3)throw Error('ocr_unavailable');
      return {documentId:id,page:p,text:'事实'.repeat(7000),method:mode,notes:notes.get(p)??'',warning:'',
        image:mode==='image'?{imageUrl:'data:image/jpeg;base64,YWJj'}:undefined};},
    saveNotes(c,id,p,text){notes.set(p,text);}};
  const access=new AgentDocumentAccess(repository); access.bind('chat',true);access.submit(['doc']);
  return {access,repository,calls,notes};
}
test('document tools isolate conversations, validate all parameters and only annotate pages actually read',async()=>{
  const {access,calls}=accessHarness();
  assert.equal(JSON.parse((await access.execute('list_documents','{}')).outputJson).documents[0].pageCount,140);
  assert.throws(()=>access.sourceLabel({documentId:'doc',page:1}),/not_read/);
  for(const args of [{documentId:'../doc',page:1},{documentId:'doc',page:0},{documentId:'doc',page:141},
    {documentId:'other',page:1},{documentId:'doc',page:1,length:12001},{documentId:'doc',page:1,offset:-1},
    {documentId:'doc',page:1,includeImage:'yes'},{documentId:'doc',page:1,path:'/etc/passwd'}]){
    await assert.rejects(()=>access.execute('read_document_page',JSON.stringify(args)),/document_/);
  }
  assert.equal(calls.length,0);
  const page=JSON.parse((await access.execute('read_document_page','{"documentId":"doc","page":130}')).outputJson);
  assert.equal(page.page,130);assert.equal(page.nextOffset,12000);assert.equal(page.nextPage,131);
  const tail=JSON.parse((await access.execute('read_document_page','{"documentId":"doc","page":130,"offset":12000}')).outputJson);
  assert.equal(tail.nextOffset,-1);assert.equal(page.text+tail.text,'事实'.repeat(7000));
  const fields=access.annotate(['Q','A'],[{documentId:'doc',page:130}]);
  assert.equal(fields[0],'Q');assert.match(fields[1],/data-jide-page="130"/);assert.match(fields[1],/教材.pdf/);
  access.bind('other',true);assert.deepEqual(JSON.parse((await access.execute('list_documents','{}')).outputJson).documents,[]);
  await assert.rejects(()=>access.execute('read_document_page','{"documentId":"doc","page":1}'),/not_in_session/);
});
test('JIDE can choose system OCR with a text-only provider and save reusable notes without card writes',async()=>{
  const {access,calls,notes}=accessHarness();access.bind('chat',false);
  await assert.rejects(()=>access.execute('read_document_page','{"documentId":"doc","page":1,"includeImage":true}'),/vision_unavailable_use_ocr/);
  assert.equal(calls.length,0);
  const result=await access.execute('ocr_document_page','{"documentId":"doc","page":1}');
  assert.equal(JSON.parse(result.outputJson).method,'ocr');assert.equal(result.images,undefined);
  await access.execute('save_document_notes','{"documentId":"doc","page":1,"notes":"公式待核实"}');
  assert.equal(notes.get(1),'公式待核实');
  const reread=JSON.parse((await access.execute('read_document_page','{"documentId":"doc","page":1}')).outputJson);
  assert.equal(reread.modelNotes,'公式待核实');
  await assert.rejects(()=>access.execute('save_document_notes','{"documentId":"doc","page":2,"notes":"invented"}'),/not_read/);
  await assert.rejects(()=>access.execute('ocr_document_page','{"documentId":"doc","page":3}'),/ocr_unavailable/);
  assert.throws(()=>access.sourceLabel({documentId:'doc',page:3}),/not_read/);
});
test('late page reads cannot authorize another conversation and cancellation allows explicit retry',async()=>{
  const {access,repository}=accessHarness();let finish;
  repository.read=()=>new Promise(resolve=>{finish=resolve;});
  const pending=access.execute('read_document_page','{"documentId":"doc","page":1}');
  access.cancel();finish({text:'late',notes:'',method:'text',warning:''});
  await assert.rejects(()=>pending,/cancelled/);assert.throws(()=>access.sourceLabel({documentId:'doc',page:1}),/not_read/);
});

function nativeStoreHarness(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jide-document-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const events=[]; const nativeFs={OpenMode:{CREATE:fs.constants.O_CREAT,WRITE_ONLY:fs.constants.O_WRONLY,TRUNC:fs.constants.O_TRUNC},
    accessSync:fs.existsSync,mkdirSync:(p,r)=>fs.mkdirSync(p,{recursive:r}),
    openSync:(p,flags)=>({fd:fs.openSync(p,flags),name:path.basename(p)}),closeSync:f=>fs.closeSync(typeof f==='number'?f:f.fd),fsyncSync:fs.fsyncSync,
    readSync:(fd,buf,o)=>fs.readSync(fd,new Uint8Array(buf),0,o.length,o.offset),
    writeSync:(fd,buf)=>fs.writeSync(fd,new Uint8Array(buf)),renameSync:fs.renameSync,readTextSync:p=>fs.readFileSync(p,'utf8'),
    listFileSync:fs.readdirSync,rmdirSync:p=>fs.rmSync(p,{recursive:true}),statSync:fs.statSync};
  const pixel={async release(){events.push('pixel-release');}};
  const page={getGraphicsObjects(){events.push('graphics');return [{type:1,text:'JIDE reference text'}, {type:3,text:'not text'}];},
    getWidth:()=>600,getHeight:()=>800,getCustomPagePixelMap(){return pixel;},release(){events.push('page-release');}};
  const pdfService={ParseResult:{PARSE_SUCCESS:0,PARSE_ERROR_PASSWORD:4},GraphicsObjectType:{OBJECT_TEXT:1},PdfMatrix:class{},
    PdfDocument:class {loadDocument(){return 0;}getPageCount(){return 140;}getPage(){return page;}releaseDocument(){events.push('pdf-release');}}};
  let ocrReady=true;
  const textRecognition={async init(){events.push('ocr-init');return ocrReady;},async recognizeText(){events.push('ocr');return {value:'OCR scan 12345'};},async release(){events.push('ocr-release');}};
  const image={createImagePacker:()=>({async packToData(){return Uint8Array.from([1,2,3]).buffer;},async release(){events.push('packer-release');}})};
  const {AgentDocumentStore,agentPdfPageText}=loadPlatformModule('backend/agent/AgentDocumentStore.ets','{AgentDocumentStore,agentPdfPageText}',
    {fs:nativeFs,pdfService,image,textRecognition,util:{Base64Helper:class {encodeToStringSync(bytes){return Buffer.from(bytes).toString('base64');}}},
      normalizeAgentDocumentText,UTF8编码:text=>new TextEncoder().encode(text)});
  const store=new AgentDocumentStore({filesDir:root});
  const original=path.join(root,'input.pdf');fs.writeFileSync(original,'PDF');
  const source={fd:fs.openSync(original,'r')};
  t.after(()=>fs.closeSync(source.fd));
  return {store,source,events,root,page,agentPdfPageText,setOcrReady:value=>{ocrReady=value;}};
}
test('API 21 adapter imports and reads real persisted files without any API 23 method; images and OCR are independently available',async t=>{
  const {store,source,events,root,page,agentPdfPageText}=nativeStoreHarness(t);
  assert.equal(page.getTextContent,undefined);assert.equal(agentPdfPageText(page),'JIDE reference text');
  const staged=store.stage('chat',source,info());assert.equal(staged.pageCount,140);assert.equal(store.list('chat').length,0);
  store.submit('chat',['doc']);const text=await store.read('chat','doc',130,'text');assert.equal(text.text,'JIDE reference text');
  assert.ok(!events.includes('ocr'));assert.ok(events.includes('page-release'));
  const image=await store.read('chat','doc',130,'image');assert.match(image.image.imageUrl,/^data:image\/jpeg;base64,/);
  store.saveNotes('chat','doc',130,'Table interpretation');
  const ocr=await store.read('chat','doc',130,'ocr');assert.equal(ocr.text,'OCR scan 12345');assert.equal(ocr.notes,'Table interpretation');
  assert.ok(events.includes('ocr-release'));assert.ok(events.includes('pixel-release'));
  const disk=fs.readFileSync(path.join(root,'agent-documents/chat/doc/page-130.json'),'utf8');assert.ok(!disk.includes('base64'));
  assert.equal((await store.read('chat','doc',130,'text')).text,'OCR scan 12345');
  assert.throws(()=>store.list('../outside'),/invalid_document_id/);assert.throws(()=>store.list('..'),/invalid_document_id/);
  store.removeConversation('chat');assert.deepEqual(store.list('chat'),[]);
});
test('OCR failure is visible, releases page resources and preserves original and cached text for another method',async t=>{
  const {store,source,events,setOcrReady}=nativeStoreHarness(t);store.stage('chat',source,info());store.submit('chat',['doc']);
  await store.read('chat','doc',1,'text');setOcrReady(false);
  await assert.rejects(()=>store.read('chat','doc',1,'ocr'),/ocr_unavailable/);
  assert.ok(events.includes('pixel-release'));assert.equal((await store.read('chat','doc',1,'text')).text,'JIDE reference text');
  assert.match((await store.read('chat','doc',1,'image')).image.imageUrl,/base64/);
});

test('Responses image parts are transmitted to any compatible provider separately from bounded text, with invalid image inputs rejected',async()=>{
  const {access}=accessHarness();const result=await access.execute('read_document_page','{"documentId":"doc","page":1,"includeImage":true}');
  const input={kind:'function_call_output',role:'',content:'',callId:'r1',name:'',argumentsJson:'',output:result.outputJson,images:result.images};
  const request={model:'custom-vision',instructions:'',input:[input],functionTools:[],searchMode:'off',reasoningEffort:'',maxOutputTokens:100};
  const payload=JSON.parse(buildResponsesPayload(request));assert.equal(payload.input[0].output[1].type,'input_image');
  assert.equal(payload.input[0].output[1].detail,'high');
  input.images=[{imageUrl:'file:///private'}];assert.throws(()=>buildResponsesPayload(request),/invalid_provider_image/);
  assert.equal(providerSupportsImages('custom','anything',false),false);assert.equal(providerSupportsImages('custom','anything',true),true);
  assert.equal(providerSupportsImages('deepseek','deepseek-flash'),true);assert.equal(providerSupportsImages('deepseek','deepseek-v4-pro'),false);
});
test('checkpoints retain document pointers but omit original page text and images; long turns can reread evicted images',()=>{
  const call={kind:'function_call',role:'',content:'',callId:'r1',name:'read_document_page',argumentsJson:'{"documentId":"doc","page":1}',output:''};
  const output={...call,kind:'function_call_output',name:'',argumentsJson:'',output:'{"documentId":"doc","page":1,"text":"private original text","nextOffset":-1}',images:[{imageUrl:'data:image/jpeg;base64,YWJj'}]};
  const state=safeAgentSessionState({input:[call,output],readableIds:[],retrieval:{},action:null,waitingCallId:'',paused:true});
  const json=JSON.stringify(state);assert.ok(!json.includes('private original text'));assert.ok(!json.includes('base64'));assert.match(json,/doc/);
  const items=[1,2,3].map(n=>({...output,callId:'r'+n,images:output.images.slice()}));compactAgentToolOutputs(items);
  assert.equal(items[0].images,undefined);assert.equal(items[2].images.length,1);assert.match(items[0].output,/reread/);
});
test('document source schema accepts real citations and rejects forged parameters before card construction',()=>{
  const card={fields:['Q','A'],sources:[{documentId:'doc',page:12}]};
  assert.deepEqual(decodeAgentToolArguments('create_flashcards',JSON.stringify({cards:[card]})).createNotes[0].sources,card.sources);
  for(const source of [{documentId:'../x',page:1},{documentId:'doc',page:0},{documentId:'doc',page:1,path:'/x'}]){
    assert.throws(()=>decodeAgentToolArguments('create_flashcards',JSON.stringify({cards:[{fields:['Q'],sources:[source]}]})),/invalid_tool_arguments/);
  }
  assert.equal(agentDocumentTools().length,4);
});
