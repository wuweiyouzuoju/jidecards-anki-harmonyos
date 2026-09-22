// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

// 仅替换平台 IO；执行真实 Runner、Registry、Session、卡库工具和确认执行器。
const stub = `
export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}
export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}
export class AgentWorkspaceStore {} export class WikimediaImageService {} export class WikimediaImageServiceError extends Error {}
export const fixture = { writes: [], noteIds: Array.from({length:2507}, (_,i)=>i+1), types:[{id:2,name:'Basic'}],
 decks:[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}], longText:'内容'.repeat(15000) };
export class 牌组服务 {
 async 获取牌组树() { return {deckId:0,name:'',children:fixture.decks}; }
 async 创建牌组(name) { fixture.writes.push(['deck',name]);fixture.decks.push({deckId:3,name,children:[]});return 3; }
}
export class 笔记类型服务 {
 async 获取笔记类型名列表() { return fixture.types; }
 async 获取笔记类型能力(id) { const t=fixture.types.find(x=>x.id===id);if(!t)throw Error('notetype_not_found');
 return {notetypeId:id,name:t.name,kind:0,fieldNames:t.fields??['Front','Back'],clozeFieldOrds:[]}; }
 async 获取标准笔记类型JSON() { return JSON.stringify({id:0,name:'Basic',type:0,sortf:0,css:'.card{}',flds:[{name:'Front',ord:0}],tmpls:[{ord:0,name:'Card',qfmt:'',afmt:''}]}); }
 async 添加笔记类型旧版(json) { const t=JSON.parse(json);fixture.writes.push(['notetype',t]);fixture.types.push({id:4,name:t.name,fields:t.flds.map(f=>f.name)});return 4; }
 async 获取笔记类型旧版() { return JSON.stringify({css:fixture.longText}); }
}
export class 搜索服务 { async 搜索笔记() { return fixture.noteIds.slice(); } async 搜索卡片() { return fixture.noteIds.slice(); } }
export class 笔记服务 {
 async 获取笔记(id) { return {id,notetypeId:2,fields:[fixture.longText,'Answer'],tags:[]}; }
 async 获取笔记的卡片(id) { return [id]; }
}
export class 卡片服务 { async 获取卡片(id) { return {id,noteId:id,deckId:1}; } }
export class 标签服务 { async 标签树() { return {name:'',level:0,children:[]}; } }
export class 统计服务 {}
`;
const stubUrl = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
const names = ['AgentTransport','DeepSeekAdapter','OpenAIAdapter','CustomAdapter','AgentWorkspaceStore','WikimediaImageService',
 '牌组服务','笔记类型服务','搜索服务','笔记服务','卡片服务','标签服务','统计服务'];
register('data:text/javascript;base64,' + Buffer.from(`export function resolve(s,c,next) {
 if (${JSON.stringify(names)}.some(n=>s.endsWith('/'+n))) return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c); }`).toString('base64'), import.meta.url);
const { fixture } = await import(stubUrl);
const { AgentScope } = await import('../../entry/src/main/ets/backend/agent/AgentScope.ets');
const { AgentToolRegistry } = await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const { AgentRunner } = await import('../../entry/src/main/ets/backend/agent/AgentRunner.ets');
const { AgentSessionController } = await import('../../entry/src/main/ets/backend/agent/AgentSessionController.ets');
const { AgentAuxiliaryTools } = await import('../../entry/src/main/ets/backend/agent/AgentAuxiliaryTools.ets');
const { CardAgentTools } = await import('../../entry/src/main/ets/backend/agent/CardAgentTools.ets');
const { agentFunctionTools } = await import('../../entry/src/main/ets/model/agent/AgentToolCatalog.ts');
const { applyAgentMemoryChange } = await import('../../entry/src/main/ets/model/agent/AgentMemory.ts');

