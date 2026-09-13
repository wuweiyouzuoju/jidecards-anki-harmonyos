// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { appendAgentTimelineText, appendAgentTimelineReference, cloneAgentTimeline,
  agentDraftProgressText, agentContentParts, agentDraftOperationImages } from '../../entry/src/main/ets/model/agent/AgentTimeline.ts';
import { ResponsesEventNormalizer } from '../../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';

test('interleaved narration, reasoning, images, tools and drafts retain occurrence order', () => {
  const blocks = [];
  appendAgentTimelineText(blocks, 'reasoning', 'First');
  appendAgentTimelineText(blocks, 'reasoning', ' step');
  appendAgentTimelineText(blocks, 'text', 'Before ![image](https://example.com/a.png) after');
  const tool = appendAgentTimelineReference(blocks, 'tool', 'call-1');
  appendAgentTimelineReference(blocks, 'draft', 'draft-1');
  appendAgentTimelineText(blocks, 'reasoning', 'Next');
  appendAgentTimelineText(blocks, 'text', 'Done');
  appendAgentTimelineReference(blocks, 'tool', 'call-1').index = 3;
  assert.equal(tool.index, 3);
  assert.deepEqual(blocks.map(b => b.kind), ['reasoning', 'text', 'tool', 'draft', 'reasoning', 'text']);
  assert.equal(blocks[0].text, 'First step');
  assert.deepEqual(agentContentParts(blocks[1].text).map(p => p.kind), ['text', 'image', 'text']);
  const clone = cloneAgentTimeline(blocks);
  clone[0].text += '!'; clone[3].indexes.push(1);
  assert.equal(blocks[0].text, 'First step');
  assert.deepEqual(blocks[3].indexes, []);
});

test('creation previews incomplete fields including split escapes and multiple cards', () => {
  assert.equal(agentDraftProgressText('create_flashcards', '{"cards":[{"fields":["题目","答'), '题目\n\n答');
  assert.equal(agentDraftProgressText('create_flashcards', '{"cards":[{"fields":["a\\u4'), 'a');
  const json = JSON.stringify({ cards: [{fields:['问题一','答案一']},{fields:['问题二','答案二']}] });
  assert.equal(agentDraftProgressText('create_flashcards', json), '问题一\n\n答案一\n\n问题二\n\n答案二');
  assert.equal(agentDraftProgressText('search_cards', '{"query":"secret"}'), '');
});

test('edit previews decode partial nested fieldUpdatesJson without exposing protocol fields', () => {
  const nested = JSON.stringify([{noteId:9, fieldOrd:0, after:'改后的内容\n第二行'}]);
  const json = JSON.stringify({fieldUpdatesJson:nested, draftId:'private-id'});
  assert.equal(agentDraftProgressText('propose_update_notes', json), '改后的内容\n第二行');
  const cut = json.indexOf('内容');
  assert.equal(agentDraftProgressText('propose_update_notes', json.slice(0, cut)), '改后的');
});

test('draft progress never emits executable calls before arguments complete', () => {
  for (const name of ['create_flashcards', 'propose_update_notes']) {
    const normalizer = new ResponsesEventNormalizer();
    const accept = raw => normalizer.accept({event:'', data:JSON.stringify(raw), id:'', done:false});
    const added = accept({type:'response.output_item.added', item:{type:'function_call', id:'fc', call_id:'call', name}});
    const partial = accept({type:'response.function_call_arguments.delta', item_id:'fc', delta:'{"cards":['});
    assert.deepEqual([...added, ...partial].map(e => e.kind), ['tool_progress','tool_progress']);
    assert.equal(partial[0].toolCall.id, 'call');
    const done = accept({type:'response.function_call_arguments.done', item_id:'fc', arguments:'{"cards":[]}'});
    assert.equal(done[0].kind, 'tool_call');
    assert.deepEqual(accept({type:'response.output_item.done', item:{type:'function_call', id:'fc', name, arguments:'{"cards":[]}'}}), []);
    assert.equal(added[0].toolCall.argumentsJson, '');
  }
});

test('untrusted local or unfinished image syntax stays text', () => {
  for (const text of ['![x](file:///private.png)', '![x](data:image/png;base64,aaa)', '![x](https://example.com/a']) {
    assert.deepEqual(agentContentParts(text), [{kind:'text',text}]);
  }
});

// 运行页面实际的事件消费/草稿接收方法，仅替换 ArkUI 状态和本地化边界。
const pageSource = fs.readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets', import.meta.url), 'utf8');
const pageMethods = pageSource.slice(pageSource.indexOf('  private 处理Agent事件('), pageSource.indexOf('  private 影响范围('));
const harnessSource = stripTypeScriptTypes(`class Page {
  constructor(drafts) {
    this.消息列表 = [{timeline:[],正文:'',providerText:'',推理摘要:'',工具过程:[],来源列表:[],卡片列表:[],变更草稿列表:[]}];
    this.agentRunner = {getPartialDrafts:() => drafts}; this.simpleMode = true;
    this.字段名列表 = ['Front','Back']; this.牌组ID = 1; this.已选笔记类型ID = 2;
  }
  更新消息(index, update) { const message = structuredClone(this.消息列表[index]); update(message); this.消息列表[index] = message; }
  克隆工具追踪(trace) { return structuredClone(trace); }
  取本地化格式(resource,args) { return args.join(' → '); }
  滚动到底部() {}
  queueAgentTimelineScroll() {}
  selectedDeckName() { return 'Deck'; }
  selectedNotetypeName() { return 'Basic'; }
  ${pageMethods}
}`, {mode:'transform'});
const Page = new Function('appendAgentTimelineText', 'appendAgentTimelineReference', 'cloneAgentTimeline',
  'agentDraftProgressText', 'agentDraftOperationImages', '$r', harnessSource + '; return Page;')(
  appendAgentTimelineText, appendAgentTimelineReference, cloneAgentTimeline, agentDraftProgressText, agentDraftOperationImages, value => value);
