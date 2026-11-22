// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { RemoteSettings, RemoteDiagnostics, RemoteReport, RemoteEnvelope, RemotePayload, RemoteState,
  REMOTE_CAPABILITIES, defaultRemoteSettings, validRemoteSettings, validCommandId, commandReceipt } from '../model/RemoteControlProtocol';

const PUBLIC_KEY: string = 'MCowBQYDK2VwAyEAsO9H0DhD6K5bbO4B70Cy4Ag0ErrmdU9guhcg5rX09d0=';
let settings: RemoteSettings = defaultRemoteSettings();
let revision: number = 0;
let state: RemoteState = { configuration: '', receipts: [], seen: [], announcement_pending: false, snapshot_pending: false };
let owner: string = '';
let context: common.UIAbilityContext | undefined;
let listener: (() => void) | undefined;
let tail: Promise<void> = Promise.resolve();

export function remoteHeartbeatMs(): number { return settings.heartbeat_seconds * 1000; }
export function remoteAnnouncementsEnabled(): boolean { return settings.announcements_enabled; }
export function remoteAnnouncementRefreshPending(): boolean { return state.announcement_pending; }
export function remoteSnapshotPending(): boolean { return state.snapshot_pending; }
export function setRemoteAnnouncementListener(value: (() => void) | undefined): void {
  listener = value;
  if (value !== undefined && state.announcement_pending) value();
}

async function verified(token: string, user: string): Promise<RemotePayload | null> {
  try {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const pieces = token.split('.');
    if (pieces.length !== 3 || pieces[0] !== 'JCP1' || !/^[A-Za-z0-9_-]+$/.test(pieces[1]) || !/^[A-Za-z0-9_-]{86}$/.test(pieces[2])) return null;
    const base64 = new util.Base64Helper();
    const signature = base64.decodeSync(pieces[2].replace(/-/g, '+').replace(/_/g, '/') + '==');
    const keys = await cryptoFramework.createAsyKeyGenerator('Ed25519').convertKey({ data: base64.decodeSync(PUBLIC_KEY) }, null);
    const verifier = cryptoFramework.createVerify('Ed25519');
    await verifier.init(keys.pubKey);
    if (!await verifier.verify({ data: new util.TextEncoder().encodeInto('JCP1.' + pieces[1]) }, { data: signature })) return null;
    let encoded = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4 !== 0) encoded += '=';
    const payload = JSON.parse(new util.TextDecoder('utf-8').decodeToString(base64.decodeSync(encoded))) as RemotePayload;
    if (payload === null || payload.protocol_version !== 1 || payload.platform !== 'harmony' || payload.user_id !== user) return null;
    return payload;
  } catch (_error) { return null; }
}

/** Store first, publish settings/results only after flush. All mutations share one serial owner. */
/** @throws {Error} 配置/执行回执未落盘，保留旧状态供下一批重试。 */
async function persist(next: RemoteState): Promise<void> {
  if (context === undefined) throw new Error('Remote control context unavailable');
  const store = await preferences.getPreferences(context, { name: 'jidecards_remote_control_v1' });
  const previous = await store.get('state', '');
  await store.put('state', JSON.stringify(next));
  try { await store.flush(); } catch (_error) {
    await store.put('state', previous);
    throw new Error('Remote control persistence failed');
  }
  state = next;
}
function serialized(work: () => Promise<void>): Promise<void> {
  const result = tail.then(work);
  tail = result.catch((): void => {});
  return result;
}

/** 本机恢复仅验证签名，不访问网络，不阻塞集合启动。 */
export async function restoreRemoteControl(value: common.UIAbilityContext, user: string): Promise<void> {
  await serialized(async (): Promise<void> => {
    if (owner === user) return;
    context = value;
    const store = await preferences.getPreferences(value, { name: 'jidecards_remote_control_v1' });
    const raw = await store.get('state', '');
    const saved: RemoteState = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) as RemoteState :
      { configuration: '', receipts: [], seen: [], announcement_pending: false, snapshot_pending: false };
    if (!Array.isArray(saved.receipts) || !Array.isArray(saved.seen) || saved.receipts.length > 256 || saved.seen.length > 256) throw new Error('Invalid remote state');
    const payload = await verified(saved.configuration, user);
    settings = defaultRemoteSettings(); revision = 0;
    if (payload !== null && payload.kind === 'configuration' && Number.isInteger(payload.revision) &&
      (payload.revision ?? 0) > 0 && validRemoteSettings(payload.settings)) {
      settings = payload.settings!; revision = payload.revision!;
    }
    state = saved; owner = user;
  }).catch((): void => { /* Remote metadata failure never blocks local learning. */ });
}
export function remoteControlReport(): RemoteReport {
  return { protocol_version: 1, capabilities: REMOTE_CAPABILITIES.slice(), configuration_revision: revision, receipts: state.receipts.slice(0, 64) };
}

/** @throws {Error} 签名状态持久化失败，由心跳边界捕获并重试。 */
export async function applyRemoteControl(envelope: RemoteEnvelope, diagnostics: RemoteDiagnostics): Promise<void> {
  await serialized(async (): Promise<void> => {
    if (owner === '' || envelope === null || envelope.protocol_version !== 1 || !Array.isArray(envelope.commands) ||
      !Array.isArray(envelope.acknowledged_receipt_ids)) return;
    const next: RemoteState = JSON.parse(JSON.stringify(state)) as RemoteState;
    next.receipts = next.receipts.filter((r): boolean => !envelope.acknowledged_receipt_ids.includes(r.id));
    let nextSettings: RemoteSettings = settings; let nextRevision: number = revision;
    if (typeof envelope.configuration === 'string') {
      const payload = await verified(envelope.configuration, owner);
      if (payload !== null && payload.kind === 'configuration' && Number.isInteger(payload.revision) &&
        payload.revision! > revision && validRemoteSettings(payload.settings)) {
        next.configuration = envelope.configuration; nextSettings = payload.settings!; nextRevision = payload.revision!;
      }
    }
    for (const token of envelope.commands.slice(0, 8)) {
      const payload = await verified(token, owner);
      if (payload === null || payload.kind !== 'command' || !validCommandId(payload.id) || next.seen.includes(payload.id!) || next.receipts.length >= 256) continue;
      const receipt = commandReceipt(payload, nextSettings, diagnostics, Date.now());
      next.receipts.push(receipt); next.seen.push(payload.id!);
      if (receipt.status === 'applied' && payload.action === 'refresh_snapshot') next.snapshot_pending = true;
      if (receipt.status === 'applied' && payload.action === 'refresh_announcements') next.announcement_pending = true;
    }
    next.seen = next.seen.slice(-256);
    await persist(next);
    settings = nextSettings; revision = nextRevision;
    if (state.announcement_pending && listener !== undefined) listener();
  });
}
/** @throws {Error} 已安排任务在落盘成功之前仍保持待执行。 */
export async function completeRemoteSnapshot(): Promise<void> {
  await serialized(async (): Promise<void> => {
    if (!state.snapshot_pending) return;
    const next = JSON.parse(JSON.stringify(state)) as RemoteState;
    next.snapshot_pending = false; await persist(next);
  });
}
/** @throws {Error} 失败时下次前台继续检查。 */
export async function completeRemoteAnnouncementRefresh(): Promise<void> {
  await serialized(async (): Promise<void> => {
    if (!state.announcement_pending) return;
    const next = JSON.parse(JSON.stringify(state)) as RemoteState;
    next.announcement_pending = false; await persist(next);
  });
}
