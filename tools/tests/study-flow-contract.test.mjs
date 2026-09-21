// SPDX-License-Identifier: AGPL-3.0-or-later

// 复习流程链路契约测试（M7）：
// - 调度器服务/卡片渲染服务 只经 后端会话 走正确服务/方法索引；
// - 学习卡片HTML构建器 为纯函数：节点流 → HTML，媒体相对路径重写到自建域名；
// - 学习页.ets 走完整链路（取卡→渲染→文案→评分→下一张），Web 组件配置防跨域；
// - 首页.ets 通过 Navigation + NavPathStack 跳转 学习页（API 12 推荐写法，替代废弃 router）。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { encodeDeckId } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { decodeCountsForDeckToday } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  构建卡片HTML,
  提取拼写标记,
  媒体基地址,
  原始侧HTML,
  重写媒体地址
} from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import {
  decodeExtractAvTagsResponse,
  encodeExtractAvTagsRequest
} from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const SCHEDULER = 'entry/src/main/ets/backend/调度器服务.ts';
const RENDERING = 'entry/src/main/ets/backend/卡片渲染服务.ts';
const STUDY_PAGE = 'entry/src/main/ets/pages/学习页.ets';
const MEDIA_HELPER = 'entry/src/main/ets/utils/媒体响应助手.ets';
const INDEX_PAGE = 'entry/src/main/ets/pages/首页.ets';
const MAIN_PAGES = 'entry/src/main/resources/base/profile/main_pages.json';
const STRINGS = 'entry/src/main/resources/base/element/string.json';
const AI_PAGE = 'entry/src/main/ets/pages/AI制卡页.ets';

test('scheduler service walks the study queue contract', () => {
  const service = read(SCHEDULER);

  assert.match(service, /async 获取队首卡片\(牌组ID: number\): Promise<QueuedCardsView>/);
  assert.match(service, /牌组方法\.设置当前牌组/, 'must select deck before queueing');
  assert.match(service, /调度器方法\.获取队首卡片/);
  assert.match(service, /encodeGetQueuedCardsRequest\(1, false\)/, 'fetch one card at a time');
  assert.match(service, /调度器方法\.描述下一档状态/);
  assert.match(service, /encodeSchedulingStates\(状态字节\)/, 'states passthrough for labels');
  assert.match(service, /调度器方法\.提交评分/);
  assert.match(service, /encodeCardAnswer\(作答参数\)/);
  assert.doesNotMatch(service, /new 后端客户端/, 'must go through 后端会话');
});

test('card rendering service wraps RenderExistingCard and ExtractAvTags', () => {
  const service = read(RENDERING);

  assert.match(service, /async 渲染既有卡片\(卡片ID: number\): Promise<RenderedCard>/);
  assert.match(service, /卡片渲染方法\.渲染既有卡片/);
  assert.match(service, /encodeRenderExistingCardRequest\(卡片ID\)/);
  assert.match(service, /async extractAudioTags\(html: string, question: boolean\): Promise<AvTagsResult>/);
  assert.match(service, /卡片渲染方法\.提取音视频标签/);
  assert.match(service, /encodeExtractAvTagsRequest\(html, question\)/);
  assert.doesNotMatch(service, /new 后端客户端/);
});

test('deck id encoder matches decks.DeckId wire format', () => {
  // did=300 (varint 0xAC 0x02)，tag = field1 << 3 | 0 = 0x08
  assert.deepEqual(Array.from(encodeDeckId(300)), [0x08, 0xAC, 0x02]);
  assert.deepEqual(Array.from(encodeDeckId(0)), [], 'proto3 default omitted');
});

test('html builder assembles nodes, css and media base url', () => {
  const rendered = {
    questionNodes: [
      { text: '<div class="front">', replacement: null },
      { text: null, replacement: { fieldName: 'Front', currentText: '猫 <img src="neko.png">', filters: [] } },
      { text: '</div>', replacement: null }
    ],
    answerNodes: [
      { text: null, replacement: { fieldName: 'Back', currentText: 'cat <a href="sound.mp3">play</a>', filters: [] } }
    ],
    css: '.card { color: black; }',
    latexSvg: false,
    isEmpty: false
  };

  const question = 构建卡片HTML(rendered, 'question');
  assert.match(question, /<!DOCTYPE html>/);
  assert.match(question, /<style>[^<]*\.card \{ color: black; \}[^<]*<\/style>/);
  assert.match(question, /猫 <img src="https:\/\/jidecards-media\.local\/neko\.png">/);
  assert.match(question, /<div class="front">/);

  const answer = 构建卡片HTML(rendered, 'answer');
  assert.match(answer, /href="https:\/\/jidecards-media\.local\/sound\.mp3"/);
  assert.ok(!answer.includes('neko.png'), 'answer side must not include question nodes');
});

