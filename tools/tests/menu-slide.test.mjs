import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuSlideSession, MenuSlideScope } from '../../entry/src/main/ets/model/MenuSlideSession.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { MENU_SLIDE_HOLD_MS } from '../../entry/src/main/ets/model/InteractionFeedback.ts';
import { MenuHoldController } from '../../entry/src/main/ets/model/MenuHoldController.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function harness() {
  const session=new MenuSlideSession(),scope=new MenuSlideScope(),events=[];
  scope.clip={left:10,top:50,width:200,height:300};scope.scroll=delta=>events.push(['scroll',delta]);session.attach(scope);
  const target=(top,options={})=>({scope,rect:{left:10,top,width:200,height:44},offset:0,layer:0,available:()=>true,
    highlight:active=>events.push(['highlight',top,active]),select:()=>events.push(['select',top]),enter:()=>events.push(['enter',top]),branch:false,...options});
  session.begin(()=>events.push('cancel'));return {session,scope,events,target};
}
test('slide release selects one real enabled target; moving out, cancellation and disabling cannot execute',()=>{
  const h=harness(),a=h.target(80);h.session.register(a);h.session.move(50,100,0);h.session.finish();h.session.finish();
  assert.equal(h.events.filter(e=>e[0]==='select').length,1);
  for(const cancel of ['outside','cancel','disable']) {
    const h=harness();let available=true;h.session.register(h.target(80,{available:()=>available}));h.session.move(50,100,0);
    if(cancel==='outside')h.session.move(500,100,30);if(cancel==='disable')available=false;
    if(cancel==='cancel')h.session.cancel();else h.session.finish();
    assert.equal(h.events.some(e=>e[0]==='select'),false);assert.ok(h.events.includes('cancel'));
  }
});
test('submenu dwell opens once, highest layer wins and scrolling uses the current offset without selecting at the edge',()=>{
  const h=harness(),branch=h.target(80,{branch:true});h.session.register(branch);
  h.session.move(50,100,0);h.session.move(50,100,219);assert.equal(h.events.some(e=>e[0]==='enter'),false);
  h.session.move(50,100,220);h.session.move(50,100,500);assert.equal(h.events.filter(e=>e[0]==='enter').length,1);
  const child=h.target(80,{layer:2,select:()=>h.events.push('child')});h.session.register(child);h.session.move(50,100,600);h.session.finish();assert.ok(h.events.includes('child'));
  const long=harness();long.session.register(long.target(180));long.scope.offset=100;
  long.session.move(50,100,0);long.session.finish();assert.ok(long.events.some(e=>e[0]==='select'&&e[1]===180));
  const edge=harness();edge.session.register(edge.target(310));edge.session.move(50,340,0);edge.session.finish();
  assert.ok(edge.events.some(e=>e[0]==='scroll'));assert.equal(edge.events.some(e=>e[0]==='select'),false);
});
test('only the top mounted menu receives slide input and a removed menu releases highlight',()=>{
  const h=harness(),old=h.target(80);h.session.register(old);const newer=new MenuSlideScope();newer.clip=h.scope.clip;
  h.session.attach(newer);h.session.move(50,100,0);h.session.finish();assert.equal(h.events.some(e=>e[0]==='select'),false);
  h.session.detach(newer);h.session.begin(()=>{});h.session.move(50,100,0);h.session.detach(h.scope);h.session.finish();
  assert.ok(h.events.some(e=>e[0]==='highlight'&&e[2]===false));
});

test('reactive wrappers share the mounted scope identity for selection and detach',()=>{
  const h=harness(),wrapped=new Proxy(h.scope,{}),target=h.target(80,{scope:wrapped});
  assert.notEqual(wrapped,h.scope);
  h.session.attach(wrapped);h.session.register(target);h.session.move(50,100,0);h.session.finish();
  assert.equal(h.events.filter(e=>e[0]==='select').length,1);
  h.session.begin(()=>h.events.push('cancel'));h.session.move(50,100,1);h.session.detach(wrapped);h.session.finish();
  assert.equal(h.events.filter(e=>e[0]==='select').length,1);
  assert.ok(h.events.some(e=>e[0]==='highlight'&&e[2]===false));
});

test('real flat and nested row builders pass the owning scope explicitly across builder boundaries',()=>{
  const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
  const scope=new MenuSlideScope(),selected=[];
  const list=loadComponentLogic('components/common/ActionMenuList.ets','ActionMenuList');
  const host=Object.assign(new list(),{slideScope:scope,items:[{id:'leaf',label:'Leaf'}],onSelect:id=>selected.push(id)});
  const options=read('components/common/ActionMenuList.ets').match(/AnchoredMenuItem\((\{[\s\S]*?\})\)/)[1];
  const props=new Function('item','index',stripTypeScriptTypes('const props='+options+';', {mode:'transform'})+'return props;').call(host,host.items[0],0);
  assert.equal(props.slideScope,scope);props.onSelect();assert.deepEqual(selected,['leaf']);
  host.items[0].available=false;props.onSelect();assert.deepEqual(selected,['leaf']);
  const source=read('components/common/CardActionMenu.ets'),start=source.indexOf('  private menuRow(');
  const method=source.slice(start,source.indexOf('\n  }',start)+4);let rowProps;
  const Rows=new Function('AnchoredMenuItem','TextAlign',stripTypeScriptTypes('class Rows {'+method+'};', {mode:'transform'})+'return Rows;')(props=>rowProps=props,{Start:0});
  const rows=Object.assign(new Rows(),{slideScope:scope,expandedIds:[],rowItem:()=>({value:'Leaf'}),primaryObscured:()=>false,selectEntry:row=>selected.push(row.node.id)});
  rows.menuRow({depth:1,enabled:true,node:{id:'child'}},0);
  assert.equal(rowProps.slideScope,scope);assert.equal(rowProps.slideLayer,1);rowProps.onSelect();assert.deepEqual(selected,['leaf','child']);
});
test('toolbar preserves ordinary click, suppresses post-hold click and cancels a second finger',()=>{
  const session=new MenuSlideSession();let interval,opens=0,closes=0,clicks=0;
  const TouchType={Down:0,Move:1,Up:2,Cancel:3};
  const clock={now:()=>0,repeat:fn=>{interval=fn;return 1;},stop:()=>{interval=null;}};
  const menuHoldTouch=loadPlatformModule('components/common/MenuHoldGesture.ets','menuHoldTouch',{TouchType});
  class Hold extends MenuHoldController { constructor(enabled,open,close) { super(enabled,open,close,session,clock); } }
  const Icon=loadComponentLogic('components/common/IconActionButton.ets','IconActionButton',{
    MENU_SLIDE_HOLD_MS,MenuHoldController:Hold,menuHoldTouch,$r:key=>key,Color:{Transparent:'transparent'},应用尺寸:{按钮高度:44},TouchType,
    setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{interval=null;}});
  const button=new Icon();Object.assign(button,{slideMenu:true,onHoldOpen:()=>opens++,onHoldCancel:()=>closes++,onAction:()=>clicks++});
  const touch=(type,touches=[{id:1,windowX:20,windowY:20}])=>button.slideTouch({type,touches,changedTouches:[{id:1,windowX:20,windowY:20}]});
  touch(0);touch(2,[]);button.activate();assert.equal(clicks,1);
  touch(0);button.holdOpen();assert.equal(opens,1);touch(2,[]);button.activate();assert.equal(clicks,1);assert.equal(closes,1);
  touch(0);button.holdOpen();touch(1,[{},{}]);button.activate();assert.equal(clicks,1);assert.equal(closes,2);assert.equal(interval,null);
});
