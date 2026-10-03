// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { StudyTimerController } from '../../entry/src/main/ets/model/StudyTimerController.ts';
import { StudyOptions, StudyAdvanceAction, StudyAutoAdvanceSettings } from '../../entry/src/main/ets/model/StudyTiming.ts';
import { ReviewPreferences } from '../../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { gradeJideChoice } from '../../entry/src/main/ets/model/JideChoice.ts';
import { loadUiFeedback } from './ui-feedback-harness.mjs';

const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
const methods=['startStudyTimers','stopStudyTimers','studyTimerState','maybeShowTimebox','closeTimebox','openStudyMenu','closeStudyMenu','按钮文案位',
  '撤销上次','刷新编辑后当前卡','埋藏或暂停当前卡','确认删除当前卡','恢复埋藏','评分','提交选择题','studyActivityChanged'];
const body=methods.map(name=>{
  const match=new RegExp('  private (?:async )?'+name+'\\(').exec(source);assert.ok(match,name);
  return source.slice(match.index,source.indexOf('\n  }',match.index)+4);
}).join('\n');

function harness() {
  let now=0, failed=false, empty=false;
  const states=Object.fromEntries(['current','again','hard','good','easy'].map(key=>[key,new Uint8Array([1,255])]));
  const card={cardId:1,states};const answers=[];
  const prefs=Object.assign(new ReviewPreferences(),{timeLimitSecs:60,showRemaining:true,showIntervals:true});
  const backend={reviewPreferences:async()=>prefs,canUndo:async()=>false,
    queuedCards:async()=>({cards:empty?[]:[card],newCount:2,learningCount:3,reviewCount:4}),
    renderCard:async()=>({}),studyOptions:async()=>new StudyOptions(),describeStates:async()=>['1m','5m','1d','4d'],
    answer:async input=>{if(failed)throw Error('answer failed');answers.push(input);},undo:async()=>{},
    buryCard:async()=>{},removeCard:async()=>{},unburyDeck:async()=>{}};
  const controller=new StudySessionController(backend,new AutoSyncScheduler(),new SyncActivity(),()=>now);
  const Page=new Function('Date','playStudyHaptic','gradeJideChoice','RATING_GOOD','RATING_HARD',
    stripTypeScriptTypes('class Page {'+body+'}',{mode:'transform'})+';return Page;')({now:()=>now},()=>{},gradeJideChoice,2,1);
  const page=Object.assign(new Page(),{mounted:true,页面已显示:true,foreground:true,requestVersion:1,
    controllerReady:true,studyMenuOpen:false,autoAdvanceSettingsOpen:false,editingPageOpen:false,
    studyGuideVisible:false,tapZonesGuideVisible:false,手写模式:false,评分中:false,flipPending:false,
    阶段:'question',choiceQuestion:null,timeboxNotice:null,choiceFeedbackDeadline:0,展示时刻毫秒:0,
    当前卡片:card,可撤销:true,牌组ID:1,contentRefreshInFlight:false,消费待重渲染(){},maybeShowStudyGuide(){},
    choiceSelectedIds:[],choiceGrade:null,背面HTML:'answer',applyStudyHtml(){this.startStudyTimers();},
    publishInterface(){},网页控制器:{runJavaScript:async()=>{}},choiceAutoAdvanceSeconds:()=>5,
    studySession:controller,studyOptions:new StudyOptions(),autoAdvanceSettings:new StudyAutoAdvanceSettings(),
    autoAdvanceEnabled:false,reviewPreferences:prefs,按钮文案:['1m','5m','1d','4d'],
    isCurrentRequest:()=>page.mounted&&page.页面已显示&&page.foreground,
    audioSession:{isPlaying:()=>false},clearChoiceAutoAdvance(){this.choiceCancelled=true;},
    invalidateCardWork(){this.stopStudyTimers();this.requestVersion++;},
    scheduleChoiceAutoAdvance(){this.choiceScheduled=true;},返回(){this.left=true;}});
  const timers=new Map();let next=0;
  page.studyTimer=new StudyTimerController({state:()=>page.studyTimerState(),display(){},act(){throw Error('unexpected automatic action');}},
    {now:()=>now,repeat:work=>{timers.set(++next,work);return next;},cancel:id=>timers.delete(id)});
  return {page,controller,backend,card,prefs,answers,timers,advance:ms=>now+=ms,fail:value=>failed=value,
    empty:value=>empty=value,answer:()=>controller.answer(card,2,now,0),load:()=>controller.loadNext(1,()=>true)};
}

