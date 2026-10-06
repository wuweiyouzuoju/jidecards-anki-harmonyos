// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rich from '../../entry/src/main/ets/model/NoteRichText.ts';
import * as htmlTools from '../../entry/src/main/ets/model/NoteHtmlTools.ts';
import { optionalReverseField, noteTypeDisplayKey } from '../../entry/src/main/ets/model/NoteTypePresentation.ts';
import { nextClozeNumber, wrapFieldSelection } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { noteEditorWheelTools, NoteEditorWheelSession } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { NoteEditorSession } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { NOTE_FIELD_EDITING_SUPPORT, noteEditorTool, noteFieldExpansionTool } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { SIMPLE_MODE_KEY } from '../../entry/src/main/ets/model/AppLayoutState.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

test('supported rich text preserves combined styles, entities, line breaks, Chinese and emoji', () => {
  const html = '<strong>中文😀<i>&lt;>&amp;&nbsp;</i></strong><br><mark><u>亮</u></mark>';
  const runs = rich.parseNoteRichText(html);
  assert.deepEqual(runs, [{text:'中文😀',format:1},{text:'<>&\u00a0',format:3},
    {text:'\n',format:0},{text:'亮',format:12}]);
  const canonical = '<b>中文😀</b><b><i>&lt;&gt;&amp;&nbsp;</i></b><br><u><mark>亮</mark></u>';
  assert.equal(rich.serializeNoteRichText(runs), canonical);
  assert.equal(rich.serializeNoteRichText(rich.parseNoteRichText(canonical)), canonical);
  assert.deepEqual(rich.parseNoteRichText('&#x1f600;&#20013;'), [{text:'😀中',format:0}]);
  for (const input of ['<img src="x">', '<span style="color:red">x</span>', '<b>x</i>',
    '<script>alert(1)</script>', 'a&copy;b', '&#xD800;', '<b>x']) assert.equal(rich.parseNoteRichText(input),null,input);
});

test('selected format checks only intersecting runs and handles mixed text and SDK font weights', () => {
  const runs=[{text:'甲😀',format:1},{text:'乙',format:3},{text:'丙',format:0}];
  assert.equal(rich.selectionHasFormat(runs,0,4,1),true);
  assert.equal(rich.selectionHasFormat(runs,2,5,1),false);
  assert.equal(rich.selectionHasFormat(runs,3,4,2),true);
  assert.equal(rich.selectionHasFormat(runs,5,6,1),false);
  for(const weight of [3,4,10,12,400,500]) assert.equal(rich.richResultIsBold(weight),false);
  for(const weight of [5,6,7,8,9,11,600,700]) assert.equal(rich.richResultIsBold(weight),true);
});

function editor(html='',fieldConfig=null,wheelSession=null,uniqueId=123) {
  const changes=[], seen=new Set(), dialogs=[], patches=[], typing=[], selections=[];
  let spans=[], caret=0;
  const overlay=[],focusRequests=[],sourceCarets=[], timers=new Map(); let timerId=0;
  class WheelParams { constructor(state,onAction,visible,initialTool,onSelection,onResetFormats){Object.assign(this,{state,onAction,visible,initialTool,onSelection,onResetFormats});} }
  class Content { constructor(_context,_builder,params){this.params=params;this.updates=[];this.disposed=false;}
    update(params){this.params=params;this.updates.push(params);} dispose(){this.disposed=true;} }
  const context={getFocusController:()=>({requestFocus:id=>focusRequests.push(id)}),getOverlayManager:()=>({addComponentContent:content=>overlay.push(content),
    removeComponentContent:content=>overlay.splice(overlay.indexOf(content),1)})};
  const normal={fontWeight:10,fontStyle:0,decoration:{type:0},textBackgroundStyle:{color:'#00000000'}};
  const controller={
    deleteSpans(){spans=[];},
    addTextSpan(value,{style,offset,urlStyle,paragraphStyle}={}) {
      // Tests use append load; insert boundary behavior is verified separately below.
      assert.equal(offset,undefined);
      spans.push({value,offsetInSpan:[0,value.length],textStyle:{...normal,...style},urlStyle,paragraphStyle});
    },
    getSpans(){return spans;}, getCaretOffset(){return caret;}, setCaretOffset(value){caret=value;},
    setSelection(start,end,options){selections.push({start,end,...options});},
    setTypingStyle(style){typing.push(style);}, updateSpanStyle(patch){patches.push(patch);}
  };
  const Editor=loadComponentLogic('components/common/NoteFieldEditor.ets','NoteFieldEditor',{
    ...rich, ...htmlTools, nextClozeNumber,wrapFieldSelection,NOTE_FIELD_EDITING_SUPPORT,noteEditorTool,NoteLinkDialog: options=>options,
    NoteEditorWheelSession,NoteEditorWheelParams:WheelParams,ComponentContent:Content,wrapBuilder:builder=>builder,buildNoteEditorWheel(){},
    setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id),
    TextAreaController:class {caretPosition(value){sourceCarets.push(value);}},RichEditorController:class {constructor(){return controller;}},
    FontWeight:{Bold:9,Normal:10},FontStyle:{Italic:1,Normal:0},TextDecorationType:{Underline:1,None:0},TextAlign:{Start:0},
    Color:{Transparent:'#00000000'},MenuPolicy:{HIDE:1},DialogAlignment:{Center:0},应用尺寸:{字号_正文:16},
    hasNoteEditingHint:key=>seen.has(key), completeNoteEditingHint:async key=>{seen.add(key);},
    CustomDialogController:class {constructor(options){this.options=options;dialogs.push(this);} open(){} close(){}},
    字段帮助对话框:options=>options, namedResourceText:(_ctx,key)=>key,
    resourceText:(_ctx,key)=>key,showToastSafely(){},$r:key=>key
  });
  const instance=new Editor();Object.assign(instance,{value:html,fieldConfig,onChange:value=>changes.push(value),getUIContext:()=>context,getUniqueId:()=>uniqueId});
  if(wheelSession!==null)instance.wheelSession=wheelSession;
  instance.aboutToAppear();instance.ready=!instance.sourceMode;
  if(instance.ready)instance.loadRich(rich.parseNoteRichText(html));
  return {instance,controller,changes,seen,dialogs,patches,typing,selections,overlay,timers,focusRequests,sourceCarets,set spans(value){spans=value;}};
}

