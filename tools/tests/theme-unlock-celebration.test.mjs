// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { parseRedemption } from '../../entry/src/main/ets/model/Redemption.ts';
import { themeDefinition, themeForContent } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

const fingerprint = '1234567890ABCDEF1234567890ABCDEF';
const code = `JCR1.${fingerprint}.theme-iridescent.${'A'.repeat(86)}`;
const resource = id => ({ id, type: 10003, params: [id] });

function panelHarness(redeemContent) {
  const applied = [];
  const Panel = loadComponentLogic('components/settings/RedemptionPanel.ets', 'RedemptionPanel', {
    CustomDialogController: class { close() {} }, 字段帮助对话框: () => ({}),
    DialogAlignment: { Center: 0 }, Color: { Transparent: 'transparent' }, $r: resource,
    getApplicationFingerprint: async () => fingerprint, parseRedemption, themeForContent, redeemContent,
    resourceText: (_context, key, label) => `${key.id}: ${label}`,
    namedResourceText: (_context, key) => key,
    displayFingerprint: value => value
  });
  const panel = new Panel();
  panel.getUIContext = () => ({});
  panel.onUseTheme = theme => applied.push(theme);
  panel.aboutToAppear();
  panel.expanded = true;
  panel.code = code;
  return { panel, applied };
}

test('only a newly persisted Iridescent redemption opens the gift and retains the existing use-theme action', async () => {
  const { panel, applied } = panelHarness(async () => 'success');
  panel.useUnlockedTheme();
  assert.deepEqual(applied, []);
  await panel.redeem();
  assert.equal(panel.showCelebration, true);
  assert.equal(panel.unlocked, true);
  assert.equal(panel.code, '');
  assert.deepEqual(applied, [], 'redemption does not silently apply a theme');
  panel.useUnlockedTheme();
  assert.deepEqual(applied, ['iridescent']);
  assert.equal(panel.expanded, false);
  assert.equal(panel.showCelebration, false);
});

test('duplicate redemption and verification failures never celebrate; storage failures preserve the entered code', async () => {
  for (const result of ['already', 'invalid', 'wrong_installation', 'unsupported']) {
    const { panel } = panelHarness(async () => result);
    await panel.redeem();
    assert.equal(panel.showCelebration, false, result);
    assert.equal(panel.unlocked, result === 'already', result);
    assert.equal(panel.busy, false);
    if (result !== 'already') assert.equal(panel.code, code);
  }
  const { panel } = panelHarness(async () => { throw new Error('disk full'); });
  await panel.redeem();
  assert.equal(panel.showCelebration, false);
  assert.equal(panel.unlocked, false);
  assert.equal(panel.code, code);
  assert.equal(panel.message.id, 'app.string.redemption_storage_failed');
});

test('busy dismissal is protected and a late accepted redemption cannot reopen a gift after leaving the page', async () => {
  let finish;
  let persisted=false;
  const pending = new Promise(resolve => { finish = resolve; });
  const { panel, applied } = panelHarness(async () => { const result=await pending;persisted=true;return result; });
  const operation = panel.redeem();
  panel.closeRedemption();
  panel.useUnlockedTheme();
  assert.equal(panel.expanded, true);
  assert.equal(panel.code, code);
  assert.deepEqual(applied, []);
  panel.aboutToDisappear();
  finish('success');
  await operation;
  assert.equal(panel.showCelebration, false);
  assert.equal(persisted,true,'the accepted entitlement still persists outside the departed UI');
  assert.equal(panel.unlocked,false,'late results cannot update a destroyed sheet');
  assert.equal(panel.code,code);
});

function animationHarness() {
  const animations = [];
  const Gift = loadComponentLogic('components/settings/IridescentUnlockCelebration.ets', 'IridescentUnlockCelebration', {
    themeDefinition, Curve: { FastOutSlowIn: 'ease', EaseOut: 'out' }
  });
  const gift = new Gift();
  gift.getUIContext = () => ({ animateTo(options, update) { animations.push(options.duration); update(); } });
  return { gift, animations };
}

test('gift entrance and confetti submit one animation each and repeated appearance does not replay them', () => {
  const { gift, animations } = animationHarness();
  gift.foreground = true;
  gift.revealGift();
  assert.deepEqual(animations, [560, 1400]);
  assert.equal(gift.revealed, true);
  assert.equal(gift.burst, true);
  gift.revealGift();
  assert.deepEqual(animations, [560, 1400]);
});

test('disabled motion and background entry settle into a readable gift without replay or callbacks after disposal', () => {
  const staticGift = animationHarness();
  staticGift.gift.motion = false;
  staticGift.gift.foreground = true;
  staticGift.gift.revealGift();
  assert.deepEqual(staticGift.animations, []);
  assert.equal(staticGift.gift.revealed, true);
  assert.equal(staticGift.gift.burst, true);
  const { gift, animations } = animationHarness();
  gift.foreground = true;
  gift.revealGift();
  gift.foreground = false;
  gift.settleMotion();
  assert.deepEqual(animations, [560, 1400, 0]);
  gift.foreground = true;
  gift.settleMotion();
  gift.aboutToDisappear();
  gift.motion = false;
  gift.settleMotion();
  assert.deepEqual(animations, [560, 1400, 0]);
});
