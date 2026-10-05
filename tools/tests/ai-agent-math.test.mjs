// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { agentMathParts, hasAgentMath, agentMathMarkup, agentMathHtml, agentMathUpdateScript,
  parseAgentMathLayout, AGENT_MATH_LAYOUT_PREFIX } from '../../entry/src/main/ets/model/agent/AgentMath.ts';
import { agentMathDocumentMarkup, agentMathDocumentHtml, agentMathDocumentUpdateScript } from '../../entry/src/main/ets/model/agent/AgentMathDocument.ts';
import { parseAgentMarkdown } from '../../entry/src/main/ets/model/agent/AgentMarkdown.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const appearance = {color:'#182230',fontSize:14,alignment:'left',bold:false};
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
  应用尺寸: dimensions, $r: key => key
});
const resourceColors = {
  'app.color.text_primary': '#FF182230', 'app.color.surface_card': '#FFFFFFFF',
  'app.color.surface_page': '#FFF6F7FA', 'app.color.surface_border': '#FF64748B'
};

test('conversation formulas preserve TeX delimiters, matrices, chemistry and source through every stream prefix', () => {
  const text = String.raw`分式 \(\frac12\)，矩阵 \[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]，$x^2$ 和 $$\ce{SO4^2- + Ba^2+ -> BaSO4 v}$$。`;
  assert.equal(agentMathParts(text).filter(p=>p.kind==='math').length,4);
  for(let length=0;length<=text.length;length++) assert.equal(agentMathParts(text.slice(0,length)).map(p=>p.text).join(''),text.slice(0,length));
  assert.equal(hasAgentMath(String.raw`\[\frac{a}{b}`),false);
  assert.equal(hasAgentMath(String.raw`\[\frac{a}{b}\]`),true);
  assert.ok(agentMathMarkup(String.raw`\(x\) 和 \[a\\b`).includes(String.raw`\[a\\b`));
});

test('code, escaped delimiters, currency and unmatched stream tails remain literal while later formulas render', () => {
  for(const text of [String.raw`\$x\$`,String.raw`\\(x\\)`,String.raw`\$5 和 \$10`,String.raw`$5 and $10`,String.raw`\[x`,String.raw`\(x`,String.raw`$$x`,String.raw`$x`,
    '`$x$`','``a `$x$` b``','```tex\n\\(x\\)\n```','~~~tex\n$x$\n~~~']) assert.equal(hasAgentMath(text),false,text);
  const text = '价格 $5，公式 \\(x^2\\)';
  assert.equal(hasAgentMath(text),true);
  assert.equal(agentMathParts('\\(x\\)\n~~~\n$literal$\n~~~').filter(p=>p.kind==='math').length,1);
});

test('vertical bars inside complete TeX stay in one table cell and retain norm escapes', () => {
  const block=parseAgentMarkdown(String.raw`名称 | 公式
--- | ---
范数 | $|x| + \|y\|$
概率 | \(P(A|B)\)`)[0];
  assert.deepEqual(block.rows.map(r=>r.cells),[['名称','公式'],['范数',String.raw`$|x| + \|y\|$`],['概率',String.raw`\(P(A|B)\)`]]);
});

