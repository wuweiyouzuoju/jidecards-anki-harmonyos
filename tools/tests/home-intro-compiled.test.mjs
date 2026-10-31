// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHomeIntroCompiled } from '../check-home-intro-compiled.mjs';
import { HOME_INTRO_PAGES } from '../../entry/src/main/ets/model/HomeIntro.ts';

// Compiler-shaped fixture tests the checker; fresh real output is checked after compilation.
const compiled=`
class HomeIntroSection extends ViewPU {
  constructor(parent,params){super(parent);this.title=params.title;this.content=params.content;}
  initialRender(){Text.create(this.title);this.content();}
}
export class HomeIntroPanel extends ViewPU {
  pageIndex=0;
  initialRender(){
    const page=HOME_INTRO_PAGES[this.pageIndex];
    for(const block of page.blocks){
      ViewPU.create(new HomeIntroSection(this,{title:block.titleKey,content:()=>{this.paragraph(block.bodyKey);}}));
    }

  }
  paragraph(body: ResourceStr){this.observeComponentCreation2(()=>{Text.create(body);Text.fontSize(16);},Text);Text.pop();}
}`;

test('compiled checker executes all paginated introduction content and native Text creation',()=>{
  const result=checkHomeIntroCompiled(compiled);
  assert.deepEqual(result.pages.map(page=>page.id),HOME_INTRO_PAGES.map(page=>page.id));
  assert.equal(result.pages.length,3);
  assert.equal(result.pages.some(page=>page.id==='study'),false,'the in-study guide page must not return');
});
test('compiled checker rejects untransformed inline Text chains',()=>{
  assert.throws(()=>checkHomeIntroCompiled(compiled.replace('this.paragraph(block.bodyKey);','Text(block.bodyKey).fontSize(16);')),/undefined.*fontSize|fontSize.*undefined/);
});
test('compiled checker rejects missing later pages, missing bodies and uncompiled source',()=>{
  assert.throws(()=>checkHomeIntroCompiled(compiled.replace('const page=HOME_INTRO_PAGES[this.pageIndex];','const page=HOME_INTRO_PAGES[0];')),/sections must render|must render/);
  assert.throws(()=>checkHomeIntroCompiled(compiled.replace('this.paragraph(block.bodyKey);','')),/body .* must render/);
  assert.throws(()=>checkHomeIntroCompiled('@Component export struct HomeIntroPanel {}'),/fresh CompileArkTS/);
});
