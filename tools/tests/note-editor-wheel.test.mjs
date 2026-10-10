// SPDX-License-Identifier: AGPL-3.0-or-later
import { motionApi } from './motion-harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NoteWheelRotation, noteWheelDistance, noteWheelAngleStep, noteWheelViewportHeight, noteWheelRadius, noteWheelY,
  noteWheelIndex, noteEditorWheelTools, noteWheelItemGap, noteWheelItemPosition,
  NOTE_EDITOR_WHEEL_VISIBLE_COUNT, NOTE_EDITOR_WHEEL_DRAG_GAIN, NoteEditorWheelSession,
  noteWheelAxisDelta, NoteWheelMouseRotation, noteWheelTrackRadius, noteWheelLabel,
  noteEditorWheelCommonTools, noteEditorWheelOuterTools } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import * as wheelModel from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { NOTE_EDITOR_ACTION_FLASH_MS, NOTE_FIELD_EDITING_SUPPORT, noteEditorTool, noteEditorFormatOptions } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { AppInterfaceTracker, noteEditorWheelObservation, noteEditorFormatObservation, APP_INTERFACE_SURFACES } from '../../entry/src/main/ets/model/AppInterface.ts';

const state={cloze:false,source:false,expanded:false,activeIds:[]};
const point=(angle,right,radius=112)=>({x:right?radius-88*Math.cos(angle):88*Math.cos(angle),y:radius+88*Math.sin(angle)});
test('arc rotation follows fractional finger motion on either edge and reverses without jumps',()=>{
 for(const right of [true,false]) {
  const rotation=new NoteWheelRotation(),start=point(-0.4,right);
  rotation.begin(start.x,start.y,112,right);
  const small=point(-0.35,right);assert.ok(Math.abs(rotation.move(small.x,small.y)+0.05/noteWheelAngleStep(112)*NOTE_EDITOR_WHEEL_DRAG_GAIN)<1e-10);
  const farther=point(0.4,right);assert.ok(Math.abs(rotation.move(farther.x,farther.y)+0.8/noteWheelAngleStep(112)*NOTE_EDITOR_WHEEL_DRAG_GAIN)<1e-10);
  assert.ok(Math.abs(rotation.move(start.x,start.y))<1e-10);
 }
 const rotation=new NoteWheelRotation(),start=point(Math.PI-0.02,true),end=point(-Math.PI+0.02,true);
 rotation.begin(start.x,start.y,112,true);
 assert.ok(Math.abs(rotation.move(end.x,end.y)+0.04/noteWheelAngleStep(112)*NOTE_EDITOR_WHEEL_DRAG_GAIN)<1e-10);
});
test('arc wrapping and selection use the nearest icon and stable tool identities',()=>{
 assert.equal(noteWheelIndex(-1,14),13);assert.equal(noteWheelIndex(14,14),0);
 assert.ok(Math.abs(noteWheelDistance(0,13.7,14)-0.3)<1e-10);
 assert.ok(Math.abs(noteWheelDistance(13,0.2,14)+1.2)<1e-10);
 const tools=noteEditorWheelTools({...state,activeIds:['bold']});
 assert.equal(tools.find(item=>item.id==='bold').active,true);
 assert.equal(tools.length,14);assert.equal(tools[0].id,'bold');assert.equal(tools.some(item=>['none','more','source','expand'].includes(item.id)),false);
 assert.deepEqual(noteEditorWheelCommonTools(state).map(tool=>tool.id),['bold','italic','underline','highlight','break','clear_format']);
 assert.equal(noteEditorWheelOuterTools(state).length,8);
 const cloze=noteEditorWheelTools({...state,cloze:true,source:true,expanded:true});
 assert.equal(cloze.length,16);assert.equal(noteEditorWheelOuterTools({...state,cloze:true}).length,10);
 assert.ok(cloze.every(item=>item.iconKey.startsWith('ic_editor_')));
});
test('seven symbols share one circle with equal chord spacing and mirrored angles on either edge',()=>{
 assert.equal(NOTE_EDITOR_WHEEL_VISIBLE_COUNT,7);
 for(const [width,height] of [[377,720],[377,250],[280,200],[160,176]]){
  const radius=noteWheelRadius(width,height);assert.ok(radius<=164);assert.ok(radius*2+16<=height);
  assert.equal(noteWheelY(-100,height,radius,false),radius+8);
  assert.equal(noteWheelY(10000,height,radius,false),height-radius-8);
  const gap=noteWheelItemGap(radius),track=noteWheelTrackRadius(radius);assert.equal(noteWheelAngleStep(radius),Math.PI*25/180);
  for(const right of [false,true])for(let index=-3;index<=3;index++){
   const item=noteWheelItemPosition(index,radius,right);
   assert.ok(item.x>=0&&item.x<=radius);assert.ok(item.y>=0&&item.y<=radius*2);
   assert.ok(Math.abs(Math.hypot(item.x-(right?radius:0),item.y-radius)-track)<1e-10);
   const mirrored=noteWheelItemPosition(-index,radius,right);
   assert.ok(Math.abs(item.x-mirrored.x)<1e-10);assert.ok(Math.abs(item.y+mirrored.y-radius*2)<1e-10);
   const otherEdge=noteWheelItemPosition(index,radius,!right);assert.ok(Math.abs(item.x+otherEdge.x-radius)<1e-10);
   if(index<3){const next=noteWheelItemPosition(index+1,radius,right);assert.ok(Math.abs(Math.hypot(next.x-item.x,next.y-item.y)-gap)<1e-10);}
  }
 }
 assert.equal(noteWheelY(1000,250,112,true),214);
 assert.equal(noteWheelViewportHeight(815,0,502),502);
 assert.equal(noteWheelViewportHeight(450,52,502),450); // 已避让的页面不再减一次键盘高度。
 assert.equal(noteWheelViewportHeight(815,0,0),815);
});
test('JIDE observes current tools, hidden cloze, grip fallback and collapsed actions; late removal cannot erase a new field',()=>{
 const tracker=new AppInterfaceTracker();
 const first=tracker.observe(noteEditorWheelObservation(state,'link','right',false,'unsupported'));
 const snapshot=tracker.snapshot()[0];assert.equal(snapshot.selectedId,'link');
 assert.equal(snapshot.values.find(item=>item.id==='visible_tools').value,'13');
 assert.equal(snapshot.values.find(item=>item.id==='inner_tools').value,'bold,italic,underline,highlight,break,clear_format');
 assert.equal(snapshot.values.find(item=>item.id==='activation').value,'click_only_rotation_preserves_multiple_selection');
 const target=noteEditorWheelObservation({...state,fieldName:'Front'},'bold','right',false,'unsupported');
 assert.equal(target.values.find(item=>item.id==='target_field').value,'Front');
 assert.equal(snapshot.values.find(item=>item.id==='grip_availability').value,'unsupported');
 assert.equal(snapshot.items.some(item=>item.id==='cloze_next'),false);
 const next=tracker.observe(noteEditorWheelObservation({...state,cloze:true,source:true},'subscript','left',true,'available'));
 tracker.leave('note_editor_wheel',first);assert.equal(tracker.snapshot()[0].selectedId,'subscript');
 assert.ok(tracker.snapshot()[0].items.every(item=>item.id==='position'||item.enabled===false));
 assert.equal(noteEditorWheelObservation(state,'','right',true,'unsupported').items.some(item=>item.id==='none'),false);
 tracker.leave('note_editor_wheel',next);assert.deepEqual(tracker.snapshot(),[]);
 const declaration=APP_INTERFACE_SURFACES.find(item=>item.id==='note_editor_wheel');
 assert.ok(declaration.instructionsKey);assert.equal(declaration.items.length,17);
});

