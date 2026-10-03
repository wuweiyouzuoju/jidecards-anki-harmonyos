// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { prepareNoteAudioFields } from '../../entry/src/main/ets/model/NoteAudioDraft.ts';
import { assertNoteMediaResolved } from '../../entry/src/main/ets/model/NoteMediaParts.ts';

function adapter({shortWrite=false}={}) {
  const files=new Map(),open=new Map(),calls=[];let fd=0;
  const fs={OpenMode:{CREATE:1,WRITE_ONLY:2},
    mkdir:async path=>calls.push(['mkdir',path]),
    open:async path=>{files.set(path,Buffer.alloc(0));open.set(++fd,path);return {fd};},
    write:async (id,data)=>{if(shortWrite)return 0;const path=open.get(id),bytes=Buffer.from(data),length=Math.min(2,bytes.length);
      files.set(path,Buffer.concat([files.get(path),bytes.subarray(0,length)]));return length;},
    close:async file=>{calls.push(['close',file.fd]);open.delete(file.fd);},
    copyFile:async (uri,path)=>{calls.push(['copy',uri,path]);files.set(path,Buffer.from('audio'));},
    unlink:async path=>{calls.push(['unlink',path]);files.delete(path);},
    rmdir:async path=>{assert.equal([...files.keys()].some(p=>p.startsWith(path+'/')),false);calls.push(['rmdir',path]);}
  };
  const Adapter=loadPlatformModule('backend/AnkiNoteDraftPreview.ets','AnkiNoteDraftPreview',{
    fs,AppStorage:{get:()=>({cacheDir:'/cache'})},prepareNoteImageFields,prepareNoteAudioFields,assertNoteMediaResolved,
    readNoteImageData:async uri=>{calls.push(['read',uri]);return {data:Uint8Array.from([1,2,3,4,5]),extension:'png'};},
    笔记服务:class{},笔记类型服务:class{},卡片渲染服务:class{},syncActivity:{}
  });
  return {instance:new Adapter(),calls,files,open};
}

test('preview media uses owned cache copies, completes short writes and preserves existing collection references',async()=>{
  const h=adapter(),draft={notetypeId:1,fields:['<img src="existing.png">','[sound:existing.mp3]'],tags:[],
    images:[{id:1,fieldIndex:0,uri:'photo://new',filename:''},{id:2,fieldIndex:0,uri:'',filename:'saved.png'}],
    audios:[{id:3,fieldIndex:1,uri:'/cache/recording.m4a',filename:'',label:'new',temporary:true}]};
  const media=await h.instance.prepareMedia(structuredClone(draft));
  assert.match(media.directory,/^\/cache\/note-preview-/);assert.equal(media.filenames.length,2);
  assert.match(media.fields[0],/existing.png/);assert.match(media.fields[0],/saved.png/);
  assert.match(media.fields[0],/draft-image-.+\.png/);assert.match(media.fields[1],/existing.mp3/);
  assert.match(media.fields[1],/draft-audio-.+\.m4a/);
  assert.deepEqual([...h.files.values()][0],Buffer.from([1,2,3,4,5]));assert.equal(h.open.size,0);
  assert.equal(draft.images[0].filename,'');assert.equal(draft.audios[0].filename,'');
  await h.instance.releaseMedia();assert.equal(h.files.size,0);
  assert.equal(h.calls.filter(c=>c[0]==='unlink').length,2);assert.equal(h.calls.at(-1)[0],'rmdir');
  assert.ok(h.calls.filter(c=>['mkdir','unlink','rmdir'].includes(c[0])).every(c=>c[1].startsWith('/cache/note-preview-')));
});

test('failed image writes close descriptors and retain partial owned files for disposal cleanup',async()=>{
  const h=adapter({shortWrite:true});
  await assert.rejects(h.instance.prepareMedia({notetypeId:1,fields:[''],tags:[],
    images:[{id:1,fieldIndex:0,uri:'photo://one',filename:''}],audios:[]}),/Incomplete preview image/);
  assert.equal(h.open.size,0);assert.equal(h.files.size,1);
  await h.instance.releaseMedia();assert.equal(h.files.size,0);assert.equal(h.calls.at(-1)[0],'rmdir');
});

test('draft Web and sound requests route owned cache files and stop playback when hidden or exited',async()=>{
  let stops=0,resets=0,releases=0,registered;
  const Preview=loadComponentLogic('components/settings/NotetypeTemplatePreview.ets','NotetypeTemplatePreview',{
    APP_FOREGROUND_KEY:'foreground',webview:{WebviewController:class{}},
    AppStorage:{get:()=>({filesDir:'/files'})},媒体基地址:'https://anki.local/',
    CardWebView:class {reset(){resets++;}},卡片渲染服务:class{},声音播放器:class{},TTS播放器:class{},
    CardAudioSession:class {constructor(_sound,_tts,_extract,path){this.path=path;}stop(){stops++;}async release(){releases++;}}
  });
  const preview=new Preview();preview.media={fields:[],directory:'/cache/owned',filenames:['draft.png','draft.m4a']};
  assert.equal(preview.requestMediaDirectory('https://anki.local/draft.png?version=1'),'/cache/owned');
  assert.equal(preview.requestMediaDirectory('https://anki.local/existing.png'),'/files/collection.media');
  assert.equal(preview.requestMediaDirectory('https://other.local/draft.png'),'/files/collection.media');
  assert.equal(preview.requestMediaDirectory('https://anki.local/%E0%A4%A'),'/files/collection.media');
  assert.equal(preview.audio.path('/files/collection.media','draft.m4a'),'/cache/owned/draft.m4a');
  assert.equal(preview.audio.path('/files/collection.media','existing.mp3'),'/files/collection.media/existing.mp3');
  preview.attached=true;preview.isVisible=false;preview.stopHiddenAudio();
  assert.equal(stops,1);await preview.playAudio();assert.equal(preview.audioFailed,false);
  preview.attached=true;preview.renderExited();assert.equal(preview.attached,false);assert.equal(preview.failed,true);
  assert.equal(stops,2);assert.equal(resets,1);
  preview.onReleaseAvailable=release=>{registered=release;};preview.aboutToAppear();
  await registered();assert.equal(releases,1);assert.equal(preview.attached,false);
});

test('structure impact uses actual localized counts and concrete field/template names and positions',()=>{
  const resources=JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json',import.meta.url),'utf8'));
  const values=new Map(resources.string.map(s=>[s.name,s.value]));
  const impactText=loadPlatformModule('utils/NotetypeImpactText.ets','notetypeImpactText',{
    $r:key=>key.split('.').at(-1),resourceText:(_ctx,key,...args)=>values.get(key).replace(/%(\d+)\$[sd]/g,(_,n)=>String(args[Number(n)-1]))
  });
  const impact={noteIds:[1,2],cardIds:[3,4,5],removedCardIds:[3],movedCardIds:[4,5]};
  const text=impactText({},impact,[{kind:'field_removed',name:'Original',oldName:'',from:1,to:0},
    {kind:'template_moved',name:'Reverse',oldName:'',from:2,to:1}]);
  assert.match(text,/2/);assert.match(text,/3/);assert.match(text,/Original/);assert.match(text,/Reverse/);
  assert.match(text,/2.*1/);assert.doesNotMatch(text,/%\d+\$/);
  const deleting=impactText({},impact,[],true);assert.match(deleting,/2/);assert.match(deleting,/3/);assert.match(deleting,/学习记录/);
});
