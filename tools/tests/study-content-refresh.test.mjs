// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const names = ['加载下一张卡', '刷新编辑后当前卡', '消费待重渲染', '卡片内容变更_回调', '显示答案', 'saveNoteEdits', 'invalidateCardWork', 'isCurrentRequest', 'studyActivityChanged', 'applyStudyHtml', 'playStudyAudio'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const js = stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' });
const hook = name => {
  const body = source.match(new RegExp(`\\.${name}\\(\\(\\): void => \\{([\\s\\S]*?)\\n    \\}\\)`))?.[1];
  assert.ok(body);
  return new Function(stripTypeScriptTypes(body));
};
const hidden = hook('onHidden'), shown = hook('onShown');

function harness(phase = 'question') {
  const store = { front: 'old-front', back: 'old-back', css: 'old-css', id: 7, empty: false, renders: 0 };
  const displayed = [];
  const Page = new Function('构建卡片HTML', '剥除拼写标记', '提取拼写标记', '原始侧HTML', '媒体基地址', js + '\nreturn Page;')(
    (rendered, side) => rendered.css + ':' + (side === 'question' ? rendered.questionNodes : rendered.answerNodes).join(''),
    html => html.replace(/\[\[type:[^\]]+\]\]/g, ''),
    nodes => nodes.some(text => text.includes('[[type:')) ? { fieldName: 'Updated', combining: true, cloze: false } : null,
    (rendered, side) => (side === 'question' ? rendered.questionNodes : rendered.answerNodes).join(''), 'media://'
  );
  const page = new Page();
  Object.assign(page, {
    mounted: true, sessionReady: true, foreground: true, requestVersion: 0, loadingVersion: -1, flipPending: false, controllerReady: true, pendingHtml: '',
    audioSession: { stop: async () => {}, play: async () => false },
    页面已显示: true, 待重渲染当前卡: false, contentRefreshInFlight: false, 评分中: false,
    noteEditorVisible: false, noteEditorBusy: false, 阶段: phase, 牌组ID: 10,
    当前卡片: { cardId: 7, noteId: 42, templateIdx: 0, states: 'old-states' },
    已渲染: {}, 正面HTML: 'old-front', 背面HTML: 'old-back', 拼写字段名: 'Old', 已输入答案: 'old-input',
    声音播放器实例: { 停止: async () => {}, 播放队列: async () => {} },
    TTS播放器实例: { 停止: async () => {}, 播放队列: async () => {} },
    刷新撤销状态: async () => {}, 是否深色: () => false, maybeShowStudyGuide: () => {},
    加载完成页信息: async () => {}, 构建拼写答案HTML: async html => html.replace('[[type:Updated]]', 'new-expected-answer'),
    调度器服务实例: { 描述下一档状态: async () => ['1m', '5m', '1d', '4d'], 获取队首卡片: async () => ({ newCount: 12, learningCount: 3, reviewCount: 4,
      cards: store.empty ? [] : [{ cardId: store.id, noteId: 42, templateIdx: 1, states: 'new-states' }] }) },
    卡片渲染服务实例: { 渲染既有卡片: async () => {
      store.renders++; return { css: store.css, questionNodes: [store.front], answerNodes: [store.back] };
    } },
    网页控制器: { loadData: html => displayed.push(html), runJavaScript: async () => {} }, 取文案: key => key,
    笔记服务实例: { 更新笔记: async notes => { store.front = notes[0].fields[0]; store.back = notes[0].fields[1]; } }
  });
  return { page, store, displayed };
}

async function settle(page) {
  for (let step = 0; step < 20; step++) {
    await new Promise(resolve => setImmediate(resolve));
    if (!page.contentRefreshInFlight) return;
  }
  assert.fail('refresh did not settle');
}

