// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser card QA; native ArkUI/ArkWeb and device validation are separate.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchCardBrowser, createCardBrowserHarness } from './card-browser-harness.mjs';
import { 构建卡片HTML, appendCardScript } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { noteLinkBridgeScript, noteLinkMirrorScript } from '../entry/src/main/ets/model/NoteLinkBridge.ts';
import { noteReferenceUrl } from '../entry/src/main/ets/model/NoteReferences.ts';
import { renderNoteLinkMirror } from '../entry/src/main/ets/model/NoteLinks.ts';

const output=path.resolve(process.argv[2]??'output/note-links-browser');mkdirSync(output,{recursive:true});
const browser=await launchCardBrowser(),report=[];
try {
  const harness=await createCardBrowserHarness(browser),calls=[];
  await harness.page.exposeFunction('nativeNoteLink',(...args)=>calls.push(args));
  await harness.page.addInitScript(()=>{window.jideNoteLinks={onLink:(...args)=>window.nativeNoteLink(...args)};});
  let version=0;
  const rows=[{guid:'d`LW#&/',noteId:42,cardIds:[420],label:'stay up 熬夜',alias:'stay up <b>熬夜</b>'},
    {guid:'long',noteId:43,cardIds:[430],label:'很长的关联说明，需要完整换行。'.repeat(20),alias:''}];
  const mirror=renderNoteLinkMirror({guid:'source',outgoing:rows,incoming:[]});
  for(const width of [320,390,1200])for(const dark of [false,true])for(const scale of [1,1.5]) {
    await harness.page.setViewportSize({width,height:844});
    const card={questionNodes:[{text:'Question',replacement:null}],answerNodes:[{text:'<h2>双端引用演示</h2><p>正文中的 <a href="'+noteReferenceUrl('d`LW#&/')+'">独立显示文字</a></p>',replacement:null}],
      css:'.card{font-family:sans-serif;font-size:20px;line-height:1.5}',latexSvg:false,isEmpty:false};
    const palette=dark?{surface:'#20372B',text:'#A7DABD'}:{surface:'#E0F0E5',text:'#205C39'};
    const html=appendCardScript(构建卡片HTML(card,'answer',dark),noteLinkBridgeScript(++version,mirror,palette));
    await harness.show(html,version,'answer');
    // Model text-only zoom, including the legacy mirror's explicit pixel fonts.
    await harness.page.evaluate(scale=>{
      const sizes=[...document.querySelectorAll('body,body *')].map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);
      for(const [node,size] of sizes)node.style.fontSize=String(size*scale)+'px';
    },scale);
    const geometry=await harness.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      rows:[...document.querySelectorAll('.ml-mirror-row')].map(row=>{const r=row.getBoundingClientRect();return{left:r.left,right:r.right,height:r.height}})}));
    assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
    assert.ok(geometry.rows.every(row=>row.left>=0&&row.right<=width+1&&row.height>=44));
    const style=await harness.page.locator('a[href^="#jide-note:"]').evaluate(node=>{
      const s=getComputedStyle(node);return {background:s.backgroundColor,decoration:s.textDecorationLine};
    });
    assert.notEqual(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.decoration,'none');
    const before=calls.length;await harness.page.locator('.ml-mirror-row').first().click();
    await harness.page.waitForFunction(()=>true);await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(calls.length,before+1);assert.deepEqual(calls.at(-1),['d`LW#&/','preview',version]);
    await harness.page.locator('a[href^="#jide-note:"]').click();
    await harness.page.waitForFunction(()=>true);await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(calls.length,before+2);assert.deepEqual(calls.at(-1),['d`LW#&/','preview',version]);
    await harness.page.evaluate(script=>{(0,eval)(script)},noteLinkMirrorScript(version-1,''));
    assert.equal(await harness.page.locator('.ml-mirror-row').count(),2,'a stale callback cannot erase the current mirror');
    const name=`card-${width}-${dark?'dark':'light'}-${scale}.png`;await harness.page.screenshot({path:path.join(output,name)});
    report.push({width,dark,scale,geometry,screenshot:name});
  }
  await harness.close();
  writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,cases:report},null,2)+'\n');
  console.log(`Note links browser QA: ${report.length} layouts passed`);
} finally {await browser.close();}
