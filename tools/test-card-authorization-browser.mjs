// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic author protocol; all URLs are intercepted and authorization always denies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchCardBrowser } from './card-browser-harness.mjs';
import { CardWebSession } from '../entry/src/main/ets/model/CardWebSession.ts';
import { 构建卡片HTML, appendCardScript } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { buildPreviewInteractionScript } from '../entry/src/main/ets/model/PreviewInteraction.ts';
import { CARD_SESSION_STORAGE_SNAPSHOT, carryCardSessionStorage } from '../entry/src/main/ets/model/CardWebBuffer.ts';
import { CARD_RENDERING_SUPPORT } from '../entry/src/main/ets/model/CardRenderingSupport.ts';

const origin = 'https://jidecards-media.local/';
const author = 'http://card-author.invalid/';
const label = '部分卡片脚本加载或执行失败，请检查网络或联系牌组作者。';
const front = `
  var script=document.createElement('script');script.src='${author}common.js';document.body.appendChild(script);
`;
const common = `
  window.authorRuns=(window.authorRuns||0)+1;
  window.validateAuthor=function(){
    var script=document.createElement('script');
    script.src='${author}identify.js?callback=authorResult&user_id='+encodeURIComponent(document.getElementById('author-id').value);
    document.body.appendChild(script);
  };
  window.authorResult=function(data){
    var old=document.getElementById('author-form');if(old)old.remove();
    var form=document.createElement('div');form.id='author-form';
    form.innerHTML='<label for="author-id">用户 ID</label><input id="author-id"><button id="verify-id">确认</button><p id="author-status"></p>';
    document.body.appendChild(form);
    document.getElementById('author-status').textContent=data.message;
    document.getElementById('verify-id').onclick=validateAuthor;
  };
  var request=document.createElement('script');request.src='${author}identify.js?callback=authorResult';document.body.appendChild(request);
`;
const browser = await launchCardBrowser({args: CARD_RENDERING_SUPPORT.web.allowHttpResources ? ['--allow-running-insecure-content'] : []});
let passed = 0;

async function createHarness({dark = false, width = 390, surface = 'study', failValidation = false, blocked = false} = {}) {
  const context = await browser.newContext({viewport:{width,height:760}});
  const page = await context.newPage();
  const failures=[], errors=[], requests=[], renders=[];
  let document='', currentHtml='', pending;
  await context.route('**/*', route => {
    const request=route.request(), url=new URL(request.url());
    if(request.isNavigationRequest())return route.fulfill({contentType:'text/html',body:document});
    if(url.hostname==='jidecards-render.local'){
      const file=url.pathname.startsWith('/jquery/')?'jquery/jquery-3.7.1.min.js':'mathjax/'+url.pathname.replace(/^\/mathjax\/3\.2\.2\//,'');
      return route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('../entry/src/main/resources/rawfile/'+file,import.meta.url))});
    }
    requests.push(url.href);
    if(url.hostname==='card-author.invalid'){
      if(blocked)return route.abort('blockedbyclient');
      if(url.pathname==='/front.js')return route.fulfill({contentType:'text/javascript',body:front});
      if(url.pathname==='/common.js')return route.fulfill({contentType:'text/javascript',body:common});
      if(url.pathname==='/identify.js')return failValidation?route.abort('failed'):route.fulfill({
        contentType:'text/javascript',body:'authorResult({allowed:false,message:"Authorization required"});'});
    }
    return route.fulfill({status:404,body:''});
  });
  page.on('pageerror', error=>errors.push(error.message));
  const session=new CardWebSession({
    load:html=>{document=html;pending=page.goto(origin);}, evaluate:script=>page.evaluate(script),
    shown:()=>renders.push(true),failed:error=>failures.push(error)
  });
  await page.exposeFunction('nativeRendered',(...args)=>session.rendered(...args));
  await page.addInitScript(()=>{window.jideCardRuntime={onRendered:(...args)=>window.nativeRendered(...args)};});
  async function show(question,answer=question,{key=1,side='question',expectFailure=false}={}){
    const card={questionNodes:[{text:question,replacement:null}],answerNodes:[{text:answer,replacement:null}],css:'',latexSvg:false,isEmpty:false};
    const html=构建卡片HTML(card,side,dark,undefined,false,'Play audio',label);
    currentHtml=surface==='study'?html:appendCardScript(html,buildPreviewInteractionScript(1));
    const count=renders.length+1, failureCount=failures.length;
    session.show(currentHtml,key,side);
    if(pending){await pending;pending=null;}
    const deadline=Date.now()+6000;
    while(renders.length<count&&failures.length===failureCount&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    if(expectFailure){assert.equal(failures.length,failureCount+1);assert.equal(renders.length,count-1);}
    else {assert.equal(failures.length,failureCount,failures.at(-1));assert.equal(renders.length,count);}
  }
  return {context,page,session,show,failures,errors,requests,renders,
    html:()=>currentHtml,close:()=>context.close()};
}

