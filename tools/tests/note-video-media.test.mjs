// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_NOTE_VIDEO_BYTES, noteVideoExtension, noteVideoHtml, isNoteVideoFilename } from '../../entry/src/main/ets/model/NoteVideoMedia.ts';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { noteMediaParts, assertNoteMediaResolved } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
import { noteAudioParts } from '../../entry/src/main/ets/model/NoteAudioDraft.ts';
import { NoteMediaSession } from '../../entry/src/main/ets/model/NoteMediaSession.ts';
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import { CardAudioSession } from '../../entry/src/main/ets/model/CardAudioSession.ts';
import { noteFieldMediaTool } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { noteVisualInterfaceObservation } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { mediaDialogHarness } from './note-media-dialog-harness.mjs';
import { editorPageHarness } from './editor-page-harness.mjs';
import { creationPageHarness } from './note-creation-harness.mjs';

const encode = value => new TextEncoder().encode(value);
const mp4 = encode('\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isommp42payload');
const draft = value => new NoteMediaSession(value, 0, [], [], 'test-video');
const pendingVideo = (uri='photo://movie') => ({id:1,fieldIndex:0,uri,filename:'',kind:'video'});
const deferred = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function importer(bytes=mp4,{size=bytes.length,shortRead=false,writeFails=false}={}) {
  let cursor=0;const events=[];
  const fs={OpenMode:{READ_ONLY:0},open:async uri=>{events.push(['open',uri]);return {fd:1};},stat:async()=>({size}),
    read:async (_fd,buffer)=>{events.push(['read',buffer.byteLength]);if(shortRead)return 0;
      const count=Math.min(3,bytes.length-cursor,buffer.byteLength);new Uint8Array(buffer).set(bytes.subarray(cursor,cursor+count));cursor+=count;return count;},
    close:async()=>events.push(['close']),copyFile:async (fd,path)=>{events.push(['copy',fd,path]);if(writeFails)throw Error('copy failed');},
    unlink:async path=>events.push(['unlink',path])};
  const dependencies={fs,fileUri:{getUriFromPath:path=>'sandbox:'+path},MAX_NOTE_VIDEO_BYTES,noteVideoExtension,
    readNoteImageData:async uri=>{events.push(['image',uri]);return {data:encode('image'),extension:'png'};},
    媒体服务:class{async 添加媒体文件(name,data){events.push(['media',name,Array.from(data)]);if(writeFails)throw Error('write failed');return 'core&movie.mp4';}}};
  const call=name=>loadPlatformModule('backend/NoteVisualImport.ets',name,dependencies);
  return {events,call};
}

test('container signatures separate video, HEIC/AVIF, audio and unsupported EBML',()=>{
  assert.equal(noteVideoExtension(mp4),'mp4');assert.equal(noteVideoExtension(encode('0000ftypqt  payload')),'mov');
  assert.equal(noteVideoExtension(Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x42,0x82,0x84,...encode('webm')])),'webm');
  for(const header of ['0000ftypheic','0000ftypavif','0000ftypM4A ','GIF89a','0000ftyp'])assert.equal(noteVideoExtension(encode(header)),'');
  assert.equal(noteVideoExtension(Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x42,0x82,0x88,...encode('matroska')])),'');
  assert.equal(isNoteVideoFilename('MOVIE.MP4'),true);assert.equal(isNoteVideoFilename('voice.m4a'),false);
});

