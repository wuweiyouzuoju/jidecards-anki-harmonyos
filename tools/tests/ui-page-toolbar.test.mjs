import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadComponentLogic, loadPlatformSource } from './platform-module-harness.mjs';
import { settingsHeaderControls, AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
const source=readFileSync(new URL('../../entry/src/main/ets/model/PageToolbarActions.ets',import.meta.url),'utf8').replace(/^@Observed\s*/gm,'');
const PageToolbarActionScope=new Function(stripTypeScriptTypes(source.replace(/^export /gm,''),{mode:'transform'})+';return PageToolbarActionScope;')();
const area=(x,y=20)=>({width:44,height:44,globalPosition:{x,y}});

test('each page owns its toolbar callbacks and filters content buttons outside the top row',()=>{
 const first=new PageToolbarActionScope(),second=new PageToolbarActionScope(),calls=[];
 Object.assign(first,{enabled:true,mounted:true,width:1000,left:100,top:0});
 for(const [id,x,y] of [['back',120,20],['save',1040,20],['body',400,300]])first.upsert({id,source:id,label:id,enabled:true,selected:false,feedback:'idle',area:area(x,y),activate:()=>calls.push(id)});
 assert.deepEqual(first.actions().map(item=>item.id),['back','save']);assert.equal(second.actions().length,0);
 assert.equal(first.side(first.actions()[0]),'left');assert.equal(first.side(first.actions()[1]),'right');
 first.actions()[0].activate();assert.deepEqual(calls,['back']);first.remove('back');assert.equal(first.contains('back'),false);
 first.dispose();assert.equal(first.enabled,false);assert.equal(first.actions().length,0);
});

test('a relocated real toolbar icon preserves the original callback and menu trigger without losing its top-row registration',()=>{
 const scope=new PageToolbarActionScope();Object.assign(scope,{enabled:true,mounted:true,width:900,left:0,top:0});
 const anchors=[],calls=[];
 const Button=loadComponentLogic('components/common/IconActionButton.ets','IconActionButton',{Color:{Transparent:'transparent'},应用尺寸:{按钮高度:44},rememberPopupTrigger:()=>{}});
 const button=new Button();Object.assign(button,{pageActions:scope,toolbarStyle:true,toolbarArea:area(800),triggerArea:area(800),
  source:'icon',label:'More',slideMenu:true,onMenuAnchor:(x,y)=>anchors.push([x,y]),onAction:()=>calls.push('original')});
 button.pageActionChanged();assert.equal(button.inPageWheel(),true);
 const actual=area(850,400);scope.actions()[0].activate(actual);
 assert.deepEqual(calls,['original']);assert.deepEqual(anchors,[[894,444]]);
 button.pageActionChanged();assert.equal(scope.actions().length,1,'trigger geometry must not replace the registered header location');
 button.isInteractive=false;button.pageActionChanged();assert.equal(scope.actions()[0].enabled,false);
 button.aboutToDisappear();assert.equal(scope.actions().length,0);
});

test('simple and experimental are independent exclusive icons in live settings knowledge',()=>{
 for(const simple of [true,false]) {
  const items=settingsHeaderControls(simple,false,true);
  assert.deepEqual(items.map(item=>item.id),['back','simple','full']);
  assert.deepEqual(items.filter(item=>item.selected).map(item=>item.id),[simple?'simple':'full']);
  const tracker=new AppInterfaceTracker();tracker.observe({surface:'settings',sectionId:'',selectedId:'',optionIds:[],optionLabels:[],busy:false,items});
  const result=buildAgentAppStructure({simple,agent:false,cloudDeck:false,themeHasTextures:false},'settings','',key=>key,[],[],tracker.snapshot());
  assert.deepEqual(result.settingsHeader.map(item=>item.id),['back','simple','full']);
 }
});

test('every current destination owns its toolbar scope and renders through the shared shell',()=>{
 const root=new URL('../../entry/src/main/ets/pages/',import.meta.url);
 let count=0;
 for(const name of readdirSync(root).filter(name=>name.endsWith('.ets'))) {
  const text=readFileSync(new URL(name,root),'utf8');if(!text.includes('NavDestination()'))continue;count++;
  assert.match(text,/@Provide\(PAGE_TOOLBAR_SCOPE\)/,name);
  assert.match(text,/NavDestination\(\) \{\s*PageActionShell\(/,name);
 }
 assert.equal(count,11);
});

test('ordinary pages preserve original top actions even when home uses the sidebar',()=>{
 const text=readFileSync(new URL('../../entry/src/main/ets/components/common/PageActionShell.ets',import.meta.url),'utf8');
 assert.match(text,/this.scope.enabled = false/);
 assert.match(text,/this.scope.mounted = false/);
 assert.doesNotMatch(text,/NoteEditorWheel|useHomeActionWheels/);
 const settings=readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets',import.meta.url),'utf8');
 assert.doesNotMatch(settings,/toolbarLayoutMode/);
 assert.match(settings,/settingsHeaderControls\(this.简洁模式, this.显示模式菜单\)/);
});
