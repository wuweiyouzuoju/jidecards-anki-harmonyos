// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTextExportRequest } from '../../entry/src/main/ets/proto/messages/TextExportMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { loadPlatformModule,loadComponentLogic } from './platform-module-harness.mjs';
import { 服务号, 导入导出方法 } from '../../entry/src/main/ets/backend/服务索引.ts';
const options={kind:'notes',withHtml:true,withTags:true,withDeck:true,withNotetype:true,withGuid:true};
function fields(bytes){const r=new 协议读取器(bytes),out={};let tag;while((tag=r.读取标签())!==null){out[tag.字段号]=tag.线类型===2?r.读取字节():r.读取变长整数();}return out;}

test('note and card text export use official option fields and deck-limit oneof',()=>{
  const notes=fields(encodeTextExportRequest('/tmp/中文.txt',123,options));
  assert.equal(new TextDecoder().decode(notes[1]),'/tmp/中文.txt');
  assert.deepEqual([notes[2],notes[3],notes[4],notes[5],notes[6]],[1,1,1,1,1]);assert.equal(fields(notes[7])[2],123);
  const cards=fields(encodeTextExportRequest('/tmp/cards.txt',123,{...options,kind:'cards',withHtml:false}));
  assert.equal(fields(cards[3])[2],123);assert.equal(cards[2]??0,0);assert.equal(cards[7],undefined);
  assert.throws(()=>encodeTextExportRequest('out',0,options),/deck/);
});

test('text export shares file-save cleanup and does not report success on picker cancellation',async()=>{
  const calls=[];
  const workflow=loadPlatformModule('backend/DataExportWorkflow.ets','exportPersonalData',{
    exportText:async(...args)=>{calls.push(['text',...args]);return '/sandbox/export.txt';},
    完成导出:async(...args)=>{calls.push(['save',...args]);return null;}
  });
  const intent={kind:'exportText',deckId:12,options};
  assert.equal(await workflow({filesDir:'/sandbox'},intent,value=>calls.push(['stage',value])),null);
  assert.equal(calls[0][2],12);assert.deepEqual(calls[1],['stage',1]);assert.equal(calls[2][3],'jidecards-notes.txt');
  const states=[];let successes=0,commits=0;
  const session=new DataTransferSession({exportData:async()=>false,committed:()=>commits++},s=>states.push(s),async()=>{},()=>successes++);
  session.open('exportDeck',12,true);await session.execute(intent);
  assert.equal(successes,0);assert.equal(commits,0);assert.equal(states.at(-1).visible,true);assert.equal(states.at(-1).phase,'idle');
  assert.equal(states.at(-1).progress.cancellable,false);
});

test('export panel emits note/card text options through its original deck scope',()=>{
  const Panel=loadComponentLogic('components/数据迁移面板.ets','数据迁移面板',{
    THEME_TEXT_COLORS_KEY:'theme',颜色键:{主色按钮背景:'color'},
    DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS:{},CustomDialogController:class {close(){}},字段帮助对话框:()=>{},
    $r:key=>key,DialogAlignment:{Center:0},Color:{Transparent:0}
  });
  const instance=new Panel();instance.模式='exportDeck';instance.已选导出牌组Id=12;instance.exportFormat=1;
  let intent;instance.onIntent=value=>intent=value;instance.提交();
  assert.equal(intent.kind,'exportText');assert.equal(intent.deckId,12);assert.deepEqual(intent.options,options);
  instance.exportFormat=2;instance.textWithHtml=false;instance.提交();
  assert.equal(intent.options.kind,'cards');assert.equal(intent.options.withHtml,false);
  instance.busy=true;instance.exportFormat=0;instance.提交();assert.equal(intent.kind,'exportText');
});

test('actual text export service cleans failed Core output and all picker/stream outcomes',async()=>{
  let coreError=false,pickerError=false,copyError=false,selection=[];
  const calls=[],deleted=[];
  const deps={服务号,导入导出方法,encodeTextExportRequest,
    确保目录存在:async()=>{},静默删除:async path=>deleted.push(path),
    后端会话:{获取实例:()=>({调用:async(...args)=>{calls.push(args);if(coreError)throw new Error('Core failed');return new Uint8Array();}})},
    picker:{DocumentSaveOptions:class {},DocumentViewPicker:class {async save(){if(pickerError)throw new Error('Picker failed');return selection;}}},
    按描述符复制文件:async()=>{if(copyError)throw new Error('Stream failed');}
  };
  const service=loadPlatformModule('backend/数据迁移服务.ts','exportText',deps);
  const save=loadPlatformModule('backend/数据迁移服务.ts','完成导出',deps);
  const path=await service('/sandbox',12,options);assert.match(path,/\/exports\/text-.*\.txt$/);
  assert.equal(calls[0][0],服务号.后端导入导出);assert.equal(calls[0][1],导入导出方法.exportNoteCsv);
  assert.equal(await save({},path,'notes.txt','.txt'),null);assert.equal(deleted.at(-1),path);
  selection=['selected.txt'];assert.equal(await save({},path,'notes.txt','.txt'),'selected.txt');assert.equal(deleted.length,2);
  pickerError=true;await assert.rejects(save({},path,'notes.txt','.txt'),/Picker failed/);assert.equal(deleted.length,3);
  pickerError=false;copyError=true;await assert.rejects(save({},path,'notes.txt','.txt'),/Stream failed/);assert.equal(deleted.length,4);
  coreError=true;await assert.rejects(service('/sandbox',12,{...options,kind:'cards'}),/Core failed/);
  assert.equal(calls.at(-1)[1],导入导出方法.exportCardCsv);assert.equal(deleted.length,5);
});
