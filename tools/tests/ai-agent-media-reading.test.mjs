// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { AgentScope } from '../../entry/src/main/ets/backend/agent/AgentScope.ets';
import { AgentToolRegistry } from '../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets';
import { AgentDocumentAccess } from '../../entry/src/main/ets/model/agent/AgentDocuments.ts';
import * as mediaModel from '../../entry/src/main/ets/model/agent/AgentNoteMedia.ts';
import * as fileModel from '../../entry/src/main/ets/model/agent/AgentFileImport.ts';
import { agentVideoFrameTimes } from '../../entry/src/main/ets/model/agent/AgentVideo.ts';
import { normalizeAgentDocumentText } from '../../entry/src/main/ets/model/agent/AgentDocumentText.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { AgentToolDiscovery } from '../../entry/src/main/ets/model/agent/AgentToolDiscovery.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { compactAgentToolOutputs, safeAgentSessionState } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import * as schemas from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { validateAgentNoteFields } from '../../entry/src/main/ets/model/agent/AgentNoteValidation.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jide-existing-media-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'collection.media'));
  for (const name of ['diagram.png', 'lesson.mp4']) fs.writeFileSync(path.join(root, 'collection.media', name), name);
  const events = [];
  const fixture = {fields:['<img src="diagram.png">', '[sound:lesson.mp4]'], decodeFail:false, ocrFail:false, rotation:'0', noteWait:null, failedTime:null};
  const nativeFs = {OpenMode:{CREATE:fs.constants.O_CREAT, WRITE_ONLY:fs.constants.O_WRONLY,
      READ_ONLY:fs.constants.O_RDONLY, TRUNC:fs.constants.O_TRUNC},
    accessSync:fs.existsSync, mkdirSync:(p,r)=>fs.mkdirSync(p,{recursive:r}),
    openSync:(p,f)=>({fd:fs.openSync(p,f),name:path.basename(p)}),
    closeSync:f=>fs.closeSync(typeof f==='number'?f:f.fd), fsyncSync:fs.fsyncSync,
    statSync:f=>typeof f==='number'?fs.fstatSync(f):fs.statSync(f), lstatSync:fs.lstatSync,
    readSync:(fd,b,o)=>fs.readSync(fd,new Uint8Array(b),0,o.length,o.offset),
    writeSync:(fd,b)=>fs.writeSync(fd,new Uint8Array(b)), renameSync:fs.renameSync,
    readTextSync:p=>fs.readFileSync(p,'utf8'), listFileSync:fs.readdirSync,
    rmdirSync:p=>fs.rmSync(p,{recursive:true})};
  const pixel=()=>({async release(){events.push('pixel-release');}});
  const media = {AVImageQueryOptions:{AV_IMAGE_QUERY_CLOSEST_SYNC:2},
    async createAVMetadataExtractor(){return {set fdSrc(value){events.push(['metadata-fd',value.fd]);},
      async fetchMetadata(){return {duration:'20000',videoWidth:'1920',videoHeight:'1080',videoOrientation:fixture.rotation};},
      async release(){events.push('metadata-release');}};},
    async createAVImageGenerator(){return {set fdSrc(value){events.push(['frame-fd',value.fd]);},
      async fetchFrameByTime(time,option,size){events.push(['frame',time,option,size]);
        if(fixture.decodeFail||time===fixture.failedTime)throw Error('unsupported_codec');return pixel();},
      async release(){events.push('generator-release');}};}};
  const image = {PixelMapFormat:{RGBA_8888:1},
    createImageSource(){return {async getImageInfo(){return {size:{width:600,height:400}};},
      async createPixelMap(){return pixel();}, async release(){events.push('image-source-release');}};},
    createImagePacker(){return {async packToData(){return new Uint8Array([1,2,3]).buffer;},
      async release(){events.push('packer-release');}};}};
  const textRecognition={async init(){if(fixture.ocrFail)throw Error('ocr_unavailable');return true;},
    async recognizeText(){return {value:'画面中的知识点'};},async release(){events.push('ocr-release');}};
  const AgentVideoReader=loadPlatformModule('backend/agent/AgentVideoReader.ets','AgentVideoReader',{fs:nativeFs,media});
  const AgentDocumentStore=loadPlatformModule('backend/agent/AgentDocumentStore.ets','AgentDocumentStore',{
    fs:nativeFs,image,textRecognition,AgentVideoReader,isSupportedAgentVideoFile:fileModel.isSupportedAgentVideoFile,
    normalizeAgentDocumentText,UTF8编码:s=>new TextEncoder().encode(s),
    util:{Base64Helper:class{encodeToStringSync(b){return Buffer.from(b).toString('base64');}}}});
  const store=new AgentDocumentStore({filesDir:root});
  const access=new AgentDocumentAccess(store);access.bind('chat',true);
  const scope=new AgentScope();scope.registerReadableNoteIds([1]);
  const Notes=class {async 获取笔记(){if(fixture.noteWait)await fixture.noteWait;return {fields:fixture.fields.slice()};}};
  const AgentNoteMediaTools=loadPlatformModule('backend/agent/AgentNoteMediaTools.ets','AgentNoteMediaTools',{
    fs:nativeFs,笔记服务:Notes,...mediaModel,...fileModel});
  const tools=new AgentNoteMediaTools({filesDir:root},scope,store,access);
  const registry=new AgentToolRegistry();tools.register(registry);
  const call=(name,args)=>registry.execute({name,argumentsJson:JSON.stringify(args),callId:name});
  const open=async(fieldOrd,mediaIndex=0)=>{
    const media=JSON.parse((await call('list_note_media',{noteId:1,fieldOrd})).outputJson).media;
    return JSON.parse((await call('import_note_media',{noteId:1,fieldOrd,mediaIndex,
      expectedFilename:media[mediaIndex].filename})).outputJson);
  };
  return {root,events,fixture,store,access,scope,tools,registry,call,open,Notes,nativeFs,AgentDocumentStore};
}