test('field editing metadata applies font, direction and hint while source default preserves HTML',()=>{
 const config={ord:0,name:'Front',fontName:'Noto Sans Arabic',fontSize:28,rtl:true,description:'تلميح',plainText:true};
 const source=editor('<b>مرحبا</b>',config);assert.equal(source.instance.sourceMode,true);
 assert.equal(source.instance.placeholderText(),'تلميح');assert.deepEqual(source.changes,[]);
 source.instance.switchMode();source.instance.richReady();const span=source.controller.getSpans()[0];
 assert.equal(span.textStyle.fontFamily,config.fontName);assert.equal(span.textStyle.fontSize,28);
 assert.equal(span.paragraphStyle.textAlign,0);assert.deepEqual(source.changes,[]);
 const visual=editor('hello',{...config,rtl:false,plainText:false,fontSize:0});
 assert.equal(visual.instance.sourceMode,false);assert.equal(visual.controller.getSpans()[0].paragraphStyle.textAlign,0);
 assert.equal(visual.instance.editingFontSize(),16);
});

test('per-field mode controls select a mode without toggling it twice, transfer the wheel and preserve HTML',()=>{
 const session=new NoteEditorWheelSession(),first=editor('first',null,session,1),second=editor('<b>中文😀</b>',null,session,2);
 second.instance.requestMode(true);assert.equal(second.instance.sourceMode,true);assert.equal(second.overlay.length,1);assert.equal(first.overlay.length,0);
 assert.equal(second.instance.value,'<b>中文😀</b>');assert.deepEqual(second.changes,[]);
 second.instance.requestMode(true);assert.equal(second.instance.sourceMode,true);
 second.instance.requestMode(false);second.instance.richReady();assert.equal(second.instance.sourceMode,false);
 second.instance.requestMode(false);assert.equal(second.instance.sourceMode,false);assert.deepEqual(second.changes,[]);
 for(const timer of second.timers.values())timer.callback();assert.equal(second.focusRequests.at(-1),'note-editor-2-visual');
 const complex=editor('<table>保留</table>');complex.instance.requestMode(false);assert.equal(complex.instance.sourceMode,true);assert.deepEqual(complex.changes,[]);
 second.instance.disabled=true;second.instance.requestMode(true);assert.equal(second.instance.sourceMode,false);
 second.instance.disabled=false;second.instance.foreground=false;second.instance.requestMode(true);assert.equal(second.instance.sourceMode,false);
 second.instance.foreground=true;second.instance.aboutToDisappear();second.instance.requestMode(true);assert.equal(second.instance.sourceMode,false);
});

test('a cleared or new-type editor cannot receive late source/ready callbacks from the disposed editor', () => {
  const old=editor('<table><tr><td>source draft</td></tr></table>');
  assert.equal(old.instance.sourceMode,true); old.instance.sourceChanged('<table>edited</table>');
  assert.equal(old.changes.length,1); old.instance.disabled=true; old.instance.sourceChanged('disabled');
  assert.equal(old.changes.length,1); old.instance.disabled=false; old.instance.aboutToDisappear();
  old.instance.sourceChanged('late'); old.instance.richReady();
  assert.equal(old.changes.length,1); assert.equal(old.instance.ready,false);
  const fresh=editor(''); assert.equal(fresh.instance.sourceMode,false); assert.equal(fresh.instance.typingFormat,0);
  assert.equal(fresh.instance.selectionStart,-1); assert.deepEqual(fresh.changes,[]);
});

