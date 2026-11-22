// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import JSON5 from 'json5';
import { ContinuationSession, decodeContinuation, studyContinuationFingerprint, hasContinuationTemplateInput, CONTINUATION_PARAM,
  CONTINUATION_MIN_VERSION, CONTINUATION_MAX_CHARS } from '../../entry/src/main/ets/model/ContinuationSession.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
const now = Date.now();
const payload = () => ({ version: 1, id: 'transfer-1', createdAt: now, deckId: '12', study: {
  cardId: 123, noteId: 456, fingerprint: 'abcd:1234', answerShown: true, typedAnswer: '单词 🧠' } });

test('continuation round trips typed answers, rejects invalid versions, stale data, identifiers and oversized payloads', () => {
  assert.deepEqual(decodeContinuation(JSON.stringify(payload()), now), payload());
  assert.deepEqual(decodeContinuation(JSON.stringify({...payload(), deckId: '', study: null}), now).study, null);
  const cases = [null, {}, {...payload(), version: 2}, {...payload(), createdAt: now - 600001},
    {...payload(), deckId: '../collection'}, {...payload(), deckId: '9999999999999999'},
    {...payload(), study: {...payload().study, cardId: 0}}, {...payload(), study: {...payload().study, typedAnswer: 'a'.repeat(4001)}},
    {...payload(), study: undefined}, {...payload(), study: {...payload().study, answerShown: 'true'}}];
  for (const value of cases) assert.throws(() => decodeContinuation(JSON.stringify(value), now));
  assert.throws(() => decodeContinuation(' '.repeat(CONTINUATION_MAX_CHARS + 1), now));
});

test('receiver holds a cold start until root consumes it, deduplicates deliveries, and preserves target work', () => {
  const session = new ContinuationSession();
  const text = JSON.stringify(payload());
  assert.equal(session.receive(text, now), true);
  assert.equal(session.hasPending(), true);
  assert.equal(session.receive(text, now), false);
  session.bind(() => null, () => false);
  assert.throws(() => session.receive(JSON.stringify({...payload(), id: 'transfer-2'}), now), /busy/);
  assert.equal(session.take().id, 'transfer-1');
  assert.equal(session.take(), null);
  session.bind(() => payload(), () => true);
  assert.equal(session.capture().study.typedAnswer, '单词 🧠');
  session.bindStudy(() => payload().study); assert.equal(session.studySnapshot().cardId, 123);
  session.bindStudy(null); assert.equal(session.studySnapshot(), null);
  session.bind(null, null); assert.equal(session.capture(), null);
});

test('Core state, card/note identity, template and rendered content must match; no state bytes are rewritten', () => {
  const card = {cardId: 123, noteId: 456, deckId: 12, templateIdx: 0, states: {current: Uint8Array.of(1, 2, 255)}};
  const rendered = {questionHtml: 'Question', answerHtml: 'Answer', css: ''};
  const stamp = studyContinuationFingerprint(card, rendered);
  assert.equal(studyContinuationFingerprint(structuredClone(card), structuredClone(rendered)), stamp);
  for (const changed of [{...card, noteId: 457}, {...card, cardId: 124}, {...card, templateIdx: 1},
    {...card, states: {current: Uint8Array.of(1, 2, 254)}}]) assert.notEqual(studyContinuationFingerprint(changed, rendered), stamp);
  assert.notEqual(studyContinuationFingerprint(card, {...rendered, answerHtml: 'Changed'}), stamp);
  assert.deepEqual([...card.states.current], [1, 2, 255]);
});

