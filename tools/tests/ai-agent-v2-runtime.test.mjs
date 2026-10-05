// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import { buildFailedOperationsRetryDraft } from '../../entry/src/main/ets/model/agent/AgentDraftRetry.ts';
import { AGENT_IDENTITY_INSTRUCTIONS, buildAgentSessionInstructions } from '../../entry/src/main/ets/model/agent/AgentSessionContext.ts';
import { AgentDocumentAccess } from '../../entry/src/main/ets/model/agent/AgentDocuments.ts';
import { AgentAppNavigationSession } from '../../entry/src/main/ets/model/agent/AgentAppNavigation.ts';
import { AgentAnkiHelp } from '../../entry/src/main/ets/model/agent/AgentAnkiHelp.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { decodeExtensionArguments } from '../../entry/src/main/ets/model/agent/AgentExtensionTools.ts';

// 仅替换平台 IO；执行真实 Runner、Registry、Session、卡库工具和确认执行器。
const stub = `
export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}
export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}
export class AgentWorkspaceStore {} export class WikimediaImageService {} export class WikimediaImageServiceError extends Error {}
export class FsrsService {async deckContext(){throw Error('unexpected FSRS context read');}async daily(){throw Error('unexpected FSRS simulation');}}
export class AnkiDeckOptions {async load(){throw Error('unexpected deck options read');}async save(){throw Error('unexpected deck options write');}committed(){throw Error('unexpected deck options notification');}}
export const fsrsContextSnapshot = context => JSON.stringify(context);
export const fixture = { writes: [], noteIds: Array.from({length:2507}, (_,i)=>i+1), types:[{id:2,name:'Basic'}],
 decks:[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}], orders: {}, orderError:false, longText:'内容'.repeat(15000) };
export async function 加载牌组顺序(parent) { if(fixture.orderError)throw Error('deck_reorder_storage_unavailable');return fixture.orders[parent]??null; }
export async function 保存牌组顺序(parent,ids) { if(fixture.orderError)throw Error('deck_reorder_storage_unavailable');fixture.writes.push(['order',parent,ids]);fixture.orders[parent]=ids.slice(); }
export class 牌组服务 {
 async 获取牌组树() { return {deckId:0,name:'',children:fixture.decks}; }
 async 创建牌组(name) { fixture.writes.push(['deck',name]);fixture.decks.push({deckId:3,name,children:[]});return 3; }
 async 调整牌组父级(ids,parentId) { fixture.writes.push(['reparent',ids,parentId]);return ids.length; }
 async 重命名牌组(id,name) { fixture.writes.push(['rename',id,name]); }
}
export class 笔记类型服务 {
 async 获取笔记类型名列表() { return fixture.types; }
 async 获取笔记类型能力(id) { const t=fixture.types.find(x=>x.id===id);if(!t)throw Error('notetype_not_found');
 return {notetypeId:id,name:t.name,kind:0,fieldNames:t.fields??['Front','Back'],clozeFieldOrds:[],
 templateCount:t.templates?.length??0,templatePreviews:t.templates??[]}; }
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
export const appThemeColorSession = {};
export async function 设置FSRS开启状态() { throw Error('unexpected setting write'); }
export async function saveCardTextSize() { throw Error('unexpected setting write'); }
export async function saveDeckListStyle() { throw Error('unexpected setting write'); }
export function legacyDeckListStyle() { return 'single_wide'; }
export async function saveStudyHaptics() { throw Error('unexpected setting write'); }
export class LocalPreferenceWriteError extends Error {}
export const reviewPreferences = {read:async()=>({loadBalancer:true,shortTermWithSteps:false,backupDaily:12,backupWeekly:5,backupMonthly:2,backupInterval:30}),
 save:async()=>{throw Error('unexpected advanced preference write');}};
export async function readStudyControls() {throw Error('unexpected study controls read');}
export async function saveStudyControls() {throw Error('unexpected study controls write');}
export async function exportSubset() {throw Error('unexpected subset export');}
export async function 完成导出() {throw Error('unexpected subset save');}
`;
const stubUrl = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
const names = ['AgentTransport','DeepSeekAdapter','OpenAIAdapter','CustomAdapter','AgentWorkspaceStore','WikimediaImageService',
 '牌组服务','笔记类型服务','搜索服务','笔记服务','卡片服务','标签服务','统计服务','AppThemeService','FSRS控制器',
 'CardTextSizeStore','DeckListAppearanceStore','StudyHaptics','LocalPreferenceWrite','牌组顺序存储',
 'ReviewPreferencesService','StudyControlsService','数据迁移服务','FsrsService','AnkiDeckOptions'];
register('data:text/javascript;base64,' + Buffer.from(`export function resolve(s,c,next) {
 if (${JSON.stringify(names)}.some(n=>s.endsWith('/'+n))) return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c); }`).toString('base64'), import.meta.url);
const { fixture } = await import(stubUrl);
const { AgentScope } = await import('../../entry/src/main/ets/backend/agent/AgentScope.ets');
const { AgentToolRegistry } = await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const { AgentRunner } = await import('../../entry/src/main/ets/backend/agent/AgentRunner.ets');
const { AgentSessionController } = await import('../../entry/src/main/ets/backend/agent/AgentSessionController.ets');
const { AgentAuxiliaryTools } = await import('../../entry/src/main/ets/backend/agent/AgentAuxiliaryTools.ets');
const { AgentMaintenanceTools } = await import('../../entry/src/main/ets/backend/agent/AgentMaintenanceTools.ets');
const { CardAgentTools } = await import('../../entry/src/main/ets/backend/agent/CardAgentTools.ets');
const { registerAgentDocumentTools } = await import('../../entry/src/main/ets/backend/agent/AgentDocumentTools.ets');
const { AgentAppNavigationTools, readNavigationTarget } = await import('../../entry/src/main/ets/backend/agent/AgentAppNavigationTools.ets');
const { agentFunctionTools } = await import('../../entry/src/main/ets/model/agent/AgentToolCatalog.ts');
const { applyAgentMemoryChange } = await import('../../entry/src/main/ets/model/agent/AgentMemory.ts');

const item = (text) => ({kind:'message',role:'user',content:text,callId:'',name:'',argumentsJson:'',output:''});
const event = (kind,text='',toolCall=null) => ({kind,text,toolCall,toolTrace:null,source:null,errorCode:''});
const call = (id,name,args) => event('tool_call','',{id,name,argumentsJson:JSON.stringify(args)});
const moveDecks = () => [{deckId:1,name:'English',filtered:false,children:[
 {deckId:2,name:'Words',filtered:false,children:[{deckId:3,name:'Week 1',filtered:false,children:[]}]}]},
 {deckId:4,name:'Exam',filtered:false,children:[]}];