const item = (text) => ({kind:'message',role:'user',content:text,callId:'',name:'',argumentsJson:'',output:''});
const event = (kind,text='',toolCall=null) => ({kind,text,toolCall,toolTrace:null,source:null,errorCode:''});
const call = (id,name,args) => event('tool_call','',{id,name,argumentsJson:JSON.stringify(args)});
function harness(rounds=[],limits) {
 const scope=new AgentScope();scope.configureCreateTarget(1,2);scope.registerReadableDeckIds([1]);scope.registerReadableNotetypeIds([2]);
 const store={state:{lastDeckId:1,deckPreferences:[],memories:[]},async load(){return this.state;},
 async saveSelection(deckId,notetypeId){this.state.lastDeckId=deckId;this.state.deckPreferences=[{deckId,notetypeId}];},
 async changeMemory(change,id){this.state.memories=applyAgentMemoryChange(this.state.memories,change,id,1);}};
 const registry=new AgentToolRegistry();const cards=new CardAgentTools(scope);cards.register(registry,'create');
 const auxiliary=new AgentAuxiliaryTools(scope,store);auxiliary.register(registry);
 const runner=limits ? new AgentRunner(registry,limits) : new AgentRunner(registry);
 const requests=[];const events=[];
 runner.createSession=(_provider,request,observer)=>({async start(){requests.push(structuredClone(request));
 for(const e of rounds.shift()??[])observer.onEvent(e);},cancel(){}});
 const session=new AgentSessionController(runner,scope,store,auxiliary);
 const request=(text)=>({apiKey:'test',baseUrl:'https://example.test',model:'test',instructions:'',input:[item(text)],
 functionTools:agentFunctionTools(100,'create'),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
 requiresDraft:false,expectedDraftCount:0,reasoningEffort:'',maxOutputTokens:1024});
 const run=(text,resume='')=>session.run('deepseek',request(text),{onEvent:e=>events.push(e)},resume);
 return {scope,store,registry,cards,auxiliary,runner,session,requests,events,run};
}

test('normal chat retains final text; free-text clarification resumes its original call',async()=>{
 const h=harness([[event('text_delta','先谈谈学习目标。')],
 [call('q1','request_clarification',{clarificationId:'goal',question:'你准备什么考试？',options:[],allowFreeText:true})],
 [event('text_delta','按四级准备。')]]);
 assert.equal((await h.run('先聊聊')).status,'completed');
 assert.equal((await h.run('开始吧')).status,'awaiting_clarification');
 assert.ok(h.requests[1].input.some(x=>x.content==='先谈谈学习目标。'));
 assert.equal((await h.run('四级','{"answer":"四级"}')).status,'completed');
 const outputs=h.requests[2].input.filter(x=>x.kind==='function_call_output'&&x.callId==='q1');
 assert.equal(outputs.length,1);assert.deepEqual(JSON.parse(outputs[0].output),{answer:'四级'});
 assert.ok(!h.events.some(x=>x.errorCode==='agent_no_valid_draft'));
});

test('notetype proposal writes once only after confirmation, then uses the new target for a real draft',async()=>{
 fixture.writes=[];fixture.types=[{id:2,name:'Basic'}];
 const h=harness([[call('newtype','propose_create_note_type',{name:'Vocabulary',kind:'normal',fields:['Word','Meaning'],frontFields:['Word'],backFields:['Meaning']})],
 [call('cards','create_flashcards',{cards:[{fields:['apple','苹果']}]})]]);
 const pending=await h.run('新建单词类型并制卡');assert.equal(pending.status,'awaiting_confirmation');
 assert.equal(fixture.writes.length,0);
 const result=await h.session.actionExecutor.executeConfirmed(pending.action);
 assert.equal(fixture.writes.length,1);assert.deepEqual(h.scope.currentCreateTarget(),[1,4]);
 const completed=await h.run('确认后继续',result);
 assert.equal(completed.status,'completed');assert.equal(completed.drafts.length,1);
 assert.deepEqual(completed.drafts[0].affectedNotetypeIds,[4]);
 assert.ok(h.requests[1].input.some(x=>x.callId==='newtype'&&x.output.includes('"notetypeId":4')));
 await assert.rejects(()=>h.session.actionExecutor.executeConfirmed(pending.action),/confirmation_mismatch/);
});

