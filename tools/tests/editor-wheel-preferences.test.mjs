import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPlatformModule} from './platform-module-harness.mjs';
import {localPreferenceApi} from './local-preference-harness.mjs';
import * as model from '../../entry/src/main/ets/model/EditorWheelPreferences.ts';
import {agentPreferenceDefinitions} from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
test('wheel preferences initialize independently and only broadcast confirmed saves',async()=>{
 const values=new Map(),current=new Map([['abilityContext',{}]]);let fail=false;
 const AppStorage={get:key=>current.get(key),setOrCreate:(key,value)=>current.set(key,value)};
 const store={getSync:(key,fallback)=>values.get(key)??fallback,putSync:(key,value)=>values.set(key,value),flush:async()=>{if(fail)throw Error('disk');}};
 const api=loadPlatformModule('utils/EditorWheelPreferencesStore.ets','({initializeEditorWheelPreferences,saveEditorWheelPreference})',{
  ...model,...localPreferenceApi(AppStorage),AppStorage,preferences:{getPreferencesSync:()=>store}
 });
 api.initializeEditorWheelPreferences();assert.equal(current.get(model.WHEEL_ON_ENTRY_KEY),true);assert.equal(current.get(model.WHEEL_ON_KEYBOARD_KEY),true);
 await api.saveEditorWheelPreference(model.WHEEL_ON_ENTRY_KEY,false,true);
 assert.equal(current.get(model.WHEEL_ON_ENTRY_KEY),false);assert.equal(current.get(model.WHEEL_ON_KEYBOARD_KEY),true);
 fail=true;await assert.rejects(api.saveEditorWheelPreference(model.WHEEL_ON_KEYBOARD_KEY,false));assert.equal(current.get(model.WHEEL_ON_KEYBOARD_KEY),true);
 await assert.rejects(api.saveEditorWheelPreference('wrong',true));
 for(const key of [model.WHEEL_ON_ENTRY_KEY,model.WHEEL_ON_KEYBOARD_KEY]) assert.ok(agentPreferenceDefinitions().some(def=>def.id===key&&def.defaultValue===true));
});