test('wheel formats follow selection while mode and expansion remain local input controls', () => {
  const h=editor('<b>内容</b>');
  const tool=id=>noteEditorWheelTools(h.instance.wheelState()).find(item=>item.id===id);
  assert.equal(tool('source'),undefined);assert.equal(tool('expand'),undefined);
  h.instance.requestMode(true);assert.equal(h.instance.wheelState().source,true);
  h.instance.requestMode(false);assert.equal(h.instance.wheelState().source,false);
  h.instance.requestExpanded();assert.equal(h.instance.wheelState().expanded,true);
  h.instance.richReady();h.instance.selectionStart=0;h.instance.selectionEnd=2;
  assert.equal(tool('bold').active,true);assert.equal(tool('italic').active,false);
  const complex=editor('<table></table>');complex.instance.switchMode();
  assert.equal(complex.instance.wheelState().source,true);
  assert.deepEqual(h.changes,[]);assert.deepEqual(complex.changes,[]);
});

test('field mode updates the existing overlay from the same global key used by settings', () => {
 const source=readFileSync(new URL('../../entry/src/main/ets/components/common/NoteFieldEditor.ets',import.meta.url),'utf8');
 assert.equal(SIMPLE_MODE_KEY,'simpleMode');assert.match(source,/@StorageProp\(SIMPLE_MODE_KEY\) @Watch\('updateWheel'\)/);
 const h=editor('draft'),content=h.overlay[0];assert.equal(content.params.state.experimental,false);
 h.instance.simpleMode=false;h.instance.updateWheel();assert.equal(h.overlay[0],content);assert.equal(content.params.state.experimental,true);
 h.instance.simpleMode=true;h.instance.updateWheel();assert.equal(content.params.state.experimental,false);assert.deepEqual(h.changes,[]);
});

test('input expansion publishes a different icon and action name in both editing modes', () => {
 for(const source of [false,true]){
  const h=editor(source?'<table>draft</table>':'draft');
  assert.equal(noteFieldExpansionTool(h.instance.expanded).iconKey,'ic_editor_expand');h.instance.requestExpanded();
  assert.deepEqual(noteFieldExpansionTool(h.instance.expanded),NOTE_FIELD_EDITING_SUPPORT.collapseTool);
  assert.equal(noteFieldExpansionTool(h.instance.expanded).iconKey,'ic_editor_collapse');h.instance.requestExpanded();
  assert.deepEqual(noteFieldExpansionTool(h.instance.expanded),NOTE_FIELD_EDITING_SUPPORT.expandTool);assert.deepEqual(h.changes,[]);
 }
 const source=readFileSync(new URL('../../entry/src/main/ets/components/common/NoteFieldEditor.ets',import.meta.url),'utf8');
 assert.match(source,/source: \$r\('app.media.' \+ noteFieldExpansionTool\(this.expanded\).iconKey\)/);
 assert.match(source,/label: \$r\('app.string.' \+ noteFieldExpansionTool\(this.expanded\).titleKey\)/);
 for(const theme of ['base','dark'])assert.notEqual(readFileSync(new URL(`../../entry/src/main/resources/${theme}/media/ic_editor_collapse.svg`,import.meta.url),'utf8'),readFileSync(new URL(`../../entry/src/main/resources/${theme}/media/ic_editor_expand.svg`,import.meta.url),'utf8'));
});

test('the wheel exists before focus, survives blur, and releases on page hiding or disposal', () => {
  const h=editor('draft');h.instance.selectionStart=1;h.instance.selectionEnd=3;
  assert.equal(h.overlay.length,1);assert.equal(h.overlay[0].params.initialTool,'');assert.deepEqual(h.dialogs,[]);
  assert.equal(h.instance.fieldFocused,false);assert.deepEqual(h.focusRequests,[]);
  h.instance.fieldFocus();h.instance.fieldFocus();assert.equal(h.overlay.length,1);
  const content=h.overlay[0];assert.equal(content.params.visible,true);
  content.params.onSelection('link');assert.equal(h.instance.lastWheelTool,'link');
  h.instance.fieldBlur();assert.equal(content.params.visible,true);assert.equal(h.overlay.length,1);
  h.instance.fieldFocus();assert.equal(h.overlay.length,1);assert.equal(content.disposed,false);
  assert.equal(content.params.initialTool,'link');assert.equal(content.params.visible,true);
  h.instance.wheelSession.setVisible(false);assert.equal(h.overlay.length,0);assert.equal(content.disposed,true);
  h.instance.wheelSession.setVisible(true);const fresh=h.overlay[0];h.instance.aboutToDisappear();assert.equal(h.overlay.length,0);
  assert.equal(fresh.disposed,true);assert.deepEqual(h.changes,[]);
  assert.equal(h.instance.selectionStart,1);assert.equal(h.instance.selectionEnd,3);
});

test('one form wheel transfers between fields without editing drafts or opening the keyboard',()=>{
  const session=new NoteEditorWheelSession(),first=editor('first',null,session,1),second=editor('second',null,session,2);
  assert.equal(first.overlay.length,1);assert.equal(second.overlay.length,0);
  second.instance.fieldFocus();first.instance.fieldBlur();
  assert.equal(first.overlay.length,0);assert.equal(second.overlay.length,1);
  second.instance.fieldBlur();assert.equal(second.overlay.length,1);
  second.instance.aboutToDisappear();assert.equal(first.overlay.length,1);assert.equal(second.overlay.length,0);
  assert.deepEqual(first.changes,[]);assert.deepEqual(second.changes,[]);
  assert.deepEqual(first.focusRequests,[]);assert.deepEqual(second.focusRequests,[]);
});

