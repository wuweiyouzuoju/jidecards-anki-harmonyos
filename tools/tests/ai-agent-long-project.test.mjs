// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentTaskPlan, agentTaskPlanTools } from '../../entry/src/main/ets/model/agent/AgentTaskPlan.ts';
import { AgentMemoryManager } from '../../entry/src/main/ets/model/agent/AgentMemoryManagement.ts';
import { applyAgentMemoryChange, relevantAgentMemories, buildAgentMemoryContext } from '../../entry/src/main/ets/model/agent/AgentMemory.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { agentExecutionBudget } from '../../entry/src/main/ets/model/agent/AgentExecutionBudget.ts';
import { buildResponsesPayload, providerRequestFitsContext } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { safeAgentSessionState } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { APP_INTERFACE_SURFACES, agentInterfaceControls, agentInterfaceTitle } from '../../entry/src/main/ets/model/AppInterface.ts';

const planUpdate = (baseRevision=0) => ({baseRevision,objective:'处理全部章节',notes:'已读第1页，接下来读取第2页。',
  steps:[{id:'read',title:'逐页读取',status:'in_progress'},{id:'draft',title:'检查并生成草稿',status:'pending'}]});

function memoryPanel(dependencies={}) {
  const windows=[];
  const Panel=loadComponentLogic('components/agent/AgentMemoryPanel.ets','AgentMemoryPanel',{
    AgentMemoryManager,$r:key=>key,appInterface:{observe(){},leave(){}},
    SurfaceTransition:{dialogEnterAnimation:()=>({}),dialogExitAnimation:()=>({})},
    AgentMemoryEditorDialog:params=>params,
    CustomDialogController:class {
      constructor(options){this.options=options;this.closes=0;windows.push(this);}
      open(){this.visible=true;} close(){this.closes++;this.visible=false;}
    },...dependencies});
  return {panel:new Panel(),windows};
}
test('task plans retain versioned decisions and reject invalid or stale updates without losing progress',()=>{
  const plan=new AgentTaskPlan();const first=plan.update(JSON.stringify(planUpdate()));
  assert.equal(first.revision,1);first.steps[0].title='tampered';assert.equal(plan.snapshot().steps[0].title,'逐页读取');
  assert.throws(()=>plan.update(JSON.stringify(planUpdate())),/task_plan_conflict/);
  const duplicate=planUpdate(1);duplicate.steps.push(duplicate.steps[0]);
  assert.throws(()=>plan.update(JSON.stringify(duplicate)),/invalid_task_plan/);
  const concurrent=planUpdate(1);concurrent.steps[1].status='in_progress';
  assert.throws(()=>plan.update(JSON.stringify(concurrent)),/invalid_task_plan/);
  const restored=new AgentTaskPlan();restored.restore(plan.snapshot());assert.deepEqual(restored.snapshot(),plan.snapshot());
  assert.equal(restored.update(JSON.stringify(planUpdate(1))).revision,2);restored.clear();assert.equal(restored.snapshot(),null);
  for(const tool of agentTaskPlanTools()) assert.match(tool.rules,/not authorization/);
});

test('manual memory management shares optimistic writes with AI, including local scope and deletion',async()=>{
  const repository={state:{lastDeckId:7,deckPreferences:[{deckId:7,notetypeId:2}],memories:[]},
    async load(){return structuredClone(this.state);},
    async changeMemory(change,id){this.state.memories=applyAgentMemoryChange(this.state.memories,change,id,123);}};
  const manager=new AgentMemoryManager(repository);
  await manager.commit(null,' 含一个例句 ','deck:7','manual');
  const baseline=(await manager.load())[0];assert.equal(baseline.text,'含一个例句');
  assert.equal(relevantAgentMemories(repository.state.memories,8).length,0);
  assert.equal(relevantAgentMemories(repository.state.memories,7).length,1);
  await repository.changeMemory({operation:'update',memoryId:'manual',text:'包含两个例句',scope:'deck:7',before:baseline},'ai');
  await assert.rejects(manager.commit(baseline,'过期内容','global','stale'),/memory_conflict/);
  assert.equal(repository.state.memories[0].text,'包含两个例句');
  await manager.commit((await manager.load())[0],'','deck:7','delete',true);
  assert.deepEqual(repository.state.memories,[]);assert.equal(repository.state.lastDeckId,7);
  await assert.rejects(manager.commit(null,'内容','invalid','invalid'),/invalid_memory_change/);
});

test('late loads are ignored and a write accepted before disposal still finishes once',async()=>{
  let resolveLoad,resolveWrite,writes=0;
  const repository={load:()=>new Promise(resolve=>{resolveLoad=resolve;}),
    changeMemory:()=>{writes++;return new Promise(resolve=>{resolveWrite=resolve;});}};
  const manager=new AgentMemoryManager(repository);const reading=manager.load();
  const writing=manager.commit(null,'简洁','global','accepted');
  resolveLoad({memories:[]});assert.equal(await reading,null);
  await assert.rejects(manager.commit(null,'重复','global','duplicate'),/memory_busy/);
  manager.dispose();resolveWrite();await writing;assert.equal(writes,1);
  await assert.rejects(manager.commit(null,'晚到','global','late'),/memory_busy/);
});

