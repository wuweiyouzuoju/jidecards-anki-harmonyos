// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { actionMenuRows, toggleActionMenuBranch } from '../../entry/src/main/ets/components/common/ActionMenuTree.ts';
import { CARD_FLAGS, customFlagLabel } from '../../entry/src/main/ets/model/CardMarking.ts';

const callbacks = { reset:'onReset', suspend:'on挂起', bury:'onBury', notetype:'on更改笔记类型', deck:'on改牌组',
  reposition:'on重新定位', due:'on设置到期日', tags:'onTags', marking:'group',
  agent:'onAI改卡', help:'onHelp', exit:'onExit', delete:'on删除' };
const markingCallbacks = {mark:'onMark',unmark:'onMark',flag:'on设置标志',flag_names:'onFlagNames'};
const path = 'components/browser/批量操作栏.ets';

test('selection count replaces the browser title while Actions stays a manual menu entry', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private 取选中计数文案(');
  const countMethod = source.slice(start, source.indexOf('\n  }', start) + 4);
  const header = source.slice(source.indexOf('  private 顶部条()'), source.indexOf('  private quickFilterOptions()'));
  const titleExpression = header.match(/Text\((.+)\)\r?\n/)?.[1];
  assert.ok(titleExpression);
  const Page = new Function('$r', stripTypeScriptTypes(
    `class Page { ${countMethod}\n title() { return ${titleExpression}; } }`, { mode: 'transform' }) + '; return Page;')(key => key);
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string.map(e => [e.name, e.value]));
    const page = new Page();
    page.取本地化文案 = key => strings.get(key.replace('app.string.', ''));
    page.多选模式值 = false;
    page.选中ID列表 = [1, 2, 3];
    assert.equal(page.title(), 'app.string.browser_title');
    page.多选模式值 = true;
    for (const count of [0, 3, 1234]) {
      page.选中ID列表 = Array(count).fill(1);
      assert.equal(page.title(), strings.get('browser_select_count').replace('%d', String(count)));
    }
    assert.equal(visibleInterfaceItems('browser', {simple:false,agent:false,cloudDeck:false,themeHasTextures:false})
      .find(item => item.id === 'selection').titleKey, 'browser_selection_actions');
    const action = header.match(/点击回调: \(\): void => \{ this\.showBatchMenu = !this\.showBatchMenu; \}/)?.[0];
    assert.ok(action);
    page.showBatchMenu = false;
    new Function(action.slice(action.indexOf('{') + 1, -1)).call(page);
    assert.equal(page.showBatchMenu, true);
    new Function(action.slice(action.indexOf('{') + 1, -1)).call(page);
    assert.equal(page.showBatchMenu, false);
    assert.equal(page.选中ID列表.length, 1234);
  }
});

function dependencies(namedResourceText = (_context,key) => key, tracker = new AppInterfaceTracker()) {
  const deps = { CARD_FLAGS, customFlagLabel, namedResourceText, $r: key=>key };
  return { ...deps, visibleInterfaceItems, appInterface:tracker, actionMenuRows, toggleActionMenuBranch,
    actionIcon:loadPlatformModule('utils/ActionIcons.ets','actionIcon',deps),
    flagMenuChoices:loadPlatformModule('components/common/FlagMenuChoices.ets','flagMenuChoices',deps),
    应用尺寸:{compactMenuWidth:112,cardActionMenuWidth:176} };
}

test('batch popup uses localized registry order, keeps each existing action and closes before dispatch', () => {
  for (const locale of ['base','en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url),'utf8')).string.map(e=>[e.name,e.value]));
    const Menu = loadComponentLogic(path, '批量操作栏', dependencies((_context,key)=>strings.get(key)));
    const menu = new Menu(), calls = [];
    menu.getUIContext = () => undefined; menu.选中数 = 4; menu.Agent入口已启用 = true;
    menu.onClose = () => calls.push('close');
    for (const [id,callback] of Object.entries({...callbacks,...markingCallbacks})) {
      menu[callback] = callback === 'onMark' ? marked => calls.push(marked?'mark':'unmark') : () => calls.push(id);
    }
    const entries = menu.entries();
    assert.deepEqual(entries.map(e=>e.id),Object.keys(callbacks));
    assert.deepEqual(entries.map(e=>e.value), visibleInterfaceItems('browser_batch', {
      simple:false,agent:true,cloudDeck:false,themeHasTextures:false }).map(e=>strings.get(e.titleKey)));
    assert.deepEqual(entries.filter(e=>e.destructive).map(e=>e.id), ['delete']);
    assert.equal(entries.at(-1).id, 'delete');
    menu.expandedIds=[]; menu.selectItem('mark'); assert.deepEqual(calls, [], 'closed group rejects late clicks');
    const group=entries.find(e=>e.id==='marking');
    assert.deepEqual(group.children.map(e=>e.id),Object.keys(markingCallbacks));
    for (const entry of [...entries, ...group.children]) {
      assert.ok(entry.icon?.startsWith('app.media.'), `${entry.id}: missing action icon`);
    }
    menu.toggleBranch('marking'); assert.deepEqual(menu.expandedIds,['marking']);
    for (const entry of [...entries.filter(e=>e.id!=='marking'), ...group.children]) {
      calls.length = 0; menu.expandedIds = ['marking']; menu.selectItem(entry.id);
      assert.deepEqual(calls, entry.id==='flag'?['flag']:['close',entry.id]);
      menu.expandedIds=[];
    }
    menu.notesMode = true; menu.Agent入口已启用 = false;
    assert.deepEqual(menu.entries().map(e=>e.id), Object.keys(callbacks).filter(id=>!['due','reposition','agent'].includes(id)));
    assert.equal(menu.entries().at(-1).id, 'delete');
    calls.length = 0;
    for (const id of ['due','reposition','agent','unknown']) menu.selectItem(id);
    menu.busy = true; menu.selectItem('delete');
    assert.ok(menu.entries().every(e=>e.enabled===false));
    menu.busy = false; menu.选中数 = 0; menu.selectItem('delete');
    assert.deepEqual(calls, []);
  }
});

test('Back closes the popup before exiting selection; explicit exit clears the menu and selection', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets',import.meta.url),'utf8');
  const methods = ['onBackPress','退出多选'].map(name=> {
    const start = source.search(new RegExp(`  (?:private )?${name}\\(`));
    assert.ok(start>=0,name); return source.slice(start,source.indexOf('\n  }',start)+4);
  });
  const Page = new Function(stripTypeScriptTypes(`class Page {${methods.join('\n')}}`,{mode:'transform'})+'; return Page;')();
  const page = new Page();
  const Menu=loadComponentLogic(path,'批量操作栏',dependencies()), menu=new Menu();
  menu.getUIContext=()=>({}); menu.expandedIds=['marking','flag']; menu.选中数=2; menu.onClose=()=>{page.showBatchMenu=false;};
  Object.assign(page,{showBatchMenu:true,batchBackRequest:0,batchDialog:'none',多选模式值:true,选中ID列表:[1,2],selectionVersion:0,退出多选信号:0});
  assert.equal(page.onBackPress(),true);
  assert.equal(page.batchBackRequest,1); menu.handleBackRequest();
  assert.deepEqual(menu.expandedIds,['marking']); assert.equal(page.showBatchMenu,true);
  assert.equal(page.onBackPress(),true); menu.handleBackRequest();
  assert.equal(page.showBatchMenu,false); assert.deepEqual(page.选中ID列表,[1,2]); assert.equal(page.多选模式值,true);
  assert.equal(page.onBackPress(),true);
  assert.equal(page.多选模式值,false); assert.deepEqual(page.选中ID列表,[]);
  page.showBatchMenu=true; page.选中ID列表=[3]; page.多选模式值=true; page.退出多选();
  assert.equal(page.showBatchMenu,false); assert.deepEqual(page.选中ID列表,[]);
});

