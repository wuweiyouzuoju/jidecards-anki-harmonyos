// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProgressConnection, ProgressFile } from './ProgressSync';

export const COLLECTION_PROTOCOL_VERSION: number = 2;
export const COLLECTION_REQUEST: string = 'jidecards:collection:2';
export const COLLECTION_MAX_BYTES: number = 4 * 1024 * 1024 * 1024;
export const COLLECTION_METADATA_MAX_BYTES: number = 64 * 1024 * 1024;
const CHUNK: number = 64 * 1024;
export type CollectionMode = 'merge' | 'pull';
export interface CollectionResult { updatedObjects: number; addedReviews: number; updatedMedia: number; deletedMedia: number; }
export interface CollectionStore {
  acquire(): Promise<void>;
  release(): Promise<void>;
  capture(): Promise<ProgressFile>;
  plan(remote: string, local: string, mode: CollectionMode): Promise<ProgressFile>;
  pack(wanted: string, local: string): Promise<ProgressFile>;
  apply(remote: string, payload: string, mode: string): Promise<CollectionResult>;
  confirm(local: string): Promise<void>;
  receiveFile(): Promise<string>;
  read(token: string, length: number): Promise<Uint8Array>;
  write(token: string, bytes: Uint8Array): Promise<void>;
  verify(token: string, file: ProgressFile): Promise<void>;
}
interface Control { kind: string; mode?: string; bytes?: number; hash?: string; offset?: number; error?: string; result?: CollectionResult; }
export function collectionError(error: Error): string {
  const keys: string[] = ['device_collection_busy', 'device_collection_not_allowed', 'device_collection_full_required', 'device_collection_filtered',
    'device_collection_record_conflict', 'device_collection_recovery', 'device_collection_too_large',
    'device_collection_invalid', 'device_collection_cancelled', 'device_collection_unsupported'];
  return keys.find((key: string): boolean => error.message.includes(key)) ?? 'device_collection_failed';
}
function control(text: string, kind: string): Control {
  if (text.length > 4096) throw new Error('device_collection_invalid');
  const value = JSON.parse(text) as Control;
  if (value === null || typeof value.kind !== 'string') throw new Error('device_collection_invalid');
  if (value.kind === 'error') throw new Error(collectionError(new Error(value.error ?? '')));
  if (value.kind !== kind) throw new Error('device_collection_invalid');
  return value;
}
async function sendFile(connection: ProgressConnection, store: CollectionStore, file: ProgressFile,
  limit: number = COLLECTION_METADATA_MAX_BYTES): Promise<void> {
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > limit) throw new Error('device_collection_too_large');
  const header: Control = { kind: 'file', bytes: file.bytes, hash: file.hash };
  await connection.send(JSON.stringify(header));
  let offset: number = 0;
  while (offset < file.bytes) {
    const bytes = await store.read(file.token, Math.min(CHUNK, file.bytes - offset));
    if (bytes.length < 1 || bytes.length > Math.min(CHUNK, file.bytes - offset)) throw new Error('device_collection_invalid');
    await connection.sendData(bytes); offset += bytes.length;
    if (control(await connection.read(), 'received').offset !== offset) throw new Error('device_collection_invalid');
  }
}
async function receiveFile(connection: ProgressConnection, store: CollectionStore,
  limit: number = COLLECTION_METADATA_MAX_BYTES): Promise<string> {
  const header = control(await connection.read(), 'file');
  if (!Number.isSafeInteger(header.bytes) || header.bytes! < 1 ||
    typeof header.hash !== 'string' || !/^[a-f0-9]{64}$/.test(header.hash)) throw new Error('device_collection_invalid');
  if (header.bytes! > limit) throw new Error('device_collection_too_large');
  const token = await store.receiveFile();
  let offset: number = 0;
  while (offset < header.bytes!) {
    const bytes = await connection.readData();
    if (bytes.length < 1 || bytes.length > Math.min(CHUNK, header.bytes! - offset)) throw new Error('device_collection_invalid');
    await store.write(token, bytes); offset += bytes.length;
    const ack: Control = { kind: 'received', offset }; await connection.send(JSON.stringify(ack));
  }
  await store.verify(token, { token, bytes: header.bytes!, hash: header.hash });
  return token;
}
function done(value: Control): CollectionResult {
  const r = value.result;
  if (r === undefined || ![r.updatedObjects, r.addedReviews, r.updatedMedia, r.deletedMedia]
    .every((n: number): boolean => Number.isSafeInteger(n) && n >= 0)) throw new Error('device_collection_invalid');
  return r;
}
function check(cancelled: () => boolean): void { if (cancelled()) throw new Error('device_collection_cancelled'); }

/** 两端均持有集合租约；拉取替换仅由接收设备上的明确确认触发。 */
export async function syncCollectionClient(connection: ProgressConnection, store: CollectionStore, mode: CollectionMode,
  cancelled: () => boolean = (): boolean => false): Promise<CollectionResult> {
  await store.acquire();
  try {
    await connection.send(COLLECTION_REQUEST); control(await connection.read(), 'ready');
    const request: Control = { kind: 'mode', mode }; await connection.send(JSON.stringify(request));
    const local = await store.capture(); check(cancelled);
    await sendFile(connection, store, local);
    const wanted = await receiveFile(connection, store);
    await sendFile(connection, store, await store.pack(wanted, local.token), COLLECTION_MAX_BYTES);
    const remote = await receiveFile(connection, store);
    await sendFile(connection, store, await store.plan(remote, local.token, mode));
    const payload = await receiveFile(connection, store, COLLECTION_MAX_BYTES); check(cancelled);
    const result = await store.apply(remote, payload, mode === 'pull' ? 'replace' : 'final');
    const committed: Control = { kind: 'done', result }; await connection.send(JSON.stringify(committed));
    done(control(await connection.read(), 'done'));
    return result;
  } finally { await store.release(); }
}

/** 服务端只接受合并或提供卡库；远端不能要求替换本机卡库。 */
export async function syncCollectionServer(connection: ProgressConnection, store: CollectionStore,
  cancelled: () => boolean = (): boolean => false): Promise<CollectionResult> {
  let acquired: boolean = false;
  try {
    await store.acquire(); acquired = true;
    const ready: Control = { kind: 'ready' }; await connection.send(JSON.stringify(ready));
    const mode = control(await connection.read(), 'mode').mode;
    if (mode !== 'merge' && mode !== 'pull') throw new Error('device_collection_invalid');
    const local = await store.capture();
    const remote = await receiveFile(connection, store);
    await sendFile(connection, store, await store.plan(remote, local.token, mode));
    const payload = await receiveFile(connection, store, COLLECTION_MAX_BYTES); check(cancelled);
    const result = await store.apply(remote, payload, mode === 'pull' ? 'media' : 'merge');
    const merged = await store.capture(); await sendFile(connection, store, merged);
    const wanted = await receiveFile(connection, store);
    await sendFile(connection, store, await store.pack(wanted, merged.token), COLLECTION_MAX_BYTES);
    done(control(await connection.read(), 'done'));
    await store.confirm(merged.token);
    await store.release(); acquired = false;
    const committed: Control = { kind: 'done', result }; await connection.send(JSON.stringify(committed));
    return result;
  } catch (error) {
    const failure: Control = { kind: 'error', error: collectionError(error instanceof Error ? error : new Error('')) };
    try { await connection.send(JSON.stringify(failure)); } catch (sendError) {}
    throw error instanceof Error ? error : new Error('device_collection_failed');
  } finally { if (acquired) await store.release(); }
}