test('mixed images, video and audio preserve order and repeated occurrence identity',async()=>{
  const value='A<img src="same.png" alt="x">B[sound:one.mp4]C[sound:voice.mp3]D[sound:one.mp4]E';
  assert.deepEqual(noteMediaParts(value).filter(p=>p.kind!=='text').map(p=>p.kind),['image','video','audio','video']);
  assert.equal(noteAudioParts(value).filter(p=>p.filename).length,1);
  const session=draft(value);session.addVisual('photo://new','video',7);
  assert.equal(noteMediaParts(session.value)[7].kind,'video');assert.throws(()=>assertNoteMediaResolved([session.value]),/Unresolved/);
  const saved=await prepareNoteImageFields([session.value],session.images,async (uri,kind)=>{assert.equal(kind,'video');return 'clip&<name>.mp4';});
  assert.equal(saved[0],value.replace(/\[sound:one.mp4\]E$/,'[sound:clip&amp;&lt;name&gt;.mp4]E'));
  assertNoteMediaResolved(saved);assert.equal(noteMediaParts(saved[0])[7].filename,'clip&<name>.mp4');
  session.removeImage(7);assert.equal(session.images.length,0);assert.ok(session.value.endsWith('DE'));
  assert.throws(()=>noteVideoHtml('bad]name.mp4'),/Invalid/);
});

test('visual replacement can switch types while image attributes and pending order survive',async()=>{
  const session=draft('a<img src="old.png" width="80">b[sound:old.mp4]c');
  session.addVisual('video','video',1);session.addVisual('image','image',3);
  session.addVisual('another','video');session.addImage('last');
  const calls=[];const saved=await prepareNoteImageFields([session.value],session.images,async (uri,kind)=>{calls.push([uri,kind]);return uri+(kind==='video'?'.mp4':'.png');});
  assert.equal(saved[0],'a[sound:video.mp4]b<img src="image.png">c<br>[sound:another.mp4]<br><img src="last.png">');
  assert.deepEqual(calls,[['video','video'],['image','image'],['another','video'],['last','image']]);
  const image=draft('<img alt="keep" width="80" src="old.png">');image.addImage('new',1);
  assert.match((await prepareNoteImageFields([image.value],image.images,async()=> 'new.png'))[0],/alt="keep" width="80"/);
});

test('media failures preserve successful video filenames and retries never import them twice',async()=>{
  const items=[pendingVideo('first'),{...pendingVideo('second'),id:2}],calls=[];
  let fail=true;const save=async (uri,kind)=>{calls.push([uri,kind]);if(uri==='second'&&fail)throw Error('disk');return uri+'.mp4';};
  await assert.rejects(prepareNoteImageFields(['text'],items,save),/disk/);assert.equal(items[0].filename,'first.mp4');
  fail=false;assert.deepEqual(await prepareNoteImageFields(['text'],items,save),['text<br>[sound:first.mp4]<br>[sound:second.mp4]']);
  assert.deepEqual(calls.map(c=>c[0]),['first','second','second']);
});

test('video importer completes provider short reads, preserves container bytes and uses Core names',async()=>{
  const h=importer();assert.equal(await h.call('importNoteVisual')('provider://opaque','video'),'core&movie.mp4');
  assert.deepEqual(h.events.find(e=>e[0]==='media'),['media','note-video.mp4',Array.from(mp4)]);
  assert.equal(h.events.filter(e=>e[0]==='close').length,1);
  const image=importer();await image.call('importNoteVisual')('photo://image');assert.equal(image.events[0][0],'image');
  for(const options of [{shortRead:true},{writeFails:true},{size:MAX_NOTE_VIDEO_BYTES+1},{size:0}]){
    const failed=importer(mp4,options);await assert.rejects(failed.call('importNoteVisual')('movie','video'));
    assert.equal(failed.events.filter(e=>e[0]==='close').length,1);
    if(options.size!==undefined)assert.equal(failed.events.some(e=>e[0]==='read'),false);
  }
  const unsupported=importer(encode('0000ftypheic'));await assert.rejects(unsupported.call('importNoteVisual')('movie','video'),/note_video_format_unsupported/);
  const classify=importer();assert.equal(await classify.call('noteVisualKind')('movie'),'video');
  const header=new Uint8Array(4096);header.set(mp4);
  const large=importer(header,{size:MAX_NOTE_VIDEO_BYTES+1});await assert.rejects(large.call('noteVisualKind')('movie'),/note_video_too_large/);
});

