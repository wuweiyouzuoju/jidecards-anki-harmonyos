// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppLocale } from '../../entry/src/main/ets/model/AppLocales.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
function fixture() {
  const observed = [], left = [];
  const Page = loadComponentLogic('components/settings/OfficialAISettings.ets', 'OfficialAISettings', {
    resolveAppLocale, OfficialAIService: class {}, appInterface: { observe: x => observed.push(x), leave: x => left.push(x) }
  });
  return { page: new Page(), observed, left };
}
test('wallet exposes verified balance and separate purchase/usage totals to JIDE', () => {
  const {page, observed} = fixture();
  Object.assign(page, { signedIn:true, environmentKnown:true, sandbox:true, product:{id:'pack'},
    wallet:{generationBalance:1997,sandboxBalance:1997,purchasedCredits:1000,usedCredits:3} });
  page.publish();
  const snapshot=observed.at(-1), values=Object.fromEntries(snapshot.values.map(x=>[x.id,x.value]));
  assert.equal(values.balance,'1997');assert.equal(values.purchased_credits,'1000');assert.equal(values.used_credits,'3');
  assert.equal(values.environment,'SANDBOX');
  for(const id of ['purchase','billing_help'])assert.equal(snapshot.items.find(x=>x.id===id).enabled,true);
});
test('unread wallet totals stay unknown and covered pages stop publishing', () => {
  const {page,observed,left}=fixture();page.publish();
  const snapshot=observed.at(-1),values=Object.fromEntries(snapshot.values.map(x=>[x.id,x.value]));
  for(const id of ['balance','purchased_credits','used_credits'])assert.equal(values[id],'unknown');
  assert.equal(snapshot.items.find(x=>x.id==='purchase').enabled,false);
  page.isCovered=true;page.publish();assert.equal(observed.length,1);assert.deepEqual(left,['official_ai']);
});

test('wallet shows server usage beside available credits and omits removed purchase totals and actions', async () => {
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/OfficialAISettings.ets',import.meta.url),'utf8');
  const view=source.slice(source.indexOf('  build() {'));
  assert.match(source,/official_ai_used/);
  assert.match(source,/this\.wallet\?\.usedCredits/);
  assert.doesNotMatch(view,/official_ai_purchased|official_ai_refresh_short|official_ai_account|SettingsActionRow/);
  assert.match(view,/official_ai_quantity/);
});

test('official credits are embedded in the provider configuration with shared session and busy ownership', async () => {
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/AIAgent设置分组.ets',import.meta.url),'utf8');
  const view=source.slice(source.indexOf('\n  build() {'));
  assert.match(view,/if \(this\.provider === 'official'\) \{\s*OfficialAISettings\(/);
  assert.match(view,/isCovered: this\.isCovered/);
  assert.match(view,/onSessionChanged:.*this\.reloadOfficialSession\(\)/);
  assert.match(view,/onBusyChange:.*this\.officialBusy = busy; this\.publishState\(\)/);
  assert.doesNotMatch(source,/onOfficialAI|OfficialAIPage/);
});

test('quantity selection updates totals, follows Huawei prices and ignores busy or invalid changes', () => {
  const {page,observed}=fixture();
  page.product={id:'pack',localPrice:'¥6.00',microPrice:6000000,currency:'CNY'};
  assert.equal(page.totalPrice(),'¥6.00');
  page.selectQuantity(1);assert.equal(page.quantity,2);
  assert.match(page.totalPrice(),/12\.00/);
  assert.equal(observed.at(-1).values.find(x=>x.id==='quantity').value,'2');
  for(const invalid of [-1,10,0.5])page.selectQuantity(invalid);
  assert.equal(page.quantity,2);page.busy=true;page.selectQuantity(3);assert.equal(page.quantity,2);
});

test('automatic refresh keeps known balance, skips covered or busy pages and releases its timer',async()=>{
  const {page,observed,left}=fixture();let updates=0;
  const wallet={generationBalance:123};page.wallet=wallet;
  page.update=async()=>{updates++;};
  await page.refreshQuietly();assert.equal(updates,1);assert.equal(page.wallet,wallet);assert.equal(page.busy,false);
  page.isCovered=true;await page.refreshQuietly();assert.equal(updates,1);
  page.isCovered=false;page.busy=true;await page.refreshQuietly();assert.equal(updates,1);
  page.busy=false;page.refreshTimer=setInterval(()=>{},10000);
  page.aboutToDisappear();assert.equal(page.refreshTimer,-1);assert.equal(page.disposed,true);
  await page.refreshQuietly();assert.equal(updates,1);assert.deepEqual(left,['official_ai']);
});

test('available credits uses the standard settings group header and help owner',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/OfficialAISettings.ets',import.meta.url),'utf8');
  const view=source.slice(source.indexOf('  build() {'));
  assert.match(view,/设置分组卡片\(\{ 是否深色: this\.isDark, 标题: \$r\('app.string.official_ai_available'\)/);
  assert.doesNotMatch(view,/showHeader: false|HelpLabel\(/);
});
