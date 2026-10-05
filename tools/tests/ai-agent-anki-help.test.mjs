// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { AgentAnkiHelp, agentAnkiHelpTools, isAgentAnkiHelpTool } from '../../entry/src/main/ets/model/agent/AgentAnkiHelp.ts';
import { isAgentDocumentTool } from '../../entry/src/main/ets/model/agent/AgentDocuments.ts';
import { filterAgentWebTools } from '../../entry/src/main/ets/model/agent/AgentWeb.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { buildAgentRuntimeInstructions } from '../../entry/src/main/ets/model/agent/AgentSessionContext.ts';
import { AgentToolRegistry } from '../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets';
import { checkSnapshot, manualDirectory, manualSections } from '../vendor-anki-manual.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';

const originalIndex = checkSnapshot();
const bytes = path => readFileSync(`${manualDirectory}/${path}`);
function fixture() {
  const state = { index: structuredClone(originalIndex), reads: [], pending: null };
  const library = new AgentAnkiHelp({
    async index() { state.reads.push('index'); return structuredClone(state.index); },
    async readTopic(id) { state.reads.push(id); return state.pending ?? bytes(`topics/${id}.mdx`).toString('utf8'); }
  });
  return { state, library, call: async (name,args={}) => JSON.parse(await library.execute(name,JSON.stringify(args))) };
}
const search = (f,args={}) => f.call('search_anki_help',args);
const read = (f,args) => f.call('read_anki_help',args);

test('offline corpus retains original English sources, licensed attribution and reproducible section ranges',()=>{
  assert.equal(originalIndex.topics.length,27);
  assert.equal(originalIndex.repository,'https://github.com/ankitects/anki');
  assert.equal(originalIndex.language,'en');assert.equal(originalIndex.licenseId,'CC-BY-SA-4.0');
  const protectedPaths=['LICENSE.txt','NOTICE.txt','index.json',...originalIndex.topics.map(t=>`topics/${t.id}.mdx`)].map(path=>'entry/src/main/resources/rawfile/anki-manual/'+path);
  const attributes=execFileSync('git',['check-attr','text','--',...protectedPaths],{encoding:'utf8'}).trim().split('\n');
  assert.equal(attributes.length,protectedPaths.length);assert.ok(attributes.every(line=>line.trimEnd().endsWith(': text: unset')));
  for(const topic of originalIndex.topics) {
    assert.match(topic.sourceUrl,new RegExp(originalIndex.revision));
    const text=bytes(`topics/${topic.id}.mdx`).toString('utf8');
    assert.equal(text.length,topic.characters);
    for(const section of topic.sections) {
      assert.ok(section.start>=0&&section.end>=section.start&&section.end<=text.length);
      if(section.level>0)assert.match(text.slice(section.start,section.end),new RegExp('^#{'+section.level+'} '));
    }
  }
  const sections=manualSections('---\ntitle: "Test"\n---\nIntro\n## Parent\n```md\n## Fake\n```\n### Child\ntext\n## Parent\nlast');
  assert.deepEqual(sections.map(s=>s.id),['overview','parent','child','parent-2']);
  assert.equal(sections[1].end,sections[3].start);
  assert.equal(sections[2].end,sections[3].start);
});

test('vendor command verifies offline and reports invalid invocation with a nonzero exit',()=>{
  const check=spawnSync(process.execPath,['tools/vendor-anki-manual.mjs','--check'],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);assert.match(check.stdout,/offline integrity OK/);
  const invalid=spawnSync(process.execPath,['tools/vendor-anki-manual.mjs','--write'],{encoding:'utf8'});
  assert.equal(invalid.status,1);assert.match(invalid.stderr,/Usage:/);
});

test('offline integrity checks reject changed original bytes, corrupted section indexes and altered license text',()=>{
  const parent=resolve('tmp');const target=mkdtempSync(parent+sep+'anki-manual-check-');
  try {
    cpSync(manualDirectory,target,{recursive:true});
    const chapter=target+'/topics/studying.mdx';const original=readFileSync(chapter);
    writeFileSync(chapter,Buffer.concat([original,Buffer.from('\nChanged')]));assert.throws(()=>checkSnapshot(target),/text mismatch/);
    writeFileSync(chapter,original);
    const manifest=JSON.parse(readFileSync(target+'/index.json','utf8'));manifest.topics[0].sections[0].end+=1;
    writeFileSync(target+'/index.json',JSON.stringify(manifest));assert.throws(()=>checkSnapshot(target),/index mismatch/);
    writeFileSync(target+'/index.json',JSON.stringify(originalIndex));
    writeFileSync(target+'/LICENSE.txt',readFileSync(target+'/LICENSE.txt','utf8')+'changed');assert.throws(()=>checkSnapshot(target),/attribution mismatch/);
  } finally {
    if(!resolve(target).startsWith(parent+sep))throw Error('Invalid test cleanup path');
    rmSync(target,{recursive:true});
  }
});