test('wheel dispatch keeps the selected text and guards closed, disabled, background or unsupported cloze actions', () => {
  const h=editor('draft'),calls=[];h.instance.fieldFocus();
  h.instance.applyFormat=flag=>calls.push(['format',flag]);h.instance.wrap=(...args)=>calls.push(['wrap',...args]);
  h.instance.cloze=same=>calls.push(['cloze',same]);h.instance.insertBreak=()=>calls.push(['break']);
  h.instance.list=ordered=>calls.push(['list',ordered]);h.instance.openLink=()=>calls.push(['link']);
  h.instance.clearFormat=()=>calls.push(['clear']);
  for(const id of ['bold','italic','underline','highlight','superscript','subscript','math','break','bullet_list',
    'numbered_list','link','clear_format','cloze_next','cloze_same'])h.seen.add(id);
  for(const id of ['bold','italic','underline','highlight','superscript','subscript','math','break','bullet_list',
    'numbered_list','link','clear_format','cloze_next','cloze_same'])h.instance.executeWheel(id);
  assert.deepEqual(calls,[...([1,2,4,8,16,32].map(flag=>['format',flag])),['wrap','\\(','\\)'],['break'],
    ['list',false],['list',true],['link'],['clear']]);
  h.instance.clozeEnabled=true;h.instance.executeWheel('cloze_same');assert.deepEqual(calls.at(-1),['cloze',true]);
  h.instance.fieldBlur();h.instance.executeWheel('bold');assert.deepEqual(calls.at(-1),['format',1]);
  const count=calls.length;h.instance.wheelSession.setVisible(false);h.instance.executeWheel('bold');
  h.instance.fieldFocus();h.instance.disabled=true;h.instance.editingAvailabilityChanged();h.instance.executeWheel('bold');
  h.instance.disabled=false;h.instance.foreground=false;h.instance.executeWheel('bold');
  h.instance.aboutToDisappear();h.instance.executeWheel('bold');assert.equal(calls.length,count);
  assert.deepEqual(h.changes,[]);
});

test('typing formats toggle without altering text; selection formatting preserves typing state', () => {
  const h=editor('word');
  h.instance.applyFormat(1);assert.equal(h.instance.typingFormat,1);assert.equal(h.typing.at(-1).fontWeight,9);
  h.instance.applyFormat(8);assert.equal(h.instance.typingFormat,9);assert.equal(h.typing.at(-1).textBackgroundStyle.color,'#FFF176');
  h.instance.selectionStart=0;h.instance.selectionEnd=4;h.instance.applyFormat(2);
  assert.deepEqual(h.patches,[{start:0,end:4,textStyle:{fontStyle:1}}]);assert.equal(h.instance.typingFormat,9);
  assert.equal(h.instance.selectionStart,0);assert.equal(h.instance.selectionEnd,4);
  h.instance.richSelectionChanged({start:4,end:4});
  h.instance.applyFormat(1);assert.equal(h.instance.typingFormat,8);h.instance.applyFormat(8);assert.equal(h.instance.typingFormat,0);
  assert.deepEqual(h.changes,[]);
  const selected=editor('<b>word</b>');selected.instance.selectionStart=0;selected.instance.selectionEnd=4;
  selected.instance.applyFormat(1);assert.equal(selected.patches[0].textStyle.fontWeight,10);assert.equal(selected.instance.typingFormat,0);
});

test('clicking multiple format buttons keeps each toggle active and turns off only the clicked format',()=>{
 const h=editor('');h.instance.fieldFocus();
 for(const id of ['bold','italic','underline','highlight'])h.seen.add(id);
 for(const id of ['bold','italic','underline','highlight'])h.instance.executeWheel(id);
 assert.equal(h.instance.typingFormat,15);assert.deepEqual(h.instance.wheelState().activeIds,['bold','italic','underline','highlight']);
 h.instance.executeWheel('italic');assert.equal(h.instance.typingFormat,13);
 assert.deepEqual(h.instance.wheelState().activeIds,['bold','underline','highlight']);
 assert.equal(h.typing.at(-1).fontWeight,9);assert.equal(h.typing.at(-1).fontStyle,0);
 assert.equal(h.typing.at(-1).decoration.type,1);assert.equal(h.typing.at(-1).textBackgroundStyle.color,'#FFF176');
 assert.deepEqual(h.changes,[]);
});