function wheelHarness(initialTool=''){
 const actions=[],longActions=[],resets=[],timers=new Map();let timerId=0;
 const Component=loadComponentLogic('components/editor/NoteEditorWheel.ets','NoteEditorWheel',{ ...motionApi(),
  ...wheelModel,NOTE_EDITOR_ACTION_FLASH_MS,NOTE_FIELD_EDITING_SUPPORT,noteEditorTool,noteEditorFormatOptions,TouchType:{Down:0,Up:1,Cancel:3},StudyGripSensor:class{},StudyGripSession:class{setActive(){}dispose(){}setTouching(){}restoreSide(){}},
  appInterface:new AppInterfaceTracker(),noteEditorWheelObservation,noteEditorFormatObservation,
  setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id),
  curves:{springCurve:()=>0},Curve:{EaseOut:0,EaseInOut:0},AxisAction:{BEGIN:1,UPDATE:2,END:3,CANCEL:4}
 });
 const instance=new Component();instance.params={state,onAction:id=>actions.push(id),onLongAction:id=>longActions.push(id),visible:true,initialTool,onSelection:()=>{},
  onOptionSelect:id=>actions.push('size:'+id),onCloseOptions:()=>{instance.params.state={...instance.params.state,optionsOpen:false};instance.parametersChanged();},
  onResetFormats:()=>{resets.push(true);instance.params.state={...instance.params.state,activeIds:[]};instance.parametersChanged();}};
 instance.getUIContext=()=>({getHostContext:()=>undefined,animateTo:(_opts,apply)=>apply()});
 instance.viewportWidth=377;instance.viewportHeight=720;instance.aboutToAppear();
 const flush=()=>{const pending=[...timers.values()];timers.clear();for(const timer of pending)timer.callback();};
 const axis=(action,value=0,scrollStep=1)=>instance.axisWheel({action,scrollStep,getVerticalAxisValue:()=>value});
 return {instance,actions,longActions,resets,timers,flush,axis};
}

