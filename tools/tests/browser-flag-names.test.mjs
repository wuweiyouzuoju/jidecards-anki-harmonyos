// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { CARD_FLAGS, parseFlagLabels, customFlagLabel, saveCardFlagLabels } from '../../entry/src/main/ets/model/CardMarking.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { autoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { syncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
const Dialog=loadComponentLogic('components/browser/FlagNamesDialog.ets','FlagNamesDialog',{
 CARD_FLAGS,parseFlagLabels,customFlagLabel,saveCardFlagLabels,BrowserOperationController,autoSyncScheduler,syncActivity,
 AnkiCardMarking:class{},resourceText:(_,resource)=>resource,$r:key=>key,AppStorage:{setOrCreate(){}}
});
function harness(){
 const dialog=new Dialog(),writes=[],events=[];let json='{"1":"old","2":"second","future":{"a":1}}';
 dialog.backend={labels:async()=>json,saveLabels:async value=>{writes.push(value);json=value;}};
 dialog.mounted=true;dialog.getUIContext=()=>({});dialog.onClose=()=>events.push('closed');dialog.onChanged=()=>events.push('changed');
 return {dialog,writes,events,update:value=>json=value,get:()=>JSON.parse(json)};
}
test('name dialog saves only edited colors against latest collection values, and empty restores default',async()=>{
 const h=harness();await h.dialog.load();
 assert.equal(h.dialog.loaded,true);assert.equal(h.dialog.drafts[1],'old');
 h.dialog.edited.add(1);h.dialog.drafts[1]='';
 h.update('{"1":"old","2":"synced while open","future":{"a":[true,2]}}');
 await h.dialog.save();
 assert.deepEqual(h.get(),{'2':'synced while open',future:{a:[true,2]}});
 assert.deepEqual(h.events,['changed','closed']);assert.equal(h.writes.length,1);
});
test('failed name reads cannot save defaults and failed writes retain edited drafts for retry',async()=>{
 const h=harness();h.dialog.backend.labels=async()=>{throw Error('read');};
 await h.dialog.load();assert.equal(h.dialog.loaded,false);await h.dialog.save();assert.equal(h.writes.length,0);
 h.dialog.backend.labels=async()=>'{"1":"old"}';await h.dialog.load();h.dialog.edited.add(1);h.dialog.drafts[1]='check';
 const save=h.dialog.backend.saveLabels;h.dialog.backend.saveLabels=async()=>{throw Error('write');};
 await h.dialog.save();assert.equal(h.dialog.drafts[1],'check');assert.equal(h.dialog.edited.has(1),true);
 assert.equal(h.dialog.isBusy,false);assert.equal(h.events.length,0);assert.notEqual(h.dialog.errorText,'');
 h.dialog.backend.saveLabels=save;await h.dialog.save();assert.equal(h.get()['1'],'check');
});
test('accepted name save completes after unmount but late reads and saves do not reopen the dialog',async()=>{
 const h=harness();await h.dialog.load();h.dialog.edited.add(7);h.dialog.drafts[7]='seven';
 let release;const gate=new Promise(r=>release=r),save=h.dialog.backend.saveLabels;
 h.dialog.backend.saveLabels=async value=>{await gate;await save(value);};
 const pending=h.dialog.save();await new Promise(setImmediate);h.dialog.aboutToDisappear();release();await pending;
 assert.equal(h.get()['7'],'seven');assert.deepEqual(h.events,[]);
});

test('name save waits for collection sync and merges only edited colors into the received config',async()=>{
 const h=harness();await h.dialog.load();h.dialog.edited.add(7);h.dialog.drafts[7]='local seven';
 syncActivity.reserveCollection();
 const pending=h.dialog.save();await new Promise(setImmediate);
 assert.equal(h.writes.length,0);assert.equal(autoSyncScheduler.canSync(),false);
 h.update('{"1":"remote one","2":"remote two","future":{"nested":[true,7]}}');
 syncActivity.cancelReservation();await pending;
 assert.deepEqual(h.get(),{'1':'remote one','2':'remote two','7':'local seven',future:{nested:[true,7]}});
 assert.equal(autoSyncScheduler.hasPending(),true);assert.equal(autoSyncScheduler.canSync(),true);
});
