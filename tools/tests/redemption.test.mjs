// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { generateKeyPairSync, sign, verify, randomBytes, createPublicKey } from 'node:crypto';
import * as catalog from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import * as protocol from '../../entry/src/main/ets/model/Redemption.ts';
import { issueCode } from '../redemption-issuer.mjs';
import { 解析主题色板, 规范化颜色主题, 颜色主题渐变档 } from '../../entry/src/main/ets/model/颜色主题.ets';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';
import { initialThemeBackgroundPoses, nextThemeBackgroundPoses, sampleThemeBackgroundPoses, backgroundEase } from '../../entry/src/main/ets/model/ThemeBackgroundMotion.ts';

const keys = generateKeyPairSync('ed25519');
const fingerprint = '0123456789ABCDEF0123456789ABCDEF';
const otherFingerprint = 'FEDCBA9876543210FEDCBA9876543210';
const content = protocol.IRIDESCENT_CONTENT;
const makeCode = (fp = fingerprint, id = content) => {
  const message = `JCR1.${fp}.${id}`;
  return `${message}.${sign(null, Buffer.from(message), keys.privateKey).toString('base64url')}`;
};

/** 运行真实 Store，只用内存偏好和 Node 的同算法密码接口替换系统适配。 */
function createStore(initial = {}, options = {}) {
  let disk = new Map(Object.entries(initial));
  const cache = new Map(disk);
  const app = new Map();
  let failFlush = !!options.failFlush;
  let flushCount = 0;
  let randomCount = 0;
  const prefs = {
    getSync: (key, fallback) => cache.has(key) ? cache.get(key) : fallback,
    putSync: (key, value) => cache.set(key, value),
    flush: async () => {
      flushCount++;
      if (failFlush) throw new Error('Disk full');
      disk = new Map(cache);
    },
  };
  const cryptoFramework = {
    createRandom: () => ({ generateRandom: async length => { randomCount++; return { data: randomBytes(length) }; } }),
    createAsyKeyGenerator: algorithm => {
      assert.equal(algorithm, 'Ed25519');
      return { convertKey: async blob => ({ pubKey: createPublicKey({ key: Buffer.from(blob.data), type: 'spki', format: 'der' }) }) };
    },
    createVerify: algorithm => {
      assert.equal(algorithm, 'Ed25519');
      let publicKey;
      return { init: async key => { publicKey = key; }, verify: async (data, signature) => verify(null, data.data, publicKey, signature.data) };
    },
  };
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/RedemptionStore.ets', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  const js = stripTypeScriptTypes(source, { mode: 'transform' });
  const injected = {
    ...protocol, ...catalog,
    REDEMPTION_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    cryptoFramework,
    preferences: { getPreferencesSync: () => prefs },
    util: {
      Base64Helper: class { decodeSync(value) { return new Uint8Array(Buffer.from(value, 'base64')); } },
      TextEncoder: class { encodeInto(value) { return new Uint8Array(Buffer.from(value)); } },
    },
    AppStorage: { get: key => key === 'abilityContext' ? {} : app.get(key), setOrCreate: (key, value) => app.set(key, value) },
  };
  const api = new Function(...Object.keys(injected), js + '\nreturn { initializeRedemption, getApplicationFingerprint, redeemContent, saveThemeMotion };')(...Object.values(injected));
  return { ...api, app, snapshot: () => Object.fromEntries(disk), setFailure: value => { failFlush = value; },
    flushCount: () => flushCount, randomCount: () => randomCount };
}

test('fingerprints normalize only full 128-bit identities', () => {
  assert.equal(protocol.normalizeFingerprint(protocol.displayFingerprint(fingerprint)), fingerprint);
  assert.equal(protocol.normalizeFingerprint(fingerprint.toLowerCase()), fingerprint);
  assert.equal(protocol.normalizeFingerprint('1234'), '');
  assert.equal(protocol.normalizeFingerprint('Z'.repeat(32)), '');
});