test('math tap and hold dispatch separate actions and never double-apply when release also sends a click',()=>{
 const h=wheelHarness();h.instance.clickTool('math');assert.deepEqual(h.actions,['math']);
 h.instance.toolTouch('math', {touches:[],type:0});h.instance.longPressTool('math');h.instance.clickTool('math');
 assert.deepEqual(h.actions,['math']);assert.deepEqual(h.longActions,['math']);
 h.instance.toolTouch('math', {touches:[],type:0});h.instance.clickTool('math');assert.deepEqual(h.actions,['math','math']);
 h.instance.longPressTool('heading');assert.deepEqual(h.longActions,['math']);
 h.instance.params.visible=false;h.instance.parametersChanged();h.instance.longPressTool('math');
 assert.deepEqual(h.longActions,['math']);
});

test('JIDE and the real format dialog enumerate the same options and release only their own observation',()=>{
 const tracker=new AppInterfaceTracker(),selected=[];
 const Dialog=loadComponentLogic('components/editor/NoteEditorFormatDialog.ets','NoteEditorFormatDialog',{
  appInterface:tracker,noteEditorFormatObservation,noteEditorFormatOptions,noteEditorTool,namedResourceText:(_ctx,key)=>key
 });
 for(const toolId of ['font_size','heading','math']){
  const dialog=new Dialog();Object.assign(dialog,{toolId,fieldName:'Front',source:false,getUIContext:()=>({}),onSelect:id=>selected.push(id)});
  dialog.aboutToAppear();const snapshot=tracker.snapshot()[0];
  assert.equal(snapshot.sectionId,toolId);assert.deepEqual(snapshot.optionIds,dialog.options().map(option=>toolId+'_'+option.id));
  assert.equal(snapshot.values.find(value=>value.id==='target_field').value,'Front');
  assert.equal(snapshot.items.every(item=>item.enabled),true);
  for(const option of dialog.options())dialog.select(option.id);
  const count=selected.length;dialog.select('unknown');assert.equal(selected.length,count);
  dialog.aboutToDisappear();assert.deepEqual(tracker.snapshot(),[]);
 }
 assert.equal(selected.length,14);
 assert.equal(NOTE_FIELD_EDITING_SUPPORT.tools.find(tool=>tool.id==='math').longPressAction,'choose_block_or_chemistry');
 assert.deepEqual(noteEditorWheelOuterTools(state).slice(-2).map(tool=>tool.id),['font_size','heading']);
 for(const toolId of ['font_size','heading','math'])assert.equal(NOTE_FIELD_EDITING_SUPPORT.formatMenus.find(menu=>menu.toolId===toolId).options,noteEditorFormatOptions(toolId));
});

