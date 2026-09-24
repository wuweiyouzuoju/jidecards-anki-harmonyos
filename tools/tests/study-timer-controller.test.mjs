// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyTimerController } from '../../entry/src/main/ets/model/StudyTimerController.ts';
import { StudyOptions, StudyAdvanceAction } from '../../entry/src/main/ets/model/StudyTiming.ts';

function harness() {
  let now=1000, next=0; const timers=new Map(), actions=[], displays=[];
  const state={version:1,active:true,advance:true,blocked:false,audioPlaying:false,options:new StudyOptions()};
  state.options.secondsToShowQuestion=1;state.options.secondsToShowAnswer=1;state.options.answerAction=2;
  const controller=new StudyTimerController({state:()=>state,display:text=>displays.push(text),act:action=>actions.push(action)},
    {now:()=>now,repeat:work=>{const id=++next;timers.set(id,work);return id;},cancel:id=>timers.delete(id)});
  controller.showQuestion(now);
  return {controller,state,timers,actions,displays,advance:ms=>now+=ms};
}

test('timer waits for audio, fires one action per face and pauses elapsed time',()=>{
  const h=harness();h.controller.start();h.controller.start();assert.equal(h.timers.size,1);
  h.state.audioPlaying=true;h.advance(1000);h.controller.tick();assert.deepEqual(h.actions,[]);
  h.state.audioPlaying=false;h.controller.tick();h.controller.tick();
  assert.deepEqual(h.actions,[StudyAdvanceAction.ShowAnswer]);
  h.controller.showAnswer(2000);h.controller.stop();h.advance(60000);h.controller.start();
  h.advance(1000);h.controller.tick();assert.deepEqual(h.actions,[StudyAdvanceAction.ShowAnswer,StudyAdvanceAction.Good]);
  assert.equal(h.displays.at(-1),'0:02');h.controller.dispose();
});

test('stale interval callbacks cannot act on a new card or after disposal',()=>{
  const h=harness();h.controller.start();const old=[...h.timers.values()][0];
  h.controller.stop();h.state.version++;h.controller.showQuestion(1000);h.controller.start();
  h.advance(3000);old();assert.deepEqual(h.actions,[]);assert.equal(h.timers.size,1);
  const current=[...h.timers.values()][0];h.controller.dispose();current();assert.deepEqual(h.actions,[]);
  assert.equal(h.timers.size,0);
});

test('editing, hidden pages and pending writes cannot trigger automatic actions',()=>{
  const h=harness();h.controller.start();h.advance(2000);
  h.state.blocked=true;h.controller.tick();assert.deepEqual(h.actions,[]);
  h.state.active=false;h.controller.tick();assert.equal(h.timers.size,0);
  h.state.active=true;h.state.blocked=false;h.controller.start();h.controller.tick();
  assert.deepEqual(h.actions,[StudyAdvanceAction.ShowAnswer]);h.controller.dispose();
});
