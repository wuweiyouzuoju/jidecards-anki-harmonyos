// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { 构建卡片HTML } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { MATH_ASSET_BASE } from '../../entry/src/main/ets/model/MathRendering.ts';
import * as codec from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 服务号, 卡片渲染方法 } from '../../entry/src/main/ets/backend/服务索引.ts';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const resources = 'entry/src/main/resources/rawfile/mathjax/';
const node = (text) => ({ text, replacement: null });
const card = (svg) => ({ questionNodes: [node('\\(x^2\\)')], answerNodes: [node('\\(\\ce{H2O}\\)')], css: '', latexSvg: svg, isEmpty: false });

test('both sides render math regardless of legacy SVG option, with theme and offline scripts', () => {
  for (const svg of [true, false]) {
    for (const side of ['question', 'answer']) {
      const html = 构建卡片HTML(card(svg), side, true);
      assert.match(html, /body class="card nightMode"/);
      assert.ok(html.indexOf('card-math.js') < html.indexOf('tex-svg-full.js'));
      assert.ok(html.indexOf('tex-svg-full.js') < html.indexOf('<body'));
      assert.doesNotMatch(html, /cdn\.jsdelivr|async src=/);
      assert.ok(html.includes(MATH_ASSET_BASE));
      assert.match(html, /overflow-x: auto/);
    }
  }
});

test('vendored component is byte-identical to the pinned manifest and embeds mhchem and SVG fonts', () => {
  const manifest = JSON.parse(read(resources + 'manifest.json'));
  assert.equal(manifest.version, '3.2.2');
  for (const [file, hash] of Object.entries(manifest.files)) {
    const bytes = readFileSync(new URL(`../../${resources}${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
  const bundle = read(resources + 'tex-svg-full.js');
  assert.ok(bundle.includes('MhchemConfiguration'));
  assert.ok(bundle.includes('output/svg/fonts/tex'));
  assert.match(read(resources + 'LICENSE'), /Apache License/);
});

test('MathJax runtime config preserves Anki delimiters and enables chemistry without network fonts', () => {
  const context = { window: {}, document: { addEventListener() {} } };
  vm.runInNewContext(read(resources + 'card-math.js'), context);
  const config = context.window.MathJax;
  assert.deepEqual(JSON.parse(JSON.stringify(config.tex.inlineMath)), [['\\(', '\\)'], ['$', '$']]);
  assert.ok(config.tex.packages.includes('mhchem'));
  assert.equal(config.loader.paths.mathjax + '/', MATH_ASSET_BASE);
  assert.equal(config.options.enableMenu, false);
  assert.ok(config.options.skipHtmlTags.includes('code'));
});

test('rawfile response only serves fixed assets and never falls through to user media or network', async () => {
  class Response {
    setResponseData(value) { this.data = value; }
    setResponseCode(value) { this.code = value; }
    setResponseEncoding(value) { this.encoding = value; }
    setResponseMimeType(value) { this.mime = value; }
    setReasonMessage(value) { this.reason = value; }
  }
  const source = read('entry/src/main/ets/utils/CardAssetResponse.ets')
    .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
  const context = { MATH_ASSET_BASE, WebResourceResponse: Response, $rawfile: (name) => name };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source), context);
  const jqueryUrl = 'https://jidecards-render.local/jquery/3.7.1/jquery.min.js';
  const jquery = context.interceptCardAsset(jqueryUrl);
  assert.equal(jquery.code, 200);
  assert.equal(jquery.data, 'jquery/jquery-3.7.1.min.js');
  assert.equal(jquery.mime, 'text/javascript');
  assert.equal(context.interceptCardAsset(jqueryUrl + '/private.js').code, 404);
  assert.equal(context.interceptCardAsset(jqueryUrl.replace('3.7.1', '0.0.0')).code, 404);
  for (const name of ['card-math.js', 'tex-svg-full.js', 'input/mml.js', 'input/mml/entities.js']) {
    const result = context.interceptCardAsset(MATH_ASSET_BASE + name);
    assert.equal(result.code, 200);
    assert.equal(result.data, 'mathjax/' + name);
    assert.equal(result.mime, 'text/javascript');
  }
  assert.equal(context.interceptCardAsset(MATH_ASSET_BASE + '../private.js').code, 404);
  assert.equal(context.interceptCardAsset('https://jidecards-media.local/x.svg'), null);
  for (const path of ['pages/学习页.ets', 'components/browser/卡片预览页.ets']) {
    assert.match(read('entry/src/main/ets/' + path), /return interceptCardAsset\(event\.request\.getRequestUrl\(\)\) \?\? this\.拦截媒体\(event\)/);
  }
});

test('ExtractLatex codec preserves UTF-8 text and SVG option without expanding clozes', () => {
  assert.deepEqual([...codec.encodeExtractLatexRequest('x', true)], [10, 1, 120, 16, 1]);
  assert.deepEqual([...codec.encodeExtractLatexRequest('', false)], []);
  const w = new 协议写入器();
  w.写入字符串(1, '<img class=latex alt="化学" src="latex-hash.svg">');
  w.写入字节(2, new Uint8Array([10, 1, 120]));
  w.写入字符串(99, 'future');
  assert.equal(codec.decodeExtractLatexResponse(w.转为字节()), '<img class=latex alt="化学" src="latex-hash.svg">');
});

test('render service resolves legacy nodes on both sides and preserves ordinary MathJax without extra calls', async () => {
  const w = new 协议写入器();
  for (const [side, text] of [[1, '[$]x[/$]'], [2, '[latex]y[/latex]']]) {
    const textNode = new 协议写入器();
    textNode.写入字符串(1, text);
    w.写入子消息(side, textNode);
  }
  w.写入布尔(4, true);
  const calls = [];
  const session = { async 调用(service, method, bytes) {
    calls.push({ service, method, bytes });
    if (method === 6) return w.转为字节();
    const response = new 协议写入器();
    response.写入字符串(1, '<img class=latex alt="x" src="latex-upstream.svg">');
    return response.转为字节();
  } };
  const source = read('entry/src/main/ets/backend/卡片渲染服务.ts')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace('export class 卡片渲染服务', 'class 卡片渲染服务') + '\nglobalThis.Service = 卡片渲染服务;';
  const context = { ...codec, 服务号, 卡片渲染方法, 后端会话: { 获取实例: () => session } };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source), context);
  const service = new context.Service();
  const rendered = await service.渲染既有卡片(123);
  assert.deepEqual(calls.map((c) => [c.service, c.method]), [[27, 6], [27, 4], [27, 4]]);
  assert.deepEqual([...calls[1].bytes], [...codec.encodeExtractLatexRequest('[$]x[/$]', true)]);
  for (const side of ['question', 'answer']) {
    const html = 构建卡片HTML(rendered, side);
    assert.match(html, /src="latex-upstream.svg"/);
    assert.equal(new URL('latex-upstream.svg', 'https://jidecards-media.local/').href,
      'https://jidecards-media.local/latex-upstream.svg');
  }
  calls.length = 0;
  await service.resolveLatexImages(card(false).questionNodes, false);
  assert.equal(calls.length, 0);
  const replacement = { text: null, replacement: { currentText: '[$$]x[/$$]', fieldName: 'Front', filters: [] } };
  await service.resolveLatexImages([replacement], false);
  assert.equal(replacement.replacement.fieldName, 'Front');
  assert.match(replacement.replacement.currentText, /latex-upstream/);
});