test('timebox accumulates across cards with hidden card timer and pauses menu, editing, background, loading and handwriting',async()=>{
  const h=harness();await h.load();assert.equal(h.page.studyOptions.showTimer,false);
  h.page.startStudyTimers();assert.equal(h.timers.size,0,'no extra periodic timer is needed');
  h.advance(20000);h.page.openStudyMenu();h.advance(600000);h.page.closeStudyMenu();
  h.advance(10000);h.page.stopStudyTimers();await h.answer();assert.equal(h.controller.pendingTimebox(),null);
  await h.load();h.page.startStudyTimers();h.advance(10000);
  for(const field of ['editingPageOpen','foreground','手写模式']) {
    h.page.stopStudyTimers();h.page[field]=field==='foreground'?false:true;
    h.advance(600000);h.page.startStudyTimers();h.page[field]=field==='foreground'?true:false;
    h.page.startStudyTimers();
  }
  h.page.stopStudyTimers();h.advance(600000);await h.load();h.page.startStudyTimers();h.advance(20000);
  h.page.stopStudyTimers();await h.answer();
  assert.deepEqual(h.controller.pendingTimebox(),{seconds:60,answers:2});
  h.page.startStudyTimers();assert.deepEqual(h.page.timeboxNotice,{seconds:60,answers:2});
  assert.equal(h.page.studyTimerState().active,false);
  h.advance(600000);h.page.closeTimebox();assert.equal(h.controller.pendingTimebox(),null);
  h.advance(59000);h.page.stopStudyTimers();await h.answer();assert.equal(h.controller.pendingTimebox(),null);
  h.page.startStudyTimers();h.advance(1000);h.page.stopStudyTimers();await h.answer();
  assert.deepEqual(h.controller.pendingTimebox(),{seconds:60,answers:2});
  h.controller.dispose();h.page.mounted=false;h.page.startStudyTimers();assert.equal(h.controller.pendingTimebox(),null);
});

test('failed answers do not count; notices wait for safe UI, survive background and can finish from the last card',async()=>{
  const h=harness();await h.load();h.page.startStudyTimers();h.advance(60000);h.page.stopStudyTimers();
  h.fail(true);await assert.rejects(h.answer(),/answer failed/);assert.equal(h.controller.pendingTimebox(),null);
  h.fail(false);await h.answer();assert.deepEqual(h.controller.pendingTimebox(),{seconds:60,answers:1});
  for(const field of ['评分中','studyMenuOpen','editingPageOpen','studyGuideVisible','tapZonesGuideVisible','autoAdvanceSettingsOpen','手写模式']) {
    h.page[field]=true;h.page.maybeShowTimebox();assert.equal(h.page.timeboxNotice,null);h.page[field]=false;
  }
  h.page.foreground=false;h.page.maybeShowTimebox();assert.equal(h.page.timeboxNotice,null);
  h.page.foreground=true;h.empty(true);const done=await h.load();assert.equal(done.card,null);
  h.controller.markComplete();h.page.阶段='done';h.page.maybeShowTimebox();h.page.maybeShowTimebox();
  assert.equal(h.page.timeboxNotice.answers,1);h.page.closeTimebox(true);assert.equal(h.page.left,true);
});

test('zero disables timeboxing; changing the limit starts a fresh box, leaving the page cannot revive it',async()=>{
  const h=harness();h.prefs.timeLimitSecs=0;await h.load();h.page.startStudyTimers();h.advance(3600000);
  await h.answer();assert.equal(h.controller.pendingTimebox(),null);
  h.prefs.timeLimitSecs=60;await h.load();h.page.startStudyTimers();h.advance(59000);h.page.stopStudyTimers();
  h.prefs.timeLimitSecs=120;await h.load();h.page.startStudyTimers();h.advance(60000);await h.answer();
  assert.equal(h.controller.pendingTimebox(),null);
  h.controller.dispose();await assert.rejects(h.load(),/disposed/);
});

