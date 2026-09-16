// SPDX-License-Identifier: AGPL-3.0-or-later
import { UNLOCKED_CONTENTS_KEY } from '../model/ThemeCatalog';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { REDEMPTION_PUBLIC_KEY } from '../model/RedemptionPublicKey';
import {
  RedemptionToken, parseRedemption, normalizeFingerprint, mergeRedemption, isSupportedContent,
  THEME_MOTION_KEY
} from '../model/Redemption';

export type RedemptionResult = 'success' | 'already' | 'invalid' | 'wrong_installation' | 'unsupported';
let initialization: Promise<void> | undefined = undefined;
let fingerprint: string = '';
let savedTokens: string[] = [];
let mutationBusy: boolean = false;

/** 独立于 Anki 数据和同步，本地安装身份不跟随牌组导入。 */
function getStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_redemption' });
}

/** 公钥仅验签；没有任何客户端生成发行签名的入口。 */
async function verifyToken(token: RedemptionToken): Promise<boolean> {
  const base64: util.Base64Helper = new util.Base64Helper();
  const publicBlob: cryptoFramework.DataBlob = { data: base64.decodeSync(REDEMPTION_PUBLIC_KEY) };
  const signatureBlob: cryptoFramework.DataBlob = {
    data: base64.decodeSync(token.signature.replace(new RegExp('-', 'g'), '+').replace(new RegExp('_', 'g'), '/') + '==')
  };
  const messageBlob: cryptoFramework.DataBlob = { data: new util.TextEncoder().encodeInto(token.message) };
  const keys: cryptoFramework.KeyPair = await cryptoFramework.createAsyKeyGenerator('Ed25519').convertKey(publicBlob, null);
  const verifier: cryptoFramework.Verify = cryptoFramework.createVerify('Ed25519');
  await verifier.init(keys.pubKey);
  return verifier.verify(messageBlob, signatureBlob);
}

/** 写失败时恢复偏好缓存；只有 flush 成功后才发布权益和指纹。 */
async function persist(store: preferences.Preferences, key: string, value: preferences.ValueType,
  fallback: preferences.ValueType): Promise<void> {
  const previous: preferences.ValueType = store.getSync(key, fallback);
  store.putSync(key, value);
  try { await store.flush(); } catch (error) {
    store.putSync(key, previous);
    throw new Error('Redemption storage write failed');
  }
}

/**
 * 启动时从已验签凭证派生权益，单个非法凭证不能解锁任何内容。
 * Invariants: 初始化共享同一个 Promise；已有身份损坏时不擅自换身份。
 */
async function restore(): Promise<void> {
  AppStorage.setOrCreate<string[]>(UNLOCKED_CONTENTS_KEY, []);
  const store: preferences.Preferences = getStore();
  const value: preferences.ValueType = store.getSync('fingerprint', '');
  let restored: string = typeof value === 'string' ? normalizeFingerprint(value) : '';
  if (value !== '' && restored === '') throw new Error('Invalid stored fingerprint');
  if (restored === '') {
    const random: cryptoFramework.DataBlob = await cryptoFramework.createRandom().generateRandom(16);
    for (let index: number = 0; index < random.data.length; index++) {
      restored += random.data[index].toString(16).padStart(2, '0').toUpperCase();
    }
    await persist(store, 'fingerprint', restored, '');
  }
  const raw: preferences.ValueType = store.getSync('tokens', '');
  if (typeof raw !== 'string' || raw.length > 65536) throw new Error('Invalid stored receipts');
  const candidates: string[] = raw === '' ? [] : raw.split('\n');
  const verified: string[] = [];
  const contents: string[] = [];
  for (const encoded of candidates) {
    const token: RedemptionToken | null = parseRedemption(encoded);
    if (token !== null && token.fingerprint === restored && await verifyToken(token)) {
      verified.push(token.encoded);
      if (!contents.includes(token.contentId)) contents.push(token.contentId);
    }
  }
  fingerprint = restored;
  savedTokens = verified;
  AppStorage.setOrCreate<boolean>(THEME_MOTION_KEY, store.getSync('motion', true) === true);
  AppStorage.setOrCreate<string[]>(UNLOCKED_CONTENTS_KEY, contents);
}

/** 初始化失败允许用户从设置重试，避免反复生成未落盘指纹。 */
export async function initializeRedemption(): Promise<void> {
  if (initialization === undefined) initialization = restore();
  try { await initialization; } catch (error) {
    initialization = undefined;
    throw new Error('Redemption initialization failed');
  }
}

/** 只有成功保存的指纹可以分享给发行者。 */
export async function getApplicationFingerprint(): Promise<string> {
  await initializeRedemption();
  return fingerprint;
}

/** 验签、身份、内容全部匹配且落盘成功后才通知界面解锁。 */
export async function redeemContent(value: string): Promise<RedemptionResult> {
  if (mutationBusy) throw new Error('Redemption storage busy');
  mutationBusy = true;
  try {
    await initializeRedemption();
    const token: RedemptionToken | null = parseRedemption(value);
    if (token === null || !await verifyToken(token)) return 'invalid';
    if (token.fingerprint !== fingerprint) return 'wrong_installation';
    if (!isSupportedContent(token.contentId)) return 'unsupported';
    if (savedTokens.some((entry: string): boolean => parseRedemption(entry)?.contentId === token.contentId)) return 'already';
    const merged: string[] = mergeRedemption(savedTokens, token);
    await persist(getStore(), 'tokens', merged.join('\n'), '');
    savedTokens = merged;
    AppStorage.setOrCreate<string[]>(UNLOCKED_CONTENTS_KEY, savedTokens.map((entry: string): string =>
      parseRedemption(entry)!.contentId));
    return 'success';
  } finally { mutationBusy = false; }
}

/** 动态效果是本机偏好，失败时保持原来的开关值。 */
export async function saveThemeMotion(enabled: boolean): Promise<void> {
  if (mutationBusy) throw new Error('Redemption storage busy');
  mutationBusy = true;
  try {
    await initializeRedemption();
    await persist(getStore(), 'motion', enabled, true);
    AppStorage.setOrCreate<boolean>(THEME_MOTION_KEY, enabled);
  } finally { mutationBusy = false; }
}
