// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { parseRedemption } from '../../entry/src/main/ets/model/Redemption.ts';
import { themeForContent } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

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

test('successful Iridescent redemption uses the ordinary result and retains explicit use-theme confirmation', async () => {
  const { panel, applied } = panelHarness(async () => 'success');
  panel.useUnlockedTheme();
  assert.deepEqual(applied, []);
  await panel.redeem();
  assert.equal(panel.unlocked, true);
  assert.match(panel.message, /app.string.redemption_success/);
  assert.equal(panel.code, '');
  assert.deepEqual(applied, [], 'redemption does not silently apply a theme');
  panel.useUnlockedTheme();
  assert.deepEqual(applied, ['iridescent']);
  assert.equal(panel.expanded, false);
});

test('duplicate redemption and verification failures keep their result; storage failure preserves the entered code', async () => {
  for (const result of ['already', 'invalid', 'wrong_installation', 'unsupported']) {
    const { panel } = panelHarness(async () => result);
    await panel.redeem();
    assert.equal(panel.unlocked, result === 'already', result);
    assert.equal(panel.busy, false);
    if (result !== 'already') assert.equal(panel.code, code);
  }
  const { panel } = panelHarness(async () => { throw new Error('disk full'); });
  await panel.redeem();
  assert.equal(panel.unlocked, false);
  assert.equal(panel.code, code);
  assert.equal(panel.message.id, 'app.string.redemption_storage_failed');
});

test('busy dismissal is protected and late accepted redemption cannot update the departed page', async () => {
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
  assert.equal(persisted,true,'the accepted entitlement still persists outside the departed UI');
  assert.equal(panel.unlocked,false,'late results cannot update a destroyed sheet');
  assert.equal(panel.code,code);
});