test('media url rewrite skips absolute urls and anchors', () => {
  const html = '<img src="https://cdn.example.com/a.png"><img src="/abs.png">' +
    '<a href="#section">x</a><img src="空格 图.png">';
  const out = 重写媒体地址(html);
  assert.match(out, /src="https:\/\/cdn\.example\.com\/a\.png"/, 'absolute http untouched');
  assert.match(out, /src="\/abs\.png"/, 'absolute path untouched');
  assert.match(out, /href="#section"/, 'anchor untouched');
  assert.match(out, new RegExp(`src="${媒体基地址.replaceAll('.', '\\.')}${encodeURIComponent('空格 图.png')}"`),
    'relative media names are rewritten and uri-encoded');
});

test('html builder strips [sound:] tags, playback left to native player', () => {
  const rendered = {
    questionNodes: [
      { text: '<div>front</div>', replacement: null }
    ],
    answerNodes: [
      { text: null, replacement: { fieldName: 'Back', currentText: 'hello [sound:word.mp3] world', filters: [] } }
    ],
    css: '',
    latexSvg: false,
    isEmpty: false
  };

  const html = 构建卡片HTML(rendered, 'answer');
  assert.ok(!html.includes('[sound:'), 'raw sound syntax must be consumed');
  assert.ok(!html.includes('<audio'), 'no web audio elements in native player scheme');
  assert.match(html, /class="sound-flag"/, 'a small marker stays where audio was');
  assert.match(原始侧HTML(rendered, 'answer'), /\[sound:word\.mp3\]/, 'raw side keeps tags for extraction');
});

test('type marker extraction accepts localized field names', () => {
  // 上游 type_filter 按建库时本地化字段名原样发出 [[type:...]]（rslib template_filters.rs），
  // 中文环境为 [[type:背面]] / [[type:cloze:文字]]，正则必须匹配非 ASCII 字段名。
  const 节点 = (文本) => [{ text: null, replacement: { fieldName: 'X', currentText: 文本, filters: [] } }];
  const 文本节点 = (文本) => [{ text: 文本, replacement: null }];

  // 生产路径：type 过滤器被后端消费后走 append_str_to_nodes 输出文本节点（rslib template.rs render_into）
  const 文本节点英文 = 提取拼写标记(文本节点('{{Front}}\n\n[[type:Back]]'));
  assert.ok(文本节点英文 !== null && 文本节点英文.fieldName === 'Back' && 文本节点英文.combining && !文本节点英文.cloze,
    'marker in a TEXT node must be found — this is how the backend actually delivers it');
  const 文本节点中文 = 提取拼写标记(文本节点('[[type:背面]]'));
  assert.ok(文本节点中文 !== null && 文本节点中文.fieldName === '背面' && 文本节点中文.combining && !文本节点中文.cloze);

  const 英文 = 提取拼写标记(节点('[[type:Back]]'));
  assert.ok(英文 !== null && 英文.fieldName === 'Back' && 英文.combining && !英文.cloze);

  const 中文 = 提取拼写标记(节点('[[type:背面]]'));
  assert.ok(中文 !== null && 中文.fieldName === '背面' && 中文.combining && !中文.cloze,
    'localized field name must be extracted or typing input silently disappears');

  const 填空 = 提取拼写标记(节点('[[type:cloze:文字]]'));
  assert.ok(填空 !== null && 填空.fieldName === '文字' && 填空.cloze && 填空.combining);

  const 不合并 = 提取拼写标记(节点('[[type:nc:Back]]'));
  assert.ok(不合并 !== null && 不合并.fieldName === 'Back' && !不合并.combining && !不合并.cloze);

  assert.equal(提取拼写标记(节点('plain text')), null);
  assert.equal(提取拼写标记(文本节点('no marker here')), null);
  assert.equal(提取拼写标记([{ text: null, replacement: null }]), null);
});

