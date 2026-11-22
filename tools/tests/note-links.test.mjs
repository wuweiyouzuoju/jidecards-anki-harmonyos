import * as references from '../../entry/src/main/ets/model/NoteReferences.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as links from '../../entry/src/main/ets/model/NoteLinks.ts';
import { noteLinkGraph } from '../../entry/src/main/ets/model/NoteLinkGraph.ts';
import { NoteLinkOrbit } from '../../entry/src/main/ets/model/NoteLinkOrbit.ts';
import { noteLinkBridgeScript } from '../../entry/src/main/ets/model/NoteLinkBridge.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { NoteEditorWheelSession } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { stripTypeScriptTypes } from 'node:module';
import { GenericString } from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';

const data = (guid, targets = [], alias = '') => ({ v: 1, guid, targets, alias });
const node = record => ({ noteId: record.guid === 'a' ? 1 : 2, guid: record.guid, title: record.guid,
  metadata: links.serializeNoteLinks(record) });
test('Python and ArkTS agree on UTF-8 metadata, special GUIDs and unbounded relationships', () => {
  const records = [data('d`LWlen#1/&|', ['中文', 'b'], '<b>熬夜</b>'), data('a', Array.from({length: 65}, (_, i) => 'target' + i))];
  const script = `import importlib.util,json,sys
s=importlib.util.spec_from_file_location('domain','desktop/anki-note-links/domain.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
records=json.loads(sys.stdin.read());print(json.dumps([{'encoded':m.encode(r),'decoded':m.decode(m.encode(r),r['guid'])} for r in records],ensure_ascii=False))`;
  const result = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c', script], {input: JSON.stringify(records), encoding: 'utf8'}));
  result.forEach((item, i) => { assert.equal(item.encoded, links.serializeNoteLinks(records[i]));
    assert.deepEqual(links.parseNoteLinks(item.encoded, records[i].guid), records[i]); assert.deepEqual(item.decoded, records[i]); });
});
test('mirrors are bounded views, incoming links remain derived, metadata survives all 65 edges', () => {
  const a = data('a', Array.from({length: 65}, (_, i) => 'target' + i));
  const nodes = [node(a), node(data('b', ['a'])), node(data('target0', [], '<b>中文</b>'))];
  const view = links.noteLinkView('a', nodes, [{guid: 'target0', title: 'old title', noteId: 20, cardIds: [201, 202]}]);
  assert.equal(view.outgoing.length, 65); assert.deepEqual(view.incoming.map(r => r.guid), ['b']);
  assert.equal(view.outgoing[0].label, '中文'); assert.deepEqual(view.outgoing[0].cardIds, [201,202]);
  const field = links.updateNoteLinkField('user <b>content</b>', a, links.renderNoteLinkMirror(view));
  assert.equal((field.match(/class="ml-mirror-row"/g) ?? []).length, 30);
  assert.deepEqual(links.parseNoteLinks(field, 'a').targets, a.targets);
  const next = links.updateNoteLinkField(field, data('a'), '');
  assert.ok(next.startsWith('user <b>content</b>')); assert.deepEqual(links.parseNoteLinks(next, 'a').targets, []);
  assert.ok(!next.includes('ml-mirror-row')); assert.equal(links.noteLinkView('b', nodes, []).incoming.length, 0);
});
test('unknown versions, damaged payloads, duplicate/self edges and HTML injection are rejected or stripped', () => {
  for (const record of [data('a', ['a']), data('a',['b','b']), {...data('a'),v:2}])
    assert.throws(() => links.parseNoteLinks(links.serializeNoteLinks(record),'a'));
  assert.throws(() => links.updateNoteLinkField('<!--jide-links:v2:x-->',data('a'),''));
  assert.throws(() => links.parseNoteLinks('<!--jide-links:v1:%E0%A4%A-->','a'));
  assert.throws(() => links.parseNoteLinks(links.serializeNoteLinks(data('a')).repeat(2),'a'));
  assert.equal(links.parseNoteLinks('<div data-guid="a">legacy</div>', 'a'), null);
  const sanitized = links.sanitizeLinkAlias('<script>bad()</script><b onclick="bad()">word</b><span style="color:red;background-image:url(x)">中文</span><img src=x onerror=bad()>');
  assert.equal(sanitized, '<b>word</b><span style="color:red">中文</span>');
  assert.doesNotMatch(links.renderNoteLinkMirror({guid:'a',incoming:[],outgoing:[{guid:'x" onmouseover="bad',label:'<img src=x>',alias:'',noteId:1,cardIds:[1]}]}), /data-guid="x" onmouseover/);
});