test('JIDE reads the home order and confirms exactly one device-only sibling permutation',async()=>{
 fixture.writes=[];fixture.orders={'':['4','1']};fixture.decks=moveDecks();
 const h=harness([[call('order','get_deck_order',{parentId:0})],
  [call('sort','propose_reorder_decks',{parentId:0,deckIds:[1,4]})]],undefined,'assistant');
 const pending=await h.run('把 English 排在 Exam 前面');assert.equal(pending.status,'awaiting_confirmation');
 assert.equal(pending.action.kind,'reorder_decks');assert.deepEqual(fixture.writes,[]);
 const plan=JSON.parse(pending.action.payloadJson);assert.deepEqual(plan.before.map(x=>x.id),[4,1]);
 assert.deepEqual(plan.after.map(x=>x.id),[1,4]);
 const result=JSON.parse(await h.session.actionExecutor.executeConfirmed(pending.action));
 assert.equal(result.scope,'device');assert.equal(result.synced,false);
 assert.deepEqual(fixture.writes,[['order','',['1','4']]]);
 await assert.rejects(h.session.actionExecutor.executeConfirmed(pending.action),/confirmation_mismatch/);
 fixture.orders={};fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

test('JIDE sibling order rejects out-of-scope, stale, incomplete, cross-parent and failed-storage actions',async()=>{
 fixture.writes=[];fixture.orders={};fixture.orderError=false;fixture.decks=moveDecks();const h=harness();
 await assert.rejects(h.auxiliary.propose('propose_reorder_decks','{"parentId":0,"deckIds":[4,1]}'),/id_out_of_scope/);
 const read=JSON.parse(await h.auxiliary.read('get_deck_order','{"parentId":0}'));
 assert.deepEqual(read.decks.map(x=>x.id),[1,4]);assert.equal(read.includesHiddenDecks,true);
 await assert.rejects(h.auxiliary.propose('propose_reorder_decks','{"parentId":0,"deckIds":[4]}'),/siblings/);
 await h.cards.executeRead('list_decks','{"query":"","limit":20}');
 await assert.rejects(h.auxiliary.propose('propose_reorder_decks','{"parentId":0,"deckIds":[2,4]}'),/siblings/);
 const stale=await h.auxiliary.propose('propose_reorder_decks','{"parentId":0,"deckIds":[4,1]}');
 h.session.actionExecutor.registerPending(stale);fixture.orders={'':['4','1']};
 await assert.rejects(h.session.actionExecutor.executeConfirmed(stale),/stale/);assert.deepEqual(fixture.writes,[]);
 const failed=await h.auxiliary.propose('propose_reorder_decks','{"parentId":0,"deckIds":[1,4]}');
 h.session.actionExecutor.registerPending(failed);fixture.orderError=true;
 await assert.rejects(h.session.actionExecutor.executeConfirmed(failed),/storage_unavailable/);assert.deepEqual(fixture.writes,[]);
 assert.equal(failed.status,'failed');fixture.orderError=false;fixture.orders={};
 fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

test('JIDE must issue sibling order proposals alone and cannot supply confirmation arguments',async()=>{
 assert.throws(()=>decodeExtensionArguments('propose_reorder_decks','{"parentId":0,"deckIds":[4,1],"confirmed":true}'));
 assert.throws(()=>decodeExtensionArguments('propose_reorder_decks','{"parentId":0,"deckIds":[1,1]}'));
 assert.throws(()=>decodeExtensionArguments('get_deck_order','{"parentId":null}'));
 const h=harness([[call('sort','propose_reorder_decks',{parentId:0,deckIds:[4,1]}),call('read','get_deck_order',{parentId:0})],
  [event('text_delta','需要单独提案。')]]);
 await h.run('调整显示顺序');assert.ok(h.requests[1].input.some(x=>x.output?.includes('clarification_must_be_only_tool')));
 assert.equal(h.session.getAction(),null);
});

test('JIDE discovers hierarchy, proposes an overlapping batch, and confirms exactly one real Core command',async()=>{
 fixture.writes=[];fixture.decks=moveDecks();
 const h=harness([[call('decks','list_decks',{query:'',limit:20})],
  [call('move','propose_reparent_decks',{deckIds:[2,3],parentId:4})], [event('text_delta','已移动。')]],undefined,'assistant');
 const pending=await h.run('把 Words 和其子牌组移到 Exam 下');
 assert.equal(pending.status,'awaiting_confirmation');assert.equal(pending.action.kind,'reparent_decks');
 assert.deepEqual(fixture.writes,[]);
 const plan=JSON.parse(pending.action.payloadJson);assert.deepEqual(plan.deckIds,[2]);
 assert.deepEqual(plan.changes.map(x=>[x.before,x.after]),[['English::Words','Exam::Words'],['English::Words::Week 1','Exam::Words::Week 1']]);
 const result=await h.session.actionExecutor.executeConfirmed(pending.action);
 assert.deepEqual(fixture.writes,[['reparent',[2],4]]);assert.equal(JSON.parse(result).affectedDecks,2);
 assert.equal((await h.run('确认后继续',result)).status,'completed');
 await assert.rejects(h.session.actionExecutor.executeConfirmed(pending.action),/confirmation_mismatch/);
 fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

test('JIDE reparent checks discovered IDs, validates arguments and rejects changed/cancelled/forged confirmations',async()=>{
 fixture.writes=[];fixture.decks=moveDecks();const h=harness();
 await assert.rejects(h.auxiliary.propose('propose_reparent_decks','{"deckIds":[2],"parentId":4}'),/id_out_of_scope/);
 for(const args of [{deckIds:[],parentId:0},{deckIds:['2'],parentId:0},{deckIds:[2],parentId:null},
  {deckIds:[2]}, {deckIds:[2],parentId:0,confirmed:true}])
   assert.throws(()=>decodeExtensionArguments('propose_reparent_decks',JSON.stringify(args)));
 await h.cards.executeRead('list_decks','{"query":"","limit":20}');
 const stale=await h.auxiliary.propose('propose_reparent_decks','{"deckIds":[2],"parentId":0}');
 h.session.actionExecutor.registerPending(stale);fixture.decks[0].children[0].children.push({deckId:8,name:'New',filtered:false,children:[]});
 await assert.rejects(h.session.actionExecutor.executeConfirmed(stale),/stale/);
 const forged=await h.auxiliary.propose('propose_reparent_decks','{"deckIds":[2],"parentId":4}');
 h.session.actionExecutor.registerPending(forged);forged.payloadJson=forged.payloadJson.replace('Exam','Changed');
 await assert.rejects(h.session.actionExecutor.executeConfirmed(forged),/confirmation_mismatch/);
 const cancelled=await h.auxiliary.propose('propose_reparent_decks','{"deckIds":[2],"parentId":0}');
 h.session.actionExecutor.registerPending(cancelled);cancelled.status='cancelled';
 await assert.rejects(h.session.actionExecutor.executeConfirmed(cancelled),/confirmation_mismatch/);assert.deepEqual(fixture.writes,[]);
 fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

test('JIDE rejects mixed reparent tool batches before proposing or writing',async()=>{
 fixture.writes=[];fixture.decks=moveDecks();
 const h=harness([[call('move','propose_reparent_decks',{deckIds:[2],parentId:4}),call('read','list_decks',{query:'',limit:20})],
  [event('text_delta','需要单独提案。')]]);
 await h.run('调整牌组');
 assert.ok(h.requests[1].input.some(x=>x.output?.includes('clarification_must_be_only_tool')));
 assert.deepEqual(fixture.writes,[]);assert.equal(h.session.getAction(),null);
 fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

function harness(rounds=[],limits,mode='create',documents=null,validate=null) {
 const scope=new AgentScope();scope.configureCreateTarget(mode==='assistant'?0:1,mode==='assistant'?0:2);scope.registerReadableDeckIds([1]);scope.registerReadableNotetypeIds([2]);
 const store={state:{lastDeckId:1,deckPreferences:[],memories:[]},async load(){return this.state;},
 async saveSelection(deckId,notetypeId){this.state.lastDeckId=deckId;this.state.deckPreferences=[{deckId,notetypeId}];},
 async changeMemory(change,id){this.state.memories=applyAgentMemoryChange(this.state.memories,change,id,1);}};
 const registry=new AgentToolRegistry();const cards=new CardAgentTools(scope,documents);cards.register(registry,mode);
 if(documents!==null)registerAgentDocumentTools(registry,documents);
 const auxiliary=new AgentAuxiliaryTools(scope,store);auxiliary.register(registry);
 new AgentMaintenanceTools(scope).register(registry);
 const runner=limits ? new AgentRunner(registry,limits) : new AgentRunner(registry);
 const requests=[];const events=[];
 runner.createSession=(_provider,request,observer)=>({async start(){requests.push(structuredClone(request));
 if(validate!==null)validate(JSON.parse(buildResponsesPayload(request)));
 for(const e of rounds.shift()??[])observer.onEvent(e);},cancel(){}});
 const session=new AgentSessionController(runner,scope,store,auxiliary);
 const request=(text,instructions)=>({apiKey:'test',baseUrl:'https://example.test',model:'test',instructions,input:[item(text)],
 functionTools:agentFunctionTools(100,mode),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
 requiresDraft:false,expectedDraftCount:0,reasoningEffort:'',maxOutputTokens:1024});
 const run=(text,resume='',expectedDraftCount=0,instructions='')=>{const value=request(text,instructions);value.expectedDraftCount=expectedDraftCount;return session.run('deepseek',value,{onEvent:e=>events.push(e)},resume);};
 return {scope,store,registry,cards,auxiliary,runner,session,requests,events,run};
}

test('real Runner reads advanced Core settings and pauses a JIDE-only write proposal before confirmation',async()=>{
 fixture.writes=[];
 const h=harness([[call('advanced','get_advanced_settings',{group:'collection'})],
  [call('change','propose_update_collection_preferences',{changesJson:'{"loadBalancer":false}'})]],undefined,'assistant');
 const pending=await h.run('通过 JIDE 关闭负担均衡');
 assert.equal(pending.status,'awaiting_confirmation');assert.equal(pending.action.kind,'collection_preferences');
 const read=h.requests[1].input.find(item=>item.kind==='function_call_output'&&item.callId==='advanced');
 assert.equal(JSON.parse(read.output).loadBalancer,true);assert.deepEqual(fixture.writes,[]);
});

test('every entry shares concise positive host facts without identity disclaimers or extra speaking rules',()=>{
 assert.ok(AGENT_IDENTITY_INSTRUCTIONS.length <= 220);
 assert.doesNotMatch(AGENT_IDENTITY_INSTRUCTIONS,/不要|不能|不代表|不是|官方|只有用户|例如|Ankitects|AnkiDroid/);
 for(const mode of ['assistant','create','edit']) {
   const instructions=buildAgentSessionInstructions({mode,deckId:0,notetypeId:0,fieldNames:[],noteTypeKind:0,clozeFieldOrds:[]},100);
   assert.ok(instructions.startsWith('你是 JIDE，记得闪卡（jidecards）的应用内助手。'));
   assert.match(AGENT_IDENTITY_INSTRUCTIONS,/基于 Anki Core/);
   assert.match(AGENT_IDENTITY_INSTRUCTIONS,/原生界面与 AI 功能由记得闪卡实现/);
   assert.match(AGENT_IDENTITY_INSTRUCTIONS,/Anki 开源社区的贡献/);
   assert.match(AGENT_IDENTITY_INSTRUCTIONS,/记得闪卡官网是 https:\/\/jidecards\.com/);
   assert.ok(instructions.includes(`当前任务模式=${mode}`));
 }
});

test('restored old Anki self-description remains history while every provider round receives the current jidecards identity',async()=>{
 const old=harness([[event('text_delta','我是你 Anki 里的学习助手。')]],undefined,'assistant');
 await old.run('你是谁？','',0,'旧身份提示');
 const next=harness([[call('types','list_notetypes',{})],[event('text_delta','已读取。')]],undefined,'assistant');
 next.session.restore(structuredClone(old.session.exportState()));
 const instructions=buildAgentSessionInstructions({mode:'assistant',deckId:0,notetypeId:0,fieldNames:[],noteTypeKind:0,clozeFieldOrds:[]},100);
 await next.run('你运行在哪个应用里？','',0,instructions);
 assert.equal(next.requests.length,2);
 for(const request of next.requests) {
   assert.ok(request.instructions.startsWith(AGENT_IDENTITY_INSTRUCTIONS));
   assert.equal(request.instructions.split(AGENT_IDENTITY_INSTRUCTIONS).length,2);
   assert.match(request.instructions,/你是 JIDE，记得闪卡（jidecards）的应用内助手/);
   assert.doesNotMatch(request.instructions,/旧身份提示/);
   assert.ok(request.input.some(item=>item.role==='assistant'&&item.content==='我是你 Anki 里的学习助手。'));
 }
});

test('unified assistant chats with no implicit target and exposes both draft capabilities',async()=>{
 const h=harness([[event('text_delta','我们可以先讨论。')]],undefined,'assistant');
 assert.equal((await h.run('你好')).status,'completed');
 assert.deepEqual(h.scope.currentCreateTarget(),[0,0]);
 const names=h.requests[0].functionTools.map(t=>t.name);
 for(const name of ['create_flashcards','propose_update_notes','search_cards','list_notetypes','request_create_target','propose_create_note_type'])assert.ok(names.includes(name),name);
});

test('native target selection pauses and resumes the same tool call before real create drafts',async()=>{
 const h=harness([[call('target','request_create_target',{clarificationId:'target-1',question:'选择目标'})],
 [call('create','create_flashcards',{cards:[{fields:['Front','Back']}]})]],undefined,'assistant');
 const waiting=await h.run('根据这段内容做卡片');
 assert.equal(waiting.status,'awaiting_clarification');assert.equal(waiting.clarification.kind,'create_target');
 assert.deepEqual(h.scope.currentCreateTarget(),[0,0]);
 await h.auxiliary.read('configure_create_target',JSON.stringify({deckId:1,notetypeId:2}));
 const result=await h.run('English · Basic',JSON.stringify({status:'selected',deckId:1,notetypeId:2}));
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);
 assert.equal(result.drafts[0].operations[0].kind,'create_note');
 assert.deepEqual(result.drafts[0].affectedDeckIds,[1]);
 assert.equal(h.requests[1].input.find(i=>i.kind==='function_call_output'&&i.callId==='target').output.includes('selected'),true);
});

test('cancelled target selection continues discussion without acquiring a target or draft',async()=>{
 const h=harness([[call('target','request_create_target',{clarificationId:'cancel',question:'选择目标'})],
 [event('text_delta','继续讨论。')]],undefined,'assistant');
 await h.run('先讨论制卡');
 const result=await h.run('取消选择',JSON.stringify({status:'cancelled'}));
 assert.deepEqual(h.scope.currentCreateTarget(),[0,0]);assert.equal(result.drafts.length,0);
 await assert.rejects(h.registry.execute({id:'invalid',name:'request_create_target',argumentsJson:'{"clarificationId":"bad","question":"选择","deckId":999}'}),e=>e.code==='unexpected_property'&&e.path==='deckId');
});

test('actual target dialog controller validates through the shared auxiliary service before resuming',async()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
 const methods=['private async finishTargetSelection(', 'private restoreTargetSelection(',
   'private async selectDeckWithPreference(', 'private async selectNotetypeWithPreference('].map(name=>{
   const start=source.indexOf('  '+name);
   assert.ok(start>=0,name);
   return source.slice(start,source.indexOf('\n  }',start)+4);
 }).join('\n');
 const Page=new Function('$r',stripTypeScriptTypes('class Page {'+methods+'}',{mode:'transform'})+';return Page;')(key=>key);
 const h=harness([],undefined,'assistant');
 const page=new Page();Object.assign(page,{targetSelectionMessage:0,targetSelectionBusy:false,处理中:false,pageDisposed:false,
   牌组ID:1,已选笔记类型ID:2,字段名列表:['Front','Back'],auxiliaryTools:h.auxiliary,
   消息列表:[{clarification:{request:{id:'real-target'},supplementalText:''}}],错误信息:''});
 let continued=-1;
 page.updateClarificationSupplement=(i,text)=>{page.消息列表[i].clarification.supplementalText=text;};
 page.selectedDeckName=()=> 'English';page.selectedNotetypeName=()=> 'Basic';page.continueClarification=async i=>{continued=i;};
 await page.finishTargetSelection('select');
 assert.equal(continued,0);assert.deepEqual(h.scope.currentCreateTarget(),[1,2]);
 assert.equal(page.消息列表[0].clarification.supplementalText,'English · Basic');assert.equal(page.targetSelectionMessage,-1);
 page.targetSelectionMessage=0;page.牌组ID=999;continued=-1;
 await page.finishTargetSelection('select');
 assert.equal(continued,-1);assert.match(page.错误信息,/deck_not_found/);assert.equal(page.targetSelectionMessage,0);

 // 真实选择方法在弹窗期间只改变暂存 UI，不保存偏好；取消恢复基线。
 h.store.state.lastDeckId=1;h.store.state.deckPreferences=[{deckId:1,notetypeId:2}];
 let preferenceWrites=0;const saveSelection=h.store.saveSelection.bind(h.store);
 h.store.saveSelection=async(...args)=>{preferenceWrites++;await saveSelection(...args);};
 page.workspaceStore=h.store;page.pageMode='assistant';page.笔记类型选项=[{id:2,name:'Basic'}];
 page.加载笔记类型=async id=>{page.已选笔记类型ID=id;page.字段名列表=['Front','Back'];};
 page.取本地化文案=key=>key;
 page.targetSelectionBaseline={deckId:0,notetypeId:0,notetypeName:'',fieldNames:[],noteTypeKind:0,clozeFieldOrds:[]};
 page.notetypeLoadVersion=0;
 await page.selectDeckWithPreference(1);await page.selectNotetypeWithPreference(2);
 assert.equal(page.已选笔记类型ID,2);
 assert.equal(preferenceWrites,0);
 assert.deepEqual(h.store.state.deckPreferences,[{deckId:1,notetypeId:2}]);
 const stored=structuredClone(h.store.state);
 await page.finishTargetSelection('cancel');
 assert.equal(continued,0);assert.equal(page.牌组ID,0);assert.equal(page.已选笔记类型ID,0);
 assert.deepEqual(page.字段名列表,[]);assert.equal(page.notetypeLoadVersion,1);
 assert.deepEqual(h.store.state,stored);assert.equal(page.targetSelectionMessage,-1);

 page.targetSelectionMessage=0;page.牌组ID=1;page.已选笔记类型ID=2;
 page.选择笔记类型=id=>{page.已选笔记类型ID=id;page.字段名列表=[];};
 await page.finishTargetSelection('new_notetype');
 assert.equal(page.牌组ID,1);assert.equal(page.已选笔记类型ID,0);assert.equal(continued,0);
 assert.equal(page.消息列表[0].clarification.supplementalText,'app.string.ai_agent_target_new_type_request');
});

test('actual unified write result refreshes existing cards even when a partial retry retains only creation',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
 const start=source.indexOf('  private 记录执行结果(');
 const method=source.slice(start,source.indexOf('\n  }',start)+4);
 const ticks=[];
 const Page=new Function('AppStorage','$r','buildFailedOperationsRetryDraft',
   stripTypeScriptTypes('class Page {'+method+'}',{mode:'transform'})+';return Page;')(
   {setOrCreate:key=>ticks.push(key)},key=>key,buildFailedOperationsRetryDraft);
 const operation=(kind,noteId)=>({kind,noteId,cardId:noteId,deckId:1,fieldOrd:0,before:'Old',after:'New'});
 for(const [operations,succeeded,failed,items,expected] of [
   [[operation('create_note',0)],1,0,[],['noteAddedTick']],
   [[operation('update_field',1)],1,0,[],['noteAddedTick','cardContentChangedTick']],
   [[operation('update_field',1)],0,1,[{targetId:1,succeeded:false}],[]],
   [[operation('update_field',1),operation('create_note',0)],1,1,
     [{targetId:1,succeeded:true},{targetId:0,succeeded:false}],['noteAddedTick','cardContentChangedTick']]
 ]) {
   ticks.length=0;const page=new Page();
   const draft={id:'d',operations,affectedNoteIds:[1],affectedCardIds:[1],affectedDeckIds:[1],affectedNotetypeIds:[2]};
   Object.assign(page,{pageMode:'assistant',消息列表:[{变更草稿列表:[draft]}],历史执行结果:[]});
   page.更新消息=(index,change)=>change(page.消息列表[index]);page.取本地化格式=()=>'';page.保存当前会话历史=()=>{};
   page.记录执行结果(0,0,{draftId:'d',status:failed?'partial':'completed',succeeded,failed,items});
   assert.deepEqual(ticks,expected);
   if(succeeded===1&&failed===1)assert.deepEqual(page.消息列表[0].变更草稿列表[0].operations.map(o=>o.kind),['create_note']);
 }
});

test('unified assistant discovers the requested note type and cards then produces existing edit previews',async()=>{
 const h=harness([[call('types','list_notetypes',{query:'Basic',limit:20})],
 [call('search','search_cards',{query:'note:Basic',limit:1})],
 [call('context','get_note_context',{cardIds:[1]})],
 [call('edit','propose_update_notes',{noteIds:[1],fieldUpdatesJson:JSON.stringify([{noteId:1,fieldOrd:1,after:'Short answer'}]),draftId:'edit-from-chat',reason:'Shorten answer'})]],undefined,'assistant');
 const result=await h.run('把 Basic 类型1张卡的答案缩短','',1);
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);
 const operation=result.drafts[0].operations[0];
 assert.equal(operation.kind,'update_field');assert.equal(operation.before,'Answer');assert.equal(operation.after,'Short answer');
 assert.deepEqual(h.scope.currentCreateTarget(),[0,0]);
});

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

test('unified assistant creates a note type once after confirmation and previews cards with its real ID',async()=>{
 fixture.writes=[];fixture.types=[{id:2,name:'Basic'}];
 const h=harness([[call('newtype','propose_create_note_type',{name:'Vocabulary',kind:'normal',fields:['Word','Meaning'],frontFields:['Word'],backFields:['Meaning']})],
 [call('cards','create_flashcards',{cards:[{fields:['apple','苹果']}]})]],undefined,'assistant');
 h.scope.configureCreateTarget(1,0);
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

test('agent can inspect renamed typing and ordinary candidates, switch target and produce a rich draft without card-library writes',async()=>{
 fixture.writes=[];
 fixture.types=[{id:2,name:'Renamed imported type',templates:[{ord:0,name:'Card',questionFormat:'{{Front}}{{type:Back}}',answerFormat:'{{type:Back}}',truncated:false}]},
  {id:6,name:'Renamed reading type',templates:[{ord:0,name:'Card',questionFormat:'{{Front}}',answerFormat:'{{Back}}',truncated:false}]}];
 const h=harness([[call('types','list_notetypes',{query:'',limit:20})],
  [call('inspect','get_note_type_capabilities',{notetypeIds:[2,6]})],
  [call('switch','configure_create_target',{deckId:1,notetypeId:6})],
  [call('draft','create_flashcards',{cards:[{fields:['钠与水反应？','<mark>浮、熔、游、响、红</mark><br><b>放热</b>']}]})]]);
 const result=await h.run('用荧光和粗体做一张知识卡');
 assert.equal(result.status,'completed');
 assert.deepEqual(h.scope.currentCreateTarget(),[1,6]);
 assert.deepEqual(result.drafts[0].affectedNotetypeIds,[6]);
 assert.match(result.drafts[0].operations.find(operation => operation.fieldOrd === 1).after, /<mark>.*<br><b>/);
 const observed=h.requests[2].input.find(x=>x.callId==='inspect'&&x.kind==='function_call_output');
 assert.match(observed.output,/type:Back/);
 assert.match(observed.output,/\{\{Back\}\}/);
 assert.deepEqual(fixture.writes,[]);
 fixture.types=[{id:2,name:'Basic'}];
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

test('real registry reports malformed JSON and wrapped arguments; successive corrections deliver the original card without writes',async()=>{
 fixture.writes=[];fixture.types=[{id:2,name:'Basic'}];
 const fields=['钠与水的反应？','2Na + 2H₂O = 2NaOH + H₂↑\n观察“熔、浮、游”。'];
 const raw='{"cards":[{"fields":["question","unescaped\nline"]}]}';
 const h=harness([
  [event('tool_call','',{id:'syntax',name:'create_flashcards',argumentsJson:raw})],
  [call('wrapper','create_flashcards',{arguments:{cards:[{fields}]}})],
  [call('correct','create_flashcards',{cards:[{fields}]})]
 ]);
 const result=await h.run('根据材料制卡');
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);
 assert.deepEqual(result.drafts[0].operations.map(x=>x.after),fields);
 const syntax=JSON.parse(h.requests[1].input.find(x=>x.callId==='syntax'&&x.kind==='function_call_output').output);
 assert.equal(syntax.tool_error,'invalid_json');assert.equal(syntax.failureStage,'arguments');
 assert.match(syntax.message,/JSON|position|character/i);assert.match(syntax.correction,/does NOT mean no arguments/);
 const wrapper=JSON.parse(h.requests[2].input.find(x=>x.callId==='wrapper'&&x.kind==='function_call_output').output);
 assert.equal(wrapper.tool_error,'unexpected_property');assert.deepEqual(wrapper.receivedKeys,['arguments']);
 assert.deepEqual(fixture.writes,[]);
 assert.equal(h.events.filter(x=>x.kind==='tool_failed').length,2);
 assert.equal(h.events.filter(x=>x.kind==='tool_completed').length,1);
});

test('unchanged failures pause with exact tool observations and restore can finish without repeating successful work',async()=>{
 fixture.types=[{id:2,name:'Basic'}];fixture.writes=[];
 const h=harness(Array.from({length:3},(_,i)=>[call(`bad-${i}`,'create_flashcards',{cards:[]})]));
 assert.equal((await h.run('制作卡片')).status,'paused');
 assert.equal(h.requests.length,3);assert.equal(h.session.isPaused(),true);
 const state=structuredClone(h.session.exportState());
 const failures=state.input.filter(x=>x.kind==='function_call_output').map(x=>JSON.parse(x.output));
 assert.deepEqual(failures.map(x=>x.repeatCount),[1,2,3]);
 assert.ok(failures.every(x=>x.tool_error==='invalid_value'));
 const next=harness([[call('recovered','create_flashcards',{cards:[{fields:['Q','A']}]})]]);
 next.session.restore(state);
 const result=await next.run('继续，修正空卡片列表','{"status":"continue"}');
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);
 assert.ok(next.requests[0].input.some(x=>x.kind==='function_call_output'&&x.callId==='bad-2'&&JSON.parse(x.output).repeatCount===3));
 assert.deepEqual(fixture.writes,[]);
});

test('runtime capabilities and remaining budget come from each actual request, without accumulating environment blocks',async()=>{
 const h=harness([[call('read','list_notetypes',{})],[event('text_delta','已读取。')]],
  {maxProviderCalls:4,maxToolCalls:5});
 await h.run('看看笔记类型');
 assert.equal(h.requests.length,2);
 assert.equal(h.events.filter(x=>x.kind==='tool_failed').length,0);
 assert.equal(h.events.filter(x=>x.kind==='tool_completed').length,1);
 for(const request of h.requests) {
  assert.equal(request.instructions.split('执行环境（应用提供）').length,2);
  for(const tool of request.functionTools) assert.ok(request.instructions.includes(tool.name));
 }
 assert.match(h.requests[0].instructions,/还可请求模型 3 次.*可执行工具 5 次/);
 assert.match(h.requests[1].instructions,/还可请求模型 2 次.*可执行工具 4 次/);
 const tool=requestToolWithoutSandbox(h.requests[0]);
 const {buildAgentRuntimeInstructions}=await import('../../entry/src/main/ets/model/agent/AgentSessionContext.ts');
 assert.doesNotMatch(buildAgentRuntimeInstructions(tool,1,0,{maxProviderCalls:4,maxToolCalls:5}),/execute_code|JavaScript/);
 assert.match(h.requests[0].instructions,/每次调用状态独立.*没有文件系统、网络/);
});

function requestToolWithoutSandbox(request) { return request.functionTools.filter(x=>x.name!=='execute_code'); }

test('text fallback after a failed draft is not completion; one bounded handoff can deliver a real draft',async()=>{
 fixture.types=[{id:2,name:'Basic'}];fixture.writes=[];
 const h=harness([[call('invalid','create_flashcards',{cards:[]})],
  [event('text_delta','问题：钠怎样保存？答案：煤油。')],
  [call('valid','create_flashcards',{cards:[{fields:['钠怎样保存？','煤油。']}]})]]);
 const result=await h.run('制作卡片');
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);
 assert.equal(h.requests.length,3);
 assert.ok(h.requests[2].input.some(x=>x.content.includes('no valid draft has been delivered')));
 assert.ok(h.requests[2].input.some(x=>x.kind==='function_call_output'&&x.callId==='invalid'));
 assert.deepEqual(fixture.writes,[]);
});

test('repeated text fallback preserves a paused task instead of claiming delivery or looping indefinitely',async()=>{
 const h=harness([[call('invalid','create_flashcards',{cards:[]})],
  [event('text_delta','这里是问答列表。')],[event('text_delta','仍然只返回列表。')]]);
 const result=await h.run('制作卡片');
 assert.equal(result.status,'paused');assert.equal(result.drafts.length,0);
 assert.equal(h.requests.length,3);assert.equal(h.session.isPaused(),true);
 const state=h.session.exportState();
 assert.ok(state.input.some(x=>x.content==='仍然只返回列表。'));
 assert.ok(state.input.some(x=>x.kind==='function_call_output'&&x.callId==='invalid'));
});

function documentAccessFixture(vision) {
 const saved=[];const reads=[];
 const documents=new AgentDocumentAccess({list:()=>[{id:'doc',name:'Chemistry.pdf',extension:'.pdf',byteSize:10,pageCount:2,warningCode:''}],
  async read(c,id,page,mode){reads.push(mode);return {documentId:id,page,text:'Water is H2O.',method:mode,notes:saved[0]??'',warning:'',
   image:mode==='image'?{imageUrl:'data:image/jpeg;base64,YWJj'}:undefined};},
  saveNotes(c,id,page,text){saved.push(text);}});
 documents.bind('chat',vision);documents.submit(['doc']);return {documents,saved,reads};
}

// 模拟提供商对真实序列化请求的要求；遗失原始思考时直接拒绝，而非只检查本地对象。
function requireReasoningReplay(body) {
 let hasReasoning=false;
 for(const input of body.input) {
   // 工具结果结束当前助手段；后续工具调用不能借用前一段的思考。
   if(input.role==='user'||input.type==='function_call_output')hasReasoning=false;
   if(input.type==='reasoning')hasReasoning=input.content?.some(part=>part.type==='reasoning_text'&&part.text.length>0)===true;
   if(input.role==='assistant'||input.type==='function_call')assert.equal(hasReasoning,true,'HTTP 400: reasoning_text must be passed back');
 }
}

test('confirmed action continues through a mixed target/details rejection with one assistant tool batch and no repeated write',async()=>{
 fixture.writes=[];
 const h=harness([
   [event('reasoning_delta','prepare deck'),call('confirmed-deck','propose_create_deck',{name:'Confirmed once'})],
   [event('reasoning_delta','read and configure first'),
     call('target-mixed','configure_create_target',{deckId:1,notetypeId:2}),
     call('details-mixed','get_notetype_details',{notetypeIds:[2]})],
   [event('reasoning_delta','configure alone'),call('target-fixed','configure_create_target',{deckId:1,notetypeId:2})],
   [event('reasoning_delta','read details next'),call('details-fixed','get_notetype_details',{notetypeIds:[2]})],
   [event('reasoning_delta','finish task'),event('text_delta','continued')]
 ],undefined,'assistant',null,requireReasoningReplay);
 const pending=await h.run('Create deck then inspect templates');
 assert.equal(pending.status,'awaiting_confirmation');assert.deepEqual(fixture.writes,[]);
 const confirmed=await h.session.actionExecutor.executeConfirmed(h.session.getAction());
 const resumed=await h.run('已确认此操作，请根据实际执行结果继续原任务。',confirmed);
 assert.equal(resumed.status,'completed');assert.equal(h.requests.length,5);
 assert.equal(fixture.writes.filter(x=>x[0]==='deck').length,1);
 const mixed=h.requests[2].input.filter(x=>['target-mixed','details-mixed'].includes(x.callId));
 assert.deepEqual(mixed.map(x=>[x.kind,x.callId]),[
   ['function_call','target-mixed'],['function_call','details-mixed'],
   ['function_call_output','target-mixed'],['function_call_output','details-mixed']]);
 assert.ok(mixed.filter(x=>x.kind==='function_call_output').every(x=>JSON.parse(x.output).tool_error==='clarification_must_be_only_tool'));
 assert.ok(!h.events.some(x=>x.kind==='tool_started'&&['target-mixed','details-mixed'].includes(x.toolCall.id)));
 assert.ok(h.events.some(x=>x.kind==='tool_completed'&&x.toolCall.id==='target-fixed'));
 assert.ok(h.events.some(x=>x.kind==='tool_completed'&&x.toolCall.id==='details-fixed'));
 const restored=harness([[event('reasoning_delta','new task'),event('text_delta','okay')]],undefined,'assistant',null,requireReasoningReplay);
 restored.session.restore(JSON.parse(JSON.stringify(h.session.exportState())));await restored.run('continue after restoring');
 assert.equal(fixture.writes.filter(x=>x[0]==='deck').length,1);
});

test('official Anki guidance is searched and read through the real session while restored references use the current revision',async()=>{
 const topic={id:'studying',title:'Studying',path:'studying',url:'https://anki.mintlify.app/manual/studying',sourceUrl:'https://github.com/ankitects/anki',keywords:['复习'],characters:4,sha256:'',sections:[]};
 const index={formatVersion:1,title:'Anki Manual',language:'en',repository:'https://github.com/ankitects/anki',revision:'a'.repeat(40),commitDate:'2026-10-01',website:'https://anki.mintlify.app',licenseId:'CC-BY-SA-4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Anki contributors',topics:[topic]};
 const install=h=>{const library=new AgentAnkiHelp({async index(){return structuredClone(index);},async readTopic(){return 'test';}});
   for(const name of ['search_anki_help','read_anki_help'])h.registry.registerRead(name,{execute:args=>library.execute(name,args),cancel:()=>library.cancel()});};
 const old=harness([[call('lookup','search_anki_help',{query:'复习'})],[call('chapter','read_anki_help',{topicId:'studying'})],[event('text_delta','根据官方手册解释。')]],undefined,'assistant');
 install(old);fixture.writes=[];const result=await old.run('按 Anki 教程解释复习');
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,0);assert.deepEqual(fixture.writes,[]);
 assert.equal(old.requests.length,3);assert.match(old.requests[2].instructions,/优先 search_anki_help/);
 assert.equal(JSON.parse(old.requests[2].input.find(i=>i.callId==='chapter'&&i.kind==='function_call_output').output).source.revision,'a'.repeat(40));
 index.revision='b'.repeat(40);
 const fresh=harness([[call('new-help','search_anki_help',{query:'复习'})],[event('text_delta','已核对新版资料。')]],undefined,'assistant');
 install(fresh);fresh.session.restore(structuredClone(old.session.exportState()));await fresh.run('更新后再核对');
 const outputs=fresh.requests[1].input.filter(i=>i.kind==='function_call_output'&&i.callId==='new-help');
 assert.ok(outputs.some(i=>JSON.parse(i.output).source.revision==='b'.repeat(40)));
 assert.deepEqual(fixture.writes,[]);
});

test('restoring old software knowledge uses the current action catalog on every real provider continuation',async()=>{
 const stale='旧版只支持六个导航动作，不支持返回首页、卡片预览或笔记编辑。';
 const old=harness([[event('text_delta',stale)]],undefined,'assistant');await old.run('介绍软件入口');
 const next=harness([[call('nav','navigate_app',{action:'open_home'})],[event('text_delta','回复结束后返回首页。')]],undefined,'assistant');
 next.session.restore(structuredClone(old.session.exportState()));const opened=[];
 const nav=new AgentAppNavigationSession({context:()=>({simple:true,agent:true,cloudDeck:false,themeHasTextures:false}),
   canNavigate:()=>true,collectionBusy:()=>false,assertReadableTarget(){},readTarget:readNavigationTarget,navigate:r=>opened.push(r)});
 new AgentAppNavigationTools(nav).register(next.registry);const generation=nav.beginTurn('返回首页');
 const instructions=buildAgentSessionInstructions({mode:'assistant',deckId:0,notetypeId:0,fieldNames:[],noteTypeKind:0,clozeFieldOrds:[]},100);
 assert.equal((await next.run('返回首页','',0,instructions)).status,'completed');assert.deepEqual(opened,[]);
 for(const request of next.requests) {
   assert.ok(request.input.some(item=>item.role==='assistant'&&item.content===stale));
   const schema=JSON.parse(request.functionTools.find(tool=>tool.name==='navigate_app').parametersJson);
   for(const action of ['open_home','open_edit_note','open_card_preview']) {
     assert.ok(schema.properties.action.enum.includes(action));assert.ok(request.instructions.includes(action));
   }
   assert.ok(schema.properties.action.description.includes('open_edit_note: required=noteId'));
   assert.match(request.instructions,/旧历史和记忆不能覆盖它/);
 }
 await nav.finish(true,generation);assert.equal(opened[0].action,'open_home');
});

test('real Runner discovers a deck, queues navigation, receives truthful status and finishes without writing or rating', async () => {
 fixture.writes=[];
 const h=harness([[call('decks','list_decks',{query:'English',limit:20})],
   [call('nav','navigate_app',{action:'start_study',deckId:1})],
   [event('text_delta','回复结束后打开英语学习页。')]],undefined,'assistant');
 h.scope.reset();
 const opened=[];
 const navigation=new AgentAppNavigationSession({
   context:()=>({simple:true,agent:true,cloudDeck:false,themeHasTextures:false}),
   canNavigate:()=>true,collectionBusy:()=>false,assertReadableTarget:args=>h.scope.assertReadableDeckIds([args.deckId]),
   readTarget:readNavigationTarget,navigate:request=>opened.push(request)
 });
 new AgentAppNavigationTools(navigation).register(h.registry);
 const generation=navigation.beginTurn('开始 English 牌组学习');
 const result=await h.run('开始 English 牌组学习');
 assert.equal(result.status,'completed');assert.deepEqual(result.drafts,[]);assert.deepEqual(opened,[]);
 const output=h.requests[2].input.find(item=>item.kind==='function_call_output'&&item.callId==='nav');
 assert.equal(JSON.parse(output.output).status,'queued');assert.equal(JSON.parse(output.output).completed,false);
 await navigation.finish(true,generation);
 assert.equal(opened.length,1);assert.equal(opened[0].deckId,1);assert.equal(opened[0].deckName,'English');
 assert.deepEqual(fixture.writes,[]);
});

test('real Runner searches notes/cards and queues the original editor/preview while retaining read-only scope', async () => {
 for(const [action,search,key,prompt] of [
   ['open_edit_note','search_notes','noteId','打开搜索结果中第一条笔记的编辑页'],
   ['open_card_preview','search_cards','cardId','预览搜索结果中的第一张卡片']
 ]) {
   fixture.writes=[];
   const h=harness([[call('search',search,{query:'English',limit:1})],
     [call('nav','navigate_app',{action,[key]:1})],[event('text_delta','回复结束后打开。')]],undefined,'assistant');
   h.scope.reset();const opened=[];
   const navigation=new AgentAppNavigationSession({
     context:()=>({simple:true,agent:true,cloudDeck:false,themeHasTextures:false}),
     canNavigate:()=>true,collectionBusy:()=>false,readTarget:readNavigationTarget,
     assertReadableTarget:args=>{
       if(args.noteId!==undefined)h.scope.assertReadableNoteIds([args.noteId]);
       if(args.cardId!==undefined)h.scope.assertReadableCardIds([args.cardId]);
     },navigate:request=>opened.push(request)
   });
   new AgentAppNavigationTools(navigation).register(h.registry);const generation=navigation.beginTurn(prompt);
   const result=await h.run(prompt);assert.equal(result.status,'completed');assert.deepEqual(opened,[]);
   const output=JSON.parse(h.requests[2].input.find(item=>item.kind==='function_call_output'&&item.callId==='nav').output);
   assert.equal(output[key],1);assert.equal(output.completed,false);assert.equal(output.status,'queued');
   assert.equal(JSON.stringify(output).includes(fixture.longText),false);
   assert.throws(()=>key==='noteId'?h.scope.assertNoteIdsInScope([1]):h.scope.assertCardIdsInScope([1]),/out_of_scope/);
   await navigation.finish(true,generation);assert.equal(opened[0].action,action);assert.equal(opened[0][key],1);
   assert.deepEqual(fixture.writes,[]);assert.deepEqual(result.drafts,[]);
 }
});

test('mixed target batches in either order retain reasoning and all calls before all error outputs',async()=>{
 for(const reversed of [false,true]) {
   fixture.writes=[];
   const calls=[call('target','configure_create_target',{deckId:1,notetypeId:2}),call('details','get_notetype_details',{notetypeIds:[2]})];
   if(reversed)calls.reverse();
   const h=harness([[event('reasoning_delta','complete raw thought'),...calls],
     [event('reasoning_delta','acknowledge tool diagnostic'),event('text_delta','done')]],undefined,'assistant',null,requireReasoningReplay);
   await h.run('read templates');
   const wire=JSON.parse(buildResponsesPayload(h.requests[1])).input;
   assert.deepEqual(wire.map(x=>x.type??x.role),['user','reasoning','function_call','function_call','function_call_output','function_call_output']);
   assert.equal(wire[1].content[0].text,'complete raw thought');assert.deepEqual(fixture.writes,[]);
 }
});

test('restoring a v1 checkpoint repairs the known rejected interleaved batch without replaying tools',async()=>{
 fixture.writes=[];
 const h=harness([[event('reasoning_delta','continue with historical failures'),event('text_delta','okay')]],undefined,'assistant',null,requireReasoningReplay);
 const saved=h.session.exportState();
 const errorOutput=JSON.stringify({tool_error:'clarification_must_be_only_tool',correction:'Call this tool alone, then continue after its result.'});
 const target={...item(''),kind:'function_call',role:'',callId:'target-old',name:'configure_create_target',argumentsJson:'{"deckId":1,"notetypeId":2}'};
 const details={...item(''),kind:'function_call',role:'',callId:'details-old',name:'get_notetype_details',argumentsJson:'{"notetypeIds":[2]}'};
 const output=callId=>({...item(''),kind:'function_call_output',role:'',callId,output:errorOutput});
 saved.input=[item('old request'),{...item('original raw thought'),kind:'reasoning',role:''},target,output(target.callId),details,output(details.callId)];
 h.session.restore(JSON.parse(JSON.stringify(saved)));await h.run('继续原任务');
 assert.deepEqual(h.requests[0].input.slice(2,6).map(x=>x.kind),['function_call','function_call','function_call_output','function_call_output']);
 assert.equal(h.requests[0].input[1].content,'original raw thought');
 assert.deepEqual(fixture.writes,[]);assert.ok(!h.events.some(x=>x.kind==='tool_started'));
});

test('real Session save/restore retains reasoning even for a prior reply without tool calls',async()=>{
 const old=harness([[event('reasoning_delta','first complete thought'),event('text_delta','first answer')]],undefined,'assistant',null,requireReasoningReplay);
 await old.run('first task');
 const next=harness([[event('reasoning_delta','second thought'),call('read-types','list_notetypes',{})],
   [event('reasoning_delta','third thought'),event('text_delta','finished')]],undefined,'assistant',null,requireReasoningReplay);
 next.session.restore(JSON.parse(JSON.stringify(old.session.exportState())));
 await next.run('continue');
 assert.equal(next.requests.length,2);
 assert.equal(next.requests[0].input.find(x=>x.kind==='reasoning').content,'first complete thought');
 assert.equal(next.requests[1].input.filter(x=>x.kind==='reasoning').length,2);
 assert.deepEqual(fixture.writes,[]);
});

test('real Runner retains opaque reasoning beyond 64KB without relying on text deltas',async()=>{
 const original={type:'reasoning',id:'long-original',content:[{type:'reasoning_text',text:'thought'.repeat(15000)}],summary:[]};
 const h=harness([[event('continuation_item',JSON.stringify(original)),call('read-types','list_notetypes',{})],
   [event('reasoning_delta','finished thought'),event('text_delta','done')]],undefined,'assistant',null,requireReasoningReplay);
 await h.run('read types');
 const wire=JSON.parse(buildResponsesPayload(h.requests[1]));
 assert.deepEqual(wire.input.find(x=>x.type==='reasoning'),original);
 const restored=harness([[event('reasoning_delta','resumed'),event('text_delta','okay')]],undefined,'assistant',null,requireReasoningReplay);
 restored.session.restore(JSON.parse(JSON.stringify(h.session.exportState())));await restored.run('continue');
 assert.deepEqual(fixture.writes,[]);
});

test('empty canonical reasoning cannot suppress actual deltas; terminal completion replaces it in place',async()=>{
 const blank={type:'reasoning',id:'r1',content:[],summary:[]};
 const full={...blank,content:[{type:'reasoning_text',text:'canonical complete thought'}]};
 for(const completed of [null,full]) {
   const events=[event('reasoning_delta','actual delta thought'),event('continuation_item',JSON.stringify(blank))];
   if(completed!==null)events.push(event('continuation_item',JSON.stringify(completed)));
   events.push(call('read-types','list_notetypes',{}));
   const h=harness([events,[event('reasoning_delta','finish'),event('text_delta','done')]],undefined,'assistant',null,requireReasoningReplay);
   await h.run('read');
   const records=JSON.parse(buildResponsesPayload(h.requests[1])).input.filter(x=>x.type==='reasoning');
   assert.equal(records.length,1);assert.equal(records[0].id,'r1');
   assert.equal(records[0].content[0].text,completed===null?'actual delta thought':'canonical complete thought');
 }
});

test('malformed continuation fails the provider round before any tool is dispatched',async()=>{
 const h=harness([[event('continuation_item','{"type":"computer_call"}'),call('read-types','list_notetypes',{})]],undefined,'assistant');
 await assert.rejects(()=>h.run('read'),/invalid_provider_input/);
 assert.equal(h.requests.length,1);assert.ok(!h.events.some(x=>x.kind==='tool_started'));
 assert.deepEqual(fixture.writes,[]);
});

test('legacy checkpoints and missing checkpoints continue with historical data without replaying broken assistant/tool items',async()=>{
 const oldInput=[item('old request'),{...item('old answer'),role:'assistant'},
   {...item(''),kind:'function_call',callId:'old-call',name:'list_notetypes',argumentsJson:'{}'},
   {...item(''),kind:'function_call_output',callId:'old-call',output:'{"status":"completed"}'}];
 for(const checkpoint of [true,false]) {
   const h=harness([[event('reasoning_delta','fresh reasoning'),event('text_delta','continued')]],undefined,'assistant',null,requireReasoningReplay);
   if(checkpoint) {
     const old=h.session.exportState();old.input=oldInput;delete old.reasoningReplayVersion;h.session.restore(old);
     await h.run('new request');
   } else {
     const request={apiKey:'test',baseUrl:'https://example.test',model:'test',instructions:'',input:[...oldInput,item('new request')],
       functionTools:agentFunctionTools(100,'assistant'),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
       requiresDraft:false,expectedDraftCount:0,reasoningEffort:'low',maxOutputTokens:1024};
     await h.session.run('deepseek',request,{onEvent(){}});
   }
   assert.ok(h.requests[0].input.every(x=>x.kind==='message'&&x.role==='user'));
   assert.match(h.requests[0].input[0].content,/old answer/);
   assert.equal(h.requests[0].input.at(-1).content,'new request');assert.deepEqual(fixture.writes,[]);
 }
});

test('a restored legacy pending action keeps confirmation and carries its result as data without reexecuting it',async()=>{
 fixture.writes=[];
 const old=harness([[event('reasoning_delta','prepare action'),call('action-call','propose_create_deck',{name:'Legacy'})]],undefined,'assistant');
 const pending=await old.run('create a deck');const snapshot=old.session.exportState();
 delete snapshot.reasoningReplayVersion;snapshot.input=snapshot.input.filter(x=>x.kind!=='reasoning'&&x.kind!=='output_item');
 const h=harness([[event('reasoning_delta','read confirmation result'),event('text_delta','confirmed')]],undefined,'assistant',null,requireReasoningReplay);
 h.session.restore(snapshot);assert.equal(h.session.getAction().status,'pending');assert.deepEqual(fixture.writes,[]);
 const result=await h.session.actionExecutor.executeConfirmed(h.session.getAction());
 await h.run('continue',result);
 assert.equal(fixture.writes.filter(x=>x[0]==='deck').length,1);
 assert.ok(h.requests[0].input.some(x=>x.content.includes(result)));
 assert.equal(h.requests[0].input.filter(x=>x.kind==='function_call').length,0);
 assert.equal(pending.action.id,snapshot.action.id);
});
test('file-to-card agent uses real Registry/Runner/Session OCR and notes before creating source-cited drafts, with no card writes',async()=>{
 fixture.writes=[];const {documents,saved,reads}=documentAccessFixture(false);
 const h=harness([
  [call('docs','list_documents',{}),event('completed')],
  [call('ocr','ocr_document_page',{documentId:'doc',page:1}),event('completed')],
  [call('notes','save_document_notes',{documentId:'doc',page:1,notes:'Chemical formula: H2O'}),event('completed')],
  [call('cards','create_flashcards',{cards:[{fields:['Water formula?','H2O'],sources:[{documentId:'doc',page:1}]}]}),event('completed')]
 ],undefined,'create',documents);
 const result=await h.run('Create a card from the imported document');
 assert.equal(result.status,'completed');assert.equal(result.drafts.length,1);assert.deepEqual(reads,['ocr']);
 assert.deepEqual(saved,['Chemical formula: H2O']);assert.deepEqual(fixture.writes,[]);
 assert.match(result.drafts[0].operations.at(-1).after,/Chemistry.pdf/);
 assert.equal(h.events.filter(e=>e.kind==='tool_completed').length,4);
});
test('vision document tool images survive real Runner and Session copies and become Responses image parts; checkpoints keep pointers',async()=>{
 fixture.writes=[];const {documents}=documentAccessFixture(true);
 const h=harness([
  [call('read','read_document_page',{documentId:'doc',page:1,includeImage:true}),event('completed')],
  [call('cards','create_flashcards',{cards:[{fields:['Formula?','H2O'],sources:[{documentId:'doc',page:1}]}]}),event('completed')]
 ],undefined,'create',documents);
 await h.run('Read the page image');
 const input=h.requests[1].input.find(x=>x.kind==='function_call_output');assert.equal(input.images.length,1);
 const payload=JSON.parse(buildResponsesPayload(h.requests[1]));
 assert.equal(payload.input.find(x=>x.type==='function_call_output').output[1].type,'input_image');
 assert.ok(!JSON.stringify(h.session.exportState()).includes('base64'));assert.deepEqual(fixture.writes,[]);
});
test('unread source citation cannot produce a valid draft; agent rereads then corrects it through the same execution chain',async()=>{
 const {documents,reads}=documentAccessFixture(false);
 const cards={cards:[{fields:['Q','A'],sources:[{documentId:'doc',page:2}]}]};
 const h=harness([[call('bad','create_flashcards',cards),event('completed')],
  [call('read','read_document_page',{documentId:'doc',page:2}),event('completed')],
  [call('fixed','create_flashcards',cards),event('completed')]],undefined,'create',documents);
 const result=await h.run('Make a document card');assert.equal(result.drafts.length,1);assert.deepEqual(reads,['text']);
 assert.match(h.events.find(e=>e.kind==='tool_failed').toolTrace.errorMessage,/\[execution\] document_source_not_read/);
});

test('switching to a text-only model removes previous page images before the actual provider request',async()=>{
 const h=harness([[event('text_delta','Use OCR next.')]],undefined,'assistant');
 const source={kind:'function_call_output',role:'',content:'',callId:'page',name:'',argumentsJson:'',output:'{"documentId":"doc","page":1}',
  images:[{imageUrl:'data:image/jpeg;base64,YWJj'}]};
 const request={apiKey:'test',baseUrl:'https://example.test',model:'text-only',supportsImages:false,instructions:'',input:[source],
  functionTools:agentFunctionTools(100,'assistant'),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
  requiresDraft:false,expectedDraftCount:0,reasoningEffort:'',maxOutputTokens:1024};
 await h.runner.run('custom',request,{onEvent:e=>h.events.push(e)});
 assert.equal(h.requests[0].input[0].images,undefined);
 assert.match(h.requests[0].input[0].output,/ocr_document_page/);
 assert.equal(source.images.length,1);
});

test('JIDE real rename proposal requires discovered ID and unchanged human confirmation before Core writes',async()=>{
 fixture.writes=[];fixture.decks=moveDecks();
 const h=harness([[call('decks','list_decks',{query:'',limit:20})],
  [call('rename','propose_rename_deck',{deckId:2,name:'New words'})]],undefined,'assistant');
 const pending=await h.run('把 Words 改名为 New words');
 assert.equal(pending.status,'awaiting_confirmation');assert.equal(pending.action.kind,'rename_deck');
 assert.deepEqual(fixture.writes,[]);
 const plan=JSON.parse(pending.action.payloadJson);
 assert.deepEqual(plan.changes.map(x=>x.after),['English::New words','English::New words::Week 1']);
 const result=JSON.parse(await h.session.actionExecutor.executeConfirmed(pending.action));
 assert.equal(result.affectedDecks,2);assert.deepEqual(fixture.writes,[['rename',2,'English::New words']]);
 await assert.rejects(h.session.actionExecutor.executeConfirmed(pending.action),/confirmation_mismatch/);
 fixture.writes=[];const isolated=harness();
 await assert.rejects(isolated.auxiliary.propose('propose_rename_deck','{"deckId":2,"name":"New"}'),/id_out_of_scope/);
 await isolated.cards.executeRead('list_decks','{"query":"","limit":20}');
 for(const invalid of [{deckId:2,name:'A::B'},{deckId:0,name:'X'},{deckId:2,name:'X',confirmed:true}])
  assert.throws(()=>decodeExtensionArguments('propose_rename_deck',JSON.stringify(invalid)));
 const stale=await isolated.auxiliary.propose('propose_rename_deck','{"deckId":2,"name":"New"}');
 isolated.session.actionExecutor.registerPending(stale);fixture.decks[0].children[0].children.push({deckId:8,name:'Added',children:[]});
 await assert.rejects(isolated.session.actionExecutor.executeConfirmed(stale),/stale/);
 const forged=await isolated.auxiliary.propose('propose_rename_deck','{"deckId":2,"name":"New"}');
 isolated.session.actionExecutor.registerPending(forged);forged.payloadJson=forged.payloadJson.replace('New','Forged');
 await assert.rejects(isolated.session.actionExecutor.executeConfirmed(forged),/confirmation_mismatch/);
 const cancelled=await isolated.auxiliary.propose('propose_rename_deck','{"deckId":2,"name":"New"}');
 isolated.session.actionExecutor.registerPending(cancelled);cancelled.status='cancelled';
 await assert.rejects(isolated.session.actionExecutor.executeConfirmed(cancelled),/confirmation_mismatch/);
 assert.deepEqual(fixture.writes,[]);fixture.decks=[{deckId:1,name:'English',children:[],totalIncludingChildren:2507}];
});

test('JIDE rename proposals must be the only tool in their batch',async()=>{
 const h=harness([[call('rename','propose_rename_deck',{deckId:1,name:'New'}),call('read','list_decks',{query:'',limit:20})],
  [event('text_delta','需要单独提案。')]]);
 await h.run('改名');assert.ok(h.requests[1].input.some(x=>x.output?.includes('clarification_must_be_only_tool')));
 assert.equal(h.session.getAction(),null);
});