test('cancelled creation performs no writes; restored pending action keeps exact confirmation identity',async()=>{
 fixture.writes=[];
 const h=harness([[call('deck','propose_create_deck',{name:'New deck'})]]);
 const pending=await h.run('创建牌组');const snapshot=h.session.exportState();
 const restored=harness([[event('text_delta','已取消。')]]);restored.session.restore(snapshot);
 assert.deepEqual(restored.session.getAction(),pending.action);
 const action=restored.session.getAction();action.status='cancelled';action.resultJson='{"status":"cancelled_by_user"}';
 await restored.run('取消',action.resultJson);assert.equal(fixture.writes.length,0);
 await assert.rejects(()=>restored.session.actionExecutor.executeConfirmed(action),/confirmation_mismatch/);
});

test('confirmed memory survives session changes and a forged create cannot replace existing memory',async()=>{
 const h=harness([[call('mem','propose_memory_change',{operation:'create',memoryId:'',text:'答案简洁',scope:'global'})]]);
 const pending=await h.run('记住答案要简洁');assert.equal(h.store.state.memories.length,0);
 await h.session.actionExecutor.executeConfirmed(pending.action);assert.equal(h.store.state.memories.length,1);
 await assert.rejects(()=>h.auxiliary.propose('propose_memory_change',JSON.stringify({operation:'create',memoryId:pending.action.id,text:'overwrite',scope:'global'})),/invalid_memory_change/);
 h.session.clear();await h.run('下一个任务');assert.match(h.requests.at(-1).instructions,/答案简洁/);
});

test('real collection tools traverse 2507 IDs, continue long fields and templates, and stop before unapproved large reads',async()=>{
 const h=harness();let response=JSON.parse(await h.cards.executeRead('search_notes','{"query":"","limit":200}'));
 const ids=[...response.noteIds];while(response.nextCursor){response=JSON.parse(await h.cards.executeRead('search_notes',JSON.stringify({query:'',limit:200,cursor:response.nextCursor})));ids.push(...response.noteIds);}
 assert.equal(ids.length,2507);assert.equal(new Set(ids).size,2507);
 let text='',offset=0;do {const part=JSON.parse(await h.cards.executeRead('read_note_field',JSON.stringify({noteId:1,fieldOrd:0,offset,length:12000})));text+=part.text;offset=part.nextOffset;}while(offset>=0);
 assert.equal(text,fixture.longText);
 text='';offset=0;do {const part=JSON.parse(await h.cards.executeRead('get_notetype_details',JSON.stringify({notetypeIds:[2],offset,length:12000})))[0];text+=part.legacyJson;offset=part.nextOffset;}while(offset>=0);
 assert.equal(JSON.parse(text).css,fixture.longText);
 for(let id=1;id<=200;id++)h.scope.retrieval.recordRead(id);
 const gated=await h.registry.execute({id:'read',name:'get_note_context',argumentsJson:'{"cardIds":[],"noteIds":[201]}'});
 assert.equal(gated.action.kind,'analysis');assert.equal(h.scope.retrieval.readCount(),200);
 await h.auxiliary.prepareAction(gated.action);h.session.actionExecutor.registerPending(gated.action);
 const previousIds=fixture.noteIds;fixture.noteIds=[99999];
 await h.session.actionExecutor.executeConfirmed(gated.action);fixture.noteIds=previousIds;
 assert.ok(!h.scope.retrieval.exportState().approvedNoteIds.includes(99999));
 const read=JSON.parse(await h.cards.executeRead('get_note_context','{"cardIds":[],"noteIds":[201]}'));
 assert.equal(read.notes[0].noteId,201);assert.equal(read.readCount,201);assert.equal(read.notes[0].fieldLengths[0],30000);
});

test('budget pause survives restore and a new conversation clears old read progress',async()=>{
 const h=harness([[call('search','search_notes',{query:'',limit:200})]],{maxProviderCalls:1,maxToolCalls:16});
 h.scope.configureCreateConstraints(true);
 assert.equal((await h.run('分析卡库')).status,'paused');
 const state=h.session.exportState();assert.equal(state.retrieval.snapshots.length,1);
 const next=harness([[event('text_delta','继续统计。')]]);next.session.restore(state);
 assert.equal(next.session.isPaused(),true);assert.equal((await next.run('继续','{"status":"continue"}')).status,'completed');
 assert.equal(next.scope.createRequiresYearCloze(),true);
 next.session.clear();assert.equal(next.session.exportState().retrieval.snapshots.length,0);
 assert.deepEqual(next.scope.readableIds(),[[],[],[],[]]);
});