test('large memory collections keep whole recent preferences in a bounded request and all others searchable',()=>{
  const memories=Array.from({length:200},(_,index)=>({id:'memory-'+index,text:'偏好'.repeat(1000),scope:'global',revision:1,updatedAt:index}));
  memories.push({id:'other-deck',text:'其他牌组',scope:'deck:99',revision:1,updatedAt:201});
  const context=buildAgentMemoryContext(memories,7);assert.equal(context.availableCount,200);
  assert.ok(context.memories.length>0&&context.memories.length<200);
  assert.equal(context.memories[0].id,'memory-199');assert.ok(JSON.stringify(context.memories).length<=16000);
  assert.equal(context.omittedCount+context.memories.length,200);assert.equal(memories.length,201);
  assert.ok(context.memories.every(memory=>memory.text.length===2000));
});

test('memory panel preserves unsaved content on cancelled exit and failed persistence; successful save closes only the editor',async()=>{
  const {panel,windows}=memoryPanel();let exits=0;
  Object.assign(panel,{alive:true,loading:false,manager:{commit:async()=>{throw Error('memory_conflict');}},
    onClose:()=>exits++,getUIContext:()=>({}),text:key=>key,deckOptions:[],reload:async()=>{},publishInterface(){},
    confirm:async()=>false});
  panel.edit(null);panel.draftText='用户输入';await panel.requestClose();
  assert.equal(windows[0].visible,true);
  assert.equal(panel.editing,true);assert.equal(panel.draftText,'用户输入');assert.equal(exits,0);
  await panel.commit(null,false);assert.equal(panel.editing,true);assert.equal(panel.busy,false);
  assert.match(panel.errorText,/conflict/);assert.equal(panel.draftText,'用户输入');
  panel.manager.commit=async()=>{};await panel.commit(null,false);assert.equal(panel.editing,false);assert.equal(exits,0);
  assert.equal(windows[0].visible,false);
  await panel.requestClose();assert.equal(exits,1);
});

test('native memory editor routes system dismissal through the same dirty and busy guards and isolates old windows',async()=>{
  const {panel,windows}=memoryPanel();let resolveDialog,exits=0;
  Object.assign(panel,{alive:true,loading:false,text:key=>key,onClose:()=>exits++,
    getUIContext:()=>({getPromptAction:()=>({showDialog:()=>new Promise(resolve=>{resolveDialog=resolve;})})})});
  panel.requestCreate();assert.equal(panel.editing,true);assert.equal(windows.length,1);
  panel.draftText='未保存偏好';
  const old=windows[0];let nativeDismissals=0;
  old.options.onWillDismiss({dismiss(){nativeDismissals++;}});
  assert.equal(panel.busy,true);assert.equal(old.visible,true);
  await panel.requestClose();panel.requestCreate();assert.equal(windows.length,1);
  resolveDialog({index:0});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(panel.editing,true);assert.equal(panel.busy,false);assert.equal(panel.draftText,'未保存偏好');
  old.options.onWillDismiss({dismiss(){nativeDismissals++;}});
  resolveDialog({index:1});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(panel.editing,false);assert.equal(old.closes,1);assert.equal(exits,0);assert.equal(nativeDismissals,0);
  panel.requestCreate();assert.equal(windows.length,2);assert.equal(panel.draftText,'');
  old.options.builder.onClose();assert.equal(panel.editing,true);assert.equal(windows[1].closes,0);
  await panel.requestClose();assert.equal(windows[1].closes,1);assert.equal(exits,0);
  await panel.requestClose();assert.equal(exits,1);
  panel.requestCreate();panel.aboutToDisappear();assert.equal(windows[2].closes,1);
  windows[2].options.builder.onClose();panel.requestCreate();assert.equal(windows.length,3);
});

