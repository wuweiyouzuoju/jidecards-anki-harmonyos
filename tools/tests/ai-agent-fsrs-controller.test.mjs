// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';

function fixture() {
  const state={enabled:false,writes:[],notifications:0,block:null,failWrite:false,failRead:false,mismatch:false};
  const config={id:9,name:'shared',config:{other:new Uint8Array([1]),preserved:[new Uint8Array([2])]}};
  const limits={new:0};
  const adapter=loadPlatformModule('model/FSRS控制器.ets','({设置FSRS开启状态,readFsrsEnabled})',{
    UPDATE_DECK_CONFIGS_MODE_NORMAL:0,
    AppStorage:{get:()=>undefined,setOrCreate:()=>state.notifications++},
    牌组配置服务:class {
      async 获取牌组配置编辑视图(id) {
        assert.equal(id,1); if(state.failRead) throw Error('backend read');
        return {fsrs:state.enabled,allConfigs:[{config}],currentDeck:{limits},
          cardStateCustomizer:'keep',applyAllParentLimits:true,newCardsIgnoreReviewLimit:true,fsrsHealthCheck:true};
      }
      async 更新牌组配置(request) {
        state.writes.push(request); if(state.block) await state.block;
        if(state.failWrite) throw Error('backend write');
        if(!state.mismatch) state.enabled=request.fsrs;
      }
    }, hilog:{error(){}}
  });
  return {state,adapter,config,limits};
}

test('real FSRS controller serializes shared mutations and reads, preserves other configs and reschedules only changes to enabled', async () => {
  const {state,adapter,config,limits}=fixture();
  let unblock;state.block=new Promise(resolve=>{unblock=resolve;});
  const enable=adapter.设置FSRS开启状态(true,false);
  const disable=adapter.设置FSRS开启状态(false,true);
  const read=adapter.readFsrsEnabled();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(state.writes.length,1);
  unblock();await enable;await disable;assert.equal(await read,false);
  assert.deepEqual(state.writes.map(x=>x.fsrsReschedule),[true,false]);
  for(const request of state.writes) {
    assert.strictEqual(request.configs[0],config);assert.strictEqual(request.limits,limits);
    assert.equal(request.cardStateCustomizer,'keep');assert.equal(request.fsrsHealthCheck,true);
    assert.equal(request.applyAllParentLimits,true);assert.deepEqual(request.removedConfigIds,[]);
  }
  assert.equal(state.notifications,2);
  await adapter.设置FSRS开启状态(false,false);assert.equal(state.writes.length,2);
  await assert.rejects(adapter.设置FSRS开启状态(true,true),/setting_changed_since_proposal/);
  assert.equal(state.writes.length,2);assert.equal(state.notifications,2);
});

test('real FSRS controller surfaces failed reads and writes, refreshes after uncertain writes, and allows a later new request', async () => {
  const {state,adapter}=fixture();
  state.failRead=true;await assert.rejects(adapter.readFsrsEnabled(),/backend read/);
  await assert.rejects(adapter.设置FSRS开启状态(true),/backend read/);assert.equal(state.writes.length,0);
  state.failRead=false;state.failWrite=true;
  await assert.rejects(adapter.设置FSRS开启状态(true,false),/backend write/);assert.equal(state.notifications,1);
  state.failWrite=false;state.mismatch=true;
  await assert.rejects(adapter.设置FSRS开启状态(true,false),/verification failed/);assert.equal(state.notifications,2);
  state.mismatch=false;assert.equal(await adapter.设置FSRS开启状态(true,false),true);
  assert.equal(await adapter.readFsrsEnabled(),true);
});
