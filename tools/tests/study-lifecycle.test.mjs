import { attachStudySession } from './study-session-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import test from 'node:test';
import { CardAudioSession } from '../../entry/src/main/ets/model/CardAudioSession.ts';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';

// Execute unchanged production methods with controllable backend/player delays.
const source = fs.readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const names = ['加载下一张卡', '显示答案', '埋藏或暂停当前卡', '评分', 'invalidateCardWork', 'isCurrentRequest', 'studyActivityChanged', 'applyStudyHtml', 'playStudyAudio', 'studyWebAttached', 'aboutToDisappear', '消费待重渲染', '刷新编辑后当前卡', '撤销上次', '加载完成页信息'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('playStudyHaptic', '构建卡片HTML', '剥除拼写标记', '提取拼写标记', '原始侧HTML', '媒体基地址', 'CustomTransition', '刷新桌面卡片数据', 'AppStorage', 'SECONDS_PER_DAY', '$r', 'console',
  stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, {mode:'transform'}) + '; return Page;')(
  () => {}, (card, side) => `${card.id}-${side}`, html => html, () => null,
  (card, side) => `${card.id}-${side}`, 'media://',
  {getInstance:()=>({注销NavParam(){}})}, async()=>{}, {setOrCreate(){}}, 86400, key=>key, {info(){}});
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
}
function harness() {
  const page = new Page(), displayed = [], sounds = [], events = [], answers = [];
  let id = 'A';
  Object.assign(page, {
    mounted:true, sessionReady:true, foreground:true, requestVersion:0, loadingVersion:-1, flipPending:false, controllerReady:true, pendingHtml:'', 媒体目录:'',
    页面已显示:true, 阶段:'question', 评分中:false, studyGuideVisible:false,
    contentRefreshInFlight:false, 待重渲染当前卡:false, 可撤销:true,
    noteEditorVisible:false, noteEditorBusy:false, 拼写字段名:'', 牌组ID:1,
    当前卡片:{cardId:'A', states:{current:[],again:[],hard:[],good:[],easy:[]}},
    已渲染:{id:'A'}, 正面HTML:'A-question', 背面HTML:'A-answer', 展示时刻毫秒:Date.now(),
    网页控制器:{loadData: html => displayed.push(html), runJavaScript:async()=>{}},
    声音播放器实例:{waitForCompletion:async()=>{},停止:async()=>events.push('stop'),释放:async()=>events.push('sound release'),播放队列:async paths=>sounds.push(paths)},
    TTS播放器实例:{waitForCompletion:async()=>{},停止:async()=>{},释放:async()=>events.push('tts release'),播放队列:async()=>{}},
    是否深色:()=>false, maybeShowStudyGuide:()=>{},
    getUIContext:()=>({getPromptAction:()=>({showToast:()=>events.push('toast')})}), 取文案:key=>key,
    集合服务实例:{获取撤销状态:async()=>{events.push('undo status');return {undo:'answer'};},撤销:async()=>{events.push('undo');id='A';}},
    卡片渲染服务实例:{extractAudioTags:async raw=>({soundFiles:[raw],ttsItems:[]}),渲染既有卡片:async cardId=>({id:cardId,answerNodes:[],questionNodes:[]})},
    调度器服务实例:{
      埋藏或暂停卡片:async()=>{id='B';}, 提交评分:async input=>{answers.push(input);id='B';},
      获取完成页信息:async()=>({secsUntilNextLearn:600,learnRemaining:1,haveUserBuried:true}),
      获取队首卡片:async()=>({cards:[{cardId:id,states:{current:[],again:[],hard:[],good:[],easy:[]}}],newCount:1,learningCount:0,reviewCount:0}),
      描述下一档状态:async()=>[]
    }
  });
  page.audioSession = new CardAudioSession(page.声音播放器实例,page.TTS播放器实例,(raw,q)=>page.卡片渲染服务实例.extractAudioTags(raw,q));
  attachStudySession(page);
  return {page, displayed, sounds, events, answers};
}