test('existing media parsing handles HTML/entities, sound videos and HTML source while rejecting external paths',()=>{
  const items=mediaModel.agentNoteMediaItems(['<img alt="src=bogus" src="a&amp;b.png">[sound:x.mp4]',
    '<video><source src="z.webm"></video><!-- <video src="hidden.mp4"> --><script>"<video src=bad.mp4>"</script>']);
  assert.deepEqual(items.map(x=>[x.kind,x.filename]),[['image','a&b.png'],['video','x.mp4'],['video','z.webm']]);
  for(const name of ['../x.png','%2e%2e%2fx.png','file:///x.png','https://x/a.png','a%5Cb.png','\0x.png']) {
    assert.equal(mediaModel.agentLocalMediaFilename(name),'');
  }
  assert.equal(mediaModel.agentLocalMediaFilename('中文%20图片.png'),'中文 图片.png');
  const inline=mediaModel.agentNoteMediaItems(['<img src="data:image/png;base64,'+'A'.repeat(20000)+'">'])[0];
  assert.equal(inline.local,false);assert.equal(inline.filename,'[inline media omitted]');
  assert.equal(mediaModel.agentNoteMediaItems(['<img src="literal&amp;lt;.png">'])[0].filename,'literal&lt;.png');
  assert.equal(fileModel.isKnownAgentImportFile('lesson.mp4'),true);
  for(const args of [{noteId:0},{noteId:1,path:'/tmp/secret'},{noteId:1,fieldOrd:-1}]) {
    assert.throws(()=>mediaModel.decodeAgentNoteMediaArguments('list_note_media',JSON.stringify(args)),/arguments_invalid/);
  }
});

