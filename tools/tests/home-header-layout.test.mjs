// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { homeHeaderGeometry, homeSummaryGeometry } from '../../entry/src/main/ets/model/HomeHeaderLayout.ts';
import { safePopupContentHeight, safeMenuGeometry, windowSafeInsets, safeDialogMaxHeight } from '../../entry/src/main/ets/model/WindowSafeLayout.ts';
import { searchHomeDecks } from '../../entry/src/main/ets/model/HomeDeckSearch.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

test('six top controls always fit one row by scaling widths, gaps and glyphs before rendering', () => {
  let previous = 0;
  for (const width of [0,80,160,240,288,328,360,480,600,768,1024,1400]) {
    const g = homeHeaderGeometry(width, 8, true);
    assert.equal(g.summaryWidth,width);assert.equal(g.summaryHeight,168);
    assert.ok(Math.abs(g.controlWidth*6+g.actionGap*5-width)<1e-10,'six controls plus five gaps exactly fill the available width');
    assert.equal(g.actionsHeight,g.controlHeight,'the action area always has one row');
    assert.ok(g.controlHeight>=44 && g.controlHeight<=56);
    assert.ok(g.actionGap>=0 && g.actionGap<=8);
    assert.ok(g.controlWidth>=previous,'buttons adapt continuously to width');previous=g.controlWidth;
    assert.ok(g.controlGlyphSize <= Math.min(g.controlWidth, g.controlHeight) * 0.46);
    const hidden=homeHeaderGeometry(width,8,false);
    assert.equal(hidden.summaryWidth,0);assert.equal(hidden.controlWidth,g.controlWidth);
    assert.equal(hidden.actionsHeight,g.actionsHeight,'hiding the summary does not change the action row');
  }
});

test('all summary pages reserve dots, a common title and centered body without overflow', () => {
  for (const compact of [true, false]) {
    const header=homeHeaderGeometry(compact ? 328 : 480,8,true);
    const g=homeSummaryGeometry(header.summaryHeight,compact);
    assert.equal(g.topPadding-g.padding,10, 'dots have their own strip above the title');
    assert.equal(g.titleHeight,24);
    assert.equal(g.topPadding+g.titleHeight+8+g.bodyHeight+g.padding,header.summaryHeight);
    assert.equal(g.chartHeight+4+16,g.bodyHeight, 'bars and ticks use the same body baseline');
    assert.ok(g.bodyHeight>=90, 'two count rows fit inside the body');
  }
});

test('cutout edges include the rectangle origin and safe menus stay below the camera and above navigation', () => {
  const empty=()=>({left:0,top:0,width:0,height:0});
  const areas=()=>({topRect:empty(),bottomRect:empty(),leftRect:empty(),rightRect:empty()});
  const system=areas(),cutout=areas(),nav=areas();
  system.topRect={left:0,top:0,width:400,height:36};
  cutout.topRect={left:180,top:12,width:40,height:40};
  nav.bottomRect={left:0,top:776,width:400,height:24};
  assert.deepEqual(windowSafeInsets(system,cutout,nav,400,800),{top:52,bottom:24,left:0,right:0});
  const landscape=areas(); landscape.leftRect={left:8,top:150,width:40,height:40};
  assert.equal(windowSafeInsets(areas(),landscape,areas(),800,400).left,48);
  for (const height of [240,400,800]) for(const top of [0,64,115,300]) {
    const g=safeMenuGeometry(height,top,52,24,8);
    assert.ok(g.top>=60);
    assert.ok(g.top+g.maxHeight<=height-32);
    const popup=safePopupContentHeight(height,g.top,52,24,8);
    assert.ok(popup>=0 && popup<=360);
    if(popup>0) assert.ok(g.top+popup+32<=height-32);
  }
  assert.equal(safeMenuGeometry(400,0,0,0,8).top,8);
  for(const height of [240,400,800]) {
    const available=height-52-24-16;
    const card=safeDialogMaxHeight(height,52,24,8,0.88);
    assert.ok(card<=available);
    const cardTop=60+(available-card)/2;
    assert.ok(cardTop>=60 && cardTop+card<=height-32,'center dialogs inside the safe rectangle');
  }
});

