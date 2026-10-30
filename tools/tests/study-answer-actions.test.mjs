// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';
import {loadComponentLogic} from './platform-module-harness.mjs';
function harness(){const C=loadComponentLogic('components/StudyAnswerActionBar.ets','StudyAnswerActionBar',{颜色键:{动作主色:'action'},应用尺寸:{},$r:x=>x});return new C();}
test('显示答案保留原阶段与忙碌守卫，无延迟调用原回调',()=>{
 const c=harness();let calls=0;c.显示答案回调=()=>calls++;
 assert.equal(c.showAnswerEnabled(),true);c.showAnswer();assert.equal(calls,1);
 c.busy=true;c.showAnswer();assert.equal(calls,1);c.busy=false;c.stage='answer';c.showAnswer();assert.equal(calls,1);
});
test('四档评分沿用原值，忙碌与阶段改变后的迟到点击不重复评分',()=>{
 const c=harness(),calls=[];c.评分回调=x=>calls.push(x);c.stage='answer';
 for(const rating of [0,1,2,3])c.rate(rating);assert.deepEqual(calls,[0,1,2,3]);
 c.busy=true;c.rate(2);c.busy=false;c.stage='question';c.rate(2);assert.deepEqual(calls,[0,1,2,3]);
 c.subtitles=['1m','6m'];assert.equal(c.subtitle(0),'1m');assert.equal(c.subtitle(3),'');
});


test('the mounted action reads live loading, busy and answer state instead of freezing its initial disabled value',()=>{
 const c=harness();c.stage='loading';c.busy=true;
 assert.equal(c.actionEnabled(true),false);
 c.stage='question';c.busy=false;assert.equal(c.actionEnabled(true),true);assert.equal(c.actionEnabled(false),false);
 c.busy=true;assert.equal(c.actionEnabled(true),false);c.busy=false;c.stage='answer';
 assert.equal(c.actionEnabled(true),false);assert.equal(c.actionEnabled(false),true);
 c.busy=true;assert.equal(c.actionEnabled(false),false);
});