const read = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
function methods(source, names, deps) {
  const bodies = names.map(name => {
    const start = source.search(new RegExp(`^  (?:private )?(?:async )?${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  return new Function(...Object.keys(deps), stripTypeScriptTypes('class Host {' + bodies.join('\n') + '}', {mode: 'transform'}) + '; return Host;')(...Object.values(deps));
}
const abilitySource = read('entry/src/main/ets/entryability/EntryAbility.ets');
function ability() {
  const session = new ContinuationSession(), toasts = [], restores = [];
  const constants = {OnContinueResult: {AGREE: 0, REJECT: 1, MISMATCH: 2}, LaunchReason: {CONTINUATION: 3}};
  const Host = methods(abilitySource, ['onContinue', 'receiveContinuation', 'onWindowStageRestore'], {
    continuationSession: session, CONTINUATION_PARAM, CONTINUATION_MIN_VERSION, CONTINUATION_MAX_CHARS,
    AbilityConstant: constants, syncActivity: {isCollectionBusy: () => false},
    wantConstant: {Params: {SUPPORT_CONTINUE_PAGE_STACK_KEY: 'stack', SUPPORT_CONTINUE_SOURCE_EXIT_KEY: 'exit'}},
    LocalStorage: class {}, hilog: {warn(){}}, DOMAIN: 0
  });
  const host = new Host(); host.主窗口 = {};
  host.continuationToast = key => toasts.push(key);
  host.context = {restoreWindowStage: value => restores.push(value)};
  host.updateContinuationState = () => {};
  return {host, session, toasts, restores};
}

test('actual Ability exports bounded parameters, rejects older targets and unsafe source state', () => {
  const {host, session, toasts} = ability();
  session.bind(payload, () => true);
  const params = {version: CONTINUATION_MIN_VERSION};
  assert.equal(host.onContinue(params), 0);
  assert.equal(params.stack, false); assert.equal(params.exit, false);
  assert.equal(JSON.parse(params[CONTINUATION_PARAM]).study.answerShown, true);
  assert.equal(host.onContinue({version: CONTINUATION_MIN_VERSION - 1}), 2);
  session.bind(() => null, () => true);
  assert.equal(host.onContinue({version: CONTINUATION_MIN_VERSION}), 1);
  assert.ok(toasts.includes('continuation_busy'));
});

test('actual cold/warm receiver restores once, ignores ordinary wants and refuses to discard target work', () => {
  const {host, session, restores, toasts} = ability();
  const want = {parameters: {[CONTINUATION_PARAM]: JSON.stringify(payload())}};
  assert.equal(host.receiveContinuation(want, {launchReason: 0}), false);
  assert.equal(restores.length, 0);
  assert.equal(host.receiveContinuation(want, {launchReason: 3}), true);
  assert.equal(restores.length, 1);
  host.receiveContinuation(want, {launchReason: 3}); assert.equal(restores.length, 1);
  session.take(); session.bind(() => null, () => false);
  host.receiveContinuation({parameters: {[CONTINUATION_PARAM]: JSON.stringify({...payload(), id:'transfer-2'})}}, {launchReason: 3});
  assert.equal(restores.length, 1); assert.equal(session.hasPending(), false);
  assert.ok(toasts.includes('continuation_busy'));
  const events = []; host.onWindowStageDestroy = () => events.push('release');
  host.onWindowStageCreate = stage => events.push(stage); host.onWindowStageRestore('restored-stage');
  assert.deepEqual(events, ['release', 'restored-stage']);
});

test('native declaration and JIDE structure expose the same continuation boundary', () => {
  const module = JSON5.parse(read('entry/src/main/module.json5')).module;
  assert.equal(module.abilities.find(a => a.name === 'EntryAbility').continuable, true);
  const info = buildAgentAppStructure({simple:false,agent:true}, '', '', key => key, [], [], []);
  assert.deepEqual(info.continuation.support.surfaces, ['home', 'study']);
  assert.equal(info.continuation.support.agentCanInitiate, false);
  assert.ok(info.continuation.support.excluded.includes('collection transfer'));
});

const homeSource = read('entry/src/main/ets/pages/首页.ets');
const studySource = read('entry/src/main/ets/pages/学习页.ets');
test('actual root refuses target editors and missing decks; restores study using explicit params exactly once', () => {
  const session = new ContinuationSession(), pushes = [], notices = [];
  let stack = [], missing = false;
  const activity = {foreground:true,collectionReady:true,collectionBusy:false,dialogOpen:false,interactionBusy:false,startupChecking:false};
  const Home = methods(homeSource, ['canReceiveContinuation','captureContinuation','restoreContinuation'], {
    continuationSession:session, syncActivity:{isCollectionBusy:()=>false}, externalDeckOpens:{hasPending:()=>false},
    牌组显示名:deck=>deck.name, $r:key=>key
  });
  const home = new Home(); Object.assign(home, {homeDisposed:false, homeActivity:()=>activity,
    页面栈:{size:()=>stack.length,getAllPathName:()=>stack,getParamByIndex:()=>({deckId:'12'}),pushPath:value=>pushes.push(value)},
    按ID查牌组:id=>({id:missing?'':id,name:'Deck'}), 选择牌组:id=>{home.选中的牌组ID=id;},
    显示提示:key=>notices.push(key), stopAutoSyncTimer(){}, 暂停主页官方公告检查(){}, 返回主页后刷新(){},选中的牌组ID:'12'});
  session.bind(()=>home.captureContinuation(),()=>home.canReceiveContinuation());
  assert.equal(session.capture().deckId,'12');
  stack=['EditNotePage']; assert.equal(session.capture(),null); assert.equal(session.canReceive(),false);
  stack=['StudyPage']; session.bindStudy(()=>payload().study); assert.equal(session.capture().study.cardId,123);
  activity.dialogOpen=true; assert.equal(session.capture(),null); activity.dialogOpen=false;
  stack=[]; session.receive(JSON.stringify(payload()),now); home.restoreContinuation(); home.restoreContinuation();
  assert.equal(pushes.length,1); assert.deepEqual(pushes[0].param.continuation,payload().study);
  missing=true; session.receive(JSON.stringify({...payload(),id:'missing-deck'}),now); home.restoreContinuation();
  assert.equal(pushes.length,1); assert.ok(notices.includes('app.string.continuation_sync_required'));
});

test('actual study source protects local drafts, recording, template forms and pending answers', () => {
  const Study = methods(studySource,['captureStudyContinuation'], {studyContinuationFingerprint,
    hasContinuationTemplateInput});
  const host = new Study(); Object.assign(host,{mounted:true,页面已显示:true,foreground:true,阶段:'answer',
    当前卡片:{cardId:123,noteId:456,deckId:12,templateIdx:0,states:{current:Uint8Array.of(1)}},
    已渲染:{questionHtml:'question',answerHtml:'answer'},studyGestureBlocked:()=>false,studySession:{hasPendingAnswer:()=>false},
    choiceQuestion:null,whiteboardMounted:false,voiceAudios:[],已输入答案:'typed',webInputFocused:false});
  assert.equal(host.captureStudyContinuation().typedAnswer,'typed');
  for (const [key,value] of [['whiteboardMounted',true],['voiceAudios',['recording']],['webInputFocused',true],['foreground',false],['choiceQuestion',{}]]) {
    const before=host[key];host[key]=value;assert.equal(host.captureStudyContinuation(),null,key);host[key]=before;
  }
  host.已渲染={questionHtml:'<input value="draft">'}; assert.equal(host.captureStudyContinuation(),null);
});

test('late disposal of a replaced root or study provider cannot unregister the new page', () => {
  const session = new ContinuationSession();
  const releaseRoot = session.bind(() => null, () => false);
  session.bind(payload, () => true); releaseRoot();
  assert.equal(session.capture().id, 'transfer-1'); assert.equal(session.canReceive(), true);
  const releaseStudy = session.bindStudy(() => null);
  session.bindStudy(() => payload().study); releaseStudy();
  assert.equal(session.studySnapshot().cardId, 123);
});