test('scoped card image becomes a persistent conversation snapshot and real visual/OCR input without altering the source',async t=>{
  const h=harness(t);const imported=await h.open(0);
  const original=path.join(h.root,'collection.media/diagram.png');
  fs.writeFileSync(original,'changed after import');
  assert.equal(fs.readFileSync(path.join(h.root,'agent-documents/chat',imported.documentId,'original'),'utf8'),'diagram.png');
  const visual=await h.access.execute('read_document_page',JSON.stringify({documentId:imported.documentId,page:1,includeImage:true}));
  assert.match(visual.images[0].imageUrl,/base64/);
  const ocr=await h.access.execute('ocr_document_page',JSON.stringify({documentId:imported.documentId,page:1}));
  assert.equal(JSON.parse(ocr.outputJson).text,'画面中的知识点');
  assert.match(h.access.annotate(['题目','答案'],[{documentId:imported.documentId,page:1}])[1],/diagram.png/);
  h.access.bind('another',true);
  await assert.rejects(()=>h.access.execute('read_document_page',JSON.stringify({documentId:imported.documentId,page:1})),/not_in_session/);
  h.access.bind('chat',true,true);
  assert.equal(JSON.parse((await h.access.execute('list_documents','{}')).outputJson).documents.length,1);
  await h.access.execute('read_document_page',JSON.stringify({documentId:imported.documentId,page:1,includeImage:true}));
  const disk=fs.readFileSync(path.join(h.root,'agent-documents/chat',imported.documentId,'page-1.json'),'utf8');
  assert.ok(!disk.includes('base64'));assert.equal(fs.readFileSync(original,'utf8'),'changed after import');
});

test('unknown notes, changed references, unsafe paths, missing files and symlinks cannot authorize arbitrary media reads',async t=>{
  const h=harness(t);
  await assert.rejects(()=>h.call('list_note_media',{noteId:999}),/out_of_scope/);
  await assert.rejects(()=>h.call('import_note_media',{noteId:1,fieldOrd:0,mediaIndex:0,expectedFilename:'old.png'}),/reference_changed/);
  await assert.rejects(()=>h.call('list_note_media',{noteId:1,fieldOrd:2}),/field_out_of_range/);
  for(const name of ['../secret.png','https://example.com/img.png','missing.png']) {
    h.fixture.fields=[`<img src="${name}">`];
    await assert.rejects(()=>h.open(0));
  }
  h.fixture.fields=['<img src="diagram.png">'];
  const original=path.join(h.root,'collection.media/diagram.png');fs.rmSync(original);
  const secret=path.join(h.root,'secret.png');fs.writeFileSync(secret,'private');
  try {fs.symlinkSync(secret,original);} catch(error) {if(error.code==='EPERM')return;throw error;}
  await assert.rejects(()=>h.open(0),/external_or_invalid/);
  assert.deepEqual(h.store.list('chat'),[]);
});

test('the existing user file picker stages video attachments and applies the video-specific size limit',async t=>{
  const h=harness(t);
  const picker={DocumentSelectOptions:class{},DocumentViewPicker:class {
    async select(){return [path.join(h.root,'collection.media/lesson.mp4')];}
  }};
  const select=loadPlatformModule('backend/agent/AgentFileImportService.ets','selectAndParseAgentFiles',{
    fs:h.nativeFs,picker,AgentDocumentStore:h.AgentDocumentStore,...fileModel});
  const files=await select({filesDir:h.root},10,'upload-chat');
  assert.equal(files[0].errorCode,'');assert.ok(files[0].documentId);
  h.store.submit('upload-chat',[files[0].documentId]);
  const access=new AgentDocumentAccess(h.store);access.bind('upload-chat',true,true);
  const result=await access.execute('read_video_frames',JSON.stringify({documentId:files[0].documentId,timestampsSeconds:[1]}));
  assert.equal(result.images.length,1);
  assert.ok(!fileModel.buildAgentImportedFilesContext(files).includes('base64'));
  const stat=h.nativeFs.statSync;h.nativeFs.statSync=fd=>{const value=stat(fd);return {size:fileModel.AGENT_IMPORT_MAX_VIDEO_BYTES+1};};
  const oversized=await select({filesDir:h.root},10,'large');assert.equal(oversized[0].errorCode,'file_too_large');
});

test('a cancelled or changed-conversation note read cannot publish a media snapshot',async t=>{
  const h=harness(t);let resume;
  h.fixture.noteWait=new Promise(resolve=>{resume=resolve;});
  const pending=h.call('list_note_media',{noteId:1});h.tools.cancel();resume();
  await assert.rejects(()=>pending,/cancelled/);assert.deepEqual(h.store.list('chat'),[]);
  h.fixture.noteWait=new Promise(resolve=>{resume=resolve;});
  const another=h.call('list_note_media',{noteId:1});h.access.bind('another',true);resume();
  await assert.rejects(()=>another,/cancelled/);
});

