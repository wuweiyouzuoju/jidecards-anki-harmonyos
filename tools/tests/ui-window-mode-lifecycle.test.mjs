// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSON5 from 'json5';
import { loadPlatformSource } from './platform-module-harness.mjs';
const source=readFileSync(new URL('../../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8');
const statuses={UNDEFINED:0,FULL_SCREEN:1,MAXIMIZE:2,MINIMIZE:3,FLOATING:4,SPLIT_SCREEN:5};
function fixture(initial){
 const logs=[],writes=[];let mode=initial,release;
 const Ability=loadPlatformSource(source.replace('export default class','export class'),'EntryAbility',{
  UIAbility:class{},window:{WindowStatusType:statuses},hilog:{info(){},warn:(...args)=>logs.push(args)}
 });
 const ability=new Ability();let safe=0;ability.同步规避区高度=()=>safe++;
 const target={getWindowStatus:()=>mode,setWindowLayoutFullScreen:async value=>{writes.push(value);if(release)await release();},off(){}};
 ability.主窗口=target;
 return {ability,target,writes,logs,mode:value=>{mode=value;},delay:fn=>{release=fn;},safe:()=>safe};
}
test('the main ability explicitly supports split/full/floating without restricting multiwindow direction',()=>{
 const manifest=JSON5.parse(readFileSync(new URL('../../entry/src/main/module.json5',import.meta.url),'utf8'));
 const ability=manifest.module.abilities.find(item=>item.name==='EntryAbility');
 assert.deepEqual(ability.supportWindowMode,['fullscreen','split','floating']);
 assert.equal(ability.preferMultiWindowOrientation,'default');
});
test('cold start and foreground respect half screen and floating instead of requesting immersive fullscreen',async()=>{
 for(const mode of [statuses.SPLIT_SCREEN,statuses.FLOATING,statuses.MAXIMIZE,statuses.FULL_SCREEN]){
  const h=fixture(mode);h.ability.syncWindowLayout();await h.ability.windowLayoutTail;
  assert.deepEqual(h.writes,[mode===statuses.FULL_SCREEN]);assert.equal(h.safe(),1);
  h.ability.windowStatusChanged(statuses.SPLIT_SCREEN);h.mode(statuses.SPLIT_SCREEN);
  await h.ability.windowLayoutTail;assert.equal(h.writes.at(-1),false);
 }
});
test('queued layout reads the latest system mode, skips minimized/destroyed windows and recovers from rejection',async()=>{
 const h=fixture(statuses.FULL_SCREEN);h.ability.syncWindowLayout();h.mode(statuses.SPLIT_SCREEN);
 await h.ability.windowLayoutTail;assert.deepEqual(h.writes,[false]);
 h.mode(statuses.MINIMIZE);h.ability.syncWindowLayout();await h.ability.windowLayoutTail;assert.equal(h.writes.length,1);
 h.mode(statuses.FULL_SCREEN);h.target.setWindowLayoutFullScreen=async()=>{throw Error('window busy');};
 h.ability.syncWindowLayout();await h.ability.windowLayoutTail;assert.equal(h.logs.length,1);
 h.target.setWindowLayoutFullScreen=async value=>{h.writes.push(value);};
 h.mode(statuses.SPLIT_SCREEN);h.ability.syncWindowLayout();await h.ability.windowLayoutTail;assert.equal(h.writes.at(-1),false);
 h.ability.syncWindowLayout();h.ability.onWindowStageDestroy();await h.ability.windowLayoutTail;
 assert.equal(h.ability.主窗口,undefined);assert.equal(h.writes.length,2);
 assert.doesNotMatch(source,/\.maximize\(|\.minimize\(|\.setWindowMode\(/);
});
