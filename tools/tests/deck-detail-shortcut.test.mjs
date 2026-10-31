// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deckDetailShortcut, deckDetailShortcuts } from '../../entry/src/main/ets/model/DeckDetailShortcut.ts';
import { deckScopeSearch } from '../../entry/src/main/ets/model/DeckScope.ts';
import { 自定义学习预设 } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

function pageMethods(names) {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets',import.meta.url),'utf8');
  const methods=names.map(name=>{const start=source.indexOf('  private '+name+'(');assert.ok(start>=0,name);
    return source.slice(start,source.indexOf('\n  }',start)+4);});
  return new Function('deckDetailShortcut','deckScopeSearch','自定义学习预设','牌组显示名',
    stripTypeScriptTypes('class Page {'+methods.join('\n')+'}',{mode:'transform'})+';return Page;')(
    deckDetailShortcut,deckScopeSearch,自定义学习预设,deck=>deck.displayName||deck.name);
}

test('detail actions reuse real rename and distinct Core new/review limits; filtered decks only browse',()=>{
  assert.equal(deckDetailShortcut('name',false).opens,'deck_rename');
  assert.equal(deckDetailShortcut('new',false).preset,自定义学习预设.新卡上限增量);
  assert.equal(deckDetailShortcut('review',false).preset,自定义学习预设.复习上限增量);
  for(const filtered of [false,true]) {
    assert.equal(deckDetailShortcut('total',filtered).query,'');
    assert.equal(deckDetailShortcut('learning',filtered).query,'is:learn');
    for(const item of deckDetailShortcuts(filtered))assert.ok(item.instructionsKey);
  }
  assert.equal(deckDetailShortcut('new',true).opens,'browser');
  assert.equal(deckDetailShortcut('review',true).query,'is:review is:due');
  assert.equal(deckDetailShortcut('unknown',false),undefined);
});

test('home dispatch preserves the selected deck, handles removed IDs and opens the original rename flow',()=>{
  const Page=pageMethods(['openDeckDetailShortcut']), calls=[];
  const page=new Page();let deck={id:'42',filtered:false};
  Object.assign(page,{选中的牌组ID:'42',按ID查牌组:id=>{assert.equal(id,'42');return deck;},
    openDeckRename:id=>calls.push(['rename',id]),打开浏览页:(...args)=>calls.push(['browser',...args]),
    打开自定义学习:(...args)=>calls.push(['custom',...args])});
  for(const id of ['name','total','learning','new','review'])page.openDeckDetailShortcut(id);
  assert.deepEqual(calls,[['rename','42'],['browser','42',''],['browser','42','is:learn'],
    ['custom','42',自定义学习预设.新卡上限增量],['custom','42',自定义学习预设.复习上限增量]]);
  calls.length=0;deck.filtered=true;page.openDeckDetailShortcut('new');page.openDeckDetailShortcut('review');
  assert.deepEqual(calls,[['browser','42','is:new'],['browser','42','is:review is:due']]);
  deck={id:''};calls.length=0;page.openDeckDetailShortcut('name');page.openDeckDetailShortcut('new');assert.deepEqual(calls,[]);
});

test('browser navigation scopes real names with escaping and refreshes on return; sync preserves query',()=>{
  const Page=pageMethods(['打开浏览页']), paths=[],deferred=[];
  const deck={id:'42',fullName:'Parent::"quoted_*\\"'};
  let busy=true,refresh=0;
  const page=Object.assign(new Page(),{deferForSync:fn=>{if(busy)deferred.push(fn);return busy;},
    按ID查牌组:()=>deck,暂停主页官方公告检查:()=>{},页面栈:{pushPath:path=>paths.push(path)},返回主页后刷新:()=>refresh++});
  page.打开浏览页('42','is:learn');assert.equal(paths.length,0);busy=false;deferred[0]();
  assert.equal(paths[0].param.initialSearch,deckScopeSearch(deck.fullName)+' is:learn');
  assert.equal(paths[0].param.deckId,'42');paths[0].onPop();assert.equal(refresh,1);
});

test('custom-study shortcut retains preset over deferred sync and rejects filtered decks',()=>{
  const Page=pageMethods(['打开自定义学习']),pending=[];let busy=true,filtered=false;
  const page=Object.assign(new Page(),{deferForSync:fn=>{if(busy)pending.push(fn);return busy;},
    按ID查牌组:id=>({id,name:'Core name',displayName:'',filtered}),显示自定义学习:false});
  page.打开自定义学习('42',自定义学习预设.复习上限增量);assert.equal(page.显示自定义学习,false);
  busy=false;pending[0]();assert.equal(page.customStudyInitialPreset,自定义学习预设.复习上限增量);
  assert.equal(page.自定义学习牌组名,'Core name');assert.equal(page.显示自定义学习,true);
  page.显示自定义学习=false;filtered=true;page.打开自定义学习('42');assert.equal(page.显示自定义学习,false);
});

test('detail observation follows actual filtered destinations and copied live controls without granting writes',()=>{
  const tracker=new AppInterfaceTracker();
  const Details=loadComponentLogic('components/牌组详情面板.ets','牌组详情面板',{
    应用尺寸:loadPlatformModule('utils/应用尺寸.ets','应用尺寸',{}),appInterface:tracker,
    deckDetailShortcut,deckDetailShortcuts,namedResourceText:(_,key)=>key,牌组显示名:deck=>deck.name,
    AI_AGENT_CHANNELS_APP_STORAGE_KEY:'agent',颜色键:{}});
  const deck={id:'42',name:'Core',fullName:'Core',displayName:'',filtered:false,totalCards:9,newCount:1,learningCount:2,reviewCount:3};
  const page=Object.assign(new Details(),{getUIContext:()=>({}),选中牌组Id:'42',主页快照数据:{decks:[deck]}});
  page.aboutToAppear();assert.equal(tracker.snapshot()[0].items.find(x=>x.id==='new').opens,'custom_study');
  deck.filtered=true;page.publishInterface();assert.equal(tracker.snapshot()[0].items.find(x=>x.id==='new').opens,'browser');
  assert.equal(tracker.snapshot()[0].items.find(x=>x.id==='name').opens,'deck_rename');
  page.aboutToDisappear();assert.deepEqual(tracker.snapshot(),[]);
});
