// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';

function fixture(token='', responseError='', loginError=false) {
  const events=[];
  class Service {
    async token(){return token;}
    async request(path){events.push(path);if(responseError)throw Error(responseError);return '{}';}
    async login(context,sandbox){events.push(['login',sandbox]);if(loginError)throw Error('cancelled');}
  }
  const ensure=loadPlatformModule('backend/agent/HuaweiAIAccount.ets','ensureHuaweiAIAccount',{
    OfficialAIService:Service,showToastSafely:(_ui,opts)=>events.push(['toast',opts.message]),
    $r:key=>key
  });
  return {events,run:()=>ensure({getHostContext:()=>({})})};
}
test('AI account gate logs in before granting entry and coalesces simultaneous taps',async()=>{
  const f=fixture();assert.deepEqual(await Promise.all([f.run(),f.run()]),[true,true]);
  assert.deepEqual(f.events,[['login',false]]);
});
test('AI account gate validates an existing session without IAP environment dependency',async()=>{
  const f=fixture('session');assert.equal(await f.run(),true);assert.deepEqual(f.events,['/session']);
});
test('expired account session requires a new Huawei login; cancellation blocks entry',async()=>{
  const f=fixture('expired','login_required',true);assert.equal(await f.run(),false);
  assert.equal(f.events[1][0],'login');assert.equal(f.events[2][0],'toast');
});
test('network failure never bypasses the AI login requirement',async()=>{
  const f=fixture('session','network');assert.equal(await f.run(),false);
  assert.equal(f.events.some(e=>Array.isArray(e)&&e[0]==='login'),false);
});

test('public requests omit Authorization while authenticated requests include the actual token', async () => {
  const headers = [];
  const Service = loadPlatformModule('backend/agent/OfficialAIService.ets', 'OfficialAIService', {
    http: {
      RequestMethod: { POST: 'POST' }, HttpDataType: { STRING: 'STRING' },
      createHttp: () => ({
        async request(_url, options) {
          headers.push(options.header);
          return { responseCode: 200, result: '{}' };
        },
        destroy() {}
      })
    }
  });
  const service = new Service();
  await service.request('/leaderboard/view', '{}', '');
  await service.request('/leaderboard/view', '{}', 'session');
  assert.deepEqual(headers, [
    { 'Content-Type': 'application/json' },
    { 'Content-Type': 'application/json', Authorization: 'Bearer session' }
  ]);
});
