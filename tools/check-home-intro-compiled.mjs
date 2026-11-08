// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { HOME_INTRO_PAGES, HOME_INTRO_ACTIONS, homeIntroPageIndex, homeIntroActionVisible, homeIntroTarget } from '../entry/src/main/ets/model/HomeIntro.ts';

/** Execute every compiled page and BuilderParam; this checks rendering, not native layout or device compatibility. */
export function checkHomeIntroCompiled(source) {
  const seen = { components: [], texts: [] };
  let nextId = 0;
  class Property {
    constructor(value) { this.value = value; }
    get() { return this.value; }
    set(value) { this.value = value; }
  }
  class ViewPU {
    constructor() { seen.components.push(this.constructor.name); }
    observeComponentCreation2(callback) { callback(++nextId, true); }
    ifElseBranchUpdateFunction(_branch, callback) { callback(); }
    forEachUpdateFunction(_id, items, callback) { items.forEach(callback); }
    createStorageProp(_key, initial) { return new Property(initial); }
    declareWatch() {}
    finalizeConstruction() {}
    getUIContext() { return {}; }
    static create(component) { component.initialRender(); }
  }
  function nativeElement(name) {
    const element = () => undefined;
    for (const attribute of ['fontSize','fontWeight','fontColor','textAlign','width','height','alignItems',
      'padding','backgroundColor','borderRadius','lineHeight','copyOption','onClick','pop','scrollBar',
      'layoutWeight','accessibilityLevel','align','transition','animation','height','flexShrink','fillColor','enabled','attributeModifier','border','margin','createWithChild','clip','maxLines','constraintSize','stateEffect','clipShape']) element[attribute] = () => {};
    element.create = value => { if (name === 'Text') seen.texts.push(value); };
    return element;
  }
  class DialogFrame {
    constructor(_parent, params) { this.params = params; }
    initialRender() { this.params.header(); this.params.content(); this.params.footer(); }
  }
  class EmptyComponent { initialRender() {} }
  class Scroller { scrollTo() {} }
  const context = vm.createContext({
    RectShape:class {radius(){return this;}},
    Context:{animation(){}},
    ViewPU, ObservedPropertySimplePU: Property, SynchedPropertySimpleOneWayPU: Property,
    SynchedPropertyObjectOneWayPU: Property, DialogFrame, DialogHeader: EmptyComponent, 按下态按钮: EmptyComponent, AppearanceReveal: EmptyComponent, ActionStatus: EmptyComponent, PrimaryActionButton: EmptyComponent, PressFeedback: class {}, Scroller,
    Button:nativeElement('Button'), Image:nativeElement('Image'), Text:nativeElement('Text'), Column:nativeElement('Column'), Span:nativeElement('Span'),
    Row:nativeElement('Row'), Scroll:nativeElement('Scroll'), ForEach:nativeElement('ForEach'), If:nativeElement('If'),
    __Common__:nativeElement('__Common__'),
    HOME_INTRO_PAGES, HOME_INTRO_ACTIONS, homeIntroPageIndex, homeIntroActionVisible, homeIntroTarget,
    namedResourceText:(_context,key)=>key, resourceText:()=> 'page', 颜色键:{动作主色:'primary'},
    prefersReducedMotion:()=>false, GLASS_HOME_SOURCE:"home",
    Color:{Transparent:0}, ButtonType:{Normal:0}, VerticalAlign:{Top:0},
    insetMaterialFill: value=>value,
    SurfaceTransition:{pageContent(){return {};}}, motionAnimation:()=>({}), currentMotionProfile:()=>({disclosureMs:150}),
    appInterface:{observe(){},leave(){}},
    应用尺寸:{间距_16:16,间距_12:12,间距_8:8,字号_正文:16,字号_正文_小:14,字号_按钮:16,字号_标题:17,圆角_面板:12},
    OFFICIAL_QQ_GROUP:'group', FontWeight:{Bold:'bold',Medium:'medium'}, BarState:{Auto:'auto'},
    HorizontalAlign:{Start:'start',Center:'center'}, Alignment:{TopStart:'topStart'}, TextAlign:{Start:'start',Center:'center'}, CopyOptions:{LocalDevice:'local'}
  });
  assert.match(source,/export class HomeIntroPanel extends ViewPU/,'Pass the fresh CompileArkTS HomeIntroPanel.ts output, not the .ets source.');
  const body=source.replace(/^import[^;]*;\s*/gm,'').replace('export class HomeIntroPanel','class HomeIntroPanel');
  vm.runInContext(stripTypeScriptTypes(body,{mode:'transform'}),context,{timeout:1000});
  const pages=[];
  for (let index=0;index<HOME_INTRO_PAGES.length;index++) {
    const start=seen.texts.length, sectionStart=seen.components.length;
    vm.runInContext(`{ const panel=new HomeIntroPanel(undefined, {}); panel.pageIndex=${index}; panel.experienced=false; panel.initialRender(); }`,context,{timeout:1000});
    const page=HOME_INTRO_PAGES[index], texts=seen.texts.slice(start);
    const sections=seen.components.slice(sectionStart).filter(name=>name==='HomeIntroSection').length;
    for (const block of page.blocks) {
      assert.ok(texts.includes(block.titleKey),`${page.id}: title ${block.titleKey} must render`);
      assert.ok(texts.includes(block.bodyKey),`${page.id}: body ${block.bodyKey} must render`);
    }
    pages.push({id:page.id,sections,textNodes:texts.length});
  }
  return { pages };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==3)throw Error('Usage: node tools/check-home-intro-compiled.mjs <compiled-HomeIntroPanel.ts>');
    const path=resolve(process.argv[2]),source=readFileSync(path,'utf8');
    console.log(JSON.stringify({path,sha256:createHash('sha256').update(source).digest('hex'),...checkHomeIntroCompiled(source)}));
  } catch(error) {console.error(`[home-intro:compiled] ${error.message}`);process.exitCode=1;}
}
