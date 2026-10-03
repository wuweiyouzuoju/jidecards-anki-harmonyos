// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { CardAudioSession } from '../../entry/src/main/ets/model/CardAudioSession.ts';
import { buildPreviewInteractionScript } from '../../entry/src/main/ets/model/PreviewInteraction.ts';
import { renderPreviewAnswer } from '../../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { 构建卡片HTML, 剥除拼写标记, 原始侧HTML } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = read('entry/src/main/ets/components/browser/卡片预览页.ets');
test('preview overlay admits child input while keeping loading input blocked', () => {
  // ArkUI Block excludes descendants from hit testing: the page and retry overlay
  // must accept their children. These are wiring checks, not native touch tests.
  const root = source.slice(source.lastIndexOf('  build() {'));
  const loading = source.slice(source.indexOf('// Loading 覆盖层'), source.indexOf('// 错误覆盖层'));
  const error = source.slice(source.indexOf('// 错误覆盖层'), source.indexOf('  private 底部条()'));
  assert.doesNotMatch(root, /hitTestBehavior\(HitTestMode\.Block\)/,
    'root Block makes close, more, menu items and Web untouchable');
  assert.doesNotMatch(error, /hitTestBehavior\(HitTestMode\.Block\)/,
    'error overlay Block makes its Retry button untouchable');
  assert.match(loading, /hitTestBehavior\(HitTestMode\.Block\)/,
    'loading must still prevent interaction with stale card content');
});
const names = ['aboutToAppear', 'aboutToDisappear', 'updateActivity', 'stopAudio', 'playCurrentAudio',
  '预览刷新版本变化', '取当前卡片ID', '加载当前卡', '应用HTML', 'webFailed', 'installActionBridge', 'onControllerAttached回调',
  '翻面', '上一张', '下一张', '请求编辑字段', '请求AI改卡', '预览更多菜单', 'focusPreviewCard', 'dismissMoreMenu'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`^  (?:private )?(?:async )?${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('构建卡片HTML', '剥除拼写标记', '原始侧HTML', '媒体基地址',
  '解码文件名', 'buildPreviewInteractionScript', 'renderPreviewAnswer', '$r', 'PreviewActionProxy', 'console',
  stripTypeScriptTypes(`class Page {${methods.join('\n')}}`, { mode: 'transform' }) + '\nreturn Page;')(
  构建卡片HTML, 剥除拼写标记, 原始侧HTML, 'https://jidecards-media.local/',
  name => { try { return decodeURIComponent(name); } catch { return name; } },
  buildPreviewInteractionScript, renderPreviewAnswer, key => key,
  class { onAction(action, version) { this.dispatch(action, version); } },
  // 故障注入的预期日志只留在替身中，避免 Windows Node 测试 IPC 与多字节 stdout 混写。
  { info() {} }
);
const card = id => ({ questionNodes: [{ text: `front-${id}[sound:%E4%B8%AD.mp3]`, replacement: null }],
  answerNodes: [{ text: `back-${id}[sound:back.mp3]`, replacement: null }], css: '', latexSvg: false, isEmpty: false });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function settle(page) { for (let i = 0; i < 8; i++) { await new Promise(r => setImmediate(r)); } }

function harness() {
  const page = new Page(), displayed = [], sounds = [], tts = [], renderedIds = [], events = [];
  const service = {
    渲染既有卡片: async id => { renderedIds.push(id); return card(id); },
    extractAudioTags: async (raw, question) => ({ soundFiles: [question ? '%E4%B8%AD.mp3' : 'back.mp3'],
      ttsItems: [{ text: question ? 'front speech' : 'back speech', language: 'en_US' }] })
  };
  Object.assign(page, {
    mounted: true, loadVersion: 0, documentVersion: 0, bridgeReady: false, audioRefreshPending: false,
    previewIds: [11, 22, 33], 卡片ID列表: [11, 22, 33], 当前索引值: 0, 初始索引: 0,
    当前面: 'question', 正面HTML: '', 背面HTML: '',
    忙碌: false, 错误详情: '', audioError: '', hasAudio: false, 已渲染: null,
    待加载HTML: '', 控制器已挂载: true,
    interactionEnabled: true, foreground: true, isDark: false, 媒体目录: '/media',
    onPositionChanged: index => events.push(['position', index]),
    onBackHandlerChange: () => {},
    onEditField: id => events.push(['edit', id]), 取本地化文案: key => key,
    soundPlayer: { waitForCompletion: async () => {}, 停止: async () => events.push('sound stop'), 释放: async () => events.push('sound release'),
      播放队列: async paths => sounds.push(paths) },
    ttsPlayer: { waitForCompletion: async () => {}, 停止: async () => events.push('tts stop'), 释放: async () => events.push('tts release'),
      播放队列: async items => tts.push(items) },
    卡片渲染服务实例: new Proxy(service, { get(target, key) {
      assert.ok(key in target, `unexpected service call: ${String(key)}`); return target[key];
    } }),
    网页控制器: { loadData: html => displayed.push(html), runJavaScript: async script => events.push(script),
      registerJavaScriptProxy: proxy => { page.proxy = proxy; } }
  });
  page.audioSession = new CardAudioSession(page.soundPlayer, page.ttsPlayer, (raw, question) => service.extractAudioTags(raw, question));
  page.cardWeb = { reset() {}, attach() {}, show: html => page.网页控制器.loadData(html) };
  return { page, displayed, sounds, tts, renderedIds, events, service };
}

test('both preview hosts dismiss the open menu before leaving preview and release the handler on unmount', async () => {
  const { page } = harness();
  let handler = null;
  page.onBackHandlerChange = value => { handler = value; };
  page.aboutToAppear(); await settle(page);
  assert.equal(typeof handler, 'function');
  for (const [file, visible] of [['首页', '显示卡片预览'], ['浏览页', '显示预览']]) {
    const hostSource = read(`entry/src/main/ets/pages/${file}.ets`);
    const start = hostSource.indexOf('  onBackPress(): boolean {');
    const method = hostSource.slice(start, hostSource.indexOf('\n  }', start) + 4);
    const Host = new Function(stripTypeScriptTypes(`class Host {${method}}`) + '; return Host;')();
    const host = Object.assign(new Host(), { [visible]: true, previewBackHandler: handler,
      transfer: { phase: 'idle' }, batchDialog: 'none', editor: { visible: false, busy: false } });
    page.moreMenuOpen = true;
    assert.equal(host.onBackPress(), true);
    assert.equal(page.moreMenuOpen, false);
    assert.equal(host[visible], true, 'first back only closes the menu');
    assert.equal(host.onBackPress(), true);
    assert.equal(host[visible], false, 'second back leaves preview');
    assert.match(hostSource, /onBackHandlerChange:[^\n]*this\.previewBackHandler = handler/);
  }
  page.moreMenuOpen = true;
  page.aboutToDisappear();
  assert.equal(handler, null);
  assert.equal(page.moreMenuOpen, false);
});

test('preview loads the question first and caches the answer for flipping, one side of audio at a time', async () => {
  const { page, displayed, sounds, tts } = harness();
  await page.加载当前卡(); await settle(page);
  assert.equal(page.当前面, 'question');
  assert.match(displayed.at(-1), /front-11/);
  assert.doesNotMatch(displayed.at(-1), /back-11/, 'the answer is not concatenated into the question document');
  assert.deepEqual(sounds.at(-1), ['/media/中.mp3']);
  assert.deepEqual(tts.at(-1).map(item => item.text), ['front speech']);
  page.翻面(); await settle(page);
  assert.equal(page.当前面, 'answer');
  assert.match(displayed.at(-1), /back-11/);
  assert.deepEqual(sounds.at(-1), ['/media/back.mp3']);
  assert.deepEqual(tts.at(-1).map(item => item.text), ['back speech']);
  page.playCurrentAudio(); await settle(page);
  assert.equal(sounds.length, 3);
  assert.equal(page.hasAudio, true);
});

test('next/previous follow the Anki preview state machine', async () => {
  const { page, displayed, renderedIds } = harness();
  await page.加载当前卡(); await settle(page);
  page.下一张(); await settle(page);
  assert.equal(page.当前面, 'answer', 'next on the question side reveals the answer');
  assert.equal(page.当前索引值, 0);
  assert.match(displayed.at(-1), /back-11/);
  page.下一张(); await settle(page);
  assert.equal(page.当前索引值, 1, 'next on the answer side moves to the next card');
  assert.equal(page.当前面, 'question');
  assert.equal(renderedIds.at(-1), 22);
  assert.match(displayed.at(-1), /front-22/);
  page.上一张(); await settle(page);
  assert.equal(page.当前索引值, 0, 'previous on the question side moves to the previous card');
  assert.equal(page.当前面, 'question');
  assert.match(displayed.at(-1), /front-11/);
  page.下一张(); await settle(page); page.上一张(); await settle(page);
  assert.equal(page.当前面, 'question', 'previous on the answer side returns to the question');
  assert.equal(page.当前索引值, 0);
  assert.match(displayed.at(-1), /front-11/);
  assert.doesNotMatch(displayed.at(-1), /back-11/);
});

test('typing preview reveals the expected answer for normal, nc and numbered cloze cards', async () => {
  for (const [marker, field, ordinal, expected] of [
    ['[[type:背面]]', '<b>correct &amp; safe</b>', 0, 'correct &amp; safe'],
    ['[[type:nc:背面]]', 'café', 0, 'café'],
    ['[[type:cloze:背面]]', '{{c1::first}} / {{c2::second}}', 1, 'second']
  ]) {
    const { page, displayed, service } = harness();
    service.渲染既有卡片 = async () => ({...card(11),
      questionNodes: [{text: `Question${marker}`, replacement: null}],
      answerNodes: [{text: `Question<hr id="answer">${marker}`, replacement: null}]});
    page.卡片服务实例 = {获取卡片: async id => { assert.equal(id, 11); return {noteId: 101, templateIdx: ordinal}; }};
    page.笔记服务实例 = {获取笔记: async id => { assert.equal(id, 101); return {notetypeId: 201, fields: ['Question', field]}; }};
    page.笔记类型服务实例 = {获取笔记类型: async id => { assert.equal(id, 201); return {fieldNames: ['正面', '背面']}; }};
    await page.加载当前卡(); await settle(page);
    const body = html => html.slice(html.indexOf('<body')).split('<script>')[0].replace(/<style>[\s\S]*?<\/style>/g, '');
    assert.doesNotMatch(body(displayed.at(-1)), /\[\[type:|id=typeans/);
    page.翻面(); await settle(page);
    assert.ok(body(displayed.at(-1)).includes(expected), `${marker} must reveal ${expected}`);
    assert.match(body(displayed.at(-1)), /id=typeans/);
    assert.doesNotMatch(body(displayed.at(-1)), /\[\[type:|<b>|first|typeBad/);
  }
});

test('typing answer reads cannot overwrite a newer preview or display after closing', async () => {
  for (const close of [false, true]) {
    const { page, displayed, service } = harness(), slow = deferred();
    service.渲染既有卡片 = async id => id === 11 ? {...card(id),
      questionNodes: [{text: 'Q[[type:Back]]', replacement: null}],
      answerNodes: [{text: 'Q<hr>[[type:Back]]', replacement: null}]} : card(id);
    page.卡片服务实例 = {获取卡片: async () => ({noteId: 101, templateIdx: 0})};
    page.笔记服务实例 = {获取笔记: () => slow.promise};
    page.笔记类型服务实例 = {获取笔记类型: async () => ({fieldNames: ['Back']})};
    const loading = page.加载当前卡(); await settle(page);
    if (close) page.aboutToDisappear(); else { page.下一张(); await settle(page); }
    slow.resolve({notetypeId: 201, fields: ['stale typing answer']});
    await loading; await settle(page);
    assert.equal(displayed.length, close ? 0 : 1);
    if (!close) {
      assert.match(displayed[0], /front-22/);
      assert.doesNotMatch(page.背面HTML, /stale typing answer/);
      assert.equal(page.已渲染.questionNodes[0].text, card(22).questionNodes[0].text);
    }
  }
});

test('editing preserves card identity even when search results reorder or remove the card', async () => {
  const { page, displayed, renderedIds, service } = harness();
  page.初始索引 = 1; page.aboutToAppear(); await settle(page);
  page.卡片ID列表 = [33, 11];
  service.渲染既有卡片 = async id => { renderedIds.push(id); const result = card(id); result.css = '/* updated */'; return result; };
  page.预览刷新版本变化(); await settle(page);
  assert.equal(renderedIds.at(-1), 22);
  assert.equal(page.当前面, 'question');
  assert.match(displayed.at(-1), /front-22/);
  assert.match(displayed.at(-1), /updated/);
  page.下一张(); await settle(page);
  assert.equal(page.当前面, 'answer');
  assert.match(displayed.at(-1), /back-22/);
  page.下一张(); await settle(page);
  assert.equal(renderedIds.at(-1), 33);
  assert.equal(page.当前面, 'question');
  assert.match(displayed.at(-1), /front-33/);
});

test('rapid navigation discards stale successes and failures while allowing skip during loading', async () => {
  for (const fails of [false, true]) {
    const { page, service, displayed } = harness(), slow = deferred();
    service.渲染既有卡片 = id => id === 11 ? slow.promise : Promise.resolve(card(id));
    const old = page.加载当前卡(); page.下一张(); await settle(page);
    assert.match(displayed.at(-1), /front-22/);
    if (fails) slow.reject(new Error('old failure')); else slow.resolve(card(11));
    await old; await settle(page);
    assert.equal(displayed.length, 1);
    assert.equal(page.错误详情, ''); assert.equal(page.忙碌, false);
  }
});

test('render failures offer retry and never block skipping a broken card', async () => {
  const { page, service, displayed } = harness();
  service.渲染既有卡片 = async () => { throw new Error('missing card'); };
  await page.加载当前卡(); await settle(page);
  assert.notEqual(page.错误详情, ''); assert.equal(page.忙碌, false);
  service.渲染既有卡片 = async id => card(id);
  await page.加载当前卡(); await settle(page);
  assert.equal(page.错误详情, ''); assert.match(displayed.at(-1), /front-11/);
  page.webFailed(); page.下一张(); await settle(page);
  assert.equal(page.错误详情, ''); assert.match(displayed.at(-1), /front-22/);
});

test('Web attach consumes cached HTML; loadData failure becomes visible and retry recovers', async () => {
  const { page, displayed } = harness();
  page.控制器已挂载 = false;
  await page.加载当前卡(); await settle(page);
  assert.equal(displayed.length, 0); assert.notEqual(page.待加载HTML, '');
  page.网页控制器.loadData = () => { throw new Error('controller unavailable'); };
  page.onControllerAttached回调();
  assert.notEqual(page.错误详情, '');
  page.网页控制器.loadData = html => displayed.push(html);
  await page.加载当前卡(); await settle(page);
  assert.equal(page.错误详情, ''); assert.match(displayed.at(-1), /front-11/);
});

test('closing during rendering or audio extraction prevents late display/playback and releases players', async () => {
  for (const pendingAudio of [false, true]) {
    const { page, service, displayed, sounds, tts, events } = harness(), slow = deferred();
    if (pendingAudio) service.extractAudioTags = () => slow.promise;
    else service.渲染既有卡片 = () => slow.promise;
    const loading = page.加载当前卡();
    await new Promise(r => setImmediate(r));
    page.aboutToDisappear();
    slow.resolve(pendingAudio ? { soundFiles: ['late.mp3'], ttsItems: [] } : card(11));
    await loading; await settle(page);
    assert.equal(displayed.length, pendingAudio ? 1 : 0);
    assert.equal(sounds.length, 0); assert.equal(tts.length, 0);
    assert.ok(events.includes('sound release')); assert.ok(events.includes('tts release'));
  }
});

test('audio extraction failure does not hide card content and replay retries the service', async () => {
  const { page, service, displayed, sounds } = harness();
  service.extractAudioTags = async () => { throw new Error('audio unavailable'); };
  await page.加载当前卡(); await settle(page);
  assert.notEqual(page.audioError, ''); assert.equal(page.错误详情, '');
  assert.match(displayed.at(-1), /front-11/);
  service.extractAudioTags = async (raw, question) => ({ soundFiles: [question ? '100%.mp3' : 'back.mp3'], ttsItems: [] });
  page.playCurrentAudio(); await settle(page);
  assert.equal(page.audioError, '');
  assert.deepEqual(sounds.at(-1), ['/media/100%.mp3']);
});

test('saving while the editor is still busy restores replay availability without autoplay after closing it', async () => {
  const { page, sounds } = harness();
  page.interactionEnabled = false;
  await page.加载当前卡(); await settle(page);
  assert.equal(page.audioRefreshPending, true); assert.equal(sounds.length, 0);
  page.interactionEnabled = true; page.updateActivity(); await settle(page);
  assert.equal(page.hasAudio, true); assert.equal(sounds.length, 0);
  page.playCurrentAudio(); await settle(page);
  assert.equal(sounds.length, 1);
});

test('editor and background suppress audio and paging; stale document callbacks cannot change the card', async () => {
  const { page, sounds, events } = harness();
  await page.加载当前卡(); page.onControllerAttached回调(); await settle(page);
  const version = page.documentVersion;
  page.interactionEnabled = false; page.updateActivity(); await settle(page);
  page.下一张(); page.playCurrentAudio(); await settle(page);
  assert.equal(page.当前索引值, 0); assert.equal(page.当前面, 'question'); assert.equal(sounds.length, 1);
  assert.ok(events.some(e => typeof e === 'string' && e.includes('m.pause()')));
  page.interactionEnabled = true; page.下一张(); await settle(page);
  assert.equal(page.当前索引值, 0); assert.equal(page.当前面, 'answer');
  assert.equal(sounds.length, 2);
  page.proxy.onAction('next', version - 1); await settle(page);
  assert.equal(page.当前索引值, 0, 'a stale document must not move the preview');
  assert.equal(page.当前面, 'answer');
  page.foreground = false; page.updateActivity(); page.playCurrentAudio(); await settle(page);
  assert.equal(sounds.length, 2);
});

function domHarness(version = 42) {
  const listeners = {}, actions = [];
  const window = { getSelection: () => '', jidePreview: { onAction: (...args) => actions.push(args) } };
  const document = { addEventListener: (name, fn) => { listeners[name] = fn; }, getElementById: () => null };
  vm.runInNewContext(buildPreviewInteractionScript(version), { window, document, Promise, setTimeout: fn => fn() });
  return { listeners, actions, window };
}

test('DOM clicks reveal the answer; controls, selection, drags and multi-touch stay inert', () => {
  const { listeners, actions, window } = domHarness();
  const plain = { tagName: 'DIV', parentElement: null, getAttribute: () => null };
  listeners.click({ target: plain });
  assert.deepEqual(actions, [['flip', 42]], 'tapping the card shows the answer');
  listeners.click({ target: { classList: { contains: name => name === 'sound-flag' } } });
  assert.deepEqual(actions.at(-1), ['replay', 42], 'the sound flag replays instead of flipping');
  for (const tagName of ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'AUDIO', 'VIDEO', 'IFRAME', 'SUMMARY', 'DETAILS']) {
    listeners.click({ target: { tagName: 'SPAN', parentElement: { tagName } } });
  }
  listeners.click({ target: { isContentEditable: true } });
  listeners.click({ target: { getAttribute: () => 'button' } });
  listeners.click({ target: plain, defaultPrevented: true });
  window.getSelection = () => 'selected text'; listeners.click({ target: plain }); window.getSelection = () => '';
  listeners.touchstart({ touches: [{ clientX: 0, clientY: 0 }], target: plain });
  listeners.touchmove({ touches: [{ clientX: 0, clientY: 50 }] }); listeners.click({ target: plain });
  listeners.touchstart({ touches: [{}, {}], target: plain }); listeners.click({ target: plain });
  assert.equal(actions.length, 2, 'only the plain tap and the sound flag act');
});

test('DOM keyboard switches cards with arrows without consuming typing', () => {
  const { listeners, actions } = domHarness();
  for (const key of ['ArrowRight', 'ArrowLeft']) listeners.keydown({ key, target: {}, preventDefault() {} });
  listeners.keydown({ key: ' ', target: {}, preventDefault() { assert.fail(); } });
  listeners.keydown({ key: ' ', target: { tagName: 'INPUT' }, preventDefault() { assert.fail(); } });
  listeners.keydown({ key: 'ArrowRight', target: {}, repeat: true, preventDefault() { assert.fail(); } });
  listeners.keydown({ key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault() { assert.fail(); } });
  listeners.keydown({ key: 'ArrowLeft', target: { isContentEditable: true }, preventDefault() { assert.fail(); } });
  assert.deepEqual(actions.map(a => a[0]), ['next', 'previous']);
});

test('horizontal swipe changes cards inside the document; vertical scrolls and controls keep native gestures', () => {
  const { listeners, actions } = domHarness();
  const plain = { tagName: 'DIV', parentElement: null, getAttribute: () => null };
  const swipe = (x0, y0, x1, y1, target = plain) => {
    listeners.touchstart({ touches: [{ clientX: x0, clientY: y0 }], target });
    listeners.touchmove({ touches: [{ clientX: x1, clientY: y1 }] });
    listeners.touchend({ changedTouches: [{ clientX: x1, clientY: y1 }] });
  };
  swipe(300, 400, 180, 410);
  swipe(180, 400, 300, 390);
  assert.deepEqual(actions.map(a => a[0]), ['next', 'previous']);
  // 滑动后紧随的合成 click 被 moved 抑制，不会顺带翻面
  listeners.click({ target: plain });
  assert.equal(actions.length, 2);
  // 竖向滚动、位移不足 48px、起点在链接/表单/画布上、双指，都不切卡
  swipe(300, 400, 296, 700);
  swipe(300, 400, 270, 405);
  swipe(300, 400, 180, 400, { tagName: 'CANVAS', parentElement: null, getAttribute: () => null });
  listeners.touchstart({ touches: [{ clientX: 300, clientY: 400 }, { clientX: 320, clientY: 400 }], target: plain });
  listeners.touchend({ changedTouches: [{ clientX: 300, clientY: 400 }, { clientX: 320, clientY: 400 }] });
  assert.equal(actions.length, 2);
});

test('preview matches Anki: no side buttons, question first, reveal by tap, swipe and keys outside ArkUI', () => {
  const bottom = source.match(/private 底部条\(\)[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(bottom, /browser_preview_previous|browser_preview_next|browser_preview_show_front/,
    'preview must not render previous/next/flip buttons');
  assert.doesNotMatch(bottom, /this\.上一张\(\)|this\.下一张\(\)|this\.翻面\(\)/);
  assert.match(bottom, /browser_preview_front/);
  assert.match(bottom, /browser_preview_back/);
  assert.match(bottom, /browser_preview_hint/);
  assert.doesNotMatch(source, /\.gesture\(|SwipeDirection\.Horizontal|处理滑动手势/,
    'swipe lives in the injected document script; ArkWeb would swallow an ArkUI gesture');
  // 只加载一面：题目在前，答案按需翻面（背面模板自带 {{FrontSide}}，不额外拼接）
  assert.match(source, /构建卡片HTML\(this\.已渲染, 'question', this\.isDark\)/);
  assert.match(source, /构建卡片HTML\(rendered, 'answer', this\.isDark\)/);
  assert.doesNotMatch(source, /构建双面卡片HTML/);
  // 顶部条统一为「关闭 / N/N / 更多」，不再有 DialogHeader 标题栏
  assert.doesNotMatch(source, /DialogHeader|browser_preview_title|browser_preview_edit_fields/);
  for (const file of ['entry/src/main/resources/base/element/string.json', 'entry/src/main/resources/en_US/element/string.json']) {
    const strings = read(file);
    assert.doesNotMatch(strings,
      /browser_preview_previous|browser_preview_next|browser_preview_show_front|browser_preview_title|browser_preview_edit_fields|browser_preview_both_sides|browser_preview_swipe_hint|browser_preview_flip_hint/,
      `stale preview strings must be removed from ${file}`);
    for (const key of ['browser_preview_front', 'browser_preview_back', 'browser_preview_hint']) {
      assert.match(strings, new RegExp(`"name": "${key}"`), `missing ${key} in ${file}`);
    }
  }
});

test('real arrow events reveal and hide answers before moving to another card', async () => {
  const { page } = harness();
  await page.加载当前卡(); await settle(page);
  const press = async (key, index, side) => {
    const dom = domHarness(page.documentVersion);
    dom.window.jidePreview = page.proxy;
    let consumed = false;
    dom.listeners.keydown({ key, target: {}, preventDefault() { consumed = true; } });
    await settle(page);
    assert.equal(consumed, true);
    assert.equal(page.当前索引值, index); assert.equal(page.当前面, side);
  };
  await press('ArrowLeft', 0, 'question');
  await press('ArrowRight', 0, 'answer');
  await press('ArrowLeft', 0, 'question');
  await press('ArrowRight', 0, 'answer');
  await press('ArrowRight', 1, 'question');
  await press('ArrowRight', 1, 'answer');
  await press('ArrowLeft', 1, 'question');
  await press('ArrowLeft', 0, 'question');
});

test('preview requests initial Web focus once and never steals it back on later flips', () => {
  const { page } = harness();
  let calls = 0;
  page.initialFocusPending = true;
  page.网页控制器.requestFocus = () => { calls++; };
  page.interactionEnabled = false; page.focusPreviewCard(); assert.equal(calls, 0);
  page.interactionEnabled = true; page.focusPreviewCard(); assert.equal(calls, 1);
  page.focusPreviewCard(); assert.equal(calls, 1);
  page.initialFocusPending = true;
  page.网页控制器.requestFocus = () => { throw new Error('not attached'); };
  page.focusPreviewCard(); assert.equal(page.initialFocusPending, true);
  assert.match(source, /new CardWebView\([\s\S]*?this\.focusPreviewCard\(\)/);
});

test('desktop preview advertises arrow keys while touch devices keep their swipe hint', () => {
  const expression = source.match(/private readonly desktopPreview: boolean = ([^;]+);/)[1];
  for (const deviceType of ['2in1', 'pc', 'phone', 'tablet']) {
    assert.equal(vm.runInNewContext(expression, { deviceInfo: { deviceType } }), ['2in1', 'pc'].includes(deviceType));
  }
  assert.match(source, /Text\(this\.desktopPreview \? \$r\('app.string.browser_preview_keyboard_hint'\) : \$r\('app.string.browser_preview_hint'\)\)/);
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string.map(item => [item.name, item.value]));
    assert.ok(strings.get('browser_preview_keyboard_hint'));
    if (locale === 'base') assert.match(strings.get('browser_preview_keyboard_hint'), /按左右方向键/);
  }
});

test('top-right preview menu replays audio and edits exactly the current card with AI', async () => {
  const { page } = harness();
  const edited = [];
  let replayed = 0;
  Object.assign(page, { agentEnabled: true, hasAudio: true, 当前索引值: 1,
    onEditWithAgent: id => edited.push(id), playCurrentAudio: () => { replayed++; } });
  const menu = page.预览更多菜单();
  const replay = menu.find(item => item.value === 'app.string.study_replay_sound');
  const agent = menu.find(item => item.value === 'app.string.ai_card_edit');
  assert.equal(replay.enabled, true);
  assert.equal(agent.enabled, true);
  replay.action(); agent.action();
  assert.equal(replayed, 1);
  assert.deepEqual(edited, [22]);
  page.interactionEnabled = false;
  assert.equal(page.预览更多菜单().find(item => item.value === 'app.string.ai_card_edit').enabled, false);
  page.请求AI改卡();
  assert.deepEqual(edited, [22]);
  page.agentEnabled = false;
  assert.ok(!page.预览更多菜单().some(item => item.value === 'app.string.ai_card_edit'));
  const bottom = source.match(/private 底部条\(\)[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(bottom, /study_replay_sound|Button\(/);
});

test('both preview hosts pass current card IDs to edit mode and restore preview on return', async () => {
  for (const [file, method, visible, ids, stack] of [
    ['首页', '关闭预览并进入AI改卡', '显示卡片预览', '预览卡片ID列表', '页面栈'],
    ['浏览页', '打开预览AI改卡', '显示预览', 'previewCardIds', 'pathStack']
  ]) {
    const hostSource = read(`entry/src/main/ets/pages/${file}.ets`);
    const start = hostSource.indexOf(`  private async ${method}(`);
    const body = hostSource.slice(start, hostSource.indexOf('\n  }', start) + 4);
    const Host = vm.runInNewContext(stripTypeScriptTypes(`class Host { ${body} }; Host;`));
    for (const configured of [true, false]) {
      const host = new Host(), paths = [];
      Object.assign(host, { [visible]: true, [ids]: [11, 22], 预览初始索引: 1, 预览刷新版本: 0,
        editor: { visible: false, busy: false }, [stack]: { pushPath: path => paths.push(path) },
        isAIConfigured: async () => configured, 暂停主页官方公告检查() {}, 返回主页后刷新() {}, 执行搜索() {} });
      await host[method](22);
      assert.equal(paths.length, 1);
      assert.equal(host[visible], false);
      assert.equal(paths[0].name, configured ? 'AiCardPage' : 'SettingsPage');
      if (configured) {
        assert.equal(paths[0].param.mode, 'edit');
        assert.deepEqual(Array.from(paths[0].param.cardIds), [22]);
      } else assert.equal(paths[0].param.openAiSettings, true);
      paths[0].onPop();
      assert.equal(host[visible], true);
      assert.equal(host.预览初始索引, 1);
      let finish;
      host.isAIConfigured = () => new Promise(resolve => { finish = resolve; });
      const pending = host[method](22);
      host.预览初始索引 = 0;
      finish(true); await pending;
      assert.equal(paths.length, 1, 'a stale preview target must not open another AI page');
    }
  }
});

test('preview wiring stays read-only, handles web errors, and preserves home/editor navigation', () => {
  assert.doesNotMatch(source, /调度器服务|提交答案|获取队首|更新卡片|更新笔记|revlog|SchedulingStates/);
  assert.doesNotMatch(source, /\.onClick\(\(\): void => \{ this\.翻面\(\); \}\)\s*\/\/ 左右滑/);
  assert.match(source, /event\.request\.isMainFrame\(\)/);
  assert.match(source, /onRenderExited/);
  assert.match(source, /browser_preview_retry/);
  assert.match(source, /if \(this\.agentEnabled\)/);
  assert.match(read('entry/src/main/ets/pages/浏览页.ets'), /interactionEnabled: !this\.editingPageOpen/);
  const home = read('entry/src/main/ets/pages/首页.ets');
  const editor = home.match(/private 关闭预览并编辑[\s\S]*?\n  }/)[0];
  assert.match(editor, /onPop:[\s\S]*this\.显示卡片预览 = true/);
  assert.match(home, /onPositionChanged:[\s\S]*this\.预览初始索引 = index/);
  const autoSync = home.match(/private tryAutoSync[\s\S]*?\n  }/)[0];
  assert.match(autoSync, /this\.syncController\.tryStart\(\)/);
  const syncHost = home.match(/private homeSyncHost[\s\S]*?\n  }/)[0];
  assert.match(syncHost, /activity:[^\n]*this\.homeActivity\(\)/);
  assert.match(read('entry/src/main/ets/model/HomeSyncPolicy.ts'), /canStartHomeAutoSync\(activity\)/);
  const activity = home.match(/private homeActivity[\s\S]*?\n  }/)[0];
  assert.match(activity, /this\.显示卡片预览/);
  assert.match(activity, /this\.预览加载中/);
});