test('manual answer replay includes the question only when configured and autoplay never adds it', async () => {
  for (const skip of [true, false]) {
    const { page, sounds } = harness();
    page.studyOptions.skipQuestionWhenReplayingAnswer = skip;
    page.阶段 = 'answer';
    await page.playStudyAudio();
    assert.deepEqual(sounds, [['/A-answer']]);
    sounds.length = 0;
    await page.playStudyAudio(true, true);
    assert.deepEqual(sounds, skip ? [['/A-answer']] : [['/A-question'], ['/A-answer']]);
  }
});

test('automatic actions use guarded production grading and hiding cancels the next action', async () => {
  for (const action of [1, 2, 3]) {
    const { page, answers } = harness();
    page.studyOptions.autoplay = false;
    page.studyOptions.waitForAudio = false;
    page.studyOptions.secondsToShowAnswer = 0.001;
    page.studyOptions.answerAction = action;
    await page.加载下一张卡();
    await page.显示答案();
    page.autoAdvanceEnabled = true;
    page.studyTiming.showAnswer(Date.now() - 10);
    page.tickStudyTimers(); page.tickStudyTimers();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(answers.length, 1);
    assert.equal(answers[0].rating, [0, 0, 2, 1][action]);
    page.foreground = false;
    page.studyActivityChanged();
    page.tickStudyTimers();
    assert.equal(page.autoAdvanceEnabled, false);
    assert.equal(page.studyTimerId, -1);
    assert.equal(answers.length, 1);
    page.aboutToDisappear();
  }
});

test('automatic question deadline waits for native audio and editing or guides block all automatic actions', async () => {
  const { page, answers } = harness();
  page.studyOptions.secondsToShowQuestion = 0.001;
  page.studyOptions.waitForAudio = true;
  page.autoAdvanceEnabled = true;
  page.studyTiming.showQuestion(Date.now() - 20);
  let playing = true;
  page.audioSession.isPlaying = () => playing;
  page.tickStudyTimers();
  assert.equal(page.阶段, 'question');
  for (const field of ['noteEditorVisible', 'noteEditorBusy', 'studyGuideVisible', 'studyMenuOpen', '手写模式']) {
    playing = false; page[field] = true;
    page.tickStudyTimers();
    assert.equal(page.阶段, 'question');
    page[field] = false;
    page.studyTiming.resume(Date.now() - 20);
  }
  page.tickStudyTimers();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.阶段, 'answer');
  assert.equal(answers.length, 0);
  page.aboutToDisappear();
});

test('disabled autoplay stays silent on both sides and reload, while manual replay still works', async () => {
  const { page, sounds } = harness();
  page.studyOptions.autoplay = false;
  page.studyOptions.skipQuestionWhenReplayingAnswer = true;
  await page.加载下一张卡();
  await page.显示答案();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sounds.length, 0);
  assert.equal(page.有音频, true, 'manual replay remains available');
  await page.playStudyAudio(true, true);
  assert.deepEqual(sounds, [['/A-answer']]);
  await page.加载下一张卡();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sounds.length, 1, 'automatic playback stays disabled after reloading');
  page.studyOptions.autoplay = true;
  await page.加载下一张卡();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sounds.at(-1), ['/A-question']);
});