test('returning without an AI notification reloads actual front, back, CSS and scheduling from backend', async () => {
  for (const phase of ['question', 'answer']) {
    const { page, store, displayed } = harness(phase);
    hidden.call(page);
    Object.assign(store, { front: 'edited-front', back: 'edited-back', css: 'edited-css' });
    shown.call(page); await settle(page);
    assert.equal(store.renders, 1);
    assert.equal(page.正面HTML, 'edited-css:edited-front');
    assert.equal(page.背面HTML, 'edited-css:edited-back');
    assert.equal(displayed.at(-1), phase === 'answer' ? page.背面HTML : page.正面HTML);
    assert.equal(page.阶段, phase);
    assert.equal(page.当前卡片.states, 'new-states');
    assert.deepEqual([page.新卡剩余, page.学习中剩余, page.复习剩余], [12, 3, 4]);
    assert.equal(page.拼写字段名, '');
    assert.equal(page.已输入答案, '');
  }
});

test('manual editor save reaches Web with new field content instead of a mocked reload', async () => {
  const { page, displayed } = harness('answer');
  page.noteEditorVisible = true;
  page.editingNote = { id: 42, guid: 'g', notetypeId: 9, mtimeSecs: 0, usn: 0 };
  assert.equal(await page.saveNoteEdits(['saved-front', 'saved-back'], []), true);
  assert.equal(displayed.at(-1), 'old-css:saved-front');
  assert.equal(page.背面HTML, 'old-css:saved-back');
  assert.equal(page.noteEditorVisible, false);
});

test('changed spelling template refreshes expected-answer metadata and the displayed answer', async () => {
  const { page, store, displayed } = harness('answer');
  hidden.call(page); store.back = '[[type:Updated]]'; shown.call(page); await settle(page);
  assert.equal(page.拼写字段名, 'Updated');
  assert.equal(page.拼写卡片序号, 1);
  assert.equal(displayed.at(-1), 'old-css:new-expected-answer');
});

test('deleted or moved card uses the real new queue head, and an empty queue enters done', async () => {
  const { page, store, displayed } = harness('answer');
  hidden.call(page); store.id = 8; store.front = 'next-card'; shown.call(page); await settle(page);
  assert.equal(page.当前卡片.cardId, 8);
  assert.equal(page.阶段, 'question');
  assert.equal(displayed.at(-1), 'old-css:next-card');
  hidden.call(page); store.empty = true; shown.call(page); await settle(page);
  assert.equal(page.阶段, 'done');
  assert.equal(page.当前卡片, null);
  // 完成页允许透出主题背景，但不能再显示上一张卡：清空渲染状态并让 Web 载入空白文档。
  assert.deepEqual([page.正面HTML, page.背面HTML, page.已渲染], ['', '', null]);
  assert.deepEqual(page.按钮文案, []);
  assert.match(displayed.at(-1) ?? '', /^<!DOCTYPE html>/,
    'empty queue must replace the previous card document instead of leaving it on the finished page');
});

test('notification during an in-flight render is replayed without concurrent refreshes', async () => {
  const { page, store } = harness();
  let finish, calls = 0;
  page.卡片渲染服务实例.渲染既有卡片 = async () => {
    calls++;
    const rendered = { css: store.css, questionNodes: [store.front], answerNodes: [store.back] };
    if (calls === 1) await new Promise(resolve => { finish = resolve; });
    return rendered;
  };
  hidden.call(page); shown.call(page);
  await new Promise(resolve => setImmediate(resolve));
  store.front = 'latest-front'; page.卡片内容变更信号 = 1; page.卡片内容变更_回调();
  assert.equal(calls, 1);
  finish(); await settle(page);
  assert.equal(calls, 2);
  assert.equal(page.正面HTML, 'old-css:latest-front');
});

test('refresh failure displays the existing error state rather than leaving old content active', async () => {
  const { page } = harness();
  page.卡片渲染服务实例.渲染既有卡片 = async () => { throw new Error('read failed'); };
  hidden.call(page); shown.call(page); await settle(page);
  assert.equal(page.阶段, 'error');
  assert.equal(page.错误详情, 'read failed');
  assert.equal(page.评分中, false);
});
