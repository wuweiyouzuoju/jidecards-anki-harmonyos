// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { actionMenuRows, toggleActionMenuBranch } from '../../entry/src/main/ets/components/common/ActionMenuTree.ts';
import { actionMenuGroupInset, placeActionMenuGroups, actionMenuBubbleOutline } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';
import { safeMenuGeometry } from '../../entry/src/main/ets/model/WindowSafeLayout.ts';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = read('entry/src/main/ets/pages/学习页.ets');
const methods = ['openStudyMenu', 'closeStudyMenu', 'toggleStudyMenuBranch', 'backStudyMenu', 'selectStudyMenu', '处理按键']
  .map(name => {
    const start = source.indexOf('  private ' + name + '(');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
const Page = new Function('KeyType', 'studyKeyName', 'actionMenuRows', 'toggleActionMenuBranch',
  stripTypeScriptTypes('class Page {' + methods.join('\n') + '}') + '; return Page;')(
  { Down: 0 }, key => key, actionMenuRows, toggleActionMenuBranch);

function harness() {
  const page = new Page(), events = [];
  const root = [
    { id: 'edit', action: () => events.push('edit') },
    { id: 'marking', value: 'Marking', children: [
      { id: 'mark', action: () => events.push('mark') },
      { id: 'flag', value: 'Flag', children: [{ id: '7', action: () => events.push('purple') }] }
    ] },
    { id: 'card_actions', children: [{ id: 'delete', action: () => events.push('delete') }] }
  ];
  Object.assign(page, { studyMenuOpen: false, studyExpandedIds: [], timeboxNotice: null, Ctrl按下: true,
    评分中: false, 更多菜单: () => root, loadFlagLabels: () => events.push('labels'),
    stopStudyTimers: () => events.push('stop'), clearChoiceAutoAdvance: () => events.push('cancel'),
    startStudyTimers: () => events.push('resume'), scheduleChoiceAutoAdvance: () => events.push('schedule') });
  return { page, events, root };
}

test('expanded trees keep parent order, nested flags and inherited disabled state without mutating input', () => {
  const { root }=harness(), expanded=['marking','card_actions'];
  assert.deepEqual(actionMenuRows(root,expanded).map(row=>row.node.id),['edit','marking','mark','flag','card_actions','delete']);
  const flags=toggleActionMenuBranch(root,expanded,'flag');
  assert.deepEqual(flags,['marking','card_actions','flag']);
  assert.deepEqual(expanded,['marking','card_actions']);
  assert.deepEqual(actionMenuRows(root,flags).find(row=>row.node.id==='7'),{node:root[1].children[1].children[0],key:'/marking/flag/7',depth:2,enabled:true});
  assert.deepEqual(toggleActionMenuBranch(root,flags,'marking'),['card_actions']);
  root[1].enabled=false;
  assert.ok(actionMenuRows(root,flags).filter(row=>row.key.startsWith('/marking')).every(row=>!row.enabled));
  assert.deepEqual(toggleActionMenuBranch(root,flags,'flag'),flags);
  assert.deepEqual(toggleActionMenuBranch(root,[], 'flag'),[],'hidden branches cannot expand');
  assert.deepEqual(toggleActionMenuBranch(root,expanded,'edit'),expanded,'leaf selection does not change expansion');
});

test('opening defaults to both left groups; toggling and closing flags keep timers paused until dismissal', () => {
  const { page,events }=harness(); page.openStudyMenu();
  assert.deepEqual(page.studyExpandedIds,['marking','card_actions']);
  assert.equal(page.Ctrl按下,false);assert.deepEqual(events,['stop','cancel']);
  page.toggleStudyMenuBranch('flag');
  assert.deepEqual(events,['stop','cancel','labels']);
  page.backStudyMenu();
  assert.deepEqual(page.studyExpandedIds,['marking','card_actions']);assert.equal(page.studyMenuOpen,true);
  page.toggleStudyMenuBranch('card_actions');page.toggleStudyMenuBranch('marking');
  assert.deepEqual(page.studyExpandedIds,[]);assert.equal(page.studyMenuOpen,true);
  page.backStudyMenu();page.closeStudyMenu();
  assert.equal(page.studyMenuOpen,false);assert.deepEqual(events,['stop','cancel','labels','resume','schedule']);
  page.openStudyMenu();assert.deepEqual(page.studyExpandedIds,['marking','card_actions']);
});

test('only visible enabled leaves execute with fresh actions before timer recovery', () => {
  const { page,events,root }=harness();page.openStudyMenu();events.length=0;
  page.selectStudyMenu(root[1]);page.selectStudyMenu({id:'7'});assert.deepEqual(events,[]);
  page.toggleStudyMenuBranch('marking');page.selectStudyMenu(root[1].children[0]);assert.deepEqual(events,[]);
  page.toggleStudyMenuBranch('marking');page.toggleStudyMenuBranch('flag');events.length=0;
  const stale={id:'7',action:()=>assert.fail('stale callback')};
  page.评分中=true;page.selectStudyMenu(stale);page.评分中=false;
  root[1].children[1].enabled=false;page.selectStudyMenu(stale);assert.deepEqual(events,[]);
  root[1].children[1].enabled=true;
  page.studyPrimaryObscured=true;page.selectStudyMenu(root[0]);assert.deepEqual(events,[]);
  root[1].children[1].children[0].action=()=>{assert.equal(page.studyMenuOpen,false);events.push('purple');};
  page.selectStudyMenu(stale);page.selectStudyMenu(stale);
  assert.deepEqual(events,['purple','resume','schedule']);
});

test('menu consumes study shortcuts; Escape closes flags first, then the menu without leaving study', () => {
  const { page,events }=harness();page.openStudyMenu();page.toggleStudyMenuBranch('flag');events.length=0;
  for(const keyCode of ['space','1','delete','b','r']) {
    assert.equal(page.处理按键({keyCode,type:0}),true);assert.ok(page.studyExpandedIds.includes('flag'));
  }
  page.处理按键({keyCode:'escape',type:0});assert.equal(page.studyMenuOpen,true);
  assert.ok(!page.studyExpandedIds.includes('flag'));assert.deepEqual(events,[]);
  page.处理按键({keyCode:'escape',type:0});assert.equal(page.studyMenuOpen,false);
  assert.match(source,/onBackPressed\([\s\S]*?if \(this.studyMenuOpen\) \{ this.backStudyMenu\(\); return true; \}/);
});

test('native Back reaches navigation instead of being swallowed by the keyboard interception', () => {
  const keyName=loadPlatformModule('utils/StudyKeyAdapter.ets','studyKeyName',
    {KeyCode:{KEYCODE_BACK:2,KEYCODE_ESCAPE:2070}});
  assert.equal(keyName(2),'back');assert.equal(keyName(2070),'escape');assert.equal(keyName(99),'');
  const {page,events}=harness();page.openStudyMenu();page.toggleStudyMenuBranch('flag');events.length=0;
  for(const type of [0,1])assert.equal(page.处理按键({keyCode:keyName(2),type}),false);
  assert.deepEqual(events,[]);assert.ok(page.studyExpandedIds.includes('flag'),'native navigation owns the close');
  page.backStudyMenu();assert.equal(page.studyMenuOpen,true);assert.ok(!page.studyExpandedIds.includes('flag'));
  page.backStudyMenu();assert.equal(page.studyMenuOpen,false);assert.deepEqual(events,['resume','schedule']);
});

test('shared menu rejects stale/disabled rows and keeps flat preview callbacks', () => {
  const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{
    应用尺寸:{compactMenuWidth:112,menuItemHeight:44,cardActionGroupWidth:136,radiusLg:16},PAGE_COMPACT_LAYOUT_KEY:'compact',actionMenuRows,actionMenuGroupInset,placeActionMenuGroups,
    MenuSurface:{pointerSpan:20,pointerDepth:6},Curve:{EaseOut:'easeOut'}
  });
  const menu=new Menu(),{root}=harness(),events=[];menu.items=root;menu.expandedIds=['marking','card_actions'];
  menu.getUIContext=()=>({animateTo:(_options,callback)=>callback()});
  menu.onToggleBranch=item=>{menu.expandedIds=toggleActionMenuBranch(menu.items,menu.expandedIds,item.id);};
  menu.onSelect=item=>events.push(item.id);
  const mark=menu.rows().find(row=>row.node.id==='mark');
  menu.selectEntry(menu.rows().find(row=>row.node.id==='marking'));menu.selectEntry(mark);assert.deepEqual(events,[]);
  menu.selectEntry(menu.rows().find(row=>row.node.id==='marking'));
  root[1].enabled=false;menu.selectEntry(mark);assert.deepEqual(events,[]);
  root[1].enabled=true;menu.selectEntry(mark);assert.deepEqual(events,['mark']);
  menu.items=[{id:'edit'},{id:'agent',enabled:false}];menu.expandedIds=[];
  for(const row of menu.rows())menu.selectEntry(row);assert.deepEqual(events,['mark','edit']);
});

test('left panels use measured first-group anchoring without adding root gaps or reserving vanished groups', () => {
  assert.equal(actionMenuGroupInset([],3,132,44),88);
  assert.equal(actionMenuGroupInset([60,48,44,64],3,180,44),94);
  assert.equal(actionMenuGroupInset([],3,484,44),0,'expanded flags move the left column upward, never stretch the right menu');
  const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{
    应用尺寸:{compactMenuWidth:112,menuItemHeight:44,cardActionGroupWidth:136,radiusLg:16},PAGE_COMPACT_LAYOUT_KEY:'compact',actionMenuRows,actionMenuGroupInset,placeActionMenuGroups,
    MenuSurface:{pointerSpan:20,pointerDepth:6}
  });
  const menu=new Menu(),{root}=harness();menu.items=root;menu.menuWidth=168;menu.contentWidth=360;menu.expandedIds=['marking','card_actions'];
  for(const width of [180,280,360,840]) { menu.contentWidth=width;assert.ok(menu.totalWidth()<=width-24); }
  menu.contentWidth=360;assert.equal(menu.sideGroups().length,2);
  menu.recordRow(0,60);assert.equal(menu.rowHeights[0],60);
  menu.expandedIds=[];assert.equal(menu.totalWidth(),168);assert.equal(menu.sideGroups().length,0);
  menu.rowHeights=[60,44,44,200,200];assert.equal(menu.layoutHeight(),148,'hidden root entries do not reserve stale height');
});

test('left panel avoidance preserves trigger coordinates and never overlaps adjacent panels', () => {
  const anchors=[154,242],heights=[132,176];
  const placements=placeActionMenuGroups(anchors,heights,26.5);
  assert.deepEqual(placements.map(item=>item.top),[75.5,215.5]);
  placements.forEach((item,index)=>assert.equal(item.top+item.pointerCenter,anchors[index]));
  assert.deepEqual(anchors,[154,242]);assert.deepEqual(heights,[132,176]);
  for(const sizes of [[132,176],[240,400],[44,44]]) {
    const panels=placeActionMenuGroups(anchors,sizes,26.5);
    assert.ok(panels[0].top>=0);assert.ok(panels[1].top>=panels[0].top+sizes[0]+8);
    panels.forEach((panel,index)=>assert.ok(panel.pointerCenter>=0&&panel.pointerCenter<=sizes[index]));
  }
});

test('bubble outline converts all coordinates at the actual density and keeps a single closed contour', () => {
  for(const width of [88,136,168])for(const height of [44,132,176,352])for(const center of [22,height/2,height-22]) {
    const commands=density=>actionMenuBubbleOutline(width,height,center,density,1,16,6,20);
    assert.equal((commands(1).match(/M /g)??[]).length,1);
    assert.equal((commands(1).match(/ Z/g)??[]).length,1);
    const numbers=density=>commands(density).match(/-?\d+(?:\.\d+)?/g).map(Number);
    const unit=numbers(1);
    for(const density of [1.5,2,3.5,4])numbers(density).forEach((value,index)=>{
      assert.ok(Math.abs(value-unit[index]*density)<1e-7,`coordinate ${index}: ${width}x${height}vp @ ${density}`);
    });
  }
  const bubble=read('entry/src/main/ets/components/common/MenuBubble.ets');
  assert.match(bubble,/vp2px\(1\)/);assert.doesNotMatch(bubble,/\.shadow\(/,'Path bounding-box shadows caused the rectangular ghost');
});

test('flags cover the primary menu at its original position and preserve operable left groups at every width', () => {
  const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{
    应用尺寸:{compactMenuWidth:168,menuItemHeight:44,cardActionGroupWidth:136,radiusLg:16},PAGE_COMPACT_LAYOUT_KEY:'compact',
    actionMenuRows,actionMenuGroupInset,placeActionMenuGroups,MenuSurface:{pointerSpan:20,pointerDepth:6},Curve:{EaseOut:'easeOut'}
  });
  const menu=new Menu(),{root}=harness(),events=[];menu.items=root;menu.expandedIds=['marking','card_actions','flag'];
  menu.onSelect=item=>events.push(item.id);menu.onPrimaryObscured=obscured=>events.push(obscured);
  menu.onToggleBranch=item=>{menu.expandedIds=toggleActionMenuBranch(menu.items,menu.expandedIds,item.id);};
  menu.contentWidth=360;menu.publishOcclusion();assert.equal(menu.primaryObscured(),true);
  assert.deepEqual(menu.popupRows().map(row=>row.node.id),['7']);
  for(const width of [180,360,840]) {
    menu.contentWidth=width;const expanded=menu.expandedIds.slice();
    menu.expandedIds=['marking','card_actions'];const originalWidth=menu.totalWidth(),originalHeight=menu.layoutHeight();
    menu.expandedIds=expanded;
    assert.equal(menu.totalWidth(),originalWidth,'colors do not reserve another column');
    assert.equal(menu.popupX()+menu.primaryWidth(),originalWidth,'overlay shares the primary right edge');
    assert.ok(menu.totalWidth()<=width-24);assert.ok(menu.layoutHeight()>=originalHeight);
    const count=events.length;menu.selectEntry(menu.rows().find(row=>row.node.id==='edit'));assert.equal(events.length,count);
    menu.selectEntry(menu.rows().find(row=>row.node.id==='mark'));assert.equal(events.at(-1),'mark');
    menu.selectEntry(menu.rows().find(row=>row.node.id==='7'));assert.equal(events.at(-1),'7');
  }
  menu.dismissTop();menu.publishOcclusion();assert.equal(menu.primaryObscured(),false);
  assert.equal(events.at(-1),false);assert.deepEqual(menu.expandedIds,['marking','card_actions']);
});

test('all card menu callers share one viewport-limited surface and one row renderer', () => {
  for (const path of ['pages/学习页.ets', 'components/browser/卡片预览页.ets', 'components/browser/批量操作栏.ets']) {
    const page = read('entry/src/main/ets/' + path);
    assert.match(page, /CardActionMenu\(\{/); assert.doesNotMatch(page, /\.bindMenu\(/);
  }
  const menu = read('entry/src/main/ets/components/common/CardActionMenu.ets');
  assert.equal((menu.match(/AnchoredMenu\(\{/g) ?? []).length, 1);
  assert.equal((menu.match(/AnchoredMenuItem\(\{/g) ?? []).length, 1);
  assert.match(menu, /contentMaxWidth: this.contentWidth/);
  assert.match(menu, /this.contentWidth = cardViewportWidth\(Number\(area.width\), Number\(area.height\)\)/);
  assert.doesNotMatch(menu, /popupOpen|rowGap|collapsedGroupIds/);
  assert.match(menu, /placeActionMenuGroups\(/);
  const shell = read('entry/src/main/ets/components/common/AnchoredMenu.ets');
  const Menu = loadComponentLogic('components/common/AnchoredMenu.ets', 'AnchoredMenu', {
    应用尺寸: { compactMenuWidth: 320, 页面底部间距: compact => compact ? 8 : 12 },
    PAGE_COMPACT_LAYOUT_KEY: '', WINDOW_SAFE_TOP_KEY: '', WINDOW_SAFE_BOTTOM_KEY: '',
    WINDOW_SAFE_LEFT_KEY: '', WINDOW_SAFE_RIGHT_KEY: '', safeMenuGeometry
  });
  const mounted = new Menu();
  for (const compact of [false, true]) for (const safeTop of [0, 36]) for (const safeBottom of [0, 24]) {
    Object.assign(mounted, { viewportHeight: 640, topOffset: 20, narrowDeckLayout: compact, safeTop, safeBottom });
    const geometry = mounted.menuGeometry(), gap = compact ? 8 : 12;
    assert.ok(geometry.top >= safeTop + gap);
    assert.ok(geometry.top + geometry.maxHeight <= 640 - safeBottom - gap);
    mounted.topOffset = 800;
    assert.equal(mounted.menuGeometry().maxHeight, 0, 'an offscreen anchor cannot create overflowing menu height');
  }
  assert.match(shell, /Scroll\(\)/);
  assert.match(shell, /maxHeight: this\.menuGeometry\(\)\.maxHeight/);
  assert.match(shell, /top: this\.menuGeometry\(\)\.top/);
});