test('the real window owner publishes the union in vp and the shared anchored menu consumes it', () => {
  const rect=()=>({left:0,top:0,width:0,height:0});
  const area=()=>({topRect:rect(),bottomRect:rect(),leftRect:rect(),rightRect:rect()});
  const system=area(),cutout=area(),navigation=area(),values=new Map();
  system.topRect.height=36;cutout.topRect={left:180,top:12,width:40,height:40};
  navigation.bottomRect={left:0,top:776,width:400,height:24};
  const keys={WINDOW_SAFE_TOP_KEY:'safeTop',WINDOW_SAFE_BOTTOM_KEY:'safeBottom',WINDOW_SAFE_LEFT_KEY:'safeLeft',
    WINDOW_SAFE_RIGHT_KEY:'safeRight',WINDOW_HEIGHT_KEY:'height'};
  const source=readFileSync(new URL('../../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8');
  const start=source.indexOf('  private 同步规避区高度(): void {');assert.ok(start>=0);
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const deps={...keys,windowSafeInsets,DOMAIN:0,AppStorage:{setOrCreate:(key,value)=>values.set(key,value)},
    window:{AvoidAreaType:{TYPE_SYSTEM:0,TYPE_CUTOUT:1,TYPE_NAVIGATION_INDICATOR:2}},hilog:{error(){}}};
  const Ability=new Function(...Object.keys(deps),stripTypeScriptTypes(`class Ability { ${method} }`,{mode:'transform'})+';return Ability;')(...Object.values(deps));
  const ability=new Ability();ability.主窗口={getWindowAvoidArea:type=>[system,cutout,navigation][type],
    getWindowProperties:()=>({windowRect:{width:400,height:800}}),getUIContext:()=>({px2vp:value=>value/2})};
  ability.同步规避区高度();
  assert.equal(values.get('safeTop'),26);assert.equal(values.get('状态栏高度'),18);
  assert.equal(values.get('safeBottom'),12);assert.equal(values.get('导航条高度'),12);
  assert.equal(values.get('height'),400);
  ability.主窗口.getWindowAvoidArea=()=>{throw Error('temporarily unavailable');};
  ability.同步规避区高度();assert.equal(values.get('safeTop'),26,'temporary errors preserve the last known safe edge');
  const Menu=loadComponentLogic('components/common/AnchoredMenu.ets','AnchoredMenu',{
    ...keys,safeMenuGeometry,应用尺寸:{compactMenuWidth:104,页面底部间距:narrow=>narrow?8:12}
  });
  const menu=new Menu();Object.assign(menu,{viewportHeight:400,safeTop:26,safeBottom:12,topOffset:0});
  assert.deepEqual(menu.menuGeometry(),{top:38,maxHeight:338});
  menu.topOffset=100;assert.deepEqual(menu.menuGeometry(),{top:100,maxHeight:276});
  const dimensions=loadPlatformModule('utils/应用尺寸.ets','应用尺寸',{});
  const Frame=loadComponentLogic('components/common/DialogFrame.ets','DialogFrame',{
    ...keys,safeDialogMaxHeight,应用尺寸:dimensions
  });
  const frame=new Frame();Object.assign(frame,{viewportHeight:400,safeTop:26,safeBottom:12});
  assert.equal(frame.bodyHeight(),(400-26-12-dimensions.间距_8*2)*dimensions.dialogHeightRatio-56-dimensions.卡片内边距*2-dimensions.间距_12);
});

function homeHeader() {
  const Header = loadComponentLogic('components/home/HomeSummaryHeader.ets', 'HomeSummaryHeader', {
    homeHeaderGeometry,
    空主页快照: {}, WINDOW_SAFE_TOP_KEY:'safeTop', WINDOW_SAFE_BOTTOM_KEY:'safeBottom', WINDOW_HEIGHT_KEY:'height',
    safePopupContentHeight, 应用尺寸: { 间距_8: 8 },
    MenuSurface: { pointerDepth: 6 }
  });
  return new Header();
}

test('both top-corner menus reserve space below the button and upward arrow and close when safe geometry changes', () => {
  const header=homeHeader();
  Object.assign(header,{contentWidth:328,headerTop:60,windowHeight:400,safeTop:52,safeBottom:24});
  const g=homeHeaderGeometry(328,8,true);
  const popupTop=60+g.controlHeight+8+6;
  assert.equal(header.menuHeight(),safePopupContentHeight(400,popupTop,52,24,8));
  assert.ok(popupTop+header.menuHeight()+32<=400-24-8);
  header.showSummary=false;header.contentWidth=328;
  assert.equal(header.menuHeight(),safePopupContentHeight(400,popupTop,52,24,8));
  const closures=[]; header.onMoreClose=()=>closures.push('more'); header.onCreateClose=()=>closures.push('create');
  header.layoutChanged(); assert.deepEqual(closures,['more','create']);
  header.aboutToDisappear();assert.deepEqual(closures,['more','create','more','create']);
});

const decks = [
  {id:'1',name:'语言',fullName:'语言',displayName:'',ancestorIds:[]},
  {id:'2',name:'法语',fullName:'语言::法语',displayName:'Français café',ancestorIds:['1']},
  {id:'3',name:'生物',fullName:'生物',displayName:'biology',ancestorIds:[]}
];
test('deck search includes collapsed descendants, matches aliases and normalized words, and excludes hidden subtrees', () => {
  assert.deepEqual(searchHomeDecks(decks, new Set(), '  CAFÉ français ').map(d => d.id), ['2']);
  assert.deepEqual(searchHomeDecks(decks, new Set(), '语言::法').map(d => d.id), ['2']);
  assert.deepEqual(searchHomeDecks(decks, new Set(['1']), '').map(d => d.id), ['3']);
  assert.deepEqual(searchHomeDecks(decks, new Set(['2']), '法'), []);
  assert.deepEqual(searchHomeDecks(decks, new Set(), 'no match'), []);
});

test('search selection validates the current snapshot and reports only loaded current results to JIDE', () => {
  const observations = [], selections = [];
  const Search = loadComponentLogic('components/home/HomeDeckSearchDialog.ets', 'HomeDeckSearchDialog', {
    searchHomeDecks, appInterface: {observe: view => observations.push(view), leave() {}}
  });
  const dialog = new Search(); dialog.decks = decks; dialog.loadState = 'ready'; dialog.onSelect = id => selections.push(id);
  dialog.query = '法'; dialog.publishInterface();
  assert.deepEqual(observations.at(-1).optionIds, ['2']); assert.equal(observations.at(-1).optionsTotal, 1);
  dialog.select('3'); dialog.select('2'); dialog.hiddenIds = new Set(['1']); dialog.select('2');
  dialog.hiddenIds.clear(); dialog.loadState = 'loading'; dialog.select('2'); dialog.publishInterface();
  assert.deepEqual(selections, ['2']); assert.equal(observations.at(-1).busy, true);
  assert.deepEqual(observations.at(-1).optionIds, []);
});

test('home binds swapped icon buttons to pointed popups while summary pages use responsive geometry', () => {
  const read = p => readFileSync(new URL('../../entry/src/main/ets/' + p, import.meta.url), 'utf8');
  const header = read('components/home/HomeSummaryHeader.ets');
  assert.deepEqual([...header.matchAll(/source: \$r\('app.media.([^']+)'\)/g)].map(match=>match[1]),
    ['ic_study_agent','ic_settings_search','ic_home_browser','ic_home_more','ic_home_new','ic_home_sync']);
  assert.match(header,/Row\(\{ space: this.geometry\(\).actionGap \}\) \{\s*this.moreButton\(\)\s*this.agentButton\(\)\s*this.searchButton\(\)\s*this.browserButton\(\)\s*this.syncButton\(\)\s*this.createButton\(\)/);
  assert.match(header,/if \(this.actionsVisible\) \{ this.actions\(\) \}\s*if \(this.showSummary\) \{ this.summaryCard\(\) \}/);
  assert.match(header,/placement: Placement.BottomLeft/);assert.match(header,/placement: Placement.BottomRight/);
  assert.equal((header.match(/enableArrow: true/g) ?? []).length, 2);
  assert.equal((header.match(/IconActionButton\(\{/g) ?? []).length, 6);
  assert.doesNotMatch(header, /\.scale\(/);
  assert.doesNotMatch(header, /caption|Text\(\$r\('app.string/);
  assert.doesNotMatch(header, /StudyGrip|gripSide|trackTouch|onSideChange|splitDetails|flanking|stacked/);
  assert.doesNotMatch(read('components/common/IconActionButton.ets'), /\bText\(/);
  assert.equal((read('components/home/主页摘要分页.ets').match(/\.height\(this.cardHeight\)/g) ?? []).length, 7);
  assert.match(read('components/今日摘要卡.ets'), /\.height\(this.cardHeight\)/);
});
