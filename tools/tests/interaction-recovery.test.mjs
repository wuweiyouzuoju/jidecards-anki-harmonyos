import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

function answerHost() {
  const card = { cardId: 7, states: { current: Uint8Array.of(1), again: Uint8Array.of(2), hard: Uint8Array.of(3), good: Uint8Array.of(4), easy: Uint8Array.of(5) } };
  const probe = { step: 9, card: 'before', reps: 3 }, writes = [];
  const backend = { answerProbe: async () => ({...probe}), answer: async input => { writes.push(input); throw Error('response lost'); } };
  return {card, probe, writes, backend, controller: new StudySessionController(backend, new AutoSyncScheduler(), new SyncActivity())};
}
test('lost answer response confirmed by Core advances once; an uncommitted answer retries the identical input', async () => {
  const h = answerHost();
  await assert.rejects(h.controller.answer(h.card,2,1000,500), /response lost/);
  assert.equal(h.controller.hasPendingAnswer(),true);
  h.backend.answer = async input => h.writes.push(input);
  await h.controller.answer(h.card,2,2000,500);
  assert.equal(h.writes.length,2); assert.equal(h.writes[1],h.writes[0]);
  assert.equal(h.controller.hasPendingAnswer(),false);
  const accepted = answerHost();
  accepted.backend.answer = async input => { accepted.writes.push(input); accepted.probe.step++; accepted.probe.reps++; accepted.probe.card='after'; throw Error('response lost'); };
  await accepted.controller.answer(accepted.card,2,1000,500);
  assert.equal(accepted.writes.length,1); assert.equal(accepted.controller.hasPendingAnswer(),false);
});
test('unavailable or conflicting Core probes never resubmit a rating or permit a different rating',async()=>{
  const h=answerHost();
  await assert.rejects(h.controller.answer(h.card,2,1000,500));
  h.backend.answerProbe=async()=>{throw Error('Core unavailable');};
  await assert.rejects(h.controller.answer(h.card,2,2000,500),/Core unavailable/);
  await assert.rejects(h.controller.answer(h.card,3,2000,500),/reconciliation/);
  h.backend.answerProbe=async()=>({step:10,card:'before'});
  await assert.rejects(h.controller.answer(h.card,2,2000,500),/unresolved/);
  assert.equal(h.writes.length,1);
});
test('recovery retains current card, input, choice selection and exposes a single explicit retry',async()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
  const methods=['recoverStudy','retryStudy'].map(name=>{const start=source.indexOf('  private '+(name==='retryStudy'?'async ':'')+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);});
  const Host=new Function(stripTypeScriptTypes('class Host {'+methods.join('\n')+'}',{mode:'transform'})+';return Host;')();
  const page=Object.assign(new Host(),{阶段:'answer',hasRenderedCard:true,已输入答案:'draft',choiceSelectedIds:['a'],当前卡片:{cardId:7},评分中:false,stopStudyTimers(){},audioSession:{stop(){}},publishInterface(){}});
  let retries=0;const current=page.当前卡片;
  page.recoverStudy(Error('offline'),async()=>{retries++;});
  assert.equal(page.阶段,'answer');assert.equal(page.当前卡片,current);assert.equal(page.已输入答案,'draft');assert.deepEqual(page.choiceSelectedIds,['a']);
  assert.equal(page.recoveryMessage,'offline');await page.retryStudy();await page.retryStudy();assert.equal(retries,1);
});
test('browser data source updates only changed rows and preserves unchanged node keys',()=>{
  const Table=loadComponentLogic('components/browser/卡片表格.ets','卡片表格',{});
  const table=new Table(), data=table.行数据源, events=[];
  const row=id=>({id,cells:[{text:String(id)}],color:0,hasSuspendedCards:false});
  data.replaceAll([row(1),row(2),row(3)]);
  data.registerDataChangeListener({onDataReloaded(){events.push('reload');},onDataDelete(i){events.push(['delete',i]);},onDataAdd(i){events.push(['add',i]);},onDataChange(i){events.push(['change',i]);}});
  data.replaceAll([row(1),{...row(3),hasSuspendedCards:true},row(4)]);
  assert.deepEqual(events,[['delete',1],['change',1],['add',2]]);assert.equal(data.keyFor(0),'1');assert.equal(data.keyFor(1),'3');
  events.length=0;data.replaceAll([row(1),{...row(3),hasSuspendedCards:true},row(4)]);assert.deepEqual(events,[]);
});
