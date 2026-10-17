// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { 后端会话 } from '../后端会话';
import { PeerCollectionRpc } from '../../proto/generated/PrivateRpc';
import { GenericString } from '../../proto/generated/CoreMessages';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';
import { syncActivity } from '../../model/SyncSettings';
import { notifyFsrsStateChanged } from '../../model/FSRS控制器';
import { ProgressFile } from '../../model/device-link/ProgressSync';
import { CollectionStore, CollectionResult, CollectionMode } from '../../model/device-link/CollectionSync';
import { bytesHex } from '../../model/device-link/DevicePairing';
import { linkRandom } from './LanCrypto';

interface OpenCollectionFile { token: string; file: fs.File | null; }
interface CollectionRequest { token: string; own: string; local?: string; out?: string; payload?: string; mode?: string; }
interface CollectionSummary { bytes: number; updated_objects: number; added_reviews: number; updated_media: number; deleted_media: number; }

/** 扩展 RPC 管理集合事务，平台适配层管理租约和有限内存的文件传输。 */
export class DeviceCollectionStore implements CollectionStore {
  private context: common.UIAbilityContext;
  private own: string;
  private owner: Object = new Object();
  private owned: string[] = [];
  private files: OpenCollectionFile[] = [];
  private acquired: boolean = false;
  constructor(context: common.UIAbilityContext, own: string) { this.context = context; this.own = own; }
  /** @throws {Error} token 无效时拒绝构造路径。 */
  private path(token: string): string {
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('device_collection_invalid');
    return `${this.context.filesDir}/.device-collection/${token}.bin`;
  }
  /** @throws {Error} 集合忙碌或打开失败时结束任务。 */
  async acquire(): Promise<void> {
    if (!autoSyncScheduler.canSync() || syncActivity.isCollectionBusy() || !syncActivity.acquire(this.owner)) throw new Error('device_collection_busy');
    this.acquired = true; autoSyncScheduler.beginOperation(this.owner);
    try { await 后端会话.获取实例().确保已打开(this.context.filesDir); }
    catch (error) { await this.release(); throw error instanceof Error ? error : new Error('device_collection_failed'); }
  }
  /** @throws {Error} 清理失败也先归还集合租约。 */
  async release(): Promise<void> {
    let failure: boolean = false;
    for (const item of this.files) {
      if (item.file !== null) {
        try { await fs.close(item.file); } catch (error) { failure = true; }
        item.file = null;
      }
    }
    for (const token of this.owned) {
      try { await fs.unlink(this.path(token)); } catch (error) { failure = true; }
    }
    this.files = []; this.owned = [];
    if (this.acquired) {
      this.acquired = false; syncActivity.release(this.owner, Date.now()); autoSyncScheduler.endOperation(this.owner);
    }
    if (failure) throw new Error('device_collection_failed');
  }
  /** @throws {Error} 原生校验、事务或磁盘错误由任务宿主显示。 */
  private async call(request: CollectionRequest, method: number): Promise<CollectionSummary> {
    if (!this.acquired) throw new Error('device_collection_busy');
    const input = new GenericString(); input.setVal(JSON.stringify(request));
    const rpc = new PeerCollectionRpc(后端会话.获取实例());
    let bytes: Uint8Array;
    try {
      if (method === 0) bytes = await rpc.capture(input.toBytes());
      else if (method === 1) bytes = await rpc.apply(input.toBytes());
      else if (method === 2) bytes = await rpc.receive(input.toBytes());
      else if (method === 3) bytes = await rpc.plan(input.toBytes());
      else if (method === 4) bytes = await rpc.pack(input.toBytes());
      else bytes = await rpc.confirm(input.toBytes());
    } finally {
      // Reopening clears undo; a later media failure may also follow a committed collection write.
      if (method === 0 || method === 1) {
        AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
        AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
        if (method === 1) notifyFsrsStateChanged();
      }
    }
    const result = JSON.parse(new GenericString(bytes).getVal()) as CollectionSummary;
    if (![result.bytes, result.updated_objects, result.added_reviews, result.updated_media, result.deleted_media]
      .every((n: number): boolean => Number.isSafeInteger(n) && n >= 0)) throw new Error('device_collection_invalid');
    return result;
  }
  /** @throws {Error} 有限缓冲读取与 SHA256 失败时不接受文件。 */
  private async hash(token: string): Promise<string> {
    const file = await fs.open(this.path(token), fs.OpenMode.READ_ONLY);
    try {
      const md = cryptoFramework.createMd('SHA256'); const buffer = new ArrayBuffer(64 * 1024);
      let count = await fs.read(file.fd, buffer);
      while (count > 0) { await md.update({ data: new Uint8Array(buffer.slice(0, count)) }); count = await fs.read(file.fd, buffer); }
      return bytesHex((await md.digest()).data);
    } finally { await fs.close(file); }
  }
  /** @throws {Error} 打开或哈希失败时不发送描述符。 */
  private async descriptor(token: string, bytes: number): Promise<ProgressFile> {
    const hash = await this.hash(token);
    this.files.push({ token, file: await fs.open(this.path(token), fs.OpenMode.READ_ONLY) });
    return { token, bytes, hash };
  }
  /** @throws {Error} 原生导出或文件准备失败时不传输。 */
  async capture(): Promise<ProgressFile> {
    const token = await linkRandom(16);
    const result = await this.call({ token, own: this.own }, 0); this.owned.push(token);
    return this.descriptor(token, result.bytes);
  }
  /** @throws {Error} 卡库不兼容或媒体清单无效时停止。 */
  async plan(remote: string, local: string, mode: CollectionMode): Promise<ProgressFile> {
    const out = await linkRandom(16);
    const result = await this.call({ token: remote, own: this.own, local, out, mode }, 3); this.owned.push(out);
    return this.descriptor(out, result.bytes);
  }
  /** @throws {Error} 源文件变化、清单无效或磁盘失败时停止。 */
  async pack(wanted: string, local: string): Promise<ProgressFile> {
    const out = await linkRandom(16);
    const result = await this.call({ token: wanted, own: this.own, local, out }, 4); this.owned.push(out);
    return this.descriptor(out, result.bytes);
  }
  /** @throws {Error} 只有验证完成的本任务文件可进入原生事务。 */
  async apply(remote: string, payload: string, mode: string): Promise<CollectionResult> {
    if (!this.owned.includes(remote) || !this.owned.includes(payload)) throw new Error('device_collection_invalid');
    const result = await this.call({ token: remote, own: this.own, payload, mode }, 1);
    if (result.updated_objects + result.added_reviews + result.updated_media + result.deleted_media > 0 || mode === 'replace') {
      autoSyncScheduler.request();
    }
    return { updatedObjects: result.updated_objects, addedReviews: result.added_reviews,
      updatedMedia: result.updated_media, deletedMedia: result.deleted_media };
  }
  /** @throws {Error} 双端提交后保存媒体基线失败时不得报告任务成功。 */
  async confirm(local: string): Promise<void> {
    if (!this.owned.includes(local)) throw new Error('device_collection_invalid');
    await this.call({ token: local, own: this.own }, 5);
  }