const event = (kind, extra = {}) => ({kind,text:'',toolCall:null,toolTrace:null,source:null,errorCode:'',...extra});

test('page exposes create and edit previews before final turn and finalizes them in their original positions', () => {
  for (const kind of ['create_note','update_field']) {
    const draft = {id:'draft-1',summary:'Preview',risk:'write',status:'pending',imageAttachments:[],
      operations:[{kind,noteId:1,cardId:0,deckId:1,fieldOrd:0,before:kind === 'update_field' ? 'Old' : '',after:'New'}]};
    const page = new Page([draft]);
    const trace = {callId:'call-1',toolName:kind === 'create_note' ? 'create_flashcards' : 'propose_update_notes',status:'started'};
    page.处理Agent事件(0, event('reasoning_delta', {text:'First'}));
    page.处理Agent事件(0, event('text_delta', {text:'Before'}));
    page.处理Agent事件(0, event('tool_started', {toolTrace:trace}));
    page.处理Agent事件(0, event('tool_completed', {toolTrace:{...trace,status:'completed'}}));
    let message = page.消息列表[0];
    assert.deepEqual(message.timeline.map(b => b.kind), ['reasoning','text','tool','draft']);
    assert.match(message.timeline[3].text, /New/);
    if (kind === 'update_field') assert.match(message.timeline[3].text, /Old/);
    assert.equal(message.timeline[3].index, -1);
    assert.deepEqual(message.timeline[3].indexes, []);
    assert.equal(message.卡片列表.length + message.变更草稿列表.length, 0, 'previews must not be writable');
    page.处理Agent事件(0, event('reasoning_delta', {text:'Next'}));
    page.处理Agent事件(0, event('text_delta', {text:'After'}));
    page.接收Agent草稿(0, [draft]);
    message = page.消息列表[0];
    assert.deepEqual(message.timeline.map(b => b.kind), ['reasoning','text','tool','draft','reasoning','text']);
    assert.equal(message.工具过程.length, 1);
    if (kind === 'create_note') {
      assert.deepEqual(message.timeline[3].indexes, [0]);
      assert.equal(message.卡片列表[0].fields[0], 'New');
    } else {
      assert.equal(message.timeline[3].index, 0);
      assert.equal(message.变更草稿列表[0].operations[0].after, 'New');
    }
  }
});

test('images follow their own card fields instead of accumulating after a multi-card draft', () => {
  const draft = {id:'pictures',summary:'Cards',operations:[
    {noteId:1,fieldOrd:0,before:'',after:'First'}, {noteId:2,fieldOrd:0,before:'',after:'Second'}],
    imageAttachments:[{noteId:1,fieldOrd:0,candidate:{thumbnailUrl:'https://example.com/1.png'}},
      {noteId:2,fieldOrd:0,candidate:{thumbnailUrl:'https://example.com/2.png'}}]};
  const page = new Page([draft]);
  page.showAgentDraftProgress(0,[draft]);
  const block = page.消息列表[0].timeline[0];
  assert.deepEqual(agentContentParts(block.text).map(p => p.kind), ['text','image','text','image']);
  assert.deepEqual(block.images, []);
  assert.deepEqual(agentDraftOperationImages(draft,0), ['https://example.com/1.png']);
  assert.deepEqual(agentDraftOperationImages(draft,1), ['https://example.com/2.png']);
  draft.imageAttachments.push({noteId:3,fieldOrd:0,candidate:{thumbnailUrl:'https://example.com/3.png'}});
  assert.deepEqual(agentDraftOperationImages(draft,-1), ['https://example.com/3.png']);
});

test('streaming scroll coalesces layout updates and preserves upward reading position', () => {
  const scrollMethods = pageSource.slice(pageSource.indexOf('  private 滚动到底部('), pageSource.indexOf('  private 取Agent错误文案('));
  const callbacks = [];
  let scrollCount = 0;
  const ScrollPage = new Function('setTimeout','Edge', stripTypeScriptTypes(`class ScrollPage {
    followAgentTail = true; agentScrollTimer = -1;
    constructor(scroller) { this.聊天滚动器 = scroller; }
    ${scrollMethods}
  }`,{mode:'transform'}) + '; return ScrollPage;')(callback => { callbacks.push(callback); return 1; }, {Bottom:0});
  const page = new ScrollPage({scrollEdge:() => { scrollCount++; }});
  page.queueAgentTimelineScroll(); page.queueAgentTimelineScroll();
  assert.equal(callbacks.length, 1);
  page.followAgentTail = false;
  callbacks.shift()();
  assert.equal(scrollCount, 0);
  page.queueAgentTimelineScroll();
  assert.equal(callbacks.length, 0);
  page.滚动到底部();
  callbacks.shift()();
  assert.equal(scrollCount, 1);
});