test('picker keeps the existing icon, selects either type, and only Done transfers the draft',async()=>{
  const initial={noteVisualKind:async()=> 'video'};
  const cancel=mediaDialogHarness(async()=>['photo://movie'],initial);await cancel.dialog.pickImage();
  assert.deepEqual(cancel.events.find(e=>e[0]==='pick'),['pick',1,'image-video']);assert.equal(cancel.dialog.images[0].kind,'video');
  cancel.dialog.close(false);assert.equal(cancel.events.some(e=>e[0]==='apply'),false);
  const done=mediaDialogHarness(async()=>['photo://movie'],initial);await done.dialog.pickImage();done.dialog.close(true);
  assert.equal(done.events.find(e=>e[0]==='apply')[2][0].kind,'video');
  const gate=deferred(),late=mediaDialogHarness(async()=>['movie'],{noteVisualKind:()=>gate.promise});
  const selecting=late.dialog.pickImage();await new Promise(setImmediate);late.dialog.aboutToDisappear();gate.resolve('video');await selecting;
  assert.equal(late.dialog.images.length,0);
  const failed=mediaDialogHarness(async()=>['large'],{noteVisualKind:async()=>{throw Error('note_video_too_large');}});
  await failed.dialog.pickImage();assert.equal(failed.dialog.errorMessage,'app.string.note_video_too_large');assert.equal(failed.dialog.working,false);
  assert.equal(noteFieldMediaTool('image').iconKey,'ic_editor_image');
});

test('add and edit saves resolve video references through the existing note writer',async()=>{
  const writes=[],calls=[];
  const session=new NoteCreationSession({importImage:async(uri,kind)=>{calls.push([uri,kind]);return 'movie.mp4';},
    saveNote:async input=>writes.push(structuredClone(input)),committed(){},errorMessage:error=>error.message},()=>{});
  await session.save({deckId:1,notetypeId:2,fields:['front'],tags:[],images:[pendingVideo()]});
  assert.deepEqual(calls,[['photo://movie','video']]);assert.deepEqual(writes[0].fields,['front<br>[sound:movie.mp4]']);
  const h=editorPageHarness();await h.page.load();h.io.image=async(uri,kind)=>{assert.equal(kind,'video');return 'movie.mp4';};
  assert.equal(await h.page.save(['front','answer'],[],[pendingVideo()]),true);
  assert.equal(h.writes[0].notes[0].fields[0],'front<br>[sound:movie.mp4]');
});

test('creation form, reopening media and frozen preview all retain video kinds',async()=>{
  const h=creationPageHarness({backend:{importImage:async(uri,kind)=>{assert.equal(kind,'video');return 'movie.mp4';}}});
  await h.ready;h.page.fieldImages=[{id:9,fieldIndex:1,uri:'other',filename:''}];
  h.page.applyFieldMedia(0,'front',[pendingVideo()],[]);
  assert.equal(h.page.fieldImages.find(item=>item.fieldIndex===0).kind,'video');
  assert.equal(h.page.fieldImages.find(item=>item.fieldIndex===1).uri,'other');
  const reopened=new NoteMediaSession('front',0,h.page.imagesForField(0),[],'reopen');
  assert.equal(reopened.images[0].kind,'video');
  h.page.fieldImages=h.page.fieldImages.filter(item=>item.fieldIndex===0);
  h.page.pathStack.pushPath=()=>{};
  h.page.openDraftPreview();assert.equal(h.page.draftPreview.images[0].kind,'video');
  h.page.draftPreview=null;await h.page.提交(true);assert.match(h.writes[0].fields[0],/\[sound:movie.mp4\]/);
});