test('extract av tags wire format round-trips sound files in order', () => {
  const tag = (name) => {
    const w = new 协议写入器();
    w.写入字符串(1, name);
    return w.转为字节();
  };
  const w = new 协议写入器();
  w.写入字符串(1, 'stripped text');
  w.写入字节(2, tag('a.mp3'));
  w.写入字节(2, tag('b.ogg'));
  const out = decodeExtractAvTagsResponse(w.转为字节());
  assert.equal(out.text, 'stripped text');
  assert.deepEqual(out.soundFiles, ['a.mp3', 'b.ogg']);

  // 请求侧：questionSide=false 为 proto3 默认，不写字段
  assert.deepEqual(Array.from(encodeExtractAvTagsRequest('', false)), []);
});

test('sound player wraps AVPlayer as a serial queue player', () => {
  const player = read('entry/src/main/ets/utils/声音播放器.ets');
  assert.match(player, /media\.createAVPlayer\(\)/);
  assert.match(player, /async 播放队列\(路径列表: string\[\]\)/);
  assert.match(player, /async 重播\(\)/);
  assert.match(player, /async 释放\(\)/);
  assert.match(player, /播放器\.fdSrc = \{ fd: 文件\.fd, offset: 0, length: /);
  assert.match(player, /状态 === 'completed' \|\| 状态 === 'error'/, 'completed advances the queue');
});

test('study audio uses a shared mix-with-others audio session', () => {
  const coordinator = read('entry/src/main/ets/utils/AudioFocusCoordinator.ets');
  const soundPlayer = read('entry/src/main/ets/utils/声音播放器.ets');
  const ttsPlayer = read('entry/src/main/ets/utils/TTS播放器.ets');

  assert.match(coordinator, /CONCURRENCY_MIX_WITH_OTHERS/,
    'short study audio must not permanently stop background audio');
  assert.match(coordinator, /activateAudioSession\(strategy\)/, 'session activates before playback');
  assert.match(coordinator, /deactivateAudioSession\(\)/, 'session releases after all playback ends');
  assert.match(soundPlayer, /audioInterruptMode = audio\.InterruptMode\.SHARE_MODE/,
    'same-app audio streams share focus');
  assert.match(soundPlayer, /INTERRUPT_HINT_RESUME[\s\S]*?\.play\(\)/,
    'AVPlayer actively resumes after a temporary focus interruption');
  assert.match(soundPlayer, /音频焦点协调器\.beginPlayback\(this\)/);
  assert.match(soundPlayer, /音频焦点协调器\.endPlayback\(this\)/);
  assert.match(ttsPlayer, /音频焦点协调器\.beginPlayback\(this\)/);
  assert.match(ttsPlayer, /音频焦点协调器\.endPlayback\(this\)/);
});

test('study and preview share native audio lifecycle without Web autoplay', () => {
  const page = read(STUDY_PAGE);
  const preview = read('entry/src/main/ets/components/browser/卡片预览页.ets');
  for (const source of [page, preview]) {
    assert.match(source, /new CardAudioSession\(/);
    assert.match(source, /extractAudioTags/);
    assert.doesNotMatch(source, /mediaPlayGestureAccess/);
  }
  // 播放、重播、取消和销毁由 card-audio-session/页面运行测试验证。
  assert.doesNotMatch(page, /runJavaScript\([^)]*\.play\(/i);
  assert.match(page, /anki\.imageOcclusion\.setup\(\)/);
});

test('image occlusion IIFE exposes toggle and hides #toggle button (BUG-007)', () => {
  const builder = read('entry/src/main/ets/model/学习卡片HTML构建器.ts');
  // 上游 afmt 模板的 <button id="toggle"> 无 onclick，由 IIFE 在 setup() 中隐藏（2026-07-28 暂停切换功能）。
  assert.match(builder, /toggle:\s*function\s*\(\s*\)\s*\{/, 'anki.imageOcclusion.toggle method defined');
  assert.match(builder, /getElementById\(['"]toggle['"]\)/, '#toggle button looked up in setup');
  // 暂时隐藏按钮：Web focusable(false) 下 click/touchend 都存在事件转发问题
  assert.match(builder, /btn\.style\.display\s*=\s*['"]none['"]/, '#toggle button hidden via display=none');
  // 防重定义：if (window.anki.imageOcclusion) return 防止 hidden 状态被重定义丢失
  assert.match(builder, /if\s*\(window\.anki\.imageOcclusion\)\s*\{\s*return;\s*\}/,
    'IIFE does not redefine anki.imageOcclusion if already present');
});

test('study page wires the full review loop', () => {
  const page = read(STUDY_PAGE);

  assert.match(page, /pageDeckId: string = ''/, 'deck id arrives via Navigation param');
  assert.match(page, /this\.pathStack\.pop\(\)/, 'back goes through NavPathStack pop');
  assert.doesNotMatch(page, /router\.(getParams|pushUrl|back)\b/, 'deprecated router must be gone');
  assert.match(page, /确保已打开\(context\.filesDir\)/);
  assert.match(page, /studySession\.loadNext\(this\.牌组ID,/);
  // 卡片身份、渲染与状态对应关系由 study-lifecycle 的延迟回调测试验证。
  assert.match(page, /studySession\.answer\(/);
  assert.match(read('entry/src/main/ets/model/StudySessionController.ts'), /currentState: states\.current/, 'raw state passthrough on answer');
  assert.match(page, /snapshot\.card === null[\s\S]*?阶段 = 'done'/, 'empty queue reaches done phase');
  assert.match(page, /this\.评分中 = true/, 'rating must be reentrancy-guarded');
});

test('study page web component blocks file-protocol cross origin correctly', () => {
  const page = read(STUDY_PAGE);

  // BUG-008 修复（2026-07-30）：src 必须为空字符串。
  // 旧实现 src=媒体基地址 会在 onControllerAttached 后自动加载 https://jidecards-media.local/，
  // 与 aboutToAppear 中的 loadData(data: URL) 竞争导致首卡渲染被初始空加载覆盖。
  // 跨域拦截由 onInterceptRequest + loadData baseUrl=媒体基地址 负责，与 Web 组件 src 无关。
  assert.match(page, /Web\(\{ src: '', controller: this\.网页控制器 \}\)/);
  assert.match(page, /\.fileAccess\(true\)/);
  assert.match(page, /\.javaScriptAccess\(true\)/);
  assert.match(page, /\.onInterceptRequest\(/);
  assert.match(page, /loadData\([^,]+, 'text\/html', 'UTF-8', 媒体基地址, ' '\)/);
  assert.match(page, /interceptMediaRequest\(event\.request, this\.媒体目录, 媒体基地址\)/);
  assert.match(page, /collection\.media/, 'media dir points at the anki media folder');
});

test('media helper retains MIME inference for card assets', () => {
  const helper = read(MEDIA_HELPER);

  assert.match(helper, /export function 取MIME类型\(文件名: string\): string/);
  assert.match(helper, /'png': 'image\/png'/);
  assert.match(helper, /'mp3': 'audio\/mpeg'/);
  assert.match(helper, /application\/octet-stream/, 'unknown extensions fall back');
  // HTTP 状态、范围正文、IO 失败和句柄归属由 media-response 行为测试验证。
});

test('study page is registered and reachable from home', () => {
  const mainPages = JSON.parse(read(MAIN_PAGES));
  assert.ok(mainPages.src.includes('pages/首页'), '首页 must be registered');
  assert.ok(!mainPages.src.includes('pages/学习页'),
    '学习页 is a NavDestination, not a router page');

  const index = read(INDEX_PAGE) + read('entry/src/main/ets/backend/HomeDataRepository.ets');
  assert.match(index, /Navigation\(this\.页面栈\)/);
  assert.match(index, /\.navDestination\(this\.页面映射\)/);
  assert.match(index, /name: 'StudyPage'/);
  assert.match(index, /deckId: this\.选中的牌组ID/);
  assert.match(index, /deckName: 牌组显示名\(this\.选中牌组\(\)\)/,
    'deckName follows UI display name (covers user-customized aliases)');
  assert.match(index, /onPop[\s\S]{0,120}?返回主页后刷新\(\)/,
    'home refreshes after returning from study (返回主页后刷新 internally calls 加载主页数据)');
  assert.doesNotMatch(index, /router\.pushUrl/, 'deprecated router must be gone');
});

test('study strings are resourced', () => {
  const strings = read(STRINGS);
  for (const key of ['study_back', 'study_show_answer', 'study_remaining_detail',
    'study_finish_title', 'study_finish_hint', 'study_load_error', 'study_replay_sound',
    'rating_again', 'rating_hard', 'rating_good', 'rating_easy']) {
    assert.match(strings, new RegExp(`"name": "${key}"`), `missing string ${key}`);
  }

  const page = read(STUDY_PAGE);
  assert.doesNotMatch(page, /\.fontSize\(\d/, 'page must use dimension tokens');
  assert.match(page, /应用尺寸/);
  assert.match(page, /app\.string\.study_show_answer/);
  assert.match(page, /app\.string\.study_finish_title/);
  assert.match(page, /app\.string\.study_load_error/);
});

test('study page reconciles the current card and queue after an Agent edit', () => {
  // 回归：改卡返回学习页后仍显示旧卡片。根因是刷新只挂在 NavPathStack.onPop 上，
  // 而 onPop 在本项目已知偶发不触发（BUG-006 同类）。现在要求双通道：
  // AI 页广播 cardContentChangedTick + NavDestination.onShown 消费。
  const page = read(STUDY_PAGE);
  const ai = read(AI_PAGE);

  // 通道一：改卡写入成功后广播；学习页用 @StorageLink + @Watch 接收。
  assert.match(ai,
    /if \(this\.pageMode === 'edit'\) \{\s*AppStorage\.setOrCreate<number>\('cardContentChangedTick', Date\.now\(\)\);\s*\}/,
    'the Agent page must broadcast card content changes in edit mode only');
  assert.match(page, /@StorageLink\('cardContentChangedTick'\) @Watch\('卡片内容变更_回调'\)/,
    'study page must watch the Agent edit broadcast');

  // 通道二：NavDestination 回到前台时消费（onPageShow 只对 @Entry 生效，必须用 onShown）。
  // onShown/onHidden 的实际行为由 study-content-refresh 运行测试验证。
  assert.match(page, /\.onHidden\(\(\): void => \{[\s\S]{0,120}?页面已显示 = false/);

  // 多通道只允许刷新一次：onPop 与 @Watch 都只置位，渲染 RPC 由 消费待重渲染 统一发起。
  assert.match(page, /onPop[\s\S]{0,120}?待重渲染当前卡 = true/);

  assert.equal((page.match(/this\.刷新编辑后当前卡\(\)/g) ?? []).length, 1,
    'only 消费待重渲染 may fire the re-render; double firing wastes a render RPC');

  // 返回后先核对真实队首：普通改字段保留当前阶段；删除/移走当前卡则加载新队首。
  const refresh = page.match(/private async 刷新编辑后当前卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(refresh, /await this\.加载下一张卡\(\)/);
  assert.match(refresh, /wasAnswer && this\.当前卡片\?\.cardId === currentCardId/);
  assert.match(refresh, /await this\.显示答案\(\)/);
  const load = page.match(/private async 加载下一张卡\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(load, /studySession\.loadNext/);
  assert.match(load, /snapshot\.rendered/);
  assert.match(load, /this\.新卡剩余 = snapshot\.queue\.newCount/);
  assert.match(load, /this\.学习中剩余 = snapshot\.queue\.learningCount/);
  assert.match(load, /this\.复习剩余 = snapshot\.queue\.reviewCount/);

  assert.doesNotMatch(refresh, /this\.评分\(|埋藏或暂停/,
    'queue reconciliation must not answer, bury, or suspend a card');
});

test('counts for deck today decodes new and review tallies', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 7);
  w.写入变长整数(2, 23);
  const counts = decodeCountsForDeckToday(w.转为字节());
  assert.equal(counts.newCount, 7);
  assert.equal(counts.reviewCount, 23);

  assert.deepEqual(decodeCountsForDeckToday(new Uint8Array(0)), { newCount: 0, reviewCount: 0 });
});

test('scheduler service exposes deck today counts via scheduler method 10', () => {
  const service = read(SCHEDULER);
  assert.match(service, /async 获取牌组今日计数\(牌组ID: number\): Promise<DeckTodayCounts>/);
  assert.match(service, /调度器方法\.牌组今日计数/);
  assert.match(service, /encodeDeckId\(牌组ID\)/);
});

test('home sources completed today from graphs.today.answerCount instead of per-deck RPCs', () => {
  // 旧实现 sumCompletedToday 只迭代顶层牌组调用 countsForDeckToday，既漏子牌组学习、
  // 又缺 learn/relearn 口径；新实现直接用 graphs.today.answerCount（全库聚合、完整口径）。
  const index = read(INDEX_PAGE) + read('entry/src/main/ets/backend/HomeDataRepository.ets');
  assert.doesNotMatch(index, /sumCompletedToday/,
    'sumCompletedToday must be removed; today.answerCount replaces it');
  assert.doesNotMatch(index, /调度器服务实例\.获取牌组今日计数/,
    'home must not call 获取牌组今日计数; graphs.today already aggregates all decks');
  assert.match(index, /构建主页快照\(tree, graphs/);
});
