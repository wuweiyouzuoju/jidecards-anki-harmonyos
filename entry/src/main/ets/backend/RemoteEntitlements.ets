// SPDX-License-Identifier: AGPL-3.0-or-later
import { REMOTE_AI_KEY, AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { UNLOCKED_CONTENTS_KEY } from '../model/ThemeCatalog';
import { IRIDESCENT_CONTENT } from '../model/Redemption';

const PUBLIC_KEY: string = 'MCowBQYDK2VwAyEAsO9H0DhD6K5bbO4B70Cy4Ag0ErrmdU9guhcg5rX09d0=';
export interface RemoteGrant { feature: string; token: string; }
let applied: string[] = [];

async function verified(token: string, user: string): Promise<string | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== 'JGE1' || parts[1] !== 'harmony' || parts[2] !== user ||
      !['ai', 'iridescent'].includes(parts[3]) || !/^[A-Za-z0-9_-]{86}$/.test(parts[4])) return null;
    const base64 = new util.Base64Helper();
    const keys = await cryptoFramework.createAsyKeyGenerator('Ed25519').convertKey(
      { data: base64.decodeSync(PUBLIC_KEY) }, null);
    const verifier = cryptoFramework.createVerify('Ed25519');
    await verifier.init(keys.pubKey);
    const valid = await verifier.verify({ data: new util.TextEncoder().encodeInto(parts.slice(0, 4).join('.')) },
      { data: base64.decodeSync(parts[4].replace(/-/g, '+').replace(/_/g, '/') + '==') });
    return valid ? parts[3] : null;
  } catch (_error) { return null; }
}

function publish(features: string[]): void {
  applied = features;
  AppStorage.setOrCreate<boolean>(REMOTE_AI_KEY, features.includes('ai'));
  if (features.includes('ai')) AppStorage.setOrCreate<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY, true);
  if (features.includes('iridescent')) {
    const contents = AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [];
    if (!contents.includes(IRIDESCENT_CONTENT)) {
      AppStorage.setOrCreate<string[]>(UNLOCKED_CONTENTS_KEY, contents.concat([IRIDESCENT_CONTENT]));
    }
  }
}

export function appliedRemoteGrants(): string[] { return applied.slice(); }

/** 本机验签恢复，不依赖网络；坏凭证不能覆盖原有本地权益。 */
export async function restoreRemoteEntitlements(user: string): Promise<void> {
  try {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) return;
    const store = await preferences.getPreferences(context, { name: 'jidecards_remote_grants' });
    const features: string[] = [];
    for (const name of ['ai', 'iridescent']) {
      const token = await store.get(name, '');
      if (typeof token === 'string' && await verified(token, user) === name) features.push(name);
    }
    publish(features);
  } catch (_error) { /* Analytics/remote storage failures never block local collection startup. */ }
}

/** @throws {Error} 持久化失败，不发送已领取回执。 */
export async function applyRemoteGrants(context: common.UIAbilityContext, user: string, grants: RemoteGrant[]): Promise<boolean> {
  const store = await preferences.getPreferences(context, { name: 'jidecards_remote_grants' });
  let changed: boolean = false;
  for (const grant of grants.slice(0, 2)) {
    const feature = await verified(grant.token, user);
    if (feature === null || feature !== grant.feature || applied.includes(feature)) continue;
    const previous = await store.get(feature, '');
    await store.put(feature, grant.token);
    try { await store.flush(); } catch (_error) {
      await store.put(feature, previous);
      throw new Error('Remote entitlement storage failed');
    }
    publish(applied.concat([feature]));
    changed = true;
  }
  return changed;
}
