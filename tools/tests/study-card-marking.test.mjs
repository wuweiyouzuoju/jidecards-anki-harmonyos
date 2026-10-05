// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { 构建卡片HTML, 剥除拼写标记 } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { hideJideChoiceStaticOptions } from '../../entry/src/main/ets/model/JideChoice.ts';
const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
const methods=['changeMarking','closeMarkingDialog'].map(name=>{const start=source.search(new RegExp('^  private (?:async )?'+name+'\\(','m'));assert.ok(start>=0);return source.slice(start,source.indexOf('\n  }',start)+4);});
const Page=new Function('构建卡片HTML','剥除拼写标记','hideJideChoiceStaticOptions','AppStorage','showToastSafely','$r',
 stripTypeScriptTypes('class Page {'+methods.join('\n')+'}',{mode:'transform'})+';return Page;')(
 构建卡片HTML,剥除拼写标记,hideJideChoiceStaticOptions,{setOrCreate(){}},(_,value)=>{_.errors.push(value.message);},key=>key);
const rendered=flag=>({css:'',questionNodes:[{text:'front '+flag}],answerNodes:[{text:'back '+flag}],latexSvg:false,isEmpty:false});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
function harness(phase='answer'){
 let flag=1,marked=false;const calls=[],displayed=[],history=[];
 const backend={setCardFlag:async(id,value)=>{calls.push(['flag',id,value]);history.push([flag,marked]);flag=value;},
  setNoteMarked:async(id,value)=>{calls.push(['mark',id,value]);history.push([flag,marked]);marked=value;},
  renderCard:async id=>{calls.push(['render',id]);return rendered(flag);},marking:async()=>({flag,marked}),
  canUndo:async()=>history.length>0,undo:async()=>{[flag,marked]=history.pop();calls.push(['undo']);}};
 const scheduler=new AutoSyncScheduler(),activity=new SyncActivity();
 const page=Object.assign(new Page(),{mounted:true,阶段:phase,requestVersion:4,当前卡片:{cardId:42,noteId:7,states:{current:[255,0]}},
  currentMarking:{flag,marked},评分中:false,flipPending:false,controllerReady:true,markingUndoDepth:0,
  choiceQuestion:null,choiceSelectedIds:['b'],choiceGrade:{rating:2},已输入答案:'my input',拼写字段名:'',
  展示时刻毫秒:12345,interactionVersion:3,errors:[],isCurrentRequest:version=>page.mounted&&page.requestVersion===version,
  正面HTML:剥除拼写标记(构建卡片HTML(rendered(flag),'question',false)),背面HTML:剥除拼写标记(构建卡片HTML(rendered(flag),'answer',false)),
  是否深色:()=>false,stopStudyTimers(){},startStudyTimers(){},clearChoiceAutoAdvance(){},scheduleChoiceAutoAdvance(){},
  publishInterface(){},getUIContext(){return this;},取文案:key=>key,cardWeb:{show:html=>displayed.push(html)},
  构建拼写答案HTML:async html=>html+' input:'+page.已输入答案});
 page.studySession=new StudySessionController(backend,scheduler,activity);page.studySession.activate();
 return {page,backend,calls,displayed,scheduler};
}
test('marking and repeated undo preserve card, face, input, choice and timer without queue or autoplay calls',async()=>{
 const h=harness(),card=h.page.当前卡片;
 await h.page.changeMarking(7);await h.page.changeMarking(null);
 assert.deepEqual(h.calls.filter(x=>x[0]!=='render'),[['flag',42,7],['mark',7,true]]);
 assert.equal(h.page.当前卡片,card);assert.equal(h.page.阶段,'answer');assert.equal(h.page.已输入答案,'my input');
 assert.deepEqual(h.page.choiceSelectedIds,['b']);assert.equal(h.page.展示时刻毫秒,12345);assert.equal(h.page.markingUndoDepth,2);
 assert.match(h.displayed[0],/back 7/);assert.equal(h.displayed.length,1);
 await h.page.changeMarking(null,true);await h.page.changeMarking(null,true);
 assert.deepEqual(h.page.currentMarking,{flag:1,marked:false});assert.equal(h.page.markingUndoDepth,0);assert.equal(h.scheduler.hasPending(),true);
});
test('question and spelling answer render on the current side without clearing input',async()=>{
 for(const phase of ['question','answer']){
  const h=harness(phase);h.page.拼写字段名='Front';await h.page.changeMarking(6);
  assert.match(h.displayed[0],phase==='question'?/front 6/:/back 6/);
  if(phase==='answer')assert.match(h.displayed[0],/input:my input/);
  assert.equal(h.page.阶段,phase);assert.equal(h.page.已输入答案,'my input');
 }
});
test('unchanged flags have no undo operation; unknown stars are reread without writing',async()=>{
 const h=harness();await h.page.changeMarking(1);assert.deepEqual(h.calls,[]);
 h.page.currentMarking=null;await h.page.changeMarking(null);
 assert.deepEqual(h.calls,[['render',42]]);assert.deepEqual(h.page.currentMarking,{flag:1,marked:false});
});
test('accepted writes finish after navigation without refreshing the next card or holding busy',async()=>{
 const h=harness(),gate=deferred();h.backend.setCardFlag=async()=>{h.calls.push(['accepted']);await gate.promise;};
 const pending=h.page.changeMarking(7);await new Promise(setImmediate);
 await h.page.changeMarking(6);assert.deepEqual(h.calls,[['accepted']]);
 h.page.requestVersion++;h.page.当前卡片={cardId:43};gate.resolve();await pending;
 assert.equal(h.page.当前卡片.cardId,43);assert.equal(h.page.评分中,false);
 assert.equal(h.calls.some(x=>x[0]==='render'),false);assert.equal(h.scheduler.hasPending(),true);
});
test('write and refresh failures hide stale badges and permit a read-only retry',async()=>{
 const h=harness();h.backend.setCardFlag=async()=>{throw Error('write');};await h.page.changeMarking(7);
 assert.equal(h.page.currentMarking,null);assert.equal(h.page.评分中,false);assert.equal(h.page.errors.length,1);
 await h.page.changeMarking(null);assert.deepEqual(h.page.currentMarking,{flag:1,marked:false});
 h.backend.marking=async()=>{throw Error('read');};await h.page.changeMarking(null);
 assert.equal(h.page.currentMarking,null);assert.equal(h.page.评分中,false);
});
