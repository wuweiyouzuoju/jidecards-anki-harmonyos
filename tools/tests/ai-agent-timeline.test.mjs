// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { appendAgentTimelineText, appendAgentTimelineReference, cloneAgentTimeline,
  agentDraftProgressText, agentContentParts, agentDraftOperationImages } from '../../entry/src/main/ets/model/agent/AgentTimeline.ts';
import { ResponsesEventNormalizer } from '../../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';
import { createAgentMessage, cloneAgentMessage, projectAgentHistory, restoreAgentMessages } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
import { ThemeModeSession } from '../../entry/src/main/ets/model/settings/ThemeModeSession.ts';
import { ScrollTailFollower } from '../../entry/src/main/ets/model/ScrollTailFollower.ts';

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
const method=name=>{
  const start=pageSource.indexOf('  private '+name+'(');
  assert.ok(start>=0,name);
  return pageSource.slice(start,pageSource.indexOf('\n  }',start)+4);
};
const harnessSource = stripTypeScriptTypes(`class Page {
  constructor(drafts) {
    this.消息列表 = [createAgentMessage(1,'ai','',false)];
    this.conversationId='first';this.pageDisposed=false;this.处理中=false;this.themeUndoBusy=false;
    this.cardBatch={isRunning:()=>false};this.lastThemeChange=null;
    this.agentRunner = {getPartialDrafts:() => drafts}; this.simpleMode = true;
    this.字段名列表 = ['Front','Back']; this.牌组ID = 1; this.已选笔记类型ID = 2;
  }
  更新消息(index, update) { const message = structuredClone(this.消息列表[index]); update(message); this.消息列表[index] = message; }
  克隆工具追踪(trace) { return structuredClone(trace); }
  取本地化格式(resource,args) { return args.join(' → '); }
  取本地化文案(resource) { return resource; }
  滚动到底部() {}
  queueAgentTimelineScroll() {}
  selectedDeckName() { return 'Deck'; }
  selectedNotetypeName() { return 'Basic'; }
  ${pageMethods}
  ${['receiveThemeChange','async undoThemeChange','currentMessageIndex'].map(method).join('\n')}
}`, {mode:'transform'});
const Page = new Function('appendAgentTimelineText', 'appendAgentTimelineReference', 'cloneAgentTimeline',
  'agentDraftProgressText', 'agentDraftOperationImages', 'createAgentMessage', '$r', harnessSource + '; return Page;')(
  appendAgentTimelineText, appendAgentTimelineReference, cloneAgentTimeline, agentDraftProgressText, agentDraftOperationImages, createAgentMessage, value => value);
const event = (kind, extra = {}) => ({kind,text:'',toolCall:null,toolTrace:null,source:null,errorCode:'',...extra});

function themeFixture() {
  const state={mode:'system',writes:[]};
  const themes=new ThemeModeSession({readSavedMode:async()=>state.mode,
    saveMode:async mode=>{state.mode=mode;state.writes.push(mode);},applyMode:async()=>{},systemDark:()=>false});
  const page=new Page([]);page.appSettingsTools={undo:id=>themes.undo(id)};
  const switchIn=async(index,mode)=>{
    page.receiveThemeChange(await themes.setMode(mode));
    page.处理Agent事件(index,event('tool_completed',{toolTrace:{callId:'theme-'+index,toolName:'set_theme_mode',status:'completed'}}));
  };
  return {page,themes,state,switchIn};
}

test('theme receipt stays in its tool reply; unrelated chat has none and undo updates that same reply',async()=>{
  const {page,state,switchIn}=themeFixture();await switchIn(0,'dark');
  page.消息列表.push(createAgentMessage(2,'ai','Discussing vocabulary',false));
  page.处理Agent事件(1,event('text_delta',{text:'Next topic'}));
  page.处理Agent事件(1,event('tool_completed',{toolTrace:{callId:'read',toolName:'get_settings',status:'completed'}}));
  assert.equal(page.消息列表[0].themeChange.mode,'dark');
  assert.equal(page.消息列表[1].themeChange,null);assert.equal(page.消息列表[1].themeUndoNotice,'');
  await page.undoThemeChange(0);
  assert.equal(state.mode,'system');assert.equal(page.消息列表[0].themeChange.undoId,'');
  assert.equal(page.消息列表[0].themeUndoNotice,'app.string.theme_change_undone');
  assert.equal(page.消息列表[1].themeChange,null);assert.equal(page.消息列表[1].themeUndoNotice,'');
});