function backendFixture() {
  const notes = new Map([[1,{id:1,guid:'a',notetypeId:9,mtimeSecs:1,usn:0,tags:[],fields:['A','answer','']}],
    [2,{id:2,guid:'b',notetypeId:9,mtimeSecs:1,usn:0,tags:[],fields:['B','answer','']}] ]);
  let writes=0, operations=0, syncs=0; const calls=[];
  const reply = value => { const m=new GenericString();m.setVal(JSON.stringify(value));return m.toBytes(); };
  const session = {调用:async(service,method,bytes)=>{
    assert.equal(service,1007); calls.push(method);
    const all=[...notes.values()];
    if(method===0)return reply(all.filter(n=>n.fields[2].includes('<!--jide-links:')).map(n=>({noteId:n.id,guid:n.guid,title:n.fields[0],metadata:n.fields[2].match(/<!--jide-links:v1:[\s\S]*?-->/)[0]})));
    const wanted=JSON.parse(new GenericString(bytes).getVal());assert.ok(wanted.length<=200);
    return reply(all.filter(n=>wanted.includes(n.guid)).map(n=>({noteId:n.id,guid:n.guid,title:n.fields[0],cardIds:[n.id*10,n.id*10+1]})));
  }};
  class Notes { async 获取笔记(id){return structuredClone(notes.get(id));} async 更新笔记(updates){writes++;for(const n of updates) notes.set(n.id,structuredClone(n));} }
  class Types { async 获取笔记类型(){return {fieldNames:['Front','Back','关联']};} }
  const Type=loadPlatformModule('backend/NoteLinksService.ts','NoteLinksService',{
    ...links,...references,noteLinkGraph,后端会话:{获取实例:()=>session},笔记服务:Notes,笔记类型服务:Types,搜索服务:class{},
    autoSyncScheduler:{beginOperation(){operations++;},endOperation(){operations--;},request(){syncs++;}},
    syncActivity:{waitForCollection:async()=>{}}
  });
  return {service:new Type(),notes,calls,get writes(){return writes},get operations(){return operations},get syncs(){return syncs}};
}
test('production service persists both mirrors in one Core write and round-trips remove/alias across reload', async () => {
  const f=backendFixture(), s=await f.service.load(1);
  await f.service.change(s,'b','add'); assert.equal(f.writes,1); assert.equal(f.operations,0);assert.equal(f.syncs,1);
  assert.deepEqual(links.parseNoteLinks(f.notes.get(1).fields[2],'a').targets,['b']);
  assert.deepEqual(links.parseNoteLinks(f.notes.get(2).fields[2],'b').targets,[]);
  assert.equal((await f.service.load(2)).view.incoming[0].guid,'a');
  const reloaded=await f.service.load(1);await f.service.change(reloaded,'b','alias','<b>New</b>');
  assert.equal((await f.service.load(1)).view.outgoing[0].label,'New');
  assert.match(f.notes.get(1).fields[2],/<b>New<\/b>/);
  await f.service.change(await f.service.load(1),'b','remove');
  assert.equal((await f.service.load(2)).view.incoming.length,0);assert.equal(f.operations,0);
});
test('read-only neighborhood preserves reciprocal edges, missing targets and sibling card IDs', async () => {
  const f = backendFixture();
  f.notes.get(1).fields[2] = links.serializeNoteLinks(data('a', ['b', 'missing'], '<b>Focus</b>'));
  f.notes.get(2).fields[2] = links.serializeNoteLinks(data('b', ['a']));
  const graph = await f.service.neighborhood(1);
  assert.deepEqual(graph.nodes.map(n => [n.guid, n.label, n.cardIds]),
    [['a', 'Focus', [10, 11]], ['b', 'B', [20, 21]], ['missing', 'missing', []]]);
  assert.deepEqual(graph.edges, [{source: 0, target: 1}, {source: 0, target: 2}, {source: 1, target: 0}]);
  assert.deepEqual(f.calls, [0, 1]);
  assert.equal(f.writes, 0);
  assert.equal(f.operations, 0);
});
test('selected orbit holds after inertia and subsequent drags start from the displayed pose', () => {
  const orbit = new NoteLinkOrbit();
  orbit.reset(5, 1000, false);
  const initial = orbit.project(350, 370, 1);
  assert.equal(initial[0].x, 175);
  assert.equal(new Set(initial.map(node => node.depth.toFixed(3))).size, 5);
  orbit.paused = true;
  orbit.rotate(45, 8, 1700);
  const dragged = orbit.project(350, 370, 1);
  orbit.release(1716, false);
  for (let time = 1732; time < 2400; time += 16) orbit.step(time, 16);
  const settled = orbit.project(350, 370, 1);
  assert.notDeepEqual(settled, dragged);
  assert.equal(orbit.step(2450, 16), false);
  assert.deepEqual(orbit.project(350, 370, 1), settled);
  orbit.rotate(-32, -7, 2500);
  assert.notDeepEqual(orbit.project(350, 370, 1), settled);
  orbit.release(2520, true);
  assert.equal(orbit.step(2550, 16), false);
  orbit.paused = false;
  const beforeIdle = orbit.project(350, 370, 1);
  assert.equal(orbit.step(3600, 16), true);
  assert.notDeepEqual(orbit.project(350, 370, 1), beforeIdle);
});
test('stale edits and missing targets cannot be reported as committed writes', async () => {
  const f=backendFixture(), stale=await f.service.load(1);
  await f.service.change(stale,'b','add');
  await assert.rejects(f.service.change(stale,'b','remove'),/note_links_conflict/);
  await assert.rejects(f.service.change(await f.service.load(1),'missing','add'),/note_links_missing/);
  assert.equal(f.writes,1);assert.equal(f.operations,0);
  assert.deepEqual(await f.service.preview('missing'),[]);
});
test('legacy display-only fields cannot be overwritten by an edit before complete migration', async () => {
  const f=backendFixture();f.notes.get(1).fields[2]='<!--ml-mirror:start--><div class="ml-mirror-row" data-guid="b">B</div><!--ml-mirror:end-->';
  await assert.rejects(f.service.load(1),/note_links_migrate/);assert.equal(f.writes,0);
});
test('broken targets can be removed and concurrent target alias changes are detected', async () => {
  const f=backendFixture();
  f.notes.get(1).fields[2]=links.serializeNoteLinks(data('a',['missing']));
  await f.service.change(await f.service.load(1),'missing','remove');
  assert.deepEqual(links.parseNoteLinks(f.notes.get(1).fields[2],'a').targets,[]);
  await f.service.change(await f.service.load(1),'b','add');
  const stale=await f.service.load(1);
  f.notes.get(2).fields[2]=links.serializeNoteLinks(data('b',[],'someone else'));
  await assert.rejects(f.service.change(stale,'b','alias','mine'),/note_links_conflict/);
  assert.equal(links.linkPlain('can&#x27;t &amp; 中文'),"can't & 中文");
});
test('bridge rebinding removes stale listeners and only passes GUID intents', () => {
  const handlers=new Map(), calls=[];let row;
  const document={head:{appendChild(){}},createElement(){return {};},getElementById(){return null;},
    addEventListener(name,fn){handlers.set(name,fn)}, removeEventListener(name,fn){if(handlers.get(name)===fn)handlers.delete(name)}};
  const window={jideNoteLinks:{onLink(...args){calls.push(args)}}};
  for(const version of [1,2])new Function('window','document',noteLinkBridgeScript(version))(window,document);
  row={getAttribute:()=> 'd`LW#&/',closest:()=>row};
  const ev={target:row,preventDefault(){},stopImmediatePropagation(){}};
  handlers.get('click')(ev);assert.deepEqual(calls,[['d`LW#&/','preview',2]]);
  assert.doesNotMatch(noteLinkBridgeScript(3),/pycmd\(/);
});
test('desktop domain and migration regression suite is discoverable from the main repository runner', () => {
  execFileSync('python',['-m','unittest','discover','-s','desktop/anki-note-links/tests','-v'],{stdio:'pipe'});
});
test('link panel publishes actual counts and ignores a read completing after disposal', async () => {
  let resolve;const pending=new Promise(r=>{resolve=r}),observations=[];
  const Type=loadComponentLogic('components/links/NoteLinksPanel.ets','NoteLinksPanel',{
    NoteEditorWheelSession,noteLinksService:{load:()=>pending},resourceText:(_context,resource)=>resource,
    appInterface:{observe:value=>observations.push(value),leave:()=>{}},$r:key=>key
  });
  const panel=new Type();panel.getUIContext=()=>({});panel.mounted=true;panel.noteId=1;
  panel.snapshot={view:{outgoing:[{}],incoming:[{},{}]}};panel.publishInterface();
  assert.deepEqual(observations.at(-1).values,
    [{id:'outgoing_count',value:'1'},{id:'incoming_count',value:'2'},{id:'result_count',value:'0'}]);
  assert.equal(observations.at(-1).items.find(item => item.id === 'graph').enabled, true);
  panel.snapshot=null;const task=panel.load();panel.aboutToDisappear();
  resolve({guid:'stale',view:{outgoing:[],incoming:[]}});await task;
  assert.equal(panel.snapshot,null);
});
test('production study timer stays paused while the links overlay is open', () => {
  const source=readFileSync('entry/src/main/ets/pages/学习页.ets','utf8');
  const start=source.indexOf('  private studyTimerState()');
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const Type=new Function(stripTypeScriptTypes('class Page{'+method+'}',{mode:'transform'})+';return Page')();
  const page=Object.assign(new Type(),{noteLinksOpen:true,recoveryMessage:'',requestVersion:1,isCurrentRequest:()=>true,
    controllerReady:true,阶段:'answer',timeboxNotice:null,choiceQuestion:null,
    audioSession:{isPlaying:()=>false},autoAdvanceSettings:{resolve:()=>({})}});
  assert.equal(page.studyTimerState().active,false);page.noteLinksOpen=false;
  assert.equal(page.studyTimerState().active,true);assert.equal(page.阶段,'answer');
});

test('editor count uses the loaded note and graph only, preserving incoming and broken outgoing links', async () => {
  const f=backendFixture();
  f.notes.get(1).fields[2]=links.serializeNoteLinks(data('a',['missing']));
  f.notes.get(2).fields[2]=links.serializeNoteLinks(data('b',['a']));
  f.service.notes.获取笔记=async()=>{throw Error('redundant note read');};
  f.service.resolve=async()=>{throw Error('counts must not resolve target cards');};
  assert.equal(await f.service.count(f.notes.get(1),()=>true),2);
  assert.deepEqual(f.calls,[0]);assert.equal(f.operations,0);
  assert.equal(await f.service.count(f.notes.get(1),()=>false),null);
  assert.deepEqual(f.calls,[0]);
  let current=true;f.service.graph=async()=>{current=false;return [];};
  assert.equal(await f.service.count(f.notes.get(1),()=>current),null);assert.equal(f.operations,0);
  f.service.graph=async()=>{throw Error('graph failed');};
  await assert.rejects(f.service.count(f.notes.get(1),()=>true),/graph failed/);assert.equal(f.operations,0);
});