test('video samples return time-labelled Provider images and only actually read times can be cited in real card drafts',async t=>{
  const h=harness(t);const video=await h.open(1);
  const result=await h.access.execute('read_video_frames',JSON.stringify({documentId:video.documentId}));
  const output=JSON.parse(result.outputJson);
  assert.deepEqual(output.frames.map(f=>f.timestampSeconds),[0,5,10,15]);assert.equal(output.audioRead,false);
  assert.equal(result.images.length,4);assert.ok(h.events.some(e=>Array.isArray(e)&&e[0]==='frame'&&e[1]===5000000));
  const packet={kind:'function_call_output',role:'',content:'',name:'',callId:'video',argumentsJson:'',output:result.outputJson,images:result.images};
  compactAgentToolOutputs([packet]);assert.equal(packet.images.length,4);
  const payload=JSON.parse(buildResponsesPayload({model:'vision',instructions:'',input:[packet],functionTools:[],
    searchMode:'off',reasoningEffort:'',maxOutputTokens:100}));
  assert.equal(payload.input[0].output.filter(p=>p.type==='input_image').length,4);
  assert.throws(()=>h.access.sourceLabel({documentId:video.documentId,page:1,timestampSeconds:3}),/frame_not_read/);
  h.scope.registerReadableDeckIds([2]);h.scope.registerReadableNotetypeIds([3]);h.scope.configureCreateTarget(2,3);
  const Dummy=class{};
  const CardAgentTools=loadPlatformModule('backend/agent/CardAgentTools.ets','CardAgentTools',{
    ...schemas,validateAgentNoteFields,笔记服务:h.Notes,卡片服务:Dummy,搜索服务:Dummy,牌组服务:Dummy,
    标签服务:Dummy,统计服务:Dummy,WikimediaImageService:Dummy,
    笔记类型服务:class{async 获取笔记类型能力(){return {notetypeId:3,kind:0,fieldNames:['Front','Back'],clozeFieldOrds:[]};}}});
  const cardTools=new CardAgentTools(h.scope,h.access);cardTools.register(h.registry,'create');
  const draft=(await h.call('create_flashcards',{cards:[{fields:['画面的知识点？','答案'],
    sources:[{documentId:video.documentId,page:1,timestampSeconds:5}]}]})).draft;
  assert.equal(draft.status,'pending');assert.match(draft.operations[1].after,/lesson.mp4.*5.00s/);
  assert.equal(fs.readFileSync(path.join(h.root,'collection.media/lesson.mp4'),'utf8'),'lesson.mp4');
  assert.ok(h.events.includes('metadata-release'));assert.equal(h.events.filter(e=>e==='generator-release').length,4);
});

test('video range validation is bounded and text models use frame OCR; decoder/OCR failure and cancellation remain visible',async t=>{
  const h=harness(t);const video=await h.open(1);const id=video.documentId;
  for(const args of [{frameCount:5},{timestampsSeconds:[20]},{startSeconds:10,endSeconds:5},
    {timestampsSeconds:[0],frameCount:1},{timestampsSeconds:['1']},{timestampsSeconds:[]}]) {
    await assert.rejects(()=>h.access.execute('read_video_frames',JSON.stringify({documentId:id,...args})),/video_/);
  }
  h.access.bind('chat',false);
  await assert.rejects(()=>h.access.execute('read_video_frames',JSON.stringify({documentId:id,includeImage:true})),/vision_unavailable/);
  const ocr=JSON.parse((await h.access.execute('read_video_frames',JSON.stringify({documentId:id,timestampsSeconds:[2]}))).outputJson);
  assert.equal(ocr.frames[0].text,'画面中的知识点');assert.equal(ocr.frames[0].imageAttached,false);
  h.fixture.decodeFail=true;
  await assert.rejects(()=>h.access.execute('read_video_frames',JSON.stringify({documentId:id})),/frames_failed/);
  assert.ok(h.events.includes('generator-release'));
  h.fixture.decodeFail=false;h.fixture.ocrFail=true;
  await assert.rejects(()=>h.access.execute('read_video_frames',JSON.stringify({documentId:id})),/frames_failed/);
  h.fixture.ocrFail=false;
  const pending=h.access.execute('read_video_frames',JSON.stringify({documentId:id}));h.access.cancel();
  await assert.rejects(()=>pending,/cancelled/);
});