test('issuer deterministically binds one content to one installation', () => {
  const code = issueCode(protocol.displayFingerprint(fingerprint), content, keys.privateKey);
  assert.equal(code, makeCode());
  assert.equal(issueCode(fingerprint, content, keys.privateKey), code);
  assert.notEqual(issueCode(otherFingerprint, content, keys.privateKey), code);
  assert.throws(() => issueCode(fingerprint, 'all-content', keys.privateKey));
  assert.equal(protocol.parseRedemption(' \n' + code + '\n').encoded, code);
  for (const invalid of [code.replace('JCR1', 'JCR2'), code + '.extra', code.slice(0, -1), 'x'.repeat(1025)]) {
    assert.equal(protocol.parseRedemption(invalid), null);
  }
});

test('concurrent startup generates and saves a single stable identity', async () => {
  const store = createStore();
  const ids = await Promise.all(Array.from({ length: 8 }, () => store.getApplicationFingerprint()));
  assert.equal(new Set(ids).size, 1);
  assert.equal(store.randomCount(), 1);
  assert.equal(store.snapshot().fingerprint, ids[0]);
  const restarted = createStore(store.snapshot());
  assert.equal(await restarted.getApplicationFingerprint(), ids[0]);
  assert.equal(restarted.randomCount(), 0);
});

test('failed identity persistence exposes no temporary fingerprint and can retry', async () => {
  const store = createStore({}, { failFlush: true });
  await assert.rejects(store.getApplicationFingerprint());
  assert.equal(store.snapshot().fingerprint, undefined);
  store.setFailure(false);
  assert.equal((await store.getApplicationFingerprint()).length, 32);
  const corrupt = createStore({ fingerprint: 'broken' });
  await assert.rejects(corrupt.getApplicationFingerprint());
  assert.equal(corrupt.randomCount(), 0);
});

test('real signature verification rejects forwarding, tampering and foreign issuers', async () => {
  const store = createStore({ fingerprint });
  assert.equal(await store.redeemContent(makeCode(otherFingerprint)), 'wrong_installation');
  assert.equal(await store.redeemContent(makeCode().replace(content, 'theme-future')), 'invalid');
  const foreign = generateKeyPairSync('ed25519');
  assert.equal(await store.redeemContent(issueCode(fingerprint, content, foreign.privateKey)), 'invalid');
  assert.equal(await store.redeemContent(makeCode(fingerprint, 'theme-future')), 'unsupported');
  assert.equal(store.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), false);
  assert.equal(store.snapshot().tokens, undefined);
});

test('successful redemption survives restart and duplicate redemption is idempotent', async () => {
  const store = createStore({ fingerprint });
  assert.equal(await store.redeemContent(makeCode()), 'success');
  assert.equal(store.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), true);
  assert.equal(await store.redeemContent(makeCode()), 'already');
  assert.equal(store.flushCount(), 1);
  const restarted = createStore(store.snapshot());
  await restarted.initializeRedemption();
  assert.equal(restarted.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), true);
  const transplanted = createStore({ ...store.snapshot(), fingerprint: otherFingerprint });
  await transplanted.initializeRedemption();
  assert.equal(transplanted.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), false);
});

test('storage failures never grant an entitlement or change animation preference', async () => {
  const store = createStore({ fingerprint }, { failFlush: true });
  await assert.rejects(store.redeemContent(makeCode()));
  assert.equal(store.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), false);
  assert.equal(store.snapshot().tokens, undefined);
  await assert.rejects(store.saveThemeMotion(false));
  assert.equal(store.app.get(protocol.THEME_MOTION_KEY), true);
  store.setFailure(false);
  await store.saveThemeMotion(false);
  assert.equal(store.snapshot().tokens || '', '', 'failed receipt must not leak through a later flush');
  assert.equal(await store.redeemContent(makeCode()), 'success');
  assert.equal(store.app.get(protocol.THEME_MOTION_KEY), false);
});

test('multi-content receipts stay separate and unknown content cannot grant iridescent', async () => {
  const future = makeCode(fingerprint, 'theme-future');
  const store = createStore({ fingerprint, tokens: future });
  await store.initializeRedemption();
  assert.equal(store.app.get(catalog.UNLOCKED_CONTENTS_KEY).includes(content), false);
  await store.redeemContent(makeCode());
  assert.deepEqual(store.snapshot().tokens.split('\n'), [future, makeCode()]);
  const token = protocol.parseRedemption(makeCode());
  assert.deepEqual(protocol.mergeRedemption([future, makeCode()], token), [future, makeCode()]);
});