test('reopening the wheel resets format toggles and selection while preserving formatted content and input mode',()=>{
 for(const html of ['<b>word</b>','<table>source draft</table>']){
  const h=editor(html);h.instance.typingFormat=15;h.instance.selectionStart=0;h.instance.selectionEnd=4;
  const source=h.instance.sourceMode;
  h.overlay[0].params.onResetFormats();
  assert.equal(h.instance.typingFormat,0);assert.deepEqual(h.instance.wheelState().activeIds,[]);
  assert.equal(h.instance.value,html);assert.equal(h.instance.sourceMode,source);assert.deepEqual(h.changes,[]);
  assert.equal(h.instance.lastWheelTool,'');assert.equal(h.instance.selectionStart,-1);assert.equal(h.instance.selectionEnd,-1);
  if(!source)assert.deepEqual(h.selections.at(-1),{start:4,end:4,menuPolicy:1});
  h.instance.typingFormat=15;h.instance.disabled=true;h.overlay[0].params.onResetFormats();assert.equal(h.instance.typingFormat,15);
  h.instance.disabled=false;h.instance.foreground=false;h.overlay[0].params.onResetFormats();assert.equal(h.instance.typingFormat,15);
 }
});

test('highlight, bold, highlight removal and clear format retain the same UTF-16 selection for consecutive actions', () => {
  const h=editor('前甲😀乙后');
  const span=value=>({value,offsetInSpan:[0,value.length],textStyle:{fontWeight:10,fontStyle:0,
    decoration:{type:0},textBackgroundStyle:{color:'#00000000'}}});
  const spans=[span('前'),span('甲😀乙'),span('后')];h.spans=spans;
  h.instance.typingFormat=rich.FORMAT_ITALIC;
  h.instance.richSelectionChanged({start:1,end:5});
  h.controller.setCaretOffset=()=>assert.fail('formatting must retain the range rather than replace it with a caret');
  h.controller.updateSpanStyle=patch=>{
    h.patches.push(patch);assert.equal(patch.start,1);assert.equal(patch.end,5);
    Object.assign(spans[1].textStyle,patch.textStyle);
    if(patch.urlStyle)spans[1].urlStyle=patch.urlStyle;
    // 平台样式更新可能通知临时收起；不能覆盖本次格式操作捕获的选区。
    h.instance.richSelectionChanged({start:5,end:5});
  };
  const retained=()=>{
    assert.equal(h.instance.selectionStart,1);assert.equal(h.instance.selectionEnd,5);
    assert.deepEqual(h.selections.at(-1),{start:1,end:5,menuPolicy:1});
    assert.equal(h.instance.typingFormat,rich.FORMAT_ITALIC);
  };
  h.instance.applyFormat(rich.FORMAT_HIGHLIGHT);retained();
  assert.equal(h.changes.at(-1),'前<mark>甲😀乙</mark>后');
  h.instance.applyFormat(rich.FORMAT_BOLD);retained();
  assert.equal(h.changes.at(-1),'前<b><mark>甲😀乙</mark></b>后');
  h.instance.applyFormat(rich.FORMAT_HIGHLIGHT);retained();
  assert.equal(h.changes.at(-1),'前<b>甲😀乙</b>后');
  h.instance.clearFormat();retained();
  assert.equal(h.changes.at(-1),'前甲😀乙后');assert.equal(h.changes.length,4);
  h.instance.richSelectionChanged({start:6,end:6});
  h.instance.applyFormat(rich.FORMAT_HIGHLIGHT);
  assert.equal(h.instance.typingFormat,rich.FORMAT_ITALIC|rich.FORMAT_HIGHLIGHT);
  assert.equal(h.patches.length,4,'a new caret must leave the old selection behind');
});

test('every visual style preserves selection, while disabled and disposed editors cannot restore it', () => {
  for(const flag of [rich.FORMAT_BOLD,rich.FORMAT_ITALIC,rich.FORMAT_UNDERLINE,rich.FORMAT_HIGHLIGHT]){
    const h=editor('甲😀乙');h.instance.richSelectionChanged({start:1,end:3});
    h.instance.applyFormat(flag);
    assert.deepEqual(h.selections,[{start:1,end:3,menuPolicy:1}]);
    assert.equal(h.instance.typingFormat,0);
    h.instance.disabled=true;h.instance.applyFormat(flag);h.instance.clearFormat();
    h.instance.disabled=false;h.instance.aboutToDisappear();
    h.instance.applyFormat(flag);h.instance.clearFormat();h.instance.richSelectionChanged({start:0,end:4});
    assert.equal(h.selections.length,1);assert.equal(h.patches.length,1);
    assert.equal(h.instance.selectionStart,1);assert.equal(h.instance.selectionEnd,3);
  }
});

test('loading unchanged HTML never rewrites a draft; changed native spans serialize visible styles', () => {
  const h=editor('<strong>word</strong>');h.instance.publishRich();assert.deepEqual(h.changes,[]);
  h.spans=[{value:'甲😀\n乙',offsetInSpan:[0,5],textStyle:{fontWeight:9,fontStyle:1,
    decoration:{type:1},textBackgroundStyle:{color:0xFFFFF176}}}];
  h.instance.publishRich();assert.equal(h.changes.at(-1),'<b><i><u><mark>甲😀<br>乙</mark></u></i></b>');
  h.instance.publishRich();assert.equal(h.changes.length,1);
  h.instance.aboutToDisappear();h.instance.publishRich();assert.equal(h.changes.length,1);
  const complex=editor('<img src="media.png"><span data-x="keep">x</span>');
  assert.equal(complex.instance.sourceMode,true);assert.deepEqual(complex.changes,[]);
});