test('batch and study reuse the same marking popup, flag choices and viewport-limited scroll surface', () => {
  const read = file => readFileSync(new URL('../../entry/src/main/ets/'+file,import.meta.url),'utf8');
  const menu = read(path), page = read('pages/浏览页.ets'), surface = read('components/common/AnchoredMenu.ets');
  assert.match(menu,/CardActionMenu\(\{ items: this.entries\(\), menuWidth: 应用尺寸.cardActionMenuWidth, topOffset: this.topOffset/);
  assert.match(menu,/flagMenuChoices\(/); assert.doesNotMatch(menu,/Scroll\(|\.height\(|\.padding\(/);
  assert.match(read('pages/学习页.ets'),/flagMenuChoices\(/);
  assert.doesNotMatch(page,/BrowserFlagDialog\(/);
  assert.match(surface,/Scroll\(/); assert.match(surface,/maxHeight: this\.menuGeometry\(\)\.maxHeight/);
  assert.match(surface,/\.onAreaChange\([\s\S]*this.viewportHeight = Number\(area.height\)/);
  const content = page.slice(page.indexOf('private browserContent()'),page.indexOf('private browserInspection()'));
  assert.doesNotMatch(content,/批量操作栏\(/,'bottom panel must no longer reserve list space');
});

test('flag popup preserves seven colors, clear, custom names and submits only one current selection', () => {
  const tracker=new AppInterfaceTracker();
  const Menu=loadComponentLogic(path,'批量操作栏',dependencies((_context,key)=>key,tracker)),menu=new Menu(),calls=[];
  menu.getUIContext=()=>({}); menu.选中数=3; menu.labels={'7':'Custom purple'}; menu.onClose=()=>calls.push('close');
  menu.onFlag=flag=>calls.push(flag); menu.aboutToAppear();
  assert.deepEqual(tracker.snapshot().map(e=>e.surface).sort(),['browser_batch','browser_batch_marking']);
  menu.expandedIds=['marking']; menu.selectItem('flag'); menu.publishInterface();
  assert.deepEqual(tracker.snapshot().map(e=>e.surface).sort(),['browser_batch','browser_batch_flags','browser_batch_marking']);
  assert.deepEqual(tracker.snapshot().find(e=>e.surface==='browser_batch_flags').optionIds,['0','1','2','3','4','5','6','7']);
  const flags=menu.flagEntries(); assert.equal(flags.length,8); assert.equal(flags[7].value,'Custom purple');
  assert.equal(flags[0].iconTint,undefined); assert.equal(flags[0].selectionUsesAccent,false);
  menu.primaryObscured=true;menu.publishInterface();
  assert.deepEqual(tracker.snapshot().map(e=>e.surface).sort(),['browser_batch_flags','browser_batch_marking']);
  menu.on删除=()=>assert.fail('covered primary action must not execute');menu.selectItem('delete');
  menu.primaryObscured=false;menu.publishInterface();
  assert.ok(tracker.snapshot().some(e=>e.surface==='browser_batch'));
  flags[7].action(); assert.deepEqual(calls,['close',7]);
  calls.length=0; menu.busy=true; flags[0].action(); menu.busy=false; menu.expandedIds=[]; flags[0].action();
  menu.expandedIds=['marking','flag']; menu.submitFlag(8); assert.deepEqual(calls,[]);
  menu.aboutToDisappear(); menu.publishInterface(); assert.equal(tracker.snapshot().length,0);
});
