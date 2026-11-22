// SPDX-License-Identifier: AGPL-3.0-or-later
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';

interface PendingCall { id: string; created: number; }
export interface OfficialRequestIdentity { hash: string; id: string; }
let requestTail: Promise<void> = Promise.resolve();

/** @throws {Error} 仅持久化账户会话与载荷的摘要，不保存 Key、消息或卡片内容。 */
export async function prepareOfficialRequest(token: string, payload: string): Promise<OfficialRequestIdentity> {
  const digest = cryptoFramework.createMd('SHA256');
  await digest.update({ data: new util.TextEncoder().encodeInto(token + ':' + payload) });
  const bytes = await digest.digest();
  let hash: string = '';
  for (const byte of bytes.data) hash += byte.toString(16).padStart(2, '0');
  const previous: Promise<void> = requestTail;
  let release: () => void = (): void => {};
  requestTail = new Promise<void>((resolve): void => { release = resolve; });
  await previous;
  try {
    const store: preferences.Preferences = await openStore();
    const raw: preferences.ValueType = await store.get(hash, '');
    if (typeof raw === 'string' && raw !== '') {
      const pending: PendingCall = JSON.parse(raw) as PendingCall;
      if (pending.id !== '' && Date.now() - pending.created < 86400000) return { hash: hash, id: pending.id };
    }
    const call: PendingCall = { id: util.generateRandomUUID(), created: Date.now() };
    await store.put(hash, JSON.stringify(call)); await store.flush();
    return { hash: hash, id: call.id };
  } finally { release(); }
}
/** @throws {Error} 完成后清理幂等凭据失败由传输层记录；已完成的响应不重新扣费。 */
export async function completeOfficialRequest(identity: OfficialRequestIdentity): Promise<void> {
  const store: preferences.Preferences = await openStore();
  const raw: preferences.ValueType = await store.get(identity.hash, '');
  if (typeof raw === 'string' && raw !== '') {
    const pending: PendingCall = JSON.parse(raw) as PendingCall;
    if (pending.id !== identity.id) return;
    await store.delete(identity.hash); await store.flush();
  }
}
/** @throws {Error} 无应用上下文时阻止付费请求。 */
async function openStore(): Promise<preferences.Preferences> {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('official_request_store_unavailable');
  return preferences.getPreferences(context, 'jidecards_official_ai_requests');
}