try {
  // Each native host shares this builder/runtime and the tested CardWebAttributes modifier.
  for(const surface of ['study','preview','template'])for(const dark of [false,true])for(const width of [390,900]){
    const h=await createHarness({surface,dark,width});
    try{
      const question=`<script src="${author}front.js"></script>`;
      const answer=`<script src="_optional-slider.js"></script><script src="${author}front.js"></script>`;
      await h.show(question,answer);
      assert.equal(await h.page.locator('#author-form').isVisible(),true);
      await h.page.locator('#author-id').fill('invalid-diagnostic-id');
      await h.page.locator('#verify-id').click();
      await h.page.waitForFunction(()=>document.getElementById('author-id').value==='');
      assert.ok(h.requests.some(url=>url.includes('user_id=invalid-diagnostic-id')));
      assert.equal(await h.page.locator('#author-status').textContent(),'Authorization required');
      await h.page.evaluate(()=>{sessionStorage.setItem('author-neutral-cache','retained');});
      await h.show(question,answer,{side:'answer'});
      await h.page.waitForFunction(()=>window.authorRuns===2);
      assert.equal(await h.page.locator('#author-form').isVisible(),true,'missing optional dependency does not suppress authorization');
      assert.match(await h.page.locator('#jide-card-script-errors').textContent(),/_optional-slider\.js/);
      assert.equal(await h.page.locator('#jide-card-script-errors summary').textContent(),label);
      const snapshot=JSON.stringify(await h.page.evaluate(CARD_SESSION_STORAGE_SNAPSHOT));
      // Exercise the same migration function used between the native Web slots.
      const carried=carryCardSessionStorage(h.html(),snapshot);
      await h.page.goto('about:blank');
      await h.page.route(origin,route=>route.fulfill({contentType:'text/html',body:carried}));
      await h.page.goto(origin);
      assert.equal(await h.page.evaluate(()=>sessionStorage.getItem('author-neutral-cache')),'retained');
      assert.deepEqual(h.errors,[]);
      passed++;
    }finally{await h.close();}
  }
  // An empty card with a missing author script fails on its first load and on a flip.
  for(const initial of [true,false]){
    const h=await createHarness();
    try{
      if(!initial)await h.show('Question','Question');
      const missing=`<script src="${author}missing.js?user_id=secret-value"></script>`;
      await h.show(missing,missing,{side:initial?'question':'answer',expectFailure:true});
      assert.match(h.failures[0],/card-author\.invalid\/missing\.js/);
      assert.ok(!h.failures[0].includes('secret-value'),'diagnostics omit authorization queries');
      await h.show('Recovered','Recovered',{key:2});
      assert.equal(await h.page.locator('#jide-card-script-errors').count(),0);
      passed++;
    }finally{await h.close();}
  }
  // The first author script can load successfully while the nested validation request fails.
  for(const failValidation of [false,true]){
    const h=await createHarness({failValidation,blocked:!failValidation});
    try{
      await h.show(`<script src="${author}front.js"></script>`,undefined,{expectFailure:true});
      assert.equal(await h.page.locator('#author-form').count(),0);
      assert.match(h.failures[0],failValidation?/identify\.js/:/front\.js/);
      passed++;
    }finally{await h.close();}
  }
  // Late asynchronous failure remains visible after the document has been acknowledged.
  const h=await createHarness();
  try{
    await h.show('Useful card');
    await h.page.evaluate(src=>{const script=document.createElement('script');script.src=src;document.body.appendChild(script);},author+'late.js?user_id=secret');
    await h.page.waitForSelector('#jide-card-script-errors');
    assert.match(await h.page.locator('#jide-card-script-errors').textContent(),/late\.js/);
    assert.ok(!(await h.page.locator('#jide-card-script-errors').textContent()).includes('secret'));
    assert.equal(await h.page.locator('#qa').innerText(),'Useful card');
    passed++;
  }finally{await h.close();}
  for(const visible of [false,true]){
    const h=await createHarness();
    try{
      const source=(visible?'Useful card':'')+'<script>throw new Error("synthetic author exception");</script>';
      await h.show(source,source,{expectFailure:!visible});
      assert.deepEqual(h.errors,['synthetic author exception']);
      if(visible){
        await h.page.locator('#jide-card-script-errors').evaluate(notice=>{notice.open=true;});
        await h.page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{
          filename:location.href,message:'repeated author exception'})));
        assert.equal(await h.page.locator('#jide-card-script-errors').evaluate(notice=>notice.open),true,
          'repeated failures from the same source do not reset an expanded diagnostic');
        await h.show(source,'Recovered answer',{side:'answer'});
        assert.equal(await h.page.locator('#jide-card-script-errors').count(),0);
      }
      passed++;
    }finally{await h.close();}
  }
  console.log(`Card authorization browser: ${passed} scenarios passed (HTTP/nested denial, optional dependency, input, storage, empty/late errors).`);
}finally{await browser.close();}