test('crash with executing action is never restored as a clickable retry',()=>{
 const h=harness();const state=h.session.exportState();
 state.action={id:'unknown',kind:'create_deck',payloadJson:'{"name":"X"}',status:'executing',resultJson:''};
 h.session.restore(state);assert.equal(h.session.getAction().status,'failed');assert.equal(h.session.isPaused(),true);
 assert.match(h.session.getAction().resultJson,/execution_outcome_unknown/);
});

test('proposal tools expose no commit; unregistered and changed confirmations cannot write',async()=>{
 fixture.writes=[];
 const h=harness();
 assert.equal(typeof h.auxiliary.executeConfirmed,'undefined');
 assert.equal(typeof h.auxiliary.registerPending,'undefined');
 const action=await h.auxiliary.propose('propose_create_deck','{"name":"Isolated proposal"}');
 await assert.rejects(()=>h.session.actionExecutor.executeConfirmed(action),/confirmation_mismatch/);
 h.session.actionExecutor.registerPending(action);
 const payload=action.payloadJson;
 action.payloadJson='{"name":"Changed after confirmation"}';
 await assert.rejects(()=>h.session.actionExecutor.executeConfirmed(action),/confirmation_mismatch/);
 assert.deepEqual(fixture.writes,[]);
 action.payloadJson=payload;
 await h.session.actionExecutor.executeConfirmed(action);
 assert.deepEqual(fixture.writes,[['deck','Isolated proposal']]);
});

test('confirmation rechecks deck and notetype names after proposals without writing on conflict',async()=>{
 for(const kind of ['deck','notetype']) {
  fixture.writes=[];fixture.types=[{id:2,name:'Basic'}];
  fixture.decks=[{deckId:1,name:'English',children:[]}];
  const args=kind==='deck' ? {name:'Conflict'} :
   {name:'Conflict',kind:'normal',fields:['Word','Meaning'],frontFields:['Word'],backFields:['Meaning']};
  const h=harness([[call('conflict',kind==='deck'?'propose_create_deck':'propose_create_note_type',args)]]);
  const pending=await h.run('propose');
  assert.equal(pending.status,'awaiting_confirmation');
  if(kind==='deck') fixture.decks.push({deckId:7,name:'Conflict',children:[]});
  else fixture.types.push({id:7,name:'CONFLICT'});
  await assert.rejects(()=>h.session.actionExecutor.executeConfirmed(pending.action),
   new RegExp(`${kind}_name_exists`));
  assert.equal(pending.action.status,'failed');
  assert.deepEqual(fixture.writes,[]);
 }
});

test('restored pending action commits exactly once through its new session executor',async()=>{
 fixture.writes=[];fixture.decks=[{deckId:1,name:'English',children:[]}];
 const h=harness([[call('restore','propose_create_deck',{name:'Restored proposal'})]]);
 await h.run('propose');
 const restored=harness();restored.session.restore(structuredClone(h.session.exportState()));
 const action=restored.session.getAction();
 await restored.session.actionExecutor.executeConfirmed(action);
 await assert.rejects(()=>restored.session.actionExecutor.executeConfirmed(action),/confirmation_mismatch/);
 assert.deepEqual(fixture.writes,[['deck','Restored proposal']]);
});

test('unsupported registered action fails explicitly without falling through to notetype creation',async()=>{
 fixture.writes=[];
 const h=harness();
 const action={id:'unsupported',kind:'unknown',payloadJson:'{}',status:'pending',resultJson:''};
 h.session.actionExecutor.registerPending(action);
 await assert.rejects(()=>h.session.actionExecutor.executeConfirmed(action),/unsupported_action/);
 assert.equal(action.status,'failed');assert.deepEqual(fixture.writes,[]);
});