test('formula/cloze insert boundaries around selection, preserve spans and include latest field in numbering', () => {
  const h=editor('甲乙');const inserts=[];
  h.controller.addTextSpan=(text,options)=>inserts.push([text,options.offset]);
  h.instance.selectionStart=0;h.instance.selectionEnd=2;h.instance.wrap('\\(','\\)');
  assert.deepEqual(inserts,[['\\)',2],['\\(',0]]);
  const cloze=editor('');cloze.instance.clozeEnabled=true;cloze.instance.allFields=['{{c3::other}}'];
  cloze.instance.value='{{c7::latest}}';const calls=[];cloze.instance.wrap=(...args)=>calls.push(args);
  cloze.instance.cloze(false);cloze.instance.cloze(true);
  assert.deepEqual(calls,[['{{c8::','}}'],['{{c7::','}}']]);
});

test('visual newline replaces a selection like Enter and retains the active typing format',()=>{
  const h=editor('abc');const edits=[];
  h.controller.deleteSpans=range=>edits.push(['delete',range]);
  h.controller.addTextSpan=(text,options)=>edits.push(['insert',text,options.offset]);
  h.instance.typingFormat=1;h.instance.selectionStart=1;h.instance.selectionEnd=3;
  h.instance.insertBreak();
  assert.deepEqual(edits,[['delete',{start:1,end:3}],['insert','\n',1]]);
  assert.equal(h.instance.selectionStart,2);assert.equal(h.instance.typingFormat,1);
});

test('first-use help defers one authorized action until closing; disabled or disposed callbacks do nothing',async()=>{
  const h=editor();let actions=0;const activate=()=>h.instance.activateTool('bold','Bold',()=>actions++);
  activate();activate();assert.equal(actions,0);assert.equal(h.dialogs.length,1);
  h.dialogs[0].options.builder.onDismiss();await Promise.resolve();assert.equal(actions,1);activate();assert.equal(actions,2);
  h.instance.activateTool('italic','Italic',()=>actions++);h.dialogs[1].options.cancel();await Promise.resolve();
  assert.equal(h.seen.has('italic'),true);assert.equal(actions,3);
  h.instance.activateTool('underline','Underline',()=>actions++);h.instance.disabled=true;
  h.dialogs[2].options.cancel();await Promise.resolve();assert.equal(actions,3);
  h.instance.aboutToDisappear();activate();assert.equal(actions,3);
});

test('hint persistence is shared and failed flush restores unseen state',async()=>{
  const values=new Map();let fail=false;
  const bindings={AppStorage:{get:()=>({})},preferences:{getPreferencesSync:()=>({
    getSync:(key,fallback)=>values.get(key)??fallback,putSync:(key,value)=>values.set(key,value),
    flush:async()=>{if(fail)throw new Error('disk full');}
  })}};
  const has=loadPlatformModule('utils/NoteEditingHints.ets','hasNoteEditingHint',bindings);
  const complete=loadPlatformModule('utils/NoteEditingHints.ets','completeNoteEditingHint',bindings);
  assert.equal(has('bold'),false);await complete('bold');assert.equal(has('bold'),true);
  fail=true;await assert.rejects(complete('italic'),/disk full/);assert.equal(has('italic'),false);assert.equal(has('bold'),true);
});

function optionalType(fields=['Front','Back','Add Reverse']) {
  return JSON.stringify({tmpls:[{qfmt:`{{${fields[0]}}}`,afmt:`{{FrontSide}}\n\n<hr id=answer>\n\n{{${fields[1]}}}`},
    {qfmt:`{{#${fields[2]}}}{{${fields[1]}}}{{/${fields[2]}}}`,afmt:`{{FrontSide}}\n\n<hr id=answer>\n\n{{${fields[0]}}}`}]});
}

test('reverse toggle follows exact template structure through rename/reorder and preserves custom fields',()=>{
  const view={originalStockKind:3,fieldNames:['Front','Back','Add Reverse']};
  assert.equal(optionalReverseField(view,optionalType()),2);
  assert.equal(optionalReverseField({...view,fieldNames:['开关','答案','问题']},optionalType(['问题','答案','开关'])),0);
  assert.equal(optionalReverseField({...view,originalStockKind:1},optionalType()),-1);
  const custom=JSON.parse(optionalType());custom.tmpls[0].qfmt+='{{Add Reverse}}';
  assert.equal(optionalReverseField(view,JSON.stringify(custom)),-1);
  assert.equal(noteTypeDisplayKey('Basic (optional reversed card)'),'note_type_optional_reverse');
  assert.equal(noteTypeDisplayKey('My personal type'),'');
});