test('only explicit inner or outer clicks apply; touch rotation preserves selection without applying a centered tool',()=>{
 const h=wheelHarness();assert.equal(h.instance.selectedId,'');h.flush();assert.deepEqual(h.actions,[]);
 h.instance.execute('bold');assert.deepEqual(h.actions,['bold']);assert.equal(h.instance.selectedId,'bold');
 const start=noteWheelItemPosition(0,h.instance.radius(),true),end=noteWheelItemPosition(-1,h.instance.radius(),true);
 h.instance.rotateStart({fingerList:[{globalX:start.x,globalY:start.y}],offsetX:0,offsetY:0});assert.equal(h.instance.selectedId,'bold');
 h.instance.rotateWheel({offsetX:end.x-start.x,offsetY:end.y-start.y});h.instance.settleRotation();h.flush();assert.deepEqual(h.actions,['bold']);
 assert.equal(h.instance.selectedId,'bold');assert.equal(h.instance.arcPosition,1);
 h.instance.select(1);assert.deepEqual(h.actions,['bold','superscript']);
 h.instance.execute('bold');h.instance.execute('bold');assert.deepEqual(h.actions,['bold','superscript','bold','bold']);
 h.instance.toggleOpen();assert.equal(h.instance.selectedId,'bold');assert.equal(h.resets.length,0);
 h.instance.toggleOpen();h.flush();assert.equal(h.instance.selectedId,'');assert.equal(h.resets.length,1);assert.equal(h.actions.length,4);
});
test('vertical wheel deltas preserve selections and use independent damping; unavailable buttons cannot apply',()=>{
 assert.equal(noteWheelAxisDelta(45,3),1);assert.equal(noteWheelAxisDelta(-15),-1);assert.equal(noteWheelAxisDelta(NaN),0);
 const h=wheelHarness();h.axis(1,45,3);h.axis(3);h.flush();assert.equal(h.instance.selectedId,'');assert.deepEqual(h.actions,[]);
 h.axis(1,45,3);h.axis(3);h.flush();assert.equal(h.instance.selected().id,'superscript');assert.deepEqual(h.actions,[]);
 h.instance.execute('underline');assert.equal(h.instance.selectedId,'underline');
 h.axis(1,-15);assert.equal(h.instance.selectedId,'underline');h.axis(3);h.flush();assert.equal(h.instance.selected().id,'superscript');
 h.axis(1,-15);h.axis(3);h.flush();assert.equal(h.instance.selected().id,'math');assert.deepEqual(h.actions,['underline']);
 h.axis(1,1500);h.axis(2,1500);h.axis(4);h.flush();assert.deepEqual(h.actions,['underline']);
 h.instance.params.visible=false;h.instance.parametersChanged();h.instance.select(2);h.instance.execute('bold');h.flush();assert.deepEqual(h.actions,['underline']);
 h.instance.params.visible=true;h.instance.parametersChanged();h.instance.toggleOpen();h.instance.select(3);h.instance.execute('bold');h.flush();assert.deepEqual(h.actions,['underline']);
 h.instance.toggleOpen();h.instance.aboutToDisappear();h.instance.select(4);h.instance.execute('bold');h.flush();assert.deepEqual(h.actions,['underline']);
});
test('mouse damping cancels opposite partial notches and bounds oversized packets to one item per two events',()=>{
 const mouse=new NoteWheelMouseRotation();
 assert.equal(mouse.move(15),0);assert.equal(mouse.move(-15),0);assert.equal(mouse.move(-15),0);assert.equal(mouse.move(-15),-1);
 assert.equal(mouse.move(45000),0);assert.equal(mouse.move(45000),1);
 assert.equal(mouse.move(15),0);mouse.reset();assert.equal(mouse.move(15),0);assert.equal(mouse.move(15),1);
 assert.equal(mouse.move(NaN),0);
});
test('concentric circular buttons remain separate with matching ring centers on both screen edges',()=>{
 const h=wheelHarness();
 for(const width of [320,377,430])for(const right of [true,false]){
  h.instance.viewportWidth=width;
  h.instance.side=right?'right':'left';
  const boxes=h.instance.wheelTools.map((_,index)=>{
   const w=h.instance.itemWidth(),height=h.instance.itemHeight(),size=h.instance.circleSize();
   const position=noteWheelItemPosition(h.instance.distance(index),h.instance.radius(),right,false,true,h.instance.wheelTools.length);
   const x=h.instance.x(index),y=h.instance.iconY(index);
   assert.ok(Math.abs(x+w/2-position.x)<1e-10);assert.ok(Math.abs(y+size/2-position.y)<1e-10);
   return {x,y,w,height};
  });
  for(let index=0;index<h.instance.commonTools.length;index++){
   const w=h.instance.itemWidth(true),height=h.instance.itemHeight(true),size=h.instance.circleSize(true),
    position=noteWheelItemPosition(index-2.5,h.instance.radius(),right,true),x=h.instance.x(index,true),y=h.instance.iconY(index,true);
   assert.ok(Math.abs(x+w/2-position.x)<1e-10);assert.ok(Math.abs(y+size/2-position.y)<1e-10);
   assert.ok(Math.abs(Math.hypot(position.x-(right?h.instance.radius():0),position.y-h.instance.radius())-noteWheelTrackRadius(h.instance.radius(),true))<1e-10);
   boxes.push({x,y,w,height});
  }
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
   const first=boxes[a],second=boxes[b];
   const distance=Math.hypot(first.x+first.w/2-second.x-second.w/2,first.y+first.height/2-second.y-second.height/2);
   assert.ok(distance>=(first.w+second.w)/2,`${width}: ${a} overlaps ${b}`);
  }
 }
});
test('icons and two-line captions retain edge clearance; normal outer items align with common radial positions',()=>{
 const h=wheelHarness();
 for(const width of [320,377,430])for(const right of [true,false])for(const cloze of [false,true]){
  h.instance.viewportWidth=width;h.instance.side=right?'right':'left';h.instance.params.state={...state,cloze};h.instance.parametersChanged();
  const radius=h.instance.radius();
  for(const common of [true,false])for(let index=0;index<(common?h.instance.commonTools:h.instance.wheelTools).length;index++){
   if(!common&&!h.instance.iconVisible(index))continue;
   const size=h.instance.circleSize(common),x=h.instance.x(index,common)+h.instance.itemWidth(common)/2,
    y=h.instance.iconY(index,common)+size/2,w=h.instance.labelWidth(common),bottom=(common?33:37)/2;
   assert.ok(Math.hypot(x-(right?radius:0),y-radius)+size/2<=radius-6,`${width}/${cloze}/${common}/${index}: button touches boundary`);
   assert.ok(Math.hypot(w/2,bottom)<=size/2,`caption is outside ${common?'inner':'outer'} button`);
  }
  if(!cloze){
   assert.equal(h.instance.trackRadius(false)-h.instance.trackRadius(true),46);
   assert.equal(wheelModel.noteWheelAngleStep(radius,6),wheelModel.noteWheelCommonAngleStep());
  }
 }
});