test('a pending spelling flip cannot overwrite the next card after bury', async () => {
  const {page,displayed}=harness(), gate=deferred();
  page.拼写字段名='Back';
  page.构建拼写答案HTML=async html=>{await gate.promise;return html;};
  const flip=page.显示答案();
  await page.埋藏或暂停当前卡(2);
  assert.equal(page.当前卡片.cardId,'B');
  gate.resolve(); await flip;
  assert.equal(displayed.at(-1),'B-question');
  assert.equal(page.阶段,'question');
});
test('late answer audio cannot replace the next question audio', async () => {
  const {page,sounds}=harness(), gate=deferred();
  page.卡片渲染服务实例.extractAudioTags=async raw=>{if(raw==='A-answer')await gate.promise;return {soundFiles:[raw],ttsItems:[]};};
  const flip=page.显示答案();
  assert.equal(page.阶段,'answer');
  await page.评分(2);
  assert.equal(page.当前卡片.cardId,'B');
  await new Promise(r=>setImmediate(r));
  assert.equal(sounds.at(-1)[0],'/B-question');
  gate.resolve(); await flip;
  await new Promise(r=>setImmediate(r));
  assert.equal(sounds.at(-1)[0],'/B-question');
});
test('hiding during rendering prevents late display and playback', async () => {
  const {page,displayed,sounds}=harness(), gate=deferred();
  page.卡片渲染服务实例.渲染既有卡片=async id=>{await gate.promise;return {id,answerNodes:[],questionNodes:[]};};
  const load=page.加载下一张卡();
  await new Promise(r=>setImmediate(r));
  page.页面已显示=false; page.studyActivityChanged();
  gate.resolve(); await load;
  assert.equal(displayed.length,0);
  assert.equal(sounds.length,0);
});

test('a newer load survives an old render success or failure', async () => {
  for (const fail of [false, true]) {
    const {page, displayed}=harness(), gate=deferred();
    let calls=0;
    page.卡片渲染服务实例.渲染既有卡片=async()=>{
      if (++calls === 1) return gate.promise;
      return {id:'latest',answerNodes:[],questionNodes:[]};
    };
    const old=page.加载下一张卡(); await new Promise(r=>setImmediate(r));
    await page.加载下一张卡();
    if(fail)gate.reject(new Error('old failure'));else gate.resolve({id:'old',answerNodes:[],questionNodes:[]});
    await old;
    assert.deepEqual(displayed,['latest-question']);
    assert.equal(page.阶段,'question');
  }
});

test('repeat flips issue only one spelling read and never allow early rating', async () => {
  const {page, answers}=harness(), gate=deferred();
  let reads=0;
  page.拼写字段名='Back';
  page.构建拼写答案HTML=async html=>{reads++;await gate.promise;return html;};
  const first=page.显示答案();
  await page.显示答案(); await page.评分(2);
  assert.equal(reads,1); assert.equal(answers.length,0);
  gate.resolve(); await first;
  assert.equal(page.阶段,'answer');
});

test('Web attach consumes only the current cached question and errors are recoverable', async () => {
  const {page,displayed,sounds}=harness();
  page.controllerReady=false;
  await page.加载下一张卡(); await page.显示答案();
  assert.equal(page.阶段,'question');
  assert.deepEqual(displayed,[]); assert.deepEqual(sounds,[]);
  page.studyWebAttached(); await new Promise(r=>setImmediate(r));
  assert.deepEqual(displayed,['A-question']); assert.equal(sounds.length,1);
  page.controllerReady=false;
  await page.加载下一张卡();
  page.网页控制器.loadData=()=>{throw new Error('web failed');};
  page.studyWebAttached();
  assert.equal(page.阶段,'error'); assert.equal(page.错误详情,'web failed');
  page.网页控制器.loadData=html=>displayed.push(html);
  await page.加载下一张卡();
  assert.equal(page.阶段,'question');
});

test('destruction during rendering or extraction prevents late display and playback', async () => {
  for (const duringAudio of [false,true]) {
    const {page,displayed,sounds,events}=harness(), gate=deferred();
    if(duringAudio)page.卡片渲染服务实例.extractAudioTags=()=>gate.promise;
    else page.卡片渲染服务实例.渲染既有卡片=()=>gate.promise;
    const loading=page.加载下一张卡(); await new Promise(r=>setImmediate(r));
    page.aboutToDisappear();
    gate.resolve(duringAudio?{soundFiles:['late'],ttsItems:[]}:{id:'A',answerNodes:[],questionNodes:[]});
    await loading; await new Promise(r=>setImmediate(r));
    assert.equal(displayed.length,duringAudio?1:0); assert.equal(sounds.length,0);
    assert.ok(events.includes('sound release')); assert.ok(events.includes('tts release'));
  }
});

