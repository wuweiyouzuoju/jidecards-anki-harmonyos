// SPDX-License-Identifier: AGPL-3.0-or-later
export const PROGRESS_CHUNK_BYTES: number = 64 * 1024;
export const PROGRESS_MAX_BYTES: number = 512 * 1024 * 1024;
export const PROGRESS_REQUEST: string = 'jidecards:progress:1';

export interface ProgressConnection {
  send(text: string): Promise<void>;
  read(): Promise<string>;
  sendData(bytes: Uint8Array): Promise<void>;
  readData(): Promise<Uint8Array>;
}
export interface ProgressFile { token: string; bytes: number; hash: string; }
export interface ProgressMergeResult { addedReviews: number; updatedCards: number; }
export interface ProgressSyncResult extends ProgressMergeResult { remoteAddedReviews: number; remoteUpdatedCards: number; }
export interface ProgressStore {
  acquire(): Promise<void>;
  release(): Promise<void>;
  exportFile(): Promise<ProgressFile>;
  receiveFile(): Promise<string>;
  read(token: string, length: number): Promise<Uint8Array>;
  write(token: string, bytes: Uint8Array): Promise<void>;
  verify(token: string, file: ProgressFile): Promise<void>;
  merge(token: string): Promise<ProgressMergeResult>;
}
interface ProgressMessage { kind: string; bytes?: number; hash?: string; offset?: number;
  addedReviews?: number; updatedCards?: number; error?: string; }

export function progressError(error: Error): string {
  const keys: string[] = ['device_progress_busy', 'device_progress_not_allowed', 'device_progress_mismatch',
    'device_progress_filtered', 'device_progress_record_conflict', 'device_progress_too_large',
    'device_progress_invalid', 'device_progress_cancelled'];
  return keys.find((key: string): boolean => error.message.includes(key)) ?? 'device_progress_failed';
}

/** @throws {Error} 远端错误或非法控制帧必须结束当前任务。 */
function message(text: string, kind: string): ProgressMessage {
  if (text.length > 4096) throw new Error('device_progress_invalid');
  const value = JSON.parse(text) as ProgressMessage;
  if (value === null || typeof value.kind !== 'string') throw new Error('device_progress_invalid');
  if (value.kind === 'error') throw new Error(progressError(new Error(value.error ?? 'device_progress_failed')));
  if (value.kind !== kind) throw new Error('device_progress_invalid');
  return value;
}

/** @throws {Error} 完整文件逐块发送并等候对端落盘；没有远端路径或单帧大包。 */
async function sendFile(connection: ProgressConnection, store: ProgressStore, file: ProgressFile): Promise<void> {
  if (file.bytes < 1 || file.bytes > PROGRESS_MAX_BYTES) throw new Error('device_progress_too_large');
  const header: ProgressMessage = { kind: 'file', bytes: file.bytes, hash: file.hash };
  await connection.send(JSON.stringify(header));
  let offset: number = 0;
  while (offset < file.bytes) {
    const bytes = await store.read(file.token, Math.min(PROGRESS_CHUNK_BYTES, file.bytes - offset));
    if (bytes.length < 1 || bytes.length > Math.min(PROGRESS_CHUNK_BYTES, file.bytes - offset)) throw new Error('device_progress_invalid');
    await connection.sendData(bytes);
    offset += bytes.length;
    if (message(await connection.read(), 'received').offset !== offset) throw new Error('device_progress_invalid');
  }
}

/** @throws {Error} 长度、哈希或落盘失败时，不进入 Core 合并。 */
async function receiveFile(connection: ProgressConnection, store: ProgressStore): Promise<string> {
  const header = message(await connection.read(), 'file');
  if (!Number.isSafeInteger(header.bytes) || header.bytes! < 1 || header.bytes! > PROGRESS_MAX_BYTES ||
    typeof header.hash !== 'string' || !/^[a-f0-9]{64}$/.test(header.hash)) throw new Error('device_progress_invalid');
  const token = await store.receiveFile();
  const file: ProgressFile = { token, bytes: header.bytes!, hash: header.hash };
  let offset: number = 0;
  while (offset < file.bytes) {
    const bytes = await connection.readData();
    if (bytes.length < 1 || bytes.length > Math.min(PROGRESS_CHUNK_BYTES, file.bytes - offset)) throw new Error('device_progress_invalid');
    await store.write(token, bytes); offset += bytes.length;
    const ack: ProgressMessage = { kind: 'received', offset };
    await connection.send(JSON.stringify(ack));
  }
  await store.verify(token, file);
  return token;
}

/** 本地先导出，远端合并后回传双方并集；成功须两端都实际提交。重试由 Core 按 ID 去重。
 * @throws {Error} 连接、落盘或 Core 合并失败由任务宿主显示。 */
export async function mergeProgressClient(connection: ProgressConnection, store: ProgressStore,
  isCancelled: () => boolean = (): boolean => false): Promise<ProgressSyncResult> {
  await store.acquire();
  try {
    await connection.send(PROGRESS_REQUEST);
    message(await connection.read(), 'ready');
    await sendFile(connection, store, await store.exportFile());
    const token = await receiveFile(connection, store);
    // 文件校验可以晚于网络取消完成；只有取消前已进入 Core 的事务继续执行。
    if (isCancelled()) throw new Error('device_progress_cancelled');
    const result = await store.merge(token);
    const committed: ProgressMessage = { kind: 'done', addedReviews: result.addedReviews, updatedCards: result.updatedCards };
    await connection.send(JSON.stringify(committed));
    const remote = message(await connection.read(), 'done');
    if (!Number.isSafeInteger(remote.addedReviews) || remote.addedReviews! < 0 ||
      !Number.isSafeInteger(remote.updatedCards) || remote.updatedCards! < 0) throw new Error('device_progress_invalid');
    return { addedReviews: result.addedReviews, updatedCards: result.updatedCards,
      remoteAddedReviews: remote.addedReviews!, remoteUpdatedCards: remote.updatedCards! };
  } finally { await store.release(); }
}

/** 已配对不自动授权学习记录写入；调用方须先核对该设备的个人同步授权。
 * @throws {Error} 错误回传给发起端，已接受的事务完成后释放租约。 */
export async function mergeProgressServer(connection: ProgressConnection, store: ProgressStore,
  isCancelled: () => boolean = (): boolean => false): Promise<ProgressMergeResult> {
  let acquired: boolean = false;
  try {
    await store.acquire(); acquired = true;
    const ready: ProgressMessage = { kind: 'ready' }; await connection.send(JSON.stringify(ready));
    const token = await receiveFile(connection, store);
    if (isCancelled()) throw new Error('device_progress_cancelled');
    const result = await store.merge(token);
    await sendFile(connection, store, await store.exportFile());
    message(await connection.read(), 'done');
    await store.release(); acquired = false;
    const done: ProgressMessage = { kind: 'done', addedReviews: result.addedReviews, updatedCards: result.updatedCards };
    await connection.send(JSON.stringify(done));
    return result;
  } catch (error) {
    const reply: ProgressMessage = { kind: 'error', error: progressError(error instanceof Error ? error : new Error('device_progress_failed')) };
    try { await connection.send(JSON.stringify(reply)); } catch (sendError) {}
    throw error instanceof Error ? error : new Error('device_progress_failed');
  } finally { if (acquired) await store.release(); }
}