test('Chinese and English queries find useful original topics and specific FSRS headings without reading bodies',async()=>{
  for(const [query,id] of [['FSRS','deck-options'],['如何设置期望保留率','deck-options'],['填空','editing'],
    ['搜索语法','searching'],['输入答案','templates-fields'],['CSS','templates-styling'],['同步','syncing'],['备份','backups']]) {
    const f=fixture();const output=await search(f,{query});
    assert.ok(output.topics.some(t=>t.topicId===id),query);
    assert.deepEqual(f.state.reads,['index']);
    assert.equal(output.source.referenceOnly,true);assert.equal(output.source.revision,originalIndex.revision);
    assert.ok(output.topics.every(t=>t.sections.length<=8&&!('text' in t)));
    if(query.includes('保留率'))assert.equal(output.topics[0].sections[0].id,'desired-retention');
  }
  const f=fixture();assert.equal((await search(f,{query:'nonexistentphrasexyz'})).totalMatched,0);
});

test('catalog paging counts matched topics rather than claiming chapters have been read',async()=>{
  const f=fixture();const ids=[];let offset=0;
  while(offset!==-1) {
    const output=await search(f,{offset,limit:7});
    assert.equal(output.totalMatched,27);assert.equal(output.returnedCount,output.topics.length);
    ids.push(...output.topics.map(t=>t.topicId));offset=output.nextOffset;
  }
  assert.equal(new Set(ids).size,27);assert.ok(f.state.reads.every(r=>r==='index'));
  await assert.rejects(search(f,{offset:28}),/offset_out_of_range/);
});