test('math markup escapes arbitrary HTML and protects non-math spans without changing formula backslashes', () => {
  const text=String.raw`**重点** <script>alert(1)</script> \(\begin{matrix}1&2\\3&4\end{matrix}\) \(\ce{H2 + O2 -> H2O}\)`;
  const html=agentMathMarkup(text);
  assert.ok(html.includes('<strong>重点</strong>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes(String.raw`1&amp;2\\3&amp;4`));
  assert.ok(html.includes('tex2jax_ignore'));
  assert.doesNotMatch(html,/<script>/);
  const script=agentMathUpdateScript('</script><img src=x onerror=alert(1)> \\(x\\)',appearance,7);
  const values=[];vm.runInNewContext(script,{window:{jideAgentMathUpdate(...args){values.push(args);}}});
  assert.equal(values[0][0],7); assert.ok(values[0][1].includes('&lt;img'));
  assert.doesNotMatch(script,/<\/script>/);
  const doc=agentMathHtml(text,appearance);
  assert.ok(doc.includes("default-src 'none'"));assert.doesNotMatch(doc,/card-math\.js/);
  const config=doc.match(/window.MathJax=([\s\S]*?);\s*\(function/)[1];
  const options=vm.runInNewContext('('+config+')');
  assert.deepEqual(JSON.parse(JSON.stringify(options.tex.inlineMath)),[['\\(','\\)'],['$','$']]);
  assert.ok(options.tex.packages.includes('mhchem'));
  assert.equal(options.tex.packages.includes('autoload'),false);assert.equal(options.tex.packages.includes('require'),false);
});

function componentHarness() {
  const calls=[],timers=new Map();let next=0;
  class Controller {loadData(...args){calls.push(['load',...args]);}runJavaScript(script){calls.push(['update',script]);return Promise.resolve('');}}
  const Component=loadComponentLogic('components/agent/AgentMathText.ets','AgentMathText',{
    $r:key=>key,应用尺寸:{字号_正文:14},webview:{WebviewController:Controller},SurfaceBorder,
    ColorMetrics:{resourceColor:key=>{assert.ok(resourceColors[key],key);return {color:resourceColors[key]};}},px2vp:x=>x,fp2px:x=>x,
    agentMathDocumentHtml,agentMathDocumentUpdateScript,parseAgentMathLayout,AGENT_MATH_BASE:'https://jidecards-render.local/agent-math/',
    setTimeout:callback=>{timers.set(++next,callback);return next;},clearTimeout:id=>timers.delete(id),
    MATH_ASSET_BASE:'https://jidecards-render.local/mathjax/3.2.2/',interceptCardAsset:()=>({asset:true}),
    WebResourceResponse:class{setResponseData(v){this.data=v;}setResponseCode(v){this.code=v;}setReasonMessage(){}}
  });
  const c=new Component();c.getUIContext=()=>({px2vp:x=>x,fp2px:x=>x});
  return {c,calls,timers,flush(){for(const[id,cb]of timers){timers.delete(id);cb();}}};
}

test('formula component waits for attach and page readiness, coalesces latest stream and cancels disposal', () => {
  const h=componentHarness();h.c.text='\\(x\\)';h.c.contentChanged();assert.equal(h.calls.length,0);
  assert.deepEqual(h.c.appearance(), {color:'#FF182230',fontSize:14,alignment:'left',bold:false,
    tableColor:'#FFFFFFFF',headerColor:'#FFF6F7FA',borderColor:'#FF64748B'});
  h.c.attached();assert.equal(h.calls[0][0],'load');assert.equal(h.calls[0][4],'https://jidecards-render.local/agent-math/');
  assert.equal(h.c.failed,false,'successful mounting must not silently enter source fallback');
  assert.equal(h.calls[0][1],agentMathDocumentHtml(h.c.text,h.c.appearance()));
  h.c.contentChanged();assert.equal(h.timers.size,0,'content updates wait for page readiness');
  h.c.ready=true;h.c.contentChanged();h.c.text+='\\(y\\)';h.c.contentChanged();assert.equal(h.timers.size,1);
  h.flush();assert.equal(h.calls.length,2);assert.ok(h.calls[1][1].includes('y'));
  const updates=[];vm.runInNewContext(h.calls[1][1],{window:{jideAgentMathUpdate(...args){updates.push(args);}}});
  assert.equal(updates[0][0],1);assert.equal(updates[0][8],'#64748BFF');
  h.c.contentChanged();h.c.aboutToDisappear();h.flush();assert.equal(h.calls.length,2);
  h.c.attached();assert.equal(h.calls.length,2);
});

test('formula component serves only the bundled engine and blocks every other resource', () => {
  const {c}=componentHarness();assert.equal(c.intercept('https://jidecards-render.local/mathjax/3.2.2/tex-svg-full.js').asset,true);
  for(const url of ['file:///private','https://example.com','https://jidecards-media.local/a','https://jidecards-render.local/mathjax/3.2.2/card-math.js']) assert.equal(c.intercept(url).code,403);
});

test('assistant prose, whole tables and reasoning share one formula document without application proxy permissions', () => {
  const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
  const markdown=read('components/agent/AgentMarkdownText.ets');
  assert.match(markdown,/this.containsMath = hasAgentMath\(this.text\)/);
  assert.equal((markdown.match(/AgentMathText\(\{/g)||[]).length,1);
  assert.match(markdown,/AgentMathText\(\{ text: this.text/);
  assert.match(read('components/agent/AgentReasoning.ets'),/AgentMarkdownText\(\{/);
  const component=read('components/agent/AgentMathText.ets');
  assert.match(component,/height\(this.contentHeight\)/);assert.match(component,/WebLayoutMode.NONE/);
  assert.doesNotMatch(component,/WebLayoutMode.FIT_CONTENT/);assert.match(component,/NestedScrollMode.PARENT_FIRST/);
  assert.match(component,/onConsole\(/);
  assert.doesNotMatch(component,/registerJavaScriptProxy|javaScriptProxy|fileAccess\(true\)/);
});

test('one mixed document preserves 13-row table order, alignment, minimum width and escaped cell content', () => {
  const text='前文 \\(x\\)\n\n|题号|考点|分值|\n|---|:---:|---:|\n'+
    Array.from({length:13},(_,i)=>`|${i+1}|\\(x_${i+1}\\)|6|`).join('\n')+'\n\n<script>evil()</script>';
  const markup=agentMathDocumentMarkup(text),html=agentMathDocumentHtml(text,appearance);
  assert.equal((markup.match(/<tr>/g)||[]).length,14);
  assert.equal((markup.match(/class="agent-table"/g)||[]).length,1);
  assert.ok(markup.includes('min-width:434px'));
  assert.ok(markup.includes('text-align:center'));assert.ok(markup.includes('text-align:right'));
  assert.ok(markup.includes('&lt;script&gt;evil()&lt;/script&gt;'));
  assert.equal((html.match(/src="[^\"]*tex-svg-full.js"/g)||[]).length,1);
  assert.ok(markup.indexOf('x_8')<markup.indexOf('x_9'));
});

test('dimension receipts reject malformed, non-finite and excessive values', () => {
  const packet={revision:2,width:320,height:42,failed:false};
  assert.deepEqual(parseAgentMathLayout(AGENT_MATH_LAYOUT_PREFIX+JSON.stringify(packet)),packet);
  for(const value of ['null','{}','broken',JSON.stringify({...packet,height:0}),
    JSON.stringify({...packet,width:-1}),JSON.stringify({...packet,revision:0.5}),
    JSON.stringify({...packet,height:1000001}),JSON.stringify({...packet,failed:'false'})]) {
    assert.equal(parseAgentMathLayout(AGENT_MATH_LAYOUT_PREFIX+value),null,value);
  }
  assert.equal(parseAgentMathLayout(JSON.stringify(packet)),null);
});

test('native height grows and shrinks only from current content receipts; stale width and disposal cannot blank reasoning', () => {
  const {c}=componentHarness();c.revision=2;c.contentWidth=320;
  const emit=patch=>c.receivedLayout(AGENT_MATH_LAYOUT_PREFIX+JSON.stringify({revision:2,width:320,height:48,failed:false,...patch}));
  emit({height:1600});assert.equal(c.contentHeight,1600);
  emit({height:36});assert.equal(c.contentHeight,36);
  emit({height:9999,revision:1});assert.equal(c.contentHeight,36);
  emit({height:9999,width:124});assert.equal(c.contentHeight,36);
  assert.equal(c.receivedLayout('ordinary console text'),false);
  c.aboutToDisappear();emit({height:9999});assert.equal(c.contentHeight,36);
});

test('engine failure visibly falls back to the unchanged source and width changes coalesce', () => {
  const h=componentHarness();h.c.ready=true;h.c.widthChanged(320);h.c.widthChanged(321);h.c.widthChanged(760);
  assert.equal(h.timers.size,1);assert.equal(h.c.contentWidth,760);
  h.c.text='原文 \\(x\\)';h.flush();
  h.c.receivedLayout(AGENT_MATH_LAYOUT_PREFIX+JSON.stringify({revision:h.c.revision,width:760,height:24,failed:true}));
  assert.equal(h.c.failed,true);assert.equal(h.c.text,'原文 \\(x\\)');
});