test('background cancels pending work and foreground resumes a real queue load', async () => {
  const {page,displayed}=harness(), gate=deferred();
  let calls=0;
  page.卡片渲染服务实例.渲染既有卡片=async()=>{
    if(++calls===1)return gate.promise;
    return {id:'fresh',answerNodes:[],questionNodes:[]};
  };
  const loading=page.加载下一张卡();await new Promise(r=>setImmediate(r));
  page.foreground=false;page.studyActivityChanged();
  gate.resolve({id:'stale',answerNodes:[],questionNodes:[]});await loading;
  assert.deepEqual(displayed,[]);
  page.foreground=true;page.studyActivityChanged();
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(displayed,['fresh-question']);
  assert.equal(page.评分中,false);
});

test('rating remains single-submit, uses the shown card, and undo reloads availability', async () => {
  const {page,events,answers,displayed}=harness(), gate=deferred();
  await page.加载下一张卡(); await page.显示答案();
  const submit=page.调度器服务实例.提交评分;
  page.调度器服务实例.提交评分=async input=>{await gate.promise;await submit(input);};
  const rating=page.评分(2);await page.评分(3);
  gate.resolve();await rating;
  assert.equal(answers.length,1);assert.equal(answers[0].cardId,'A');assert.equal(answers[0].rating,2);
  assert.equal(displayed.at(-1),'B-question');
  await page.撤销上次();
  assert.equal(displayed.at(-1),'A-question');assert.equal(page.可撤销,true);
  assert.deepEqual(events.filter(e=>e==='undo status'||e==='undo'),['undo status','undo status','undo','undo status']);
});

test('empty queue stops old audio; congrats errors degrade and stale results do not replace new state', async () => {
  const {page,displayed,events}=harness();
  page.调度器服务实例.获取队首卡片=async()=>({cards:[],newCount:0,learningCount:0,reviewCount:0});
  page.调度器服务实例.获取完成页信息=async()=>{throw new Error('congrats unavailable');};
  await page.加载下一张卡();
  assert.equal(page.阶段,'done');assert.equal(page.完成页数据已加载,false);
  assert.equal(page.当前卡片,null);assert.equal(page.已渲染,null);
  assert.match(displayed.at(-1),/^<!DOCTYPE html>/);assert.ok(events.includes('stop'));
  const gate=deferred();page.调度器服务实例.获取完成页信息=()=>gate.promise;
  const old=page.加载完成页信息();page.invalidateCardWork();page.完成页有埋藏=false;
  gate.resolve({secsUntilNextLearn:60,learnRemaining:2,haveUserBuried:true});await old;
  assert.equal(page.完成页有埋藏,false);
});

test('audio errors keep the card usable and replay retries extraction', async () => {
  const {page,events,sounds}=harness();
  page.卡片渲染服务实例.extractAudioTags=async()=>{throw new Error('bad audio');};
  await page.加载下一张卡();await new Promise(r=>setImmediate(r));
  assert.equal(page.阶段,'question');assert.equal(page.有音频,true);assert.ok(events.includes('toast'));
  page.卡片渲染服务实例.extractAudioTags=async()=>({soundFiles:['fixed'],ttsItems:[]});
  await page.playStudyAudio();
  assert.deepEqual(sounds.at(-1),['/fixed']);
});

test('leaving during a submitted rating keeps its eventual sync notification without loading another card', async () => {
  const { page, displayed } = harness(), gate = deferred();
  page.阶段 = 'answer';
  page.调度器服务实例.提交评分 = () => gate.promise;
  const rating = page.评分(2);
  await new Promise(resolve => setImmediate(resolve));
  page.aboutToDisappear();
  assert.equal(page.studyScheduler.canSync(), false);
  gate.resolve(); await rating;
  assert.equal(page.studyScheduler.hasPending(), true);
  assert.equal(page.studyScheduler.canSync(), true);
  assert.deepEqual(displayed, []);
});
