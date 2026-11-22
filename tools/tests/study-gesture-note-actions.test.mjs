// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
function host(overrides={}) {
 const names=['openGestureNoteAction','closeGestureNoteAction','saveGestureNoteAction','runGestureScript'];
 const methods=names.map(name=>{const expression=new RegExp('  private (?:async )?'+name+'\\(');const start=source.search(expression);assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n  }',start)+4);}).join('\n');
 const errors=[],writes=[],scripts=[];let current={tags:['old'],fields:['latest field'],id:9};
 const Page=new Function('showToastSafely',stripTypeScriptTypes('class Page{'+methods+'}',{mode:'transform'})+';return Page;')((_ctx,options)=>errors.push(options.message));
 const page=Object.assign(new Page(),{mounted:true,gestureNoteVersion:0,gestureNoteAction:'',gestureNoteBusy:false,当前卡片:{cardId:3,noteId:9},
  studyGestureBlocked:()=>false,stopStudyTimers(){},clearChoiceAutoAdvance(){},startStudyTimers(){},scheduleChoiceAutoAdvance(){},消费待重渲染(){},audioSession:{stop(){}},getUIContext:()=>({}),
  笔记服务实例:{获取笔记:async()=>structuredClone(current),获取笔记的卡片:async()=>[3,4],更新笔记:async notes=>writes.push(notes)},
  调度器服务实例:{设置到期日:async(ids,days)=>writes.push({ids,days})},controllerReady:true,pendingHtml:'',cardRenderPending:false,网页控制器:{runJavaScript:async text=>scripts.push(text)},...overrides});
 return {page,writes,errors,scripts,setCurrent:value=>{current=value;}};
}
test('gesture tag edit rereads latest fields, preserves siblings, rejects concurrent tag changes',async()=>{
 const {page,writes,errors,setCurrent}=host();await page.openGestureNoteAction('tag');
 assert.deepEqual(page.gestureNoteTags,['old']);page.gestureNoteTags=['new'];
 setCurrent({id:9,tags:['old'],fields:['edited meanwhile']});await page.saveGestureNoteAction();
 assert.equal(writes.length,1);assert.deepEqual(writes[0][0].tags,['new']);assert.deepEqual(writes[0][0].fields,['edited meanwhile']);
 await page.openGestureNoteAction('tag');setCurrent({id:9,tags:['changed elsewhere'],fields:['x']});await page.saveGestureNoteAction();
 assert.equal(writes.length,1);assert.equal(errors.length,1);assert.equal(page.gestureNoteAction,'tag');
});
test('reschedule uses all sibling cards and rejects a changed current card',async()=>{
 const {page,writes}=host();await page.openGestureNoteAction('reschedule_note');await page.saveGestureNoteAction('3-5');
 assert.deepEqual(writes,[{ids:[3,4],days:'3-5'}]);await page.openGestureNoteAction('reschedule_note');page.当前卡片.cardId=99;await page.saveGestureNoteAction('1');assert.equal(writes.length,1);
});
test('late tag reads cannot populate a disposed page; template actions do not inject arbitrary scripts',async()=>{
 let resolve;const {page,scripts}=host({笔记服务实例:{获取笔记:()=>new Promise(r=>{resolve=r;})}});
 const pending=page.openGestureNoteAction('tag');page.mounted=false;resolve({tags:['late']});await pending;assert.equal(page.gestureNoteTags,undefined);
 page.runGestureScript('user_action_9');page.runGestureScript('user_action_10');page.runGestureScript('user_action_1);evil(');page.runGestureScript('page_down');
 assert.equal(scripts.length,2);assert.match(scripts[0],/userAction\(9\)/);assert.match(scripts[1],/scrollBy/);
});