  /** @throws {Error} 文件排他创建或打开失败时停止接收。 */
  async receiveFile(): Promise<string> {
    const token = await linkRandom(16);
    await this.call({ token, own: this.own }, 2); this.owned.push(token);
    this.files.push({ token, file: await fs.open(this.path(token), fs.OpenMode.READ_WRITE) });
    return token;
  }
  /** @throws {Error} 拒绝未归本任务持有或已经关闭的文件。 */
  private opened(token: string): fs.File {
    const item = this.files.find((value: OpenCollectionFile): boolean => value.token === token);
    if (item === undefined || item.file === null) throw new Error('device_collection_invalid');
    return item.file;
  }
  /** @throws {Error} 文件读取失败由传输任务处理。 */
  async read(token: string, length: number): Promise<Uint8Array> {
    const buffer = new ArrayBuffer(length);
    return new Uint8Array(buffer.slice(0, await fs.read(this.opened(token).fd, buffer, { length })));
  }
  /** @throws {Error} 每块处理短写，写入失败不得发送确认。 */
  async write(token: string, bytes: Uint8Array): Promise<void> {
    let offset: number = 0;
    while (offset < bytes.length) {
      const data = bytes.slice(offset).buffer as ArrayBuffer;
      const size = await fs.write(this.opened(token).fd, data, { length: data.byteLength });
      if (size <= 0) throw new Error('device_collection_failed'); offset += size;
    }
  }
  /** @throws {Error} 刷盘、关闭、长度或 SHA256 校验失败时不启动事务。 */
  async verify(token: string, descriptor: ProgressFile): Promise<void> {
    const item = this.files.find((value: OpenCollectionFile): boolean => value.token === token)!;
    const file = this.opened(token); await fs.fsync(file.fd); await fs.close(file); item.file = null;
    if ((await fs.stat(this.path(token))).size !== descriptor.bytes || await this.hash(token) !== descriptor.hash) throw new Error('device_collection_invalid');
  }
}
