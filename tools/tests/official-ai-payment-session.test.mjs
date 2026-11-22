// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';

for (const environment of [true, false, 'unavailable']) {
  test(`payment login binds the Huawei session to ${environment} IAP environment`, async () => {
    const events = [], context = {};
    const Service = loadPlatformModule('backend/agent/OfficialAIService.ets', 'OfficialAIService', {
      iap: { async isSandboxActivated(received) {
        assert.equal(received, context);
        if (environment === 'unavailable') throw Error('IAP unavailable');
        return environment;
      } }
    });
    const service = new Service();
    service.login = async (received, sandbox) => events.push([received, sandbox]);
    await service.loginForPayments(context);
    assert.deepEqual(events, [[context, environment === true]]);
  });
}

const { readFileSync } = await import('node:fs');
const { stripTypeScriptTypes } = await import('node:module');
const settings = readFileSync(new URL('../../entry/src/main/ets/components/settings/OfficialAISettings.ets', import.meta.url), 'utf8');
const start = settings.indexOf('  private async update():');
const update = settings.slice(start, settings.indexOf('\n  private async perform(', start));
for (const sessionEnvironment of ['NORMAL', 'SANDBOX']) {
  test(`wallet ${sessionEnvironment} session requires explicit sandbox reauthorization when mismatched`, async () => {
    let queries = 0;
    const Page = new Function('iap', '$r', stripTypeScriptTypes(`class Page { ${update} }`, { mode: 'transform' }) + ';return Page;')(
      { ProductType: { CONSUMABLE: 0 }, async queryProducts() { queries++; return [{ id: 'pack' }]; } }, key => key);
    const page = new Page();
    const wallet = { environment: sessionEnvironment, products: [{ id: 'pack' }] };
    Object.assign(page, { service: { token: async () => 'session', wallet: async () => wallet }, disposed: false,
      sandbox: true, wallet: null, context: () => ({}), text: x => x,
      detectEnvironment: async () => {
        await Promise.resolve();
        assert.equal(page.wallet, null);
      } });
    if (sessionEnvironment === 'NORMAL') {
      await assert.rejects(page.update(), /login_required/);
      assert.equal(page.signedIn, false); assert.equal(page.wallet, null); assert.equal(queries, 0);
    } else {
      await page.update();
      assert.equal(page.signedIn, true); assert.equal(page.wallet, wallet); assert.equal(queries, 1);
      assert.equal(page.product.id, 'pack');
    }
  });
}

test('purchase binds the same quantity into the server intent and Huawei checkout',async()=>{
  const requests=[],purchases=[];
  const Service=loadPlatformModule('backend/agent/OfficialAIService.ets','OfficialAIService',{
    iap:{ProductType:{CONSUMABLE:0},isSandboxActivated:async()=>true,
      createPurchase:async(_context,body)=>{purchases.push(body);return{purchaseData:'receipt'};}}
  });
  const service=new Service();service.token=async()=>'session';
  service.request=async(path,body)=>{requests.push([path,JSON.parse(body)]);return JSON.stringify({intentId:'bound-intent'});};
  service.deliver=async()=>{};
  await service.buy({},'pack',true,3);
  assert.deepEqual(requests,[['/intents',{productId:'pack',quantity:3}]]);
  assert.equal(purchases[0].quantity,3);assert.equal(purchases[0].developerPayload,'bound-intent');
  await assert.rejects(service.buy({},'pack',true,11),/unsupported_order_quantity/);
  assert.equal(purchases.length,1);
});