test('a later theme command removes the earlier button and external changes report expiry only in its owning reply',async()=>{
  const {page,themes,state,switchIn}=themeFixture();await switchIn(0,'dark');
  page.消息列表.push(createAgentMessage(2,'ai','Switch again',false));await switchIn(1,'light');
  assert.equal(page.消息列表[0].themeChange.mode,'dark');assert.equal(page.消息列表[0].themeChange.undoId,'');
  const written=state.writes.length;await page.undoThemeChange(0);assert.equal(state.writes.length,written);
  await themes.setMode('system');await page.undoThemeChange(1);
  assert.equal(page.消息列表[1].themeChange.undoId,'');
  assert.equal(page.消息列表[1].themeUndoNotice,'app.string.theme_change_undo_expired');
  assert.equal(page.消息列表[0].themeUndoNotice,'');assert.equal(state.mode,'system');
});

test('accepted undo survives conversation replacement without adding feedback to the replacement',async()=>{
  const {page,state,switchIn}=themeFixture();await switchIn(0,'dark');
  const originalUndo=page.appSettingsTools.undo;let finish;
  page.appSettingsTools.undo=async id=>{await new Promise(resolve=>{finish=resolve;});return originalUndo(id);};
  const pending=page.undoThemeChange(0);
  page.conversationId='replacement';page.消息列表=[createAgentMessage(1,'ai','New conversation',false)];
  finish();await pending;
  assert.equal(state.mode,'system');assert.equal(page.消息列表[0].themeChange,null);
  assert.equal(page.消息列表[0].themeUndoNotice,'');assert.equal(page.themeUndoBusy,false);
});

test('theme feedback clones independently and history projection never restores its live undo button',()=>{
  const message=createAgentMessage(1,'ai','Switched',false);
  message.themeChange={status:'completed',mode:'dark',previousMode:'system',saved:true,applied:true,errorCode:'',undoId:'live-only'};
  const clone=cloneAgentMessage(message);clone.themeChange.undoId='';assert.equal(message.themeChange.undoId,'live-only');
  const projection=projectAgentHistory([message],'History');assert.doesNotMatch(JSON.stringify(projection),/live-only|themeChange/);
  const [restored]=restoreAgentMessages({...projection,results:[]},()=>2,'tools',false);
  assert.equal(restored.themeChange,null);assert.equal(restored.themeUndoNotice,'');
});

test('theme feedback is rendered inside the reply and excluded from the shared composer',()=>{
  const bubble=pageSource.match(/private AI气泡\([\s\S]*?\n  \}/)?.[0]??'';
  const composer=pageSource.match(/private 输入区\([\s\S]*?\n  \}/)?.[0]??'';
  assert.match(bubble,/this\.themeChangeFeedback\(\{ message: ctx\.message/);
  assert.doesNotMatch(composer,/themeChange|themeUndo|theme_change_/);
  assert.match(pageSource,/undoThemeChange\(ctx\.messageIndex\)/);
});

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

test('failed tools clear unvalidated content and new traces always start collapsed', () => {
  const page = new Page([]);
  page.simpleMode = false;
  const call = {id:'failed',name:'create_flashcards',argumentsJson:'{"cards":[{"fields":["Q","A"]}]}'};
  page.处理Agent事件(0, event('tool_progress', {toolCall:call}));
  assert.equal(page.消息列表[0].timeline[0].text, 'Q\n\nA');
  page.处理Agent事件(0, event('tool_failed', {toolTrace:{callId:'failed',toolName:call.name,status:'failed'}}));
  assert.equal(page.消息列表[0].timeline[0].text, '');
  assert.equal(page.消息列表[0].工具过程[0].expanded, false);
  assert.equal(page.消息列表[0].卡片列表.length, 0);
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
  const callbacks = new Map();
  let next = 0;
  let scrollCount = 0;
  const ScrollPage = new Function(stripTypeScriptTypes(`class ScrollPage {
    pageDisposed = false;
    constructor(scroller, follower) { this.聊天滚动器 = scroller; this.agentTailFollower = follower; }
    ${scrollMethods}
  }`,{mode:'transform'}) + '; return ScrollPage;')();
  const follower = new ScrollTailFollower(() => { scrollCount++; }, () => true, 50, {
    schedule: callback => { callbacks.set(++next, callback); return next; }, cancel: id => callbacks.delete(id)
  });
  const page = new ScrollPage({}, follower);
  page.queueAgentTimelineScroll(); page.queueAgentTimelineScroll();
  assert.equal(callbacks.size, 1);
  const stale = callbacks.values().next().value;
  page.pauseAgentTimelineFollow(); stale();
  assert.equal(scrollCount, 0);
  page.queueAgentTimelineScroll();
  assert.equal(callbacks.size, 0);
  page.滚动到底部();
  callbacks.values().next().value();
  assert.equal(scrollCount, 1);
});