test('preview owns only cache copies, stops on blocking/background and ignores stale preparation',async()=>{
  const h=importer(),file=await h.call('prepareNoteVideoPreview')('file://media/Photo/movie.mp4','/cache');
  assert.match(file.path,/^\/cache\/note-video-preview-/);assert.equal(h.events.find(e=>e[0]==='copy')[1],1);
  await h.call('releaseNoteVideoPreview')(file);assert.equal(h.events.at(-1)[1],file.path);
  const local=importer();assert.deepEqual(await local.call('prepareNoteVideoPreview')('file:///files/a%20b.mp4','/cache'),{source:'sandbox:/files/a b.mp4',path:''});
  assert.equal(local.events.length,0);
  const gate=deferred(),released=[];let pauses=0;
  const Preview=loadComponentLogic('components/editor/NoteVisualPreview.ets','NoteVisualPreview',{
    APP_FOREGROUND_KEY:'foreground',VideoController:class{pause(){pauses++;}},
    prepareNoteVideoPreview:()=>gate.promise,releaseNoteVideoPreview:async file=>released.push(file.path)});
  const preview=new Preview();preview.kind='video';preview.source='movie';preview.getUIContext=()=>({getHostContext:()=>({cacheDir:'/cache'})});
  const loading=preview.load();preview.aboutToDisappear();gate.resolve({source:'cached',path:'/cache/late'});await loading;
  assert.deepEqual(released,['/cache/late']);assert.equal(preview.videoSource,'');
  preview.disabled=true;preview.pauseIfBlocked();preview.disabled=false;preview.foreground=false;preview.pauseIfBlocked();assert.ok(pauses>=4);
});

test('JIDE reads the same icon capability, localized instructions and real mixed-attachment state without content',()=>{
  const status=noteVisualInterfaceObservation({working:true,hasError:false,kinds:['image','video']});
  assert.equal(status.items.every(item=>!item.enabled),true);assert.equal(status.controlsComplete,false);
  assert.equal(status.values.find(item=>item.id==='video_count').value,'1');
  const h=mediaDialogHarness(async()=>['photo://private-movie'],{noteVisualKind:async()=> 'video'});
  return h.dialog.pickImage().then(()=>{
    const observation=h.events.filter(e=>e[0]==='observe').at(-1)[1];
    assert.doesNotMatch(JSON.stringify(observation),/private-movie|photo:\/\//);
    for(const locale of ['base','en_US']){
      const strings=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(item=>[item.name,item.value]));
      const structure=buildAgentAppStructure({simple:true,agent:true,cloudDeck:false,themeHasTextures:false},'note_visual_manage','',key=>strings.get(key),[],[],[observation]);
      assert.equal(structure.noteEditing.mediaTools.find(tool=>tool.id==='image').iconKey,'ic_editor_image');
      assert.deepEqual(structure.noteEditing.mediaTools[0].mediaKinds,['image','video']);
      assert.deepEqual(structure.noteEditing.mediaTools[0].videoFormats,['mp4','mov','webm']);
      assert.equal(structure.surfaces[0].title,strings.get('note_visual_manage'));
      assert.match(structure.surfaces[0].instructions,/64 MiB/);
    }
  });
});

test('card audio leaves video to the inline player without changing Core item indices',async()=>{
  const played=[],player={async 播放队列(items){played.push(items);},async waitForCompletion(){},async 停止(){},async 释放(){}};
  const tags={soundFiles:['movie.mp4','voice.mp3'],ttsItems:[],items:[{soundFile:'movie.mp4',tts:null},{soundFile:'voice.mp3',tts:null}]};
  const audio=new CardAudioSession(player,player,async()=>tags);
  await audio.play('mixed',true,'/media');assert.deepEqual(played,[['/media/voice.mp3']]);
  played.length=0;await audio.play('mixed',true,'/media',true,'',()=>{},{itemIndex:1});assert.deepEqual(played,[['/media/voice.mp3']]);
  played.length=0;assert.equal(await audio.play('mixed',true,'/media',true,'',()=>{},{itemIndex:0}),false);assert.deepEqual(played,[]);
});