test('iridescent keeps readable theme colors and stable study semantics', () => {
  assert.equal(规范化颜色主题('iridescent'), 'iridescent');
  assert.deepEqual(颜色主题渐变档('iridescent'), ['#3974E8', '#7951CF', '#B04491']);
  for (const dark of [false, true]) {
    const palette = 解析主题色板('iridescent', dark);
    const normal = 解析主题色板('aurora', dark);
    for (const key of ['新卡计数色', '学习中计数色', '复习中计数色']) assert.equal(palette[key], normal[key]);
    assert.ok(对比度(palette.动作主色, dark ? '#18202B' : '#FFFFFF') >= 4.5);
  }
  for (const color of ['#345AC6', '#7040BB', '#A23788']) assert.ok(对比度(color, '#FFFFFF') >= 4.5);
});

test('animation lifecycle and entitlement gating remain connected', () => {
  const background = readFileSync(new URL('../../entry/src/main/ets/components/common/ThemeBackground.ets', import.meta.url), 'utf8');
  assert.match(background, /backgroundTextures.length === 0.*!this\.motion.*!this\.foreground.*!this\.visible/);
  assert.match(background, /this\.pauseMotion\(\)/);
  assert.match(background, /aboutToDisappear[\s\S]*this\.generation\+\+/);
  assert.doesNotMatch(background, /onFrame|hueRotate|radialGradient|createAnimator/);
  assert.match(background, /hitTestBehavior\(HitTestMode\.None\)/);
  assert.match(background, /duration: this\.cycleDuration/);
  assert.match(background, /generation === this\.generation/);
  const settings = readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets', import.meta.url), 'utf8');
  assert.ok(settings.lastIndexOf('RedemptionPanel({') > settings.indexOf('开发者调试分组({'));
  const appearance = readFileSync(new URL('../../entry/src/main/ets/components/settings/外观分组.ets', import.meta.url), 'utf8');
  assert.match(appearance, /return availableThemes\(this\.unlockedContents\)/);
});

test('texture motion stays bounded and pause samples match native easing without jumps', () => {
  const poses = initialThemeBackgroundPoses();
  const next = nextThemeBackgroundPoses();
  for (const pose of next) {
    assert.ok(pose.x >= -.16 && pose.x <= .16);
    assert.ok(pose.y >= -.16 && pose.y <= .16);
    assert.ok(pose.scale >= 1 && pose.scale <= 1.2);
    assert.ok(pose.opacity >= .25 && pose.opacity <= .55);
  }
  assert.deepEqual(sampleThemeBackgroundPoses(poses, next, -1), poses);
  assert.ok(Math.abs(backgroundEase(.5) - .5) < .00001);
  const end = sampleThemeBackgroundPoses(poses, next, 9000);
  const mid = sampleThemeBackgroundPoses(poses, next, 3000);
  for (let i = 0; i < next.length; i++) for (const key of ['x', 'y', 'scale', 'opacity']) {
    assert.ok(Math.abs(end[i][key] - next[i][key]) < .00001);
    assert.ok(Math.abs(mid[i][key] - (poses[i][key] + next[i][key]) / 2) < .00001);
  }
  assert.deepEqual(catalog.themeDeckColors(catalog.themeDefinition('iridescent'), '123456'), catalog.themeDeckColors(catalog.themeDefinition('iridescent'), '123456'));
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => catalog.themeDeckColors(catalog.themeDefinition('iridescent'), String(i)).join(','))).size, 5);
});

test('exclusive content information uses the existing developer group and stated eligibility', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/RedemptionPanel.ets', import.meta.url), 'utf8');
  assert.match(source, /this\.contentInfo\(\)/);
  assert.match(source, /pasteboard\.MIMETYPE_TEXT_PLAIN, this\.developerGroup/);
  const strings = JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string;
  assert.equal(strings.find(item => item.name === 'redemption_fingerprint_hint').value, '用于领取 JideCards 主题');
  assert.match(strings.find(item => item.name === 'redemption_contents_eligibility').value, /3\.0\.0 版本之前/);
});