test('portrait video sizing and partial decode failure preserve usable frames and previously saved video notes',async t=>{
  const h=harness(t);const video=await h.open(1);h.fixture.rotation='90';h.fixture.failedTime=5000000;
  const result=await h.access.execute('read_video_frames',JSON.stringify({documentId:video.documentId,timestampsSeconds:[2,5]}));
  const output=JSON.parse(result.outputJson);assert.equal(output.succeeded,1);assert.equal(result.images.length,1);
  assert.equal(output.frames[1].warning,'unsupported_codec');
  const frame=h.events.find(e=>Array.isArray(e)&&e[0]==='frame');assert.deepEqual(frame[3],{width:900,height:1600});
  assert.throws(()=>h.access.sourceLabel({documentId:video.documentId,page:1,timestampSeconds:5}),/frame_not_read/);
  await h.access.execute('save_document_notes',JSON.stringify({documentId:video.documentId,page:1,notes:'资料解释'}));
  const reread=await h.access.execute('read_video_frames',JSON.stringify({documentId:video.documentId,timestampsSeconds:[2]}));
  assert.equal(JSON.parse(reread.outputJson).modelNotes,'资料解释');
});

test('media capabilities are discoverable in every mode and video source/checkpoint contracts reject invented data',()=>{
  for(const mode of ['assistant','create','edit']) {
    const catalog=agentFunctionTools(100,mode);
    const discovery=new AgentToolDiscovery(catalog);
    const result=JSON.parse(discovery.discover('{"names":["list_note_media","import_note_media","read_video_frames"]}'));
    assert.equal(result.tools.length,3);
    const structure=buildAgentAppStructure({simple:true,agent:true,cloudDeck:false,themeHasTextures:false},
      'agent','',key=>key,[],catalog,[],'agent','browser');
    for(const name of ['list_note_media','import_note_media','read_video_frames']) {
      assert.ok(structure.tools.some(tool=>tool.name===name));
    }
  }
  const source={documentId:'video',page:1,timestampSeconds:1.25};
  assert.deepEqual(schemas.decodeAgentToolArguments('create_flashcards',JSON.stringify({cards:[{fields:['Q','A'],sources:[source]}]})).createNotes[0].sources,[source]);
  for(const timestampSeconds of [-1,'1',null])assert.throws(()=>schemas.decodeAgentToolArguments('create_flashcards',JSON.stringify({cards:[{fields:['Q','A'],sources:[{...source,timestampSeconds}]}]})));
  const state=safeAgentSessionState({input:[{kind:'function_call_output',callId:'v',role:'',content:'',name:'',argumentsJson:'',
    output:'{"documentId":"video","method":"video_frames","frames":[{"timestampSeconds":2,"text":"original"}]}',
    images:[{imageUrl:'data:image/jpeg;base64,YWJj'}]}],readableIds:[],retrieval:{},action:null,waitingCallId:'',paused:true});
  assert.ok(!JSON.stringify(state).includes('base64'));assert.match(JSON.stringify(state),/video/);
  assert.deepEqual(agentVideoFrameTimes({durationSeconds:10,width:10,height:10},{startSeconds:2,endSeconds:6,frameCount:2}),[2,4]);
});

test('the actual tool timeline uses localized media names in both UI languages',()=>{
  const source=fs.readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const start=source.indexOf('  private 工具显示名(');
  assert.ok(start>=0);
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const Page=new Function('$r','operationDefinition',stripTypeScriptTypes('class Page {'+method+'}',{mode:'transform'})+';return Page;')(key=>key,()=>undefined);
  for(const locale of ['base','en_US']) {
    const resources=JSON.parse(fs.readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string;
    const page=new Page();page.取本地化文案=key=>resources.find(item=>item.name===key.split('.').at(-1))?.value;
    for(const tool of ['list_note_media','import_note_media','read_video_frames']) {
      const text=page.工具显示名(tool);assert.equal(typeof text,'string');assert.notEqual(text,tool);
      assert.ok(locale==='base'?/[\u4e00-\u9fff]/.test(text):/images|video/i.test(text));
    }
    assert.match(resources.find(item=>item.name==='ai_agent_custom_vision_hint').value,locale==='base'?/视频帧/:/video frames/);
  }
});