test('memory observation exposes only current card actions with shared icons and truthful disabled states',()=>{
  let snapshot;
  let available,locale='zh';const leaves=[];
  const {panel}=memoryPanel({appInterface:{observe(value){snapshot=value;},leave(id){leaves.push(id);}}});
  Object.assign(panel,{alive:true,loading:false,text:key=>locale+key,onCreateAvailability:value=>{available=value;},deckOptions:[],memories:[
    {id:'one',text:'简洁',scope:'global',revision:1,updatedAt:1},
    {id:'two',text:'例句',scope:'deck:7',revision:1,updatedAt:2}]});
  const declared=APP_INTERFACE_SURFACES.find(surface=>surface.id==='agent_memory').items;
  panel.publishInterface();
  assert.equal(available,true);assert.equal(snapshot.items.find(item=>item.id==='create').iconKey,'ic_home_new');
  for(const id of ['edit','delete']) {
    const control=snapshot.items.find(item=>item.id===id+'-one');
    const shared=declared.find(item=>item.id===id);
    assert.equal(control.titleKey,shared.titleKey);assert.equal(control.iconKey,shared.iconKey);
    assert.equal(control.enabled,true);
  }
  panel.query='简洁';panel.publishInterface();
  assert.deepEqual(snapshot.optionIds,['one']);
  assert.equal(snapshot.items.some(item=>item.id.endsWith('-two')),false);
  for(const state of ['busy','loading']) {
    panel[state]=true;panel.publishInterface();
    assert.equal(available,false);
    for(const id of ['edit-one','delete-one','create']) assert.equal(snapshot.items.find(item=>item.id===id).enabled,false);
    panel[state]=false;
  }
  panel.edit(panel.memories[0]);panel.publishInterface();
  assert.equal(snapshot.surface,'agent_memory_editor');assert.equal(snapshot.sectionId,'editor');
  assert.ok(leaves.includes('agent_memory'),'covered list actions must not remain available behind the modal');
  assert.equal(snapshot.titleKey,'ai_agent_memory_update');assert.equal(available,false);
  assert.deepEqual(snapshot.optionIds,[]);
  assert.deepEqual(snapshot.items.map(item=>item.id),['text','scope','save','cancel']);
  panel.draftText='';panel.publishInterface();assert.equal(panel.saveEnabled,false);
  panel.draftText='有效偏好';panel.publishInterface();assert.equal(panel.saveEnabled,true);
  locale='en';panel.publishInterface();assert.match(panel.editorScopes[0].value,/^en/);
  panel.draftScope='deck:7';panel.deckOptions=[{id:7,name:'牌组'}];panel.publishInterface();
  assert.equal(panel.saveEnabled,true);assert.equal(panel.editorScopes[1].value,'牌组');
  panel.deckOptions=[];panel.publishInterface();assert.equal(panel.saveEnabled,false);
  assert.equal(panel.editorScopes.length,1);
  panel.alive=false;snapshot=null;panel.publishInterface();assert.equal(snapshot,null);
});

test('known DeepSeek budgets support long material and checkpoints preserve it without silently truncating',()=>{
  const budget=agentExecutionBudget('deepseek','deepseek-flash');assert.equal(budget.maxOutputTokens,131072);
  assert.equal(budget.contextBudgetChars,768000);
  assert.deepEqual(agentExecutionBudget('custom','deepseek-flash'),{contextBudgetChars:240000,maxOutputTokens:32768});
  const input=[{kind:'message',role:'user',content:'中'.repeat(400000)+'END',callId:'',name:'',argumentsJson:'',output:''}];
  const value={apiKey:'test',baseUrl:'https://example.test',model:'deepseek-flash',instructions:'',input,functionTools:[],
    searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,requiresDraft:false,expectedDraftCount:0,
    reasoningEffort:'low',maxOutputTokens:budget.maxOutputTokens,contextBudgetChars:budget.contextBudgetChars};
  assert.equal(providerRequestFitsContext(value),true);assert.equal(JSON.parse(buildResponsesPayload(value)).max_output_tokens,131072);
  const state=safeAgentSessionState({input,readableIds:[[],[],[],[]],retrieval:{snapshots:[],readNoteIds:[],approvedNoteIds:[]},
    action:null,waitingCallId:'',paused:true});assert.equal(state.input[0].content,input[0].content);
  delete value.contextBudgetChars;assert.equal(providerRequestFitsContext(value),false);
  assert.throws(()=>buildResponsesPayload(value),/agent_context_limit/);
});

test('settings replace the history memory shortcut and memory toolbar creates only when available',()=>{
  const context={history:true,processing:false,parsing:false,batchRunning:false,pendingClarification:false,canSubmit:false};
  assert.deepEqual(agentInterfaceControls(context).map(x=>x.id),['back','new']);
  assert.equal(agentInterfaceControls({...context,history:false}).some(x=>x.id==='memory'),false);
  const memoryControls=agentInterfaceControls({...context,memory:true,memoryCanCreate:true});
  assert.deepEqual(memoryControls.map(x=>x.id),['back','memory_create']);
  assert.equal(memoryControls[1].titleKey,'ai_agent_memory_create');assert.equal(memoryControls[1].enabled,true);
  assert.equal(agentInterfaceControls({...context,memory:true,memoryCanCreate:false})[1].enabled,false);
  assert.equal(agentInterfaceTitle('assistant',true,true),'agent_memory_title');
  assert.equal(agentInterfaceControls({...context,history:false,processing:true}).find(x=>x.id==='more').enabled,false);
  assert.deepEqual(agentInterfaceControls({...context,settings:true}).map(x=>x.id),['back']);
  assert.equal(agentInterfaceTitle('assistant',true,false,true),'ai_agent_settings_page_title');
});