test('the handle flips toward opening or closing on either edge using the same animation progress',()=>{
 for(const right of [true,false]){
  assert.equal(wheelModel.noteWheelHandleAngle(1,right),right?0:180);
  assert.equal(wheelModel.noteWheelHandleAngle(0,right),right?180:0);
  assert.equal(wheelModel.noteWheelHandleAngle(0.5,right),90);
  for(const collapsed of [false,true]){
   const side=right?'right':'left',item=noteEditorWheelObservation(state,'none',side,collapsed,'unsupported').items.find(item=>item.id==='position');
   assert.equal(item.iconKey,right!==collapsed?'ic_common_arrow_right':'ic_common_arrow_left');
  }
 }
 const source=readFileSync(new URL('../../entry/src/main/ets/components/editor/NoteEditorWheel.ets',import.meta.url),'utf8');
 assert.match(source,/DisclosureChevron\(\{ tint: this.accent \}\)\s*\.rotate\(\{ angle: noteWheelHandleAngle\(this.openProgress, this.side === 'right'\) \}\)/);
});
test('default wheel exposes both arcs and rejects cloze actions after switching to a field without cloze capability',()=>{
 const h=wheelHarness();
 assert.equal(h.instance.wheelTools.length,8);assert.equal(h.instance.commonTools.length,6);assert.equal(h.instance.radius(),158);
 assert.equal(h.instance.trackRadius(true),82);assert.equal(h.instance.trackRadius(false),128);
 h.instance.execute('superscript');h.flush();assert.deepEqual(h.actions,['superscript']);
 h.instance.execute('cloze_next');h.instance.execute('missing');assert.deepEqual(h.actions,['superscript']);
 h.instance.params.state={...state,cloze:true};h.instance.parametersChanged();
 assert.equal(h.instance.wheelTools.length,10);h.instance.execute('cloze_next');h.flush();
 assert.deepEqual(h.actions,['superscript','cloze_next']);
 const cloze=noteEditorWheelObservation(h.instance.params.state,'','right',false,'unsupported');
 assert.equal(cloze.values.find(value=>value.id==='cloze_enabled').value,'true');
 assert.equal(cloze.items.some(item=>item.id==='cloze_same'),true);
 h.instance.params.state=state;h.instance.parametersChanged();h.flush();
 h.instance.execute('cloze_same');assert.deepEqual(h.actions,['superscript','cloze_next']);
 const normal=noteEditorWheelObservation(state,'','right',false,'unsupported');
 assert.equal(normal.values.find(value=>value.id==='cloze_enabled').value,'false');
 assert.equal(normal.items.some(item=>item.id==='cloze_next'),false);
});
test('Chinese ring captions balance long names into two lines and retain complete non-Chinese labels',()=>{
 assert.equal(noteWheelLabel('粗体',33),'粗体');assert.equal(noteWheelLabel('下划线',33),'下划线');
 assert.equal(noteWheelLabel('清除格式',33),'清除\n格式');assert.equal(noteWheelLabel('编号列表',33),'编号\n列表');
 assert.equal(noteWheelLabel('展开输入框',33),'展开\n输入框');assert.equal(noteWheelLabel('Clear formatting',33),'Clear formatting');
});
test('restoring an inner selection or updating parameters does not execute the tool or rotate the outer ring',()=>{
 const h=wheelHarness('bold');assert.equal(h.instance.selectedId,'bold');assert.equal(h.instance.arcPosition,0);h.flush();assert.deepEqual(h.actions,[]);
 h.instance.params.state={...state,activeIds:['bold']};h.instance.parametersChanged();assert.equal(h.instance.selectedId,'bold');h.flush();assert.deepEqual(h.actions,[]);
});
test('wheel places each label below its symbol; gestures keep the handle separate from the rotating surface',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/components/editor/NoteEditorWheel.ets',import.meta.url),'utf8');
 assert.match(source,/Text\(noteWheelLabel\(this.title\(tool\), this.labelWidth\(common\),/);
 assert.match(source,/buildNoteEditorWheel\(params:[\s\S]*?Column\(\) \{[\s\S]*?hitTestBehavior\(HitTestMode.Transparent\)/);
 assert.match(source,/GestureGroup\(GestureMode.Exclusive/);
 assert.match(source,/\.width\(this.itemWidth\(common\)\)\.height\(this.itemHeight\(common\)\)/);
 assert.match(source,/glyphSize: \(common \? 16 : 18\) \* this.contentScale\(\)/);
 assert.match(source,/\.fontSize\([\s\S]*?maxLines\(2\).*wordBreak/);
 assert.match(source,/private toolButton[\s\S]*?type\(ButtonType.Circle\)/);
 assert.doesNotMatch(source,/emptyDock|emptyButton|note_editor_none/);
 assert.match(source,/viewportWidth - 28/);
});

test('multiple formats highlight from current field state; reused entries and the last click cannot leave a disabled format lit',()=>{
 const h=wheelHarness(),oldBold=h.instance.commonTools.find(tool=>tool.id==='bold');assert.equal(oldBold.active,false);
 h.instance.params.state={...state,activeIds:['bold','italic','highlight']};h.instance.parametersChanged();
 assert.equal(h.instance.current(oldBold),true);
 for(const tool of h.instance.commonTools)assert.equal(h.instance.current(tool),['bold','italic','highlight'].includes(tool.id));
 h.instance.selectedId='italic';h.instance.params.state={...state,activeIds:['bold','highlight']};h.instance.parametersChanged();
 assert.equal(h.instance.current(oldBold),true);assert.equal(h.instance.current(h.instance.commonTools.find(tool=>tool.id==='italic')),false);
 h.axis(1,15);h.axis(3);assert.equal(h.instance.current(oldBold),true);
 const observation=noteEditorWheelObservation(h.instance.params.state,'italic','right',false,'unsupported');
 assert.deepEqual(observation.items.filter(item=>item.selected).map(item=>item.id),['bold','highlight']);
 h.instance.toggleOpen();assert.equal(h.resets.length,0);assert.deepEqual(h.instance.params.state.activeIds,['bold','highlight']);
 h.instance.toggleOpen();assert.equal(h.resets.length,1);assert.deepEqual(h.instance.params.state.activeIds,[]);assert.equal(h.instance.current(oldBold),false);
});

test('all one-shot tools flash briefly, execute once and leave multiple format toggles unchanged',()=>{
 const h=wheelHarness();h.instance.params.state={...state,cloze:true,activeIds:['bold','highlight']};h.instance.parametersChanged();
 const oneShots=wheelModel.noteEditorWheelTools(h.instance.params.state).filter(tool=>!wheelModel.noteWheelToolIsToggle(tool.id,false)&&
  !NOTE_FIELD_EDITING_SUPPORT.formatOptionPicker.toolIds.includes(tool.id));
 for(const tool of oneShots){
  const before=h.actions.length;h.instance.execute(tool.id);
  assert.equal(h.instance.current(tool),true);assert.equal(h.actions.length,before+1);assert.equal(h.actions.at(-1),tool.id);
  assert.equal([...h.timers.values()].some(timer=>timer.delay===NOTE_EDITOR_ACTION_FLASH_MS),true);
  const during=noteEditorWheelObservation(h.instance.params.state,h.instance.selectedId,'right',false,'unsupported');
  assert.deepEqual(during.items.filter(item=>item.selected).map(item=>item.id),['bold','highlight']);
  h.flush();assert.equal(h.instance.current(tool),false);assert.equal(h.instance.selectedId,'');assert.equal(h.actions.length,before+1);
  for(const id of ['bold','highlight'])assert.equal(h.instance.current(h.instance.commonTools.find(item=>item.id===id)),true);
 }
 const declaration=noteEditorWheelObservation(state,'','right',false,'unsupported');
 assert.equal(declaration.values.find(item=>item.id==='one_shot_feedback').value,'brief_flash_without_toggle');
 assert.equal(declaration.values.find(item=>item.id==='one_shot_flash_ms').value,String(NOTE_EDITOR_ACTION_FLASH_MS));
 assert.deepEqual(NOTE_FIELD_EDITING_SUPPORT.toolMenu.toggleToolIds,['bold','italic','underline','highlight']);
 assert.equal(NOTE_FIELD_EDITING_SUPPORT.toolMenu.oneShotFeedback,'brief_flash_without_toggle');
 const restored=wheelHarness('bullet_list');assert.equal(restored.instance.selectedId,'');assert.deepEqual(restored.actions,[]);
});

test('old flash expiry cannot erase a later click or survive collapse, hiding or disposal',()=>{
 const h=wheelHarness();h.instance.execute('bullet_list');const stale=[...h.timers.values()][0].callback;
 h.instance.execute('numbered_list');stale();assert.equal(h.instance.selectedId,'numbered_list');
 h.instance.execute('bold');stale();h.flush();assert.equal(h.instance.selectedId,'bold');
 h.instance.execute('break');h.instance.toggleOpen();assert.equal(h.instance.selectedId,'');assert.equal(h.timers.size,0);assert.equal(h.resets.length,0);
 h.instance.toggleOpen();h.instance.execute('math');const before=h.actions.length;
 h.instance.params.visible=false;h.instance.parametersChanged();h.flush();assert.equal(h.instance.selectedId,'');assert.equal(h.actions.length,before);
 h.instance.params.visible=true;h.instance.parametersChanged();h.instance.execute('link');h.instance.aboutToDisappear();h.flush();assert.equal(h.timers.size,0);
});

test('source-format insertions flash once while visual formatting retains independent toggle state',()=>{
 const h=wheelHarness();h.instance.params.state={...state,source:true};h.instance.parametersChanged();
 for(const id of ['bold','italic','underline','highlight']){
  const tool=h.instance.commonTools.find(item=>item.id===id);h.instance.execute(id);assert.equal(h.instance.current(tool),true);
  h.flush();assert.equal(h.instance.current(tool),false);assert.deepEqual(h.instance.params.state.activeIds,[]);
 }
 h.instance.params.state={...state,activeIds:['bold','underline']};h.instance.parametersChanged();h.instance.execute('bold');h.flush();
 assert.equal(h.instance.current(h.instance.commonTools.find(item=>item.id==='bold')),true);
 assert.equal(h.instance.current(h.instance.commonTools.find(item=>item.id==='underline')),true);
 h.instance.params.state={...state,source:true};h.instance.parametersChanged();assert.equal(h.instance.selectedId,'');
});

test('form ownership defaults to the first available field, keeps focus target through page hiding, and refuses unavailable targets',()=>{
 const session=new NoteEditorWheelSession(),events=[];
 const register=(id,available=true)=>session.register(id,available,active=>events.push([id,active]));
 register('readonly',false);register('first');register('second');
 assert.deepEqual(events.at(-1),['first',true]);session.activate('second');assert.deepEqual(events.slice(-3),[['readonly',false],['first',false],['second',true]]);
 session.setVisible(false);assert.ok(events.slice(-3).every(e=>e[1]===false));
 session.setVisible(true);assert.deepEqual(events.at(-1),['second',true]);
 session.activate('readonly');assert.deepEqual(events.at(-1),['second',true]);
 session.setAvailable('second',false);assert.deepEqual(events.at(-1),['first',true]);
 session.remove('first');assert.ok(events.slice(-3).every(e=>e[1]===false));
 session.setAvailable('second',true);assert.deepEqual(events.at(-1),['second',true]);
});


test('cancelled rotation and vertical motion restore their exact start without executing or clearing formats',()=>{
 const h=wheelHarness(),w=h.instance;
 w.params.state={...state,activeIds:['bold','italic','underline','highlight']};w.parametersChanged();
 w.arcPosition=2.25;w.rotationPosition=2.25;w.rotating=true;w.arcPosition=3.8;
 w.cancelManipulation();assert.equal(w.arcPosition,2.25);assert.equal(w.rotating,false);
 w.dragY=400;w.centerY=510;w.moving=true;w.edgeContact=true;w.finishMove(true);
 assert.equal(w.centerY,400);assert.equal(w.edgeContact,false);assert.deepEqual(h.actions,[]);
 assert.deepEqual(w.params.state.activeIds,['bold','italic','underline','highlight']);
 w.arcPosition=2.25;h.axis(2,1,1);h.axis(2,1,1);h.axis(4);
 assert.equal(w.arcPosition,2.25);assert.deepEqual(h.actions,[]);
});
test('shared option arc reports current selection and rejects cancelled, hidden and late clicks',()=>{
 const h=wheelHarness(),w=h.instance;
 w.params.state={...state,optionsOpen:true,optionToolId:'font_size',optionId:'large',fieldName:'Front'};w.parametersChanged();
 assert.equal(w.current(w.wheelTools.find(tool=>tool.id==='font_size')),true);
 const observation=noteEditorFormatObservation('font_size','Front',false,'large','outer_arc_overlay');
 assert.equal(observation.selectedId,'font_size_large');
 assert.deepEqual(observation.items.filter(item=>item.selected).map(item=>item.id),['font_size_large']);
 assert.equal(observation.values.find(value=>value.id==='placement').value,'outer_arc_overlay');
 w.toolTouch('font_size_small',{type:0,touches:[]});w.selectFormatOption('small');assert.deepEqual(h.actions,['size:small']);
 w.toolTouch('font_size_large',{type:3,touches:[]});w.selectFormatOption('large');assert.deepEqual(h.actions,['size:small']);
 w.toolTouch('font_size_large',{type:0,touches:[{},{}]});w.selectFormatOption('large');assert.deepEqual(h.actions,['size:small']);
 w.toolTouch('font_size_large',{type:0,touches:[]});
 w.selectFormatOption('unknown');w.rotating=true;w.selectFormatOption('large');w.rotating=false;
 w.params.visible=false;w.selectFormatOption('large');w.params.visible=true;
 w.toggleOpen();assert.equal(w.params.state.optionsOpen,false);w.selectFormatOption('large');
 w.aboutToDisappear();w.selectFormatOption('large');assert.deepEqual(h.actions,['size:small']);
});

test('heading and font size triggers remain lit from actual formats after the option arc closes and clicks expire',()=>{
 for(const source of [false,true]) {
  const h=wheelHarness(),w=h.instance;
  w.params.state={...state,source,activeIds:['heading','font_size']};w.parametersChanged();
  for(const id of ['heading','font_size']) {
   const tool=w.wheelTools.find(item=>item.id===id);
   w.execute(id);h.flush();assert.equal(w.current(tool),true);
  }
  const observed=noteEditorWheelObservation(w.params.state,'','right',false,'unsupported');
  assert.deepEqual(observed.items.filter(item=>item.selected).map(item=>item.id),['font_size','heading']);
  w.params.state={...state,source,activeIds:[]};w.parametersChanged();
  w.selectedId='heading';assert.equal(w.current(w.wheelTools.find(item=>item.id==='heading')),false);
  w.selectedId='font_size';assert.equal(w.current(w.wheelTools.find(item=>item.id==='font_size')),false);
 }
});

function assertOuterArc(boxes,width,height,radius,centerY,right) {
 const centerX=right?width:0;
 const track=Math.hypot(boxes[0].x-centerX,boxes[0].y-centerY);
 for(const point of boxes) {
  assert.ok(point.x-point.size/2>=8-1e-9);assert.ok(point.x+point.size/2<=width-8+1e-9);
  assert.ok(point.y-point.size/2>=8-1e-9);assert.ok(point.y+point.size/2<=height-8+1e-9);
  const distance=Math.hypot(point.x-centerX,point.y-centerY);
  assert.ok(Math.abs(distance-track)<1e-9,'all options must share the original wheel center');
  assert.ok(distance-point.size/2>radius,'the whole option must stay outside the original wheel');
 }
 for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++) {
  assert.ok(Math.hypot(boxes[a].x-boxes[b].x,boxes[a].y-boxes[b].y)>(boxes[a].size+boxes[b].size)/2,'option buttons overlap');
 }
}
function arcAngle(point,width,centerY,right) {
 return Math.atan2(point.y-centerY,right?width-point.x:point.x);
}

test('font size and heading stay on a concentric local arc entirely outside the wheel on either screen edge',()=>{
 for(const [width,height] of [[377,720],[377,500],[320,480],[280,250],[160,176]])for(const right of [true,false])for(const count of [5,7]) {
  const radius=noteWheelRadius(width,height);
  for(const desiredY of [0,height/2,height])for(const anchorAngle of [-75,-20,0,20,75].map(deg=>deg*Math.PI/180)) {
   const centerY=noteWheelY(desiredY,height,radius,false);
   const boxes=Array.from({length:count},(_,index)=>wheelModel.noteWheelOptionArcPosition(index,count,radius,centerY,anchorAngle,width,height,right));
   assertOuterArc(boxes,width,height,radius,centerY,right);
   const angles=boxes.map(point=>arcAngle(point,width,centerY,right));
   assert.ok(angles.at(-1)-angles[0]<Math.PI*0.51,'options must not fill a whole semicircle');
   const middle=angles[Math.floor(count/2)];
   assert.ok(Math.abs((angles[0]+angles.at(-1))/2-middle)<1e-9);
   if(Math.abs(middle-anchorAngle)>1e-9) {
    const end=middle>anchorAngle?boxes[0]:boxes.at(-1);
    const nearestEdge=Math.min(end.x-end.size/2,width-end.x-end.size/2,end.y-end.size/2,height-end.y-end.size/2);
    assert.ok(Math.abs(nearestEdge-8)<1e-9,'alignment may shift only as far as a boundary requires');
   }
  }
 }
});

test('an unconstrained outer arc is angularly centered on its trigger and mirrors across left and right wheels',()=>{
 for(const count of [5,7])for(const anchorAngle of [-20,0,20].map(deg=>deg*Math.PI/180)) {
  const boxes=Array.from({length:count},(_,index)=>wheelModel.noteWheelOptionArcPosition(index,count,158,360,anchorAngle,377,720,true));
  assert.ok(Math.abs(arcAngle(boxes[Math.floor(count/2)],377,360,true)-anchorAngle)<1e-9);
  for(let index=0;index<count;index++) {
   const left=wheelModel.noteWheelOptionArcPosition(index,count,158,360,anchorAngle,377,720,false);
   assert.ok(Math.abs(left.x+boxes[index].x-377)<1e-9);assert.equal(left.y,boxes[index].y);
  }
 }
});

test('the shared font size and heading overlay uses actual wheel geometry and keyboard limits without resizing it',()=>{
 for(const [width,height] of [[377,720],[377,500],[320,480],[280,250],[160,176]])for(const right of [true,false])for(const toolId of ['font_size','heading']) {
  const h=wheelHarness(),w=h.instance;
  w.viewportWidth=width;w.viewportHeight=height+240;w.overlayTop=32;w.keyboardTop=height+32;w.side=right?'right':'left';
  const original=[w.radius(),w.frameRadius(),w.x(0),w.iconY(0)];
  w.params.state={...state,optionsOpen:true,optionToolId:toolId,optionId:toolId==='font_size'?'medium':'h2'};w.parametersChanged();
  assert.deepEqual([w.radius(),w.frameRadius(),w.x(0),w.iconY(0)],original);
  const count=noteEditorFormatOptions(toolId).length;
  for(const angle of [-50,0,20,75])for(const desiredY of [0,height/2,height]) {
   w.arcPosition=w.wheelTools.findIndex(tool=>tool.id===toolId)-angle*Math.PI/180/noteWheelAngleStep(w.radius(),w.wheelTools.length);
   w.centerY=desiredY;
   const boxes=Array.from({length:count},(_,index)=>w.optionPosition(index));
   assertOuterArc(boxes,width,height,w.radius(),w.y(),right);
   if(height===720&&desiredY===height/2&&angle===20) {
    const toolIndex=w.wheelTools.findIndex(tool=>tool.id===toolId);
    const trigger={x:(right?width-w.frameRadius():0)+w.x(toolIndex)+w.itemWidth()/2,
      y:w.y()-w.frameRadius()+w.iconY(toolIndex)+w.itemHeight()/2};
    assert.ok(Math.abs(arcAngle(boxes[Math.floor(count/2)],width,w.y(),right)-arcAngle(trigger,width,w.y(),right))<1e-9);
   }
  }
  assert.equal(w.current(w.wheelTools.find(tool=>tool.id===toolId)),true);
  w.aboutToDisappear();
 }
});
