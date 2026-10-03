// SPDX-License-Identifier: AGPL-3.0-or-later
// Production conversation markup/runtime with the bundled offline engine in Edge; no provider or device access.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { agentMathHtml, agentMathUpdateScript, AGENT_MATH_BASE } from '../entry/src/main/ets/model/agent/AgentMath.ts';
import { agentMathDocumentHtml, agentMathDocumentUpdateScript } from '../entry/src/main/ets/model/agent/AgentMathDocument.ts';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const output=new URL('../tmp/agent-math/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext();
let html='';const unexpected=[],errors=[],requests=[];
await context.route('**/*',async route=>{
  const url=route.request().url();requests.push(url);
  if(url===AGENT_MATH_BASE+'test')return route.fulfill({contentType:'text/html',body:html});
  if(url===MATH_ASSET_BASE+'tex-svg-full.js')return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../entry/src/main/resources/rawfile/mathjax/tex-svg-full.js',import.meta.url))});
  unexpected.push(url);await route.abort();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const receipts=[];page.on('console',message=>{
  if(message.text().startsWith('__JIDE_AGENT_MATH_LAYOUT__')) receipts.push(JSON.parse(message.text().slice(26)));
});
const sample=String.raw`**数学与化学**
行内分式 \(\frac{-b\pm\sqrt{b^2-4ac}}{2a}\) 与 $x^2$。
矩阵：\[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]
积分：$$\int_0^1 x^2\,dx=\frac13$$
反应：\[\ce{2H2 + O2 ->[点燃] 2H2O}\]
离子：\(\ce{SO4^2- + Ba^2+ -> BaSO4 v}\)
同位素：\(\ce{^{14}_{6}C -> ^{14}_{7}N + e-}\)
单位：\(\pu{1.2e3 kJ mol-1}\)
多行：\[\begin{aligned}x+2&=3\\x&=1\end{aligned}\]
长公式：\[\underbrace{a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a}_{30}\]
代码：`+'`'+String.raw`\(literal\) $code$`+'`'+String.raw`
<script>window.injected=true</script><img src="https://example.com/a" onerror="window.injected=true">
未闭合：\[x + `;
const results=[];
try{
  for(const[width,dark]of [[320,false],[320,true],[760,false],[760,true]]){
    const appearance={color:dark?'#E6E6E6':'#182230',fontSize:14,alignment:'left',bold:false};
    await page.setViewportSize({width,height:844});html=agentMathHtml(sample,appearance);
    await page.goto(AGENT_MATH_BASE+'test');
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='0');
    assert.equal(await page.locator('mjx-container').count(),10,JSON.stringify(await page.evaluate(()=>({
      error:document.documentElement.dataset.mathError,config:MathJax.config.tex,
      parts:[...document.querySelectorAll('.agent-math')].map(el=>({source:el.dataset.source,error:el.dataset.mathError,text:el.textContent}))}))));
    assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
    assert.ok(await page.locator('[data-mml-node="mfrac"]').count()>0);
    assert.ok(await page.locator('[data-mml-node="mtable"]').count()>0);
    assert.equal(await page.locator('.tex2jax_ignore mjx-container').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await page.locator('#content img, #content script').count(),0);
    assert.ok((await page.locator('#content').innerText()).includes(String.raw`\[x +`));
    const layout=await page.evaluate(()=>({bodyWidth:document.body.scrollWidth,viewport:innerWidth,
      longScroll:[...document.querySelectorAll('mjx-container')].some(el=>el.scrollWidth>el.clientWidth),
      color:getComputedStyle(document.querySelector('mjx-container')).color,height:document.body.scrollHeight}));
    assert.ok(layout.bodyWidth<=width+1);if(width===320)assert.ok(layout.longScroll);
    assert.equal(layout.color,dark?'rgb(230, 230, 230)':'rgb(24, 34, 48)');
    if(dark)await page.addStyleTag({content:'html{background:#17191c}'});
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${dark?'dark':'light'}.png`,output)),fullPage:true});
    // A stream supersedes pending updates inside the same document without reloading the engine.
    const before=requests.length;
    const longSource=await page.locator('.agent-math').last().getAttribute('data-source');
    if(width===320){
      await page.locator('mjx-container').last().evaluate(el=>{el.scrollLeft=60;});
      await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(sample+'追加文字',appearance,1));
      await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='1');
      assert.equal(await page.locator('.agent-math').last().getAttribute('data-source'),longSource);
      assert.ok(await page.locator('mjx-container').last().evaluate(el=>el.scrollLeft)>0);
    }
    await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(String.raw`\(x^2\) 未闭合 \[`,appearance,1));
    await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(String.raw`\(x^2\) \[\frac12`,appearance,2));
    await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(String.raw`\(x^2\) \[\frac12\] \(\ce{H2O}\)`,appearance,3));
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='3');
    assert.equal(await page.locator('mjx-container').count(),3);assert.equal(requests.length,before);
    await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(String.raw`错式 \(\frac{\) 正常 \(y^2\)`,appearance,4));
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='4');
    assert.ok((await page.locator('#content').innerText()).includes(String.raw`\(\frac{\)`));
    assert.equal(await page.locator('mjx-container').count(),1);
    // A table cell is built from the same source path at the minimum native column's inner width.
    await page.setViewportSize({width:124,height:844});
    await page.evaluate(script=>{(0,eval)(script);},agentMathUpdateScript(String.raw`\(P(A|B)\) 与 $\|x\|$`,{...appearance,bold:true,alignment:'center'},5));
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='5');
    assert.equal(await page.locator('mjx-container').count(),2);
    assert.equal(await page.locator('#content').evaluate(el=>getComputedStyle(el).textAlign),'center');
    results.push({width,dark,layout});
  }
  // A whole streamed exam table shares one engine and content height never inherits the viewport height.
  const exam='**卷面构成（13道大题）**\n\n|题号|题型|分值|考点|\n|---|---|---:|---|\n'+
    Array.from({length:13},(_,i)=>`|${i+1}|${i===8?'单调区间与极值':'积分计算'}|6|${i===7?'':String.raw`\(\int_0^1 x^2\,dx=\frac13\)`}|`).join('\n')+
    '\n\n后续正文 \\(x^2\\)';
  for(const width of [320,760]) {
    await page.setViewportSize({width,height:844});html=agentMathDocumentHtml(exam,{...appearanceFor(false)});
    await page.goto(AGENT_MATH_BASE+'test');
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='0');
    assert.equal(await page.locator('.agent-table').count(),1);assert.equal(await page.locator('tr').count(),14);
    assert.equal(await page.locator('mjx-container').count(),13);
    const geometry=await page.evaluate(()=>({
      rows:[...document.querySelectorAll('tr')].map(row=>row.getBoundingClientRect().height),
      height:document.querySelector('#content').getBoundingClientRect().height,
      width:document.body.scrollWidth,table:document.querySelector('.agent-table').getBoundingClientRect().width,
      viewport:innerWidth
    }));
    assert.ok(geometry.rows.every(h=>h>20&&h<120),JSON.stringify(geometry));
    assert.ok(geometry.width<=width+1);assert.ok(geometry.table>=578);
    await page.screenshot({path:fileURLToPath(new URL(`exam-${width}.png`,output)),fullPage:true});
    results.push({width,exam:geometry});
    const short=String.raw`短内容 \(x^2\)`;
    await page.evaluate(script=>(0,eval)(script),agentMathDocumentUpdateScript(short,appearanceFor(false),1));
    await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='1');
    await page.waitForTimeout(50);
    const receipt=receipts.at(-1);
    assert.equal(receipt.revision,1);assert.equal(receipt.width,width);
    assert.ok(receipt.height>10&&receipt.height<100,JSON.stringify(receipt));
    assert.ok(Math.abs(receipt.height-await page.locator('#content').evaluate(el=>el.getBoundingClientRect().height))<=1);
  }
  // Hold a real typeset in flight: one latest pending slot replaces a burst of 100 stale versions.
  await page.evaluate(()=>{
    window.reusedFormula=document.querySelector('.agent-math');
    window.typesetCounts=[];
    const original=MathJax.typesetPromise.bind(MathJax);let first=true;
    MathJax.typesetPromise=nodes=>{
      window.typesetCounts.push(nodes.length);
      const work=original(nodes);
      if(first){first=false;return work.then(()=>new Promise(resolve=>{window.releaseTypeset=resolve;}));}
      return work;
    };
  });
  await page.evaluate(script=>(0,eval)(script),agentMathDocumentUpdateScript(String.raw`短内容 \(x^2\) \(y\)`,appearanceFor(false),2));
  await page.waitForFunction(()=>typeof window.releaseTypeset==='function');
  const burst=Array.from({length:100},(_,i)=>agentMathDocumentUpdateScript(String.raw`短内容 \(x^2\) \(z\)`+' '+i,appearanceFor(false),i+3));
  await page.evaluate(scripts=>{scripts.forEach(script=>(0,eval)(script));window.releaseTypeset();},burst);
  await page.waitForFunction(()=>document.documentElement.dataset.renderedRevision==='102');
  assert.deepEqual(await page.evaluate(()=>window.typesetCounts),[1,1]);
  assert.equal(await page.evaluate(()=>window.reusedFormula===document.querySelector('.agent-math')),true);
  assert.equal(await page.locator('mjx-container').count(),2);
  assert.equal(await page.evaluate(()=>Array.from(MathJax.startup.document.math).length),2);
  assert.ok((await page.locator('#content').innerText()).endsWith('99'));
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await writeFile(new URL('results.json',output),JSON.stringify({results,requests,errors,unexpected,receipts},null,2));
  console.log(JSON.stringify({passed:results.length,requests:requests.length,errors,unexpected}));
}finally{await browser.close();}

function appearanceFor(dark) { return {color:dark?'#E6E6E6':'#182230',fontSize:14,alignment:'left',bold:false}; }
