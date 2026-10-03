// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { createAgentMessage, cloneAgentMessage, projectAgentHistory, restoreAgentMessages } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
import { appendAgentTimelineText, appendAgentTimelineReference, agentDraftProgressText, agentDraftOperationImages } from '../../entry/src/main/ets/model/agent/AgentTimeline.ts';
import { ScrollTailFollower } from '../../entry/src/main/ets/model/ScrollTailFollower.ts';

function reasoningHarness() {
  const callbacks = new Map();
  let next = 0, scrolls = 0, atEnd = false, paused = 0, resumed = 0;
  const clock = { schedule: callback => { callbacks.set(++next, callback); return next; },
    cancel: id => callbacks.delete(id) };
  const Component = loadComponentLogic('components/agent/AgentReasoning.ets', 'AgentReasoning', {
    Scroller: class { scrollEdge() { scrolls++; } isAtEnd() { return atEnd; } },
    Edge: { Bottom: 1 }, ScrollState: { Idle: 0, Scroll: 1 },
    ScrollTailFollower: class extends ScrollTailFollower {
      constructor(scroll, enabled, delay) { super(scroll, enabled, delay, clock); }
    }
  });
  const component = new Component();
  component.onReadingOlder = () => paused++;
  component.onFollowingLatest = () => resumed++;
  return { component, callbacks, get scrolls() { return scrolls; },
    get paused() { return paused; },
    get resumed() { return resumed; },
    end: () => { atEnd = true; },
    flush: () => { for (const [id, callback] of callbacks) { callbacks.delete(id); callback(); } } };
}

test('reasoning starts expanded, follows appended content and respects manual folding', () => {
  const h = reasoningHarness(), c = h.component;
  assert.equal(c.expanded,true);
  c.text = 'first'; c.contentChanged(); c.contentChanged();
  assert.equal(h.callbacks.size, 1); h.flush(); assert.equal(h.scrolls, 1);
  c.text += '\nlatest'; c.contentChanged(); h.flush(); assert.equal(h.scrolls, 2);
  c.expanded = false; c.contentChanged(); assert.equal(h.callbacks.size, 0);
  c.expanded = true; c.expansionChanged(); h.flush(); assert.equal(h.scrolls, 3);
});

test('reading older thoughts pauses follow; closing or disposal cancels pending scroll', () => {
  const h = reasoningHarness(), c = h.component;
  c.expanded = true; c.expansionChanged(); c.didScroll(0, -10, 1); h.flush();
  assert.equal(h.scrolls, 0);
  assert.equal(h.paused, 1); assert.equal(h.callbacks.size,0);
  c.contentChanged(); assert.equal(h.callbacks.size, 0);
  h.end(); c.didScroll(0, 10, 1); c.contentChanged(); h.flush(); assert.equal(h.scrolls, 1);
  assert.equal(h.resumed, 1);
  c.didScroll(0, 10, 1); assert.equal(h.resumed, 1);
  c.contentChanged(); c.expanded = false; h.flush(); assert.equal(h.scrolls, 1);
  c.expanded = true; c.expansionChanged(); c.aboutToDisappear();
  assert.equal(h.callbacks.size, 0); c.contentChanged(); assert.equal(h.callbacks.size, 0);
});

test('real Scroll callbacks use the second offset; horizontal and controller-idle frames cannot change reading intent', () => {
  const h=reasoningHarness(), c=h.component;
  c.contentChanged(); c.didScroll(-20,0,1); h.flush();
  assert.equal(h.scrolls,1); assert.equal(h.paused,0);
  c.didScroll(0,-10,0); c.contentChanged(); h.flush();
  assert.equal(h.scrolls,2); assert.equal(h.paused,0);
  c.contentChanged(); c.didScroll(0,-10,1);
  assert.equal(h.callbacks.size,0);assert.equal(h.paused,1);
  h.end();c.didScroll(20,0,1);c.contentChanged();h.flush();assert.equal(h.scrolls,2);
  c.text+='new thought';c.contentChanged();h.flush();assert.equal(h.scrolls,2);
  c.didScroll(0,10,1);c.contentChanged();h.flush();assert.equal(h.scrolls,3);
});

