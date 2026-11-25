import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../src/harmony/shared/ExpandingSearch.ets',import.meta.url),'utf8');
const methods=['closeRequested','hideKeyboard','focus','close','activate'].map(name=>{
 const start=source.indexOf('  private '+name+'(');assert.ok(start>=0);let i=source.indexOf('{',start)+1,depth=1;
 while(depth){if(source[i]==='{')depth++;if(source[i]==='}')depth--;i++;}return source.slice(start,i);
}).join('\n');
function fixture(){
 const animations=[],events=[];
 const Type=vm.runInNewContext(stripTypeScriptTypes('class Search {'+methods+'}; Search',{mode:'transform'}),{
  inputMethod:{getController:()=>({showTextInput(){events.push('keyboard');return Promise.resolve();},stopInputSession(){events.push('hide');return Promise.resolve();}})}});
 const search=Object.assign(new Type(),{active:true,expanded:false,isEnabled:true,generation:0,value:'castle',inputId:'test-input',
  readAnimation:()=>({duration:220}),getUIContext:()=>({animateTo(options,change){animations.push(options);change();},
  getFocusController:()=>({clearFocus(){events.push('blur');},requestFocus(id){events.push(id);}})}),
  onSubmit:value=>events.push('submit:'+value),onExpandedChange:open=>events.push('open:'+open)});
 return {search,animations,events};
}
test('focus and keyboard follow completed expansion, icon submission collapses and preserves the query',()=>{
 const {search,animations,events}=fixture();search.activate();assert.equal(search.expanded,true);assert.ok(!events.includes('keyboard'));
 animations[0].onFinish();assert.ok(events.includes('test-input'));assert.ok(events.includes('keyboard'));
 search.activate();assert.equal(search.expanded,false);assert.ok(events.includes('submit:castle'));assert.equal(search.value,'castle');
});
test('keyboard submission uses the same collapse path; stale animation cannot steal focus',()=>{
 const {search,animations,events}=fixture();search.activate();search.close(true);animations[0].onFinish();
 assert.equal(search.expanded,false);assert.ok(events.includes('submit:castle'));assert.ok(!events.includes('keyboard'));
});
test('disabled and disposed controls cannot open, focus or submit',()=>{
 const {search,animations,events}=fixture();search.isEnabled=false;search.activate();assert.equal(animations.length,0);
 search.isEnabled=true;search.activate();search.active=false;animations[0].onFinish();search.close(true);
 assert.ok(!events.includes('keyboard'));assert.ok(!events.includes('submit:castle'));
});
test('explicit close hides the keyboard without submitting and invalidates pending focus',()=>{
 const {search,animations,events}=fixture();search.activate();search.close(false);animations[0].onFinish();
 assert.equal(search.expanded,false);assert.equal(search.value,'castle');
 assert.ok(events.includes('hide'));assert.ok(!events.includes('submit:castle'));assert.ok(!events.includes('keyboard'));
});