test('reverse capability survives the actual editor load/save/retry lifecycle',async()=>{
  let state;const note={id:1,notetypeId:2,fields:['f','b','y'],tags:[]};
  const session=new NoteEditorSession({note:async()=>note,notetype:async()=>({fieldNames:['f','b','gate'],optionalReverseFieldOrd:2})},value=>state=value);
  await session.open(1,true,()=>true);assert.equal(state.optionalReverseFieldOrd,2);
  await session.save(['f','b',''],[],async saved=>{assert.deepEqual(saved.fields,['f','b','']);return false;});
  assert.equal(state.optionalReverseFieldOrd,2);assert.equal(state.error,'save');
  session.close();assert.equal(state.optionalReverseFieldOrd,-1);
});

test('help uses current labels and the common header centers independently of side actions',()=>{
  const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
  const strings=JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const help=strings.filter(item=>item.name.startsWith('add_note_notetype_'));
  for(const item of help)assert.doesNotMatch(item.value,/\bFront\b|\bBack\b|Add Reverse|非空|c1-c5/,item.name);
  assert.ok(!strings.some(item=>item.name==='add_note_images_hint'));
  const header=read('entry/src/main/ets/components/common/DialogHeader.ets');
  assert.match(header,/Stack\(\{ alignContent: Alignment.Center \}\)/);
  assert.match(header,/HelpLabel\([\s\S]*?centered: true/);
  const width=Number(header.match(/HelpLabel\([\s\S]*?\.width\('(\d+)%'\)/)[1])/100;
  for(const viewport of [320,840])for(const inset of [0,24]) {
    const content=viewport-2*inset;const start=(content-content*width)/2;
    assert.equal(inset+start+content*width/2,viewport/2);
  }
});


test('cloze text has no automatic background and retains explicit highlight and stored markup',()=>{
 for(const html of ['{{c1::答案}}','😀 {{c1::中<b>{{c2::文}}</b>::提示}} x {{c3::unfinished',
   '{{c1::<mark>答案</mark>}}']) {
   const h=editor(html);h.instance.clozeEnabled=true;h.instance.richReady();
   const expected=rich.parseNoteRichText(html);
   assert.deepEqual(h.controller.getSpans().map(span=>span.textStyle.textBackgroundStyle.color),
     expected.map(run=>(run.format & rich.FORMAT_HIGHLIGHT)!==0?'#FFF176':'#00000000'));
   assert.equal(rich.serializeNoteRichText(h.instance.richRuns()),html);
   h.instance.publishRich();h.instance.publishRich();
   assert.deepEqual(h.patches,[]);assert.deepEqual(h.changes,[]);
   assert.equal(h.instance.typingFormat,0);
 }
});

test('expanded input retains draft, native controller, selection and typing state',()=>{
  for(const html of ['<b>长内容😀</b>','<table><tr><td>source</td></tr></table>']) {
    const h=editor(html),controller=h.instance.richController,mode=h.instance.sourceMode;
    h.instance.selectionStart=1;h.instance.selectionEnd=3;h.instance.typingFormat=3;
    h.instance.requestExpanded();
    assert.equal(h.instance.expanded,true);
    assert.equal(h.instance.sourceMode,mode);assert.equal(h.instance.richController,controller);
    assert.equal(h.instance.selectionStart,1);assert.equal(h.instance.selectionEnd,3);assert.equal(h.instance.typingFormat,3);
    assert.deepEqual(h.changes,[]);h.instance.requestExpanded();assert.equal(h.instance.expanded,false);
    h.instance.disabled=true;h.instance.requestExpanded();
    assert.equal(h.instance.expanded,false);
    h.instance.disabled=false;h.instance.foreground=false;h.instance.requestExpanded();assert.equal(h.instance.expanded,false);
    h.instance.foreground=true;h.instance.aboutToDisappear();h.instance.requestExpanded();assert.equal(h.instance.expanded,false);
  }
});

test('native links preserve unchanged HTML and selection actions do not change persistent typing toggles',()=>{
  const html='<a href="https://example.com"><b>链接😀</b></a>';
  const h=editor(html);h.instance.publishRich();assert.deepEqual(h.changes,[]);
  assert.equal(rich.serializeNoteRichText(h.instance.richRuns()),html);
  h.instance.applyFormat(2);assert.equal(h.instance.typingFormat,2);
  h.instance.selectionStart=0;h.instance.selectionEnd=1;h.instance.clearFormat();
  assert.equal(h.instance.typingFormat,2);assert.deepEqual(h.patches.at(-1).urlStyle,{url:''});
  assert.equal(h.patches.at(-1).textStyle.fontWeight,10);
  h.instance.selectionStart=1;h.instance.selectionEnd=1;h.instance.clearFormat();assert.equal(h.instance.typingFormat,0);
});

test('script actions use standard source tags and place an empty-selection caret inside, without font-dependent typing',()=>{
  for(const [flag,tag] of [[rich.FORMAT_SUPERSCRIPT,'sup'],[rich.FORMAT_SUBSCRIPT,'sub']]) {
    const h=editor('<b>x</b>');h.instance.selectionStart=1;h.instance.selectionEnd=1;
    h.instance.applyFormat(flag);
    assert.equal(h.instance.sourceMode,true);assert.equal(h.instance.sourceToolFocus,true);
    assert.equal(h.instance.value,`<b>x</b><${tag}></${tag}>`);
    assert.equal(h.instance.selectionStart,13);assert.equal(h.instance.selectionEnd,13);
    assert.equal(h.instance.typingFormat,0);assert.deepEqual(h.patches,[]);
    const pos=h.instance.selectionStart;
    h.instance.sourceChanged(h.instance.value.slice(0,pos)+'2'+h.instance.value.slice(pos));
    assert.equal(h.changes.at(-1),`<b>x</b><${tag}>2</${tag}>`);
    h.instance.switchMode();assert.equal(h.instance.sourceMode,true);
    h.instance.richReady();assert.equal(h.instance.ready,false);
    const selected=editor('<b>甲😀乙</b>后');selected.instance.selectionStart=1;selected.instance.selectionEnd=3;
    selected.instance.applyFormat(flag);
    assert.equal(selected.changes.at(-1),`<b>甲</b><${tag}><b>😀</b></${tag}><b>乙</b>后`);
    const unchanged=editor(`<${tag}>中文😀2</${tag}>`);
    assert.equal(unchanged.instance.sourceMode,true);unchanged.instance.richReady();unchanged.instance.publishRich();
    assert.deepEqual(unchanged.changes,[]);assert.equal(unchanged.instance.ready,false);
    const late=editor('x');late.instance.disabled=true;late.instance.applyFormat(flag);
    late.instance.disabled=false;late.instance.aboutToDisappear();late.instance.applyFormat(flag);
    assert.deepEqual(late.changes,[]);assert.equal(late.instance.sourceMode,false);
  }
});

test('list action handles selection and caret line, keeps drafts on unsupported source, and refuses late or disabled actions',()=>{
  const h=editor('前<br><b>甲😀<br>乙</b><br>后');
  h.instance.selectionStart=2;h.instance.selectionEnd=7;h.instance.list(false);
  assert.equal(h.changes.at(-1),'前<br><ul><li><b>甲😀</b></li><li><b>乙</b></li></ul><br>后');
  assert.equal(h.instance.sourceMode,true);assert.equal(h.instance.ready,false);
  const caret=editor('甲<br>乙<br>丙');caret.instance.selectionStart=3;caret.instance.selectionEnd=3;caret.instance.list(true);
  assert.equal(caret.changes.at(-1),'甲<br><ol><li>乙</li></ol><br>丙');
  const source=editor('<table>unknown</table>');source.instance.selectionStart=0;source.instance.selectionEnd=source.instance.value.length;
  source.instance.list(false);source.instance.clearFormat();assert.deepEqual(source.changes,[]);
  const late=editor('word');late.instance.disabled=true;late.instance.list(false);late.instance.clearFormat();late.instance.openLink();
  late.instance.disabled=false;late.instance.aboutToDisappear();late.instance.list(false);late.instance.clearFormat();late.instance.openLink();
  assert.deepEqual(late.changes,[]);assert.deepEqual(late.dialogs,[]);
});

test('link dialog freezes selection, cancellation does not edit, valid apply preserves selected styles, and departed callbacks are ignored',()=>{
  const h=editor('<b>甲😀</b>乙');h.instance.selectionStart=0;h.instance.selectionEnd=3;h.instance.openLink();
  const canceled=h.dialogs.at(-1);assert.equal(canceled.options.builder.selectedText,'甲😀');
  canceled.options.builder.onClose();assert.deepEqual(h.changes,[]);assert.equal(h.instance.linkDialog,null);
  h.instance.openLink();h.instance.selectionStart=4;h.instance.selectionEnd=4;
  h.dialogs.at(-1).options.builder.onApply('https://example.com','ignored');
  assert.equal(h.changes.at(-1),'<a href="https://example.com"><b>甲😀</b></a>乙');
  assert.equal(h.instance.selectionStart,3);assert.equal(h.instance.sourceMode,false);
  const late=editor('草稿');late.instance.openLink();const callback=late.dialogs.at(-1).options.builder.onApply;
  late.instance.aboutToDisappear();callback('https://example.com','文字');assert.deepEqual(late.changes,[]);
  const stale=editor('旧');stale.instance.openLink();stale.instance.value='新';
  stale.dialogs.at(-1).options.builder.onApply('https://example.com','文字');assert.deepEqual(stale.changes,[]);
});

test('script transition focuses the mounted source input before restoring the interior caret; late transitions cannot steal focus',()=>{
 const h=editor('x');h.instance.selectionStart=1;h.instance.selectionEnd=1;
 h.instance.applyFormat(rich.FORMAT_SUPERSCRIPT);
 const callback=[...h.timers.values()].at(-1).callback;
 assert.deepEqual(h.focusRequests,[]);callback();
 assert.deepEqual(h.focusRequests,['note-editor-123-source']);assert.deepEqual(h.sourceCarets,[6]);
 const stale=editor('x');stale.instance.applyFormat(rich.FORMAT_SUBSCRIPT);
 const late=[...stale.timers.values()].at(-1).callback;stale.instance.aboutToDisappear();late();
 assert.deepEqual(stale.focusRequests,[]);assert.deepEqual(stale.sourceCarets,[]);
});