test('reasoning scroll forwards the complete native tuple and pauses its host while nested gestures consume thoughts first', () => {
  const component=readFileSync(new URL('../../entry/src/main/ets/components/agent/AgentReasoning.ets',import.meta.url),'utf8');
  assert.match(component,/onDidScroll\(\(xOffset: number, yOffset: number, state: ScrollState\)/);
  assert.match(component,/this\.didScroll\(xOffset, yOffset, state\)/);
  assert.match(component,/scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST/);
  const page=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  assert.match(page,/onReadingOlder: \(\): void => \{ this\.pauseAgentTimelineFollow\(\); \}/);
  assert.match(page,/onFollowingLatest: \(\): void => \{ this\.resumeAgentTimelineFromReasoning\(ctx\.messageIndex\); \}/);
  assert.match(page,/onDidScroll\(\(xOffset: number, yOffset: number, state: ScrollState\): void => \{\s*this\.didScrollAgentTimeline\(xOffset, yOffset, state\)/);
});

const source = readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets', import.meta.url), 'utf8');
const method = name => {
  const start = source.indexOf('  private ' + name + '(');
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
};
function pageHarness() {
  const callbacks = new Map();
  let next = 0, scrolls = 0, atEnd = true;
  const dependencies = {
    Edge: { Bottom: 1 }, ScrollState: { Idle: 0, Scroll: 1 },
    appendAgentTimelineText, appendAgentTimelineReference, agentDraftProgressText, agentDraftOperationImages
  };
  const Page = new Function(...Object.keys(dependencies), stripTypeScriptTypes(`class Page {
    消息列表 = []; pageDisposed = false;
    agentRunner = null; lastThemeChange = null;
    克隆消息(message) { return structuredClone(message); }
    克隆工具追踪(trace) { return structuredClone(trace); }
    ${['更新消息', '追加消息', '滚动到底部', 'queueAgentTimelineScroll', 'pauseAgentTimelineFollow',
      'didScrollAgentTimeline', 'resumeAgentTimelineFromReasoning', '处理Agent事件', 'showAgentDraftProgress',
      'agentTimelineKey', 'toggleReasoning', '切换工具详情', '更新草稿操作'].map(method).join('\n')}
  }`, { mode: 'transform' }) + '; return Page;')(...Object.values(dependencies));
  const page = new Page();
  page.聊天滚动器 = { scrollEdge: () => scrolls++, isAtEnd: () => atEnd };
  page.agentTailFollower = new ScrollTailFollower(() => page.聊天滚动器.scrollEdge(), () => !page.pageDisposed, 50, {
    schedule: callback => { callbacks.set(++next, callback); return next; }, cancel: id => callbacks.delete(id)
  });
  return { page, callbacks, get scrolls() { return scrolls; }, end: value => { atEnd = value; },
    flush: () => { for (const [id, callback] of callbacks) { callbacks.delete(id); callback(); } } };
}

test('latest reasoning and every tool phase follow even when outer layout height stays unchanged', () => {
  const h = pageHarness(), p = h.page;
  p.消息列表 = [createAgentMessage(1, 'ai', '', false)];
  const trace = { callId: 'call-1', toolName: 'read_document', status: 'running', expanded: false };
  const events = [
    { kind: 'reasoning_delta', text: 'thinking' },
    { kind: 'reasoning_summary', text: 'summary' },
    { kind: 'text_delta', text: 'answer' },
    { kind: 'tool_progress', toolCall: { id: 'call-1', name: 'read_document', argumentsJson: '{}' } },
    { kind: 'tool_call', toolCall: { id: 'call-1', name: 'read_document', argumentsJson: '{}' } },
    { kind: 'tool_started', toolTrace: trace },
    { kind: 'tool_completed', toolTrace: { ...trace, status: 'completed' } },
    { kind: 'tool_failed', toolTrace: { ...trace, status: 'failed' } }
  ];
  for (const [index, event] of events.entries()) {
    p.处理Agent事件(0, { text: '', toolCall: null, toolTrace: null, source: null, ...event });
    assert.equal(h.callbacks.size, 1, event.kind);
    h.flush(); assert.equal(h.scrolls, index + 1, event.kind);
  }
  assert.equal(p.消息列表[0].推理摘要, 'thinkingsummary');
  assert.equal(p.消息列表[0].正文, 'answer');
  assert.equal(p.消息列表[0].工具过程[0].status, 'failed');
  p.agentRunner = { getPartialDrafts: () => [{ id: 'draft-1', summary: 'preview', operations: [] }] };
  p.处理Agent事件(0, { kind: 'tool_completed', toolCall: null, toolTrace: { ...trace, status: 'completed' } });
  assert.equal(p.消息列表[0].timeline.at(-1).kind, 'draft');
  assert.equal(h.callbacks.size, 1);
  // Final reply/status updates take the same route without requiring an onAreaChange frame.
  p.更新消息(0, message => { message.streaming = false; });
  assert.equal(h.callbacks.size, 1); h.flush(); assert.equal(h.scrolls, 9);
});

test('outer reading cancels queued follow and resumes only on a vertical gesture reaching the end', () => {
  const h = pageHarness(), p = h.page;
  p.消息列表 = [createAgentMessage(1, 'ai', '', false)];
  p.更新消息(0, message => { message.正文 = 'first'; });
  p.didScrollAgentTimeline(0, -10, 1);
  assert.equal(h.callbacks.size, 0); assert.equal(p.agentTailFollower.isFollowing(), false);
  p.处理Agent事件(0, { kind: 'reasoning_delta', text: 'more', toolCall: null, toolTrace: null });
  h.flush(); assert.equal(h.scrolls, 0);
  p.didScrollAgentTimeline(20, 0, 1); p.didScrollAgentTimeline(0, 10, 0);
  assert.equal(p.agentTailFollower.isFollowing(), false);
  h.end(false); p.didScrollAgentTimeline(0, 10, 1);
  assert.equal(p.agentTailFollower.isFollowing(), false);
  h.end(true); p.didScrollAgentTimeline(0, 10, 1);
  assert.equal(p.agentTailFollower.isFollowing(), true); h.flush(); assert.equal(h.scrolls, 1);
  p.更新消息(0, message => { message.正文 += 'second'; }); h.flush(); assert.equal(h.scrolls, 2);
});

test('nested thoughts returning to their end restore both followers only for the latest visible reply', () => {
  const h = pageHarness(), p = h.page, child = reasoningHarness(), c = child.component;
  p.消息列表 = [createAgentMessage(1, 'ai', '', false)];
  c.onReadingOlder = () => p.pauseAgentTimelineFollow();
  c.onFollowingLatest = () => p.resumeAgentTimelineFromReasoning(0);
  p.queueAgentTimelineScroll(); c.contentChanged(); c.didScroll(0, -10, 1);
  assert.equal(h.callbacks.size, 0); assert.equal(child.callbacks.size, 0);
  p.更新消息(0, message => { message.推理摘要 += 'new'; }); c.contentChanged();
  assert.equal(h.callbacks.size, 0); assert.equal(child.callbacks.size, 0);
  child.end(); c.didScroll(0, 10, 1);
  h.flush(); child.flush(); assert.equal(h.scrolls, 1); assert.equal(child.scrolls, 1);
  p.pauseAgentTimelineFollow(); h.end(false); p.resumeAgentTimelineFromReasoning(0);
  assert.equal(p.agentTailFollower.isFollowing(), false); assert.equal(h.callbacks.size, 0);
  h.end(true); p.消息列表.push(createAgentMessage(2, 'ai', '', false));
  p.resumeAgentTimelineFromReasoning(0);
  assert.equal(p.agentTailFollower.isFollowing(), false); assert.equal(h.callbacks.size, 0);
});

test('old message updates and a disposed page never schedule follow; sending a new message restores it', () => {
  const h = pageHarness(), p = h.page;
  p.消息列表 = [createAgentMessage(1, 'ai', '', false), createAgentMessage(2, 'ai', '', false)];
  p.更新消息(0, message => { message.正文 = 'old'; }); assert.equal(h.callbacks.size, 0);
  p.pauseAgentTimelineFollow(); p.追加消息(createAgentMessage(3, 'user', 'new request', false));
  assert.equal(p.agentTailFollower.isFollowing(), true); h.flush(); assert.equal(h.scrolls, 1);
  p.queueAgentTimelineScroll(); p.pageDisposed = true; h.flush(); assert.equal(h.scrolls, 1);
  p.queueAgentTimelineScroll(); p.resumeAgentTimelineFromReasoning(2);
  assert.equal(h.callbacks.size, 0);
});

test('streaming disclosure clicks update host state without remounting or page auto-scroll', () => {
  const h = pageHarness(), page = h.page;
  const message=createAgentMessage(99,'ai','',false);message.streaming=true;message.工具过程=[{expanded:false}];
  page.消息列表 = [message];
  const block = {id: 5, text: 'first', index: -1, kind: 'tool'};
  const identity = page.agentTimelineKey(0, block);
  page.queueAgentTimelineScroll();
  page.toggleReasoning(0, -1); page.切换工具详情(0, 0);
  assert.deepEqual(page.消息列表[0].expandedReasoningIds, []);
  assert.equal(page.消息列表[0].工具过程[0].expanded, true);
  assert.equal(page.agentTailFollower.isFollowing(), false);
  assert.equal(h.callbacks.size, 0);
  block.text += 'latest'; block.index = 0; page.消息列表[0].streaming = false;
  assert.equal(page.agentTimelineKey(0, block), identity);
  page.toggleReasoning(0, -1); assert.deepEqual(page.消息列表[0].expandedReasoningIds, [-1]);
  assert.equal(page.agentTimelineKey(0, block), identity);
});

test('new and restored replies open reasoning while cloning retains a manually collapsed state',()=>{
  const message=createAgentMessage(1,'ai','reply',false);message.推理摘要='Actual provider reasoning';
  assert.deepEqual(message.expandedReasoningIds,[-1]);
  message.expandedReasoningIds=[];
  assert.deepEqual(cloneAgentMessage(message).expandedReasoningIds,[]);
  const projection=projectAgentHistory([message],'history');
  const restored=restoreAgentMessages({...projection,results:[]},()=>2,'tools',false);
  assert.deepEqual(restored[0].expandedReasoningIds,[-1]);
  assert.equal(restored[0].推理摘要,'Actual provider reasoning');
});

test('stable rows receive live state by reference through every nested builder', () => {
  for (const name of ['AI气泡', 'agentTimelineItem', '工具过程项', '工具详情内容', '卡片项', '变更草稿项']) {
    assert.match(source, new RegExp('private ' + name + '\\(ctx: AgentMessageViewContext\\)'));
    const calls = [...source.matchAll(new RegExp('this\\.' + name + '\\(([^\\n]+)', 'g'))];
    assert.ok(calls.length > 0);
    for (const [, call] of calls) assert.match(call, /^\{ message:/);
  }
  assert.equal((source.match(/AgentReasoning\(\{/g) ?? []).length, 1);
});

test('rich draft callbacks cannot edit an accepted, completed or high-risk operation', () => {
  const page = pageHarness().page;
  page.消息列表 = [{变更草稿列表: [{risk: 'write', status: 'pending', operations: [{kind: 'update_field', after: 'old'}]}]}];
  page.更新草稿操作(0, 0, 0, '<b>new</b>');
  assert.equal(page.消息列表[0].变更草稿列表[0].operations[0].after, '<b>new</b>');
  for (const status of ['confirmed', 'applying', 'applied', 'failed', 'cancelled']) {
    page.消息列表[0].变更草稿列表[0].status = status;
    page.更新草稿操作(0, 0, 0, 'late');
    assert.equal(page.消息列表[0].变更草稿列表[0].operations[0].after, '<b>new</b>');
  }
  page.消息列表[0].变更草稿列表[0].status = 'pending';
  page.消息列表[0].变更草稿列表[0].risk = 'high_risk';
  page.更新草稿操作(0, 0, 0, 'late');
  assert.equal(page.消息列表[0].变更草稿列表[0].operations[0].after, '<b>new</b>');
  page.更新草稿操作(99, 99, 99, 'stale');
});
