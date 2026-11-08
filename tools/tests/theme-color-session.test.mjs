// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { ThemeColorSession, isThemeId } from '../../entry/src/main/ets/model/settings/ThemeColorSession.ts';
import { isThemeAvailable, UNLOCKED_CONTENTS_KEY } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

function fixture() {
  const state = { saved:'aurora', active:'aurora', locked:true, writes:[], readError:false, saveError:false, applyError:false, mismatch:false };
  const session = new ThemeColorSession({
    async readSavedColor() { if(state.readError) throw Error('read'); return state.saved; },
    async saveColor(theme) { state.writes.push(theme); if(state.saveError) throw Error('disk'); if(!state.mismatch) state.saved=theme; },
    applyColor(theme) { if(state.applyError) throw Error('apply'); state.active=theme; },
    isAvailable(theme) { return theme !== 'iridescent' || !state.locked; }
  });
  return {state,session};
}

test('page and agent share a serialized color writer and stale confirmations cannot overwrite newer choices', async () => {
  const {state,session} = fixture();
  const first = session.setColor('forest','aurora');
  const stale = session.setColor('sunset','aurora');
  assert.equal((await first).status,'completed');
  await assert.rejects(stale,/setting_changed_since_proposal/);
  assert.deepEqual(state.writes,['forest']); assert.equal(await session.read(),'forest');
  await assert.rejects(session.setColor('iridescent'),/theme_color_locked/);
  await assert.rejects(session.setColor('invalid'),/invalid_theme_color/);
  state.locked=false; assert.equal((await session.setColor('iridescent')).status,'completed');
});

test('strict reads fail; unverified persistence never applies, partial application reports saved and queue recovers', async () => {
  const {state,session} = fixture();
  state.readError=true; await assert.rejects(session.read(),/read/);
  await assert.rejects(session.setColor('forest'),/read/); assert.deepEqual(state.writes,[]);
  state.readError=false;
  for (const failure of ['saveError','mismatch']) {
    state[failure]=true;
    const change=await session.setColor('forest');
    assert.equal(change.saved,false); assert.equal(change.applied,false); assert.equal(change.status,'partial');
    assert.equal(state.active,'aurora'); state[failure]=false;
  }
  state.applyError=true;
  const partial=await session.setColor('forest');
  assert.equal(partial.saved,true); assert.equal(partial.applied,false); assert.equal(partial.status,'partial');
  assert.equal(partial.errorCode,'theme_color_apply_failed');
  state.applyError=false; assert.equal((await session.setColor('sunset')).status,'completed');
});

test('real color preference adapter propagates IO and flush failure, checks IDs and rechecks entitlement', async () => {
  const state={context:{},value:'aurora',failRead:false,failFlush:false,puts:[],contents:[]};
  const adapter=loadPlatformModule('model/颜色主题存储.ets','({readSavedThemeColor,保存颜色主题})',{
    默认颜色主题:'aurora', isThemeId,isThemeAvailable,UNLOCKED_CONTENTS_KEY,
    AppStorage:{get:key=>key === 'abilityContext' ? state.context : state.contents},
    preferences:{async getPreferences(){
      if(state.failRead) throw Error('disk read');
      return {async get(){return state.value;},async put(key,value){state.puts.push(value);state.value=value;},
        async flush(){if(state.failFlush) throw Error('flush');}};
    }}
  });
  assert.equal(await adapter.readSavedThemeColor(),'aurora');
  state.failRead=true; await assert.rejects(adapter.readSavedThemeColor(),/disk read/);state.failRead=false;
  state.value='unknown';await assert.rejects(adapter.readSavedThemeColor(),/invalid_saved_theme_color/);
  await assert.rejects(adapter.保存颜色主题('iridescent'),/theme_color_locked/);assert.deepEqual(state.puts,[]);
  state.failFlush=true;await assert.rejects(adapter.保存颜色主题('forest'),/flush/);
  state.context=undefined;await assert.rejects(adapter.readSavedThemeColor(),/ability_context_unavailable/);
});

test('custom accent and both mode adaptations are saved in one flush and published only after readback',async()=>{
 const config=await import('../../entry/src/main/ets/model/AppearanceCustomization.ts');
 const data=new Map([['color_theme','aurora'],[config.CUSTOM_ACCENT_KEY,'#336699'],
  [config.ACCENT_LIGHT_ADAPTATION_KEY,100],[config.ACCENT_DARK_ADAPTATION_KEY,100]]);
 const published=new Map();let flushes=0,fail=false;
 const store={get:async(key,fallback)=>data.get(key)??fallback,put:async(key,value)=>{data.set(key,value);},
  putSync:(key,value)=>data.set(key,value),flush:async()=>{flushes++;if(fail)throw Error('disk');}};
 const adapter=loadPlatformModule('model/颜色主题存储.ets','({保存自定义颜色主题})',{
  ...config,默认颜色主题:'aurora',AppStorage:{get:()=>({}),setOrCreate:(key,value)=>published.set(key,value)},
  preferences:{getPreferences:async()=>store}
 });
 await adapter.保存自定义颜色主题('#ccaa00',{light:0,dark:60});
 assert.equal(flushes,1);assert.equal(data.get('color_theme'),'custom');
 assert.equal(data.get(config.CUSTOM_ACCENT_KEY),'#CCAA00');
 assert.equal(published.get(config.ACCENT_LIGHT_ADAPTATION_KEY),0);
 assert.equal(published.get(config.ACCENT_DARK_ADAPTATION_KEY),60);
 published.clear();fail=true;
 await assert.rejects(adapter.保存自定义颜色主题('#112233',{light:40,dark:80}),/disk/);
 assert.equal(data.get(config.CUSTOM_ACCENT_KEY),'#CCAA00');assert.equal(published.size,0);
 assert.equal(data.get(config.ACCENT_LIGHT_ADAPTATION_KEY),0);assert.equal(data.get(config.ACCENT_DARK_ADAPTATION_KEY),60);
 await assert.rejects(adapter.保存自定义颜色主题('#112233',{light:101,dark:80}),/invalid_accent_adaptation/);
 assert.equal(flushes,2);
});