test('section reads are original text, parent ranges include children and continuation ends at true boundaries',async()=>{
  const f=fixture();const topic=originalIndex.topics.find(t=>t.id==='deck-options');
  const section=topic.sections.find(s=>s.id==='fsrs');
  const content=bytes('topics/deck-options.mdx').toString('utf8');
  let offset=0, collected='';
  while(offset!==-1) {
    const output=await read(f,{topicId:topic.id,sectionId:'fsrs',offset,length:1000});
    collected+=output.text;offset=output.nextOffset;
    assert.ok(output.text.length<=1000);assert.equal(output.totalCharacters,section.end-section.start);
    assert.equal(output.mediaIncluded,false);assert.equal(output.source.language,'en');
    assert.equal(output.url,topic.url);assert.equal(output.sourceUrl,topic.sourceUrl);
  }
  assert.equal(collected,content.slice(section.start,section.end));assert.match(collected,/Desired Retention/);
  const desired=await read(f,{topicId:topic.id,sectionId:'desired-retention',length:12000});
  assert.match(desired.text,/^### Desired Retention/);assert.equal(desired.nextOffset,-1);
  assert.doesNotMatch(desired.text,/### Help Me Decide/);
  const last=await read(f,{topicId:topic.id,offset:topic.characters});assert.equal(last.text,'');assert.equal(last.nextOffset,-1);
});

test('arguments reject paths, unknown targets, wrong types and oversized ranges before reading a body',async()=>{
  const f=fixture();
  for(const args of [{topicId:'../index'},{topicId:'https://example.test'},{topicId:''},{topicId:4},
    {topicId:'studying',url:'file://secret'},{topicId:'studying',length:12001},{topicId:'studying',length:0},
    {topicId:'studying',offset:-1},{topicId:'studying',offset:0.5},{topicId:'studying',offset:'0'},
    {topicId:'studying',sectionId:null},{topicId:'missing-topic'},{topicId:'studying',sectionId:'missing-section'}]) await assert.rejects(read(f,args));
  for(const args of [{query:1},{query:'x'.repeat(201)},{limit:21},{limit:0},{limit:'5'},{offset:null},{topicId:'studying'}])await assert.rejects(search(f,args));
  for(const json of ['null','[]','bad'])await assert.rejects(f.library.execute('read_anki_help',json));
  assert.ok(f.state.reads.every(r=>r==='index'));
  await assert.rejects(read(f,{topicId:'studying',offset:1e9}),/offset_out_of_range/);
});

test('a changed resource revision is visible to the same library and stale body reads fail after cancellation',async()=>{
  const f=fixture();const old=await search(f,{query:'FSRS'});
  f.state.index.revision='a'.repeat(40);const fresh=await search(f,{query:'FSRS'});
  assert.notEqual(fresh.source.revision,old.source.revision);
  let finish;f.state.pending=new Promise(resolve=>finish=resolve);
  const pending=read(f,{topicId:'studying'});
  await Promise.resolve();await Promise.resolve();f.library.cancel();
  finish(bytes('topics/studying.mdx').toString('utf8'));await assert.rejects(pending,/cancelled/);
  f.state.pending='bad';await assert.rejects(read(f,{topicId:'studying'}),/resource_mismatch/);
});

test('cancellation during index loading prevents search results from entering the next turn',async()=>{
  let finish;const loading=new Promise(resolve=>finish=resolve);
  const library=new AgentAnkiHelp({index:()=>loading,async readTopic(){throw Error('unexpected body read');}});
  const pending=library.execute('search_anki_help','{}');library.cancel();finish(structuredClone(originalIndex));
  await assert.rejects(pending,/cancelled/);
});

test('actual resource adapter registers read-only tools with Registry and reports resource failure without fallback success',async()=>{
  const paths=[];let fail=false;
  const resources={async getRawFileContent(path) {paths.push(path);if(fail)throw Error('rawfile_missing');return bytes(path.replace(/^anki-manual\//,''));}};
  const Adapter=loadPlatformModule('backend/agent/AgentAnkiHelpTools.ets','AgentAnkiHelpTools',{
    AgentAnkiHelp,agentAnkiHelpTools,util:{TextDecoder:{create(){return {decodeToString:value=>new TextDecoder('utf-8',{fatal:true}).decode(value)};}}}
  });
  const registry=new AgentToolRegistry();new Adapter(resources).register(registry);
  for(const name of ['search_anki_help','read_anki_help'])assert.equal(toolRiskOf(name),'read');
  const result=await registry.execute({id:'help',name:'read_anki_help',argumentsJson:'{"topicId":"deck-options","sectionId":"fsrs"}'});
  assert.match(JSON.parse(result.outputJson).text,/FSRS/);assert.equal(result.draft,null);assert.equal(result.clarification,null);assert.equal(result.action,undefined);
  assert.deepEqual(paths,['anki-manual/index.json','anki-manual/topics/deck-options.mdx']);
  fail=true;await assert.rejects(registry.execute({id:'fail',name:'search_anki_help',argumentsJson:'{}'}),/rawfile_missing/);
  await assert.rejects(registry.execute({id:'unsafe',name:'read_anki_help',argumentsJson:'{"topicId":"../secret"}'}));
  assert.equal(paths.length,3);
});

test('all task modes declare offline help and current runtime prompts use it only when both handlers are available',()=>{
  const limits={maxProviderCalls:8,maxToolCalls:20};
  for(const mode of ['assistant','create','edit']) {
    const tools=agentFunctionTools(100,mode);
    for(const tool of agentAnkiHelpTools())assert.equal(tools.filter(t=>t.name===tool.name).length,1);
    const instructions=buildAgentRuntimeInstructions(tools,0,0,limits);
    assert.match(instructions,/优先 search_anki_help/);assert.match(instructions,/旧会话引用需重新核对/);
    assert.doesNotMatch(buildAgentRuntimeInstructions(tools.filter(t=>!t.name.endsWith('_anki_help')),0,0,limits),/离线原文快照/);
  }
});

test('actual page declares help only when mounted and keeps it available with web access disabled',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const start=source.indexOf('  private providerFunctionToolsForTurn(');
  assert.ok(start>=0);const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const Page=new Function('agentFunctionTools','filterAgentWebTools','isAgentDocumentTool','isAgentAnkiHelpTool',
    stripTypeScriptTypes('class Page { '+method+' }',{mode:'transform'})+';return Page;')(agentFunctionTools,filterAgentWebTools,isAgentDocumentTool,isAgentAnkiHelpTool);
  const page=new Page();Object.assign(page,{agentSettings:{batchLimit:100},pageMode:'assistant',documentAccess:null,navigationSession:null,ankiHelpTools:null});
  assert.ok(page.providerFunctionToolsForTurn(false).every(t=>!isAgentAnkiHelpTool(t.name)));
  page.ankiHelpTools={};const names=page.providerFunctionToolsForTurn(false).map(t=>t.name);
  assert.ok(names.includes('search_anki_help')&&names.includes('read_anki_help'));
  assert.ok(!names.includes('web_search')&&!names.includes('read_webpage')&&!names.includes('list_documents'));
});