test('choice feedback pauses while the timebox is open; counts and both button layouts use Core display preferences',async()=>{
  const h=harness();await h.load();h.page.choiceQuestion={};h.page.choiceFeedbackDeadline=10000;
  h.page.startStudyTimers();h.advance(60000);h.page.stopStudyTimers();await h.answer();h.page.maybeShowTimebox();
  assert.equal(h.page.choiceCancelled,true);h.advance(5000);h.page.closeTimebox();
  assert.equal(h.page.choiceFeedbackDeadline,15000);
  assert.equal(h.page.展示时刻毫秒,5000,'reading the prompt is excluded from the next recorded answer duration');
  assert.equal(h.page.按钮文案位(2),'1d');h.prefs.showIntervals=false;assert.equal(h.page.按钮文案位(2),'');
  const expression=source.match(/评分按钮文案: (.+),/)[1];
  assert.deepEqual(new Function('return '+expression).call(h.page),[]);
  assert.deepEqual(h.page.按钮文案,['1m','5m','1d','4d'],'hiding labels preserves Core scheduling data');
  assert.match(source,/if \(this.reviewPreferences.showRemaining\)\s*\{\s*Text\(\$r\('app.string.study_remaining_detail'/);
});

for(const [method,args] of [['撤销上次',[]],['刷新编辑后当前卡',[]],['埋藏或暂停当前卡',[2]],['确认删除当前卡',[]],['恢复埋藏',[]]]) {
  test(`${method} resumes the same timebox after asynchronous card refresh`,async()=>{
    const h=harness();await h.load();h.page.startStudyTimers();h.advance(20000);
    h.page.加载下一张卡=async()=>{
      assert.equal(h.page.评分中,true);h.page.阶段='loading';h.advance(600000);await h.load();
      h.page.阶段='question';h.page.startStudyTimers();assert.equal(h.page.studyTimerState().active,false);
    };
    await h.page[method](...args);
    assert.equal(h.page.studyTimerState().active,true);
    h.advance(40000);await h.answer();
    assert.deepEqual(h.controller.pendingTimebox(),{seconds:60,answers:1});
  });
}

test('accepted grading pauses timeboxing during Core work and cannot revive a notice after exit',async()=>{
  const h=harness();await h.load();h.page.startStudyTimers();h.advance(59000);
  let release;h.backend.answer=()=>new Promise(resolve=>release=resolve);
  const grading=h.answer();await new Promise(resolve=>setImmediate(resolve));h.advance(600000);release();await grading;
  assert.equal(h.controller.pendingTimebox(),null,'Core write latency is not study time');
  h.page.startStudyTimers();h.advance(1000);const last=h.answer();await new Promise(resolve=>setImmediate(resolve));
  h.controller.dispose();release();await last;assert.equal(h.controller.pendingTimebox(),null);
});

test('ordinary and choice grading display the pending timebox only after their actual page flow finishes',async()=>{
  for(const choice of [false,true]) {
    const h=harness();await h.load();h.page.startStudyTimers();h.advance(60000);
    if(choice) {
      h.page.choiceQuestion={type:'single_choice',options:[{id:'a'},{id:'b'}],answer:['a']};h.page.choiceSelectedIds=['a'];
      await h.page.提交选择题();
      assert.equal(h.page.阶段,'answer');assert.equal(h.page.choiceCancelled,true);
    } else {
      h.page.阶段='answer';h.page.加载下一张卡=async()=>{await h.load();h.page.阶段='question';h.page.startStudyTimers();
        assert.equal(h.page.timeboxNotice,null,'grading is still busy during card load');};
      await h.page.评分(2);
    }
    assert.deepEqual(h.page.timeboxNotice,{seconds:60,answers:1});assert.equal(h.page.评分中,false);
    h.page.foreground=false;h.page.studyActivityChanged();assert.equal(h.page.timeboxNotice,null);
    assert.deepEqual(h.controller.pendingTimebox(),{seconds:60,answers:1});
    h.advance(600000);h.page.foreground=true;h.page.studyActivityChanged();await h.load();h.page.startStudyTimers();
    assert.deepEqual(h.page.timeboxNotice,{seconds:60,answers:1});
  }
});

test('timebox copy formats both languages through the actual shared resource boundary',()=>{
  const api=loadUiFeedback();
  for(const locale of ['base','en_US']) {
    const strings=JSON.parse(readFileSync(new URL('../../entry/src/main/resources/'+locale+'/element/string.json',import.meta.url),'utf8')).string;
    const value=strings.find(entry=>entry.name==='study_timebox_message').value;
    const context={getHostContext:()=>({resourceManager:{getStringSync:(_id,...args)=>{let i=0;return value.replace(/%d/g,()=>String(args[i++]));}}})};
    const actual=api.resourceText(context,{id:'study_timebox_message',params:['study_timebox_message']},2,17);
    assert.ok(actual.includes('2'));assert.ok(actual.includes('17'));assert.doesNotMatch(actual,/%d/);
  }
});
