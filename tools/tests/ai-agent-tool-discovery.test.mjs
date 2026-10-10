// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentToolDiscovery } from '../../entry/src/main/ets/model/agent/AgentToolDiscovery.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { filterAgentWebTools } from '../../entry/src/main/ets/model/agent/AgentWeb.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { buildAgentRuntimeInstructions } from '../../entry/src/main/ets/model/agent/AgentSessionContext.ts';

const core = ['discover_tools', 'get_app_structure', 'request_clarification'];
const names = discovery => discovery.definitions().map(tool => tool.name);
const load = (discovery, requested) => JSON.parse(discovery.discover(JSON.stringify({names:requested})));

test('fresh requests expose only core schemas and exclude the host discovery flag from the wire', () => {
  for (const mode of ['assistant','create','edit']) {
    const catalog=filterAgentWebTools(agentFunctionTools(100,mode),false);
    const discovery=new AgentToolDiscovery(catalog);
    assert.deepEqual(names(discovery),core);
    const base={model:'test',input:[],instructions:'',functionTools:discovery.definitions(),deferTools:true,
      searchMode:'off',reasoningEffort:'low',maxOutputTokens:1024};
    const reduced=JSON.parse(buildResponsesPayload(base));
    assert.deepEqual(reduced.tools.map(tool=>tool.name),core);
    assert.equal(Object.hasOwn(reduced,'deferTools'),false);
    assert.ok(JSON.stringify(reduced.tools).length < JSON.stringify(JSON.parse(buildResponsesPayload({...base,functionTools:catalog})).tools).length/5);
    load(discovery,['search_notes']);
    assert.deepEqual(names(new AgentToolDiscovery(catalog)),core,'new turns do not inherit loaded schemas');
  }
});

test('Chinese and English queries use the actual catalog and return paginated summaries without schemas', () => {
  const catalog=agentFunctionTools(100,'assistant');
  for (const query of ['搜索笔记','search_notes']) {
    const discovery=new AgentToolDiscovery(catalog);
    const result=JSON.parse(discovery.discover(JSON.stringify({query,limit:1})));
    assert.equal(result.tools[0].name,'search_notes');
    assert.ok(names(discovery).includes('search_notes'));
    assert.deepEqual(Object.keys(result.tools[0]),['name','description']);
    assert.equal(result.tools[0].description,catalog.find(tool=>tool.name==='search_notes').description);
  }
  const discovery=new AgentToolDiscovery(catalog);
  const first=JSON.parse(discovery.discover('{"query":"fsrs","limit":2}'));
  assert.ok(first.totalMatched>2);assert.equal(first.nextOffset,2);
  const next=JSON.parse(discovery.discover('{"query":"fsrs","limit":2,"offset":2}'));
  assert.equal(new Set([...first.tools,...next.tools].map(tool=>tool.name)).size,4);
  assert.deepEqual(JSON.parse(discovery.discover('{"query":"zzzzz_nonexistent"}')).tools,[]);
});

test('exact loading preserves original schemas and mode/platform/web filtering; invalid loads are atomic', () => {
  const catalog=filterAgentWebTools(agentFunctionTools(100,'edit'),false).filter(tool=>tool.name!=='read_document_page');
  const discovery=new AgentToolDiscovery(catalog);
  load(discovery,['search_notes','propose_update_notes']);
  assert.deepEqual(discovery.definitions().find(tool=>tool.name==='propose_update_notes'),catalog.find(tool=>tool.name==='propose_update_notes'));
  const before=names(discovery);
  for(const forbidden of ['web_search','read_webpage','create_flashcards','read_document_page','invented_tool']) {
    assert.throws(()=>load(discovery,['list_decks',forbidden]),/tool_not_available/);
    assert.deepEqual(names(discovery),before);
  }
  for(const invalid of [null,[],{}, {query:null},{names:null},{names:['search_notes','search_notes']},
    {names:Array(7).fill('list_decks')},{names:[42]},{query:'x',offset:-1},{query:'x',limit:7},{query:'x',confirmed:true}]) {
    assert.throws(()=>discovery.discover(JSON.stringify(invalid)));
    assert.deepEqual(names(discovery),before);
  }
  assert.throws(()=>discovery.discover('{broken'),/invalid_json/);
});

test('the definition window retains 12 recent domain tools and reloads evicted tools without changing capabilities', () => {
  const catalog=agentFunctionTools(100,'assistant');
  const domain=catalog.filter(tool=>!core.includes(tool.name)).slice(0,18).map(tool=>tool.name);
  const discovery=new AgentToolDiscovery(catalog);
  load(discovery,domain.slice(0,6));load(discovery,domain.slice(6,12));
  discovery.touch(domain[0]);
  const result=load(discovery,domain.slice(12,18));
  assert.equal(names(discovery).length,15);
  assert.ok(names(discovery).includes(domain[0]));
  assert.deepEqual(result.removedNames,domain.slice(1,7));
  assert.ok(!names(discovery).includes(domain[1]));
  load(discovery,[domain[1]]);assert.ok(names(discovery).includes(domain[1]));
  const before=buildAgentRuntimeInstructions(core.map(name=>catalog.find(tool=>tool.name===name)),1,0,{maxProviderCalls:32,maxToolCalls:96},catalog);
  const after=buildAgentRuntimeInstructions(discovery.definitions(),2,3,{maxProviderCalls:32,maxToolCalls:96},catalog);
  const revision=text=>text.match(/当前软件能力指纹=([^；]+)/)[1];
  assert.equal(revision(before),revision(after),'loading schemas is not a capability change');
});
