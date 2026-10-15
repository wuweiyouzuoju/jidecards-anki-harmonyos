// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { 后端会话 } from '../后端会话';
import { PeerProgressRpc } from '../../proto/generated/PrivateRpc';
import { GenericString } from '../../proto/generated/CoreMessages';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';
import { syncActivity } from '../../model/SyncSettings';
import { ProgressStore, ProgressFile, ProgressMergeResult, PROGRESS_CHUNK_BYTES } from '../../model/device-link/ProgressSync';
import { bytesHex } from '../../model/device-link/DevicePairing';
import { linkRandom } from './LanCrypto';

interface OpenProgressFile { token: string; file: fs.File | null; }
interface NativeProgressSummary { cards: number; reviews: number; added_reviews: number; updated_cards: number; bytes: number; }

/** 每个任务拥有自己的临时文件；Core 负责导出/原子合并，平台层只管字节与集合租约。 */
export class DeviceProgressStore implements ProgressStore {
  private context: common.UIAbilityContext;
  private owner: Object = new Object();
  private owned: string[] = [];
  private files: OpenProgressFile[] = [];
  private acquired: boolean = false;
  constructor(context: common.UIAbilityContext) { this.context = context; }
  private path(token: string): string {
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('device_progress_invalid');
    return `${this.context.filesDir}/.device-progress/${token}.jsonl`;
  }

  /** @throws {Error} 正在学习、导入、编辑或同步时不接收另一份写入。 */
  async acquire(): Promise<void> {
    if (!autoSyncScheduler.canSync() || syncActivity.isCollectionBusy() || !syncActivity.acquire(this.owner)) {
      throw new Error('device_progress_busy');
    }
    this.acquired = true; autoSyncScheduler.beginOperation(this.owner);
    try {
      await 后端会话.获取实例().确保已打开(this.context.filesDir);
    } catch (error) { await this.release(); throw error instanceof Error ? error : new Error('device_progress_failed'); }
  }

  /** @throws {Error} 临时文件清理失败仍归还租约，任务不得悬挂。 */
  async release(): Promise<void> {
    let failure: Error | null = null;
    for (const item of this.files) {
      if (item.file !== null) {
        try { await fs.close(item.file); } catch (error) { failure = new Error('device_progress_failed'); }
        item.file = null;
      }
    }
    for (const token of this.owned) {
      try { await fs.unlink(this.path(token)); } catch (error) { failure = new Error('device_progress_failed'); }
    }
    this.files = []; this.owned = [];
    if (this.acquired) {
      this.acquired = false; syncActivity.release(this.owner, Date.now()); autoSyncScheduler.endOperation(this.owner);
    }
    if (failure !== null) throw failure;
  }

  /** @throws {Error} RPC 错误必须保留给任务，不返回空集合。 */
  private async call(token: string, method: number): Promise<NativeProgressSummary> {
    if (!this.acquired) throw new Error('device_progress_busy');
    const request = new GenericString(); request.setVal(token);
    const rpc = new PeerProgressRpc(后端会话.获取实例());
    const bytes = method === 1 ? await rpc.merge(request.toBytes()) : method === 2 ? await rpc.receive(request.toBytes()) : await rpc.export(request.toBytes());
    const summary = JSON.parse(new GenericString(bytes).getVal()) as NativeProgressSummary;
    if (!Number.isSafeInteger(summary.added_reviews) || summary.added_reviews < 0 ||
      !Number.isSafeInteger(summary.updated_cards) || summary.updated_cards < 0) throw new Error('device_progress_invalid');
    return summary;
  }

  /** @throws {Error} 流式哈希读取不会把整份历史装入 ArkTS 内存。 */
  private async hash(token: string): Promise<string> {
    const file = await fs.open(this.path(token), fs.OpenMode.READ_ONLY);
    try {
      const md = cryptoFramework.createMd('SHA256');
      const buffer = new ArrayBuffer(PROGRESS_CHUNK_BYTES);
      let count = await fs.read(file.fd, buffer);
      while (count > 0) {
        await md.update({ data: new Uint8Array(buffer.slice(0, count)) });
        count = await fs.read(file.fd, buffer);
      }
      return bytesHex((await md.digest()).data);
    } finally { await fs.close(file); }
  }

  /** @throws {Error} 原生导出、打开或校验失败结束传输。 */
  async exportFile(): Promise<ProgressFile> {
    const token = await linkRandom(16);
    const summary = await this.call(token, 0); this.owned.push(token);
    const hash = await this.hash(token);
    const file = await fs.open(this.path(token), fs.OpenMode.READ_ONLY);
    this.files.push({ token, file });
    return { token, bytes: summary.bytes, hash };
  }

  /** @throws {Error} 文件名仅在本机随机生成，不接受远端路径。 */
  async receiveFile(): Promise<string> {
    const token = await linkRandom(16);
    await this.call(token, 2); this.owned.push(token);
    const file = await fs.open(this.path(token), fs.OpenMode.READ_WRITE);
    this.files.push({ token, file });
    return token;
  }

  private opened(token: string): fs.File {
    const item = this.files.find((value: OpenProgressFile): boolean => value.token === token);
    if (item === undefined || item.file === null) throw new Error('device_progress_invalid');
    return item.file;
  }

  /** @throws {Error} 短读由协议继续处理，空读不会冒充完整文件。 */
  async read(token: string, length: number): Promise<Uint8Array> {
    const buffer = new ArrayBuffer(length);
    const size = await fs.read(this.opened(token).fd, buffer, { length });
    return new Uint8Array(buffer.slice(0, size));
  }

  /** @throws {Error} 处理短写；每帧写完才发送确认。 */
  async write(token: string, bytes: Uint8Array): Promise<void> {
    let offset: number = 0;
    while (offset < bytes.length) {
      const data = bytes.slice(offset).buffer as ArrayBuffer;
      const size = await fs.write(this.opened(token).fd, data, { length: data.byteLength });
      if (size <= 0) throw new Error('device_progress_failed');
      offset += size;
    }
  }

  /** @throws {Error} 只有长度和 SHA256 都符合才交给 Core。 */
  async verify(token: string, descriptor: ProgressFile): Promise<void> {
    const item = this.files.find((value: OpenProgressFile): boolean => value.token === token)!;
    const file = this.opened(token);
    await fs.fsync(file.fd); await fs.close(file); item.file = null;
    if ((await fs.stat(this.path(token))).size !== descriptor.bytes || await this.hash(token) !== descriptor.hash) {
      throw new Error('device_progress_invalid');
    }
  }

  /** @throws {Error} Core 已接受的事务独立于页面存活，完成后刷新统计并请求云端增量。 */
  async merge(token: string): Promise<ProgressMergeResult> {
    if (!this.owned.includes(token)) throw new Error('device_progress_invalid');
    const summary = await this.call(token, 1);
    if (summary.added_reviews > 0 || summary.updated_cards > 0) {
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); autoSyncScheduler.request();
    }
    return { addedReviews: summary.added_reviews, updatedCards: summary.updated_cards };
  }
}
