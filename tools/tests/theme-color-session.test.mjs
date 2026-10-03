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
