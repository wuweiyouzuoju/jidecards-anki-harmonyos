// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { cloudSync, fileIo as fs } from '@kit.CoreFileKit';
import { DeviceCollectionStore } from '../device-link/DeviceCollectionStore';
import { DevicePairingStore } from '../device-link/DevicePairingStore';
import { linkRandom } from '../device-link/LanCrypto';
import { ProgressFile } from '../../model/device-link/ProgressSync';
import { CollectionResult } from '../../model/device-link/CollectionSync';
import { CloudGeneration, CloudCollectionPort, parseCloudGeneration, latestCloudGenerations,
  CloudCapture, CloudCollectionSummary, legacyCloudSummary,
  syncCloudCollection, uploadCloudCollection, downloadCloudCollection } from '../../model/cloud-sync/CloudCollectionSync';
import { createAnkiCloudBackup, restoreAnkiCloudBackup } from './AnkiCollectionBackup';

/** 文件云同步只承担传输；原生集合拥有合并、备份与恢复事务。 */
interface CloudMediaRevision { hash: string; }
interface CloudMediaRecord { bytes: number; version: CloudMediaRevision; }
interface CloudMediaIndex { media: Record<string, CloudMediaRecord>; }
interface WantedCloudMedia { files: Record<string, CloudMediaRecord>; }
interface CloudMediaFile { name: string; hash: string; bytes: number; }

const MAX_MEDIA_BYTES: number = 100 * 1024 * 1024;
const CLOUD_HISTORY_GRACE_MS: number = 500;
const CLOUD_INACTIVITY_MS: number = 180000;
export const HUAWEI_CLOUD_PROGRESS_KEY: string = 'huawei_cloud_upload_progress';
export const HUAWEI_CLOUD_UNIT_KEY: string = 'huawei_cloud_progress_unit';
export const HUAWEI_CLOUD_DONE_KEY: string = 'huawei_cloud_completed_files';
export const HUAWEI_CLOUD_TOTAL_KEY: string = 'huawei_cloud_total_files';
export const HUAWEI_CLOUD_STAGE_KEY: string = 'huawei_cloud_stage';

class HuaweiCloudPort implements CloudCollectionPort {
  private store: DeviceCollectionStore;
  private root: string;
  private filesDir: string;
  private device: string;
  private legacyRoot: string;
  private uploadOnly: boolean;
  private reportFiles: (stage: string, done: number, total: number, unit?: string) => void;
  private collectionYielded: boolean = false;
  private backupTokens: string[] = [];
  private downloadedVersion: number = 2;
  private downloadedSummary: CloudCollectionSummary | null = null;
  /** @throws {Error} 云空间沙箱或系统能力不可用时拒绝任务。 */
  constructor(context: common.UIAbilityContext, device: string, uploadOnly: boolean = false,
    reportFiles: (stage: string, done: number, total: number, unit?: string) => void = (): void => {}) {
    this.store = new DeviceCollectionStore(context, device);
    this.filesDir = context.filesDir;
    this.device = device;
    this.uploadOnly = uploadOnly;
    this.reportFiles = reportFiles;
    this.legacyRoot = `${context.cloudFileDir}/jidecards-v1`;
    if (!canIUse('SystemCapability.FileManagement.DistributedFileService.CloudSync.Core') || !context.cloudFileDir) throw new Error('huawei_cloud_unavailable');
    this.root = `${context.cloudFileDir}/jidecards-v2`;
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async acquire(): Promise<void> {
    if (!await fs.access(this.root)) await fs.mkdir(this.root);
    await this.store.acquire();
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async release(): Promise<void> {
    try { await this.store.release(); }
    finally {
      for (const token of this.backupTokens) {
        const path = this.backupPath(token);
        if (await fs.access(path)) await fs.unlink(path);
      }
      this.backupTokens = [];
    }
  }
  private backupPath(token: string): string { return `${this.filesDir}/.cloud-backups/${token}.colpkg`; }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async capture(): Promise<CloudCapture> {
    this.reportFiles('huawei_cloud_preparing', 0, 0);
    if (this.uploadOnly) {
      const folder = `${this.filesDir}/.cloud-backups`;
      if (!await fs.access(folder)) await fs.mkdir(folder);
      const token = await linkRandom(16);
      this.backupTokens.push(token);
      const path = this.backupPath(token);
      const summary = await createAnkiCloudBackup(this.filesDir, path);
      return { token, bytes: (await fs.stat(path)).size, hash: await this.store.hashFile(path), version: 3, summary };
    }
    return this.store.capture();
  }
  /** @throws 缺失、损坏或未同步完成的附件不会进入集合事务。 */
  async apply(snapshot: string, mode: string): Promise<CollectionResult> {
    if (this.downloadedVersion === 3) {
      if (mode !== 'cloud_replace' || this.downloadedSummary === null) throw new Error('huawei_cloud_full_required');
      this.reportFiles('huawei_cloud_applying', 0, 0);
      const restored = await restoreAnkiCloudBackup(this.filesDir, this.store.packetPath(snapshot), this.downloadedSummary);
      hilog.info(0x4342, 'HuaweiCloudSync', 'Restored COLPKG cards=%{public}d notes=%{public}d decks=%{public}d reviews=%{public}d',
        restored.cards, restored.notes, restored.decks, restored.reviews);
      return { updatedObjects: restored.cards + restored.notes + restored.decks, addedReviews: restored.reviews,
        updatedMedia: 0, deletedMedia: 0 };
    }
    const local = await this.store.capture();
    const plan = await this.store.plan(snapshot, local.token, mode === 'cloud_replace' ? 'cloud_replace' : 'merge');
    const wanted = JSON.parse(await fs.readText(this.store.packetPath(plan.token))) as WantedCloudMedia;
    const cache = `${this.filesDir}/.device-collection/blobs`;
    if (!await fs.access(cache)) await fs.mkdir(cache);
    const distinct = new Map<string, CloudMediaFile>();
    for (const media of this.mediaFiles(wanted.files)) distinct.set(media.hash, media);
    const mediaFiles = Array.from(distinct.values());
    let prepared: number = 0;
    this.reportFiles('huawei_cloud_preparing_restore_media', 0, mediaFiles.length);
    for (let offset = 0; offset < mediaFiles.length; offset += 8) {
      let failure: string = '';
      // 小文件并发拉取；全部收尾后才退出，失败时不释放仍有写入的缓存目录。
      await Promise.all(mediaFiles.slice(offset, offset + 8).map(async (media: CloudMediaFile): Promise<void> => {
        try {
          await this.prepareMedia(cache, media);
          this.reportFiles('huawei_cloud_preparing_restore_media', ++prepared, mediaFiles.length);
        } catch (error) { if (failure === '') failure = error instanceof Error ? error.message : 'huawei_cloud_invalid'; }
      }));
      if (failure !== '') throw new Error(failure);
    }
    this.reportFiles('huawei_cloud_applying', 0, 0);
    const empty = await this.store.receiveFile();
    const emptyBytes = new Uint8Array(8);
    await this.store.write(empty, emptyBytes);
    await this.store.verify(empty, { token: empty, bytes: 8,
      hash: 'af5570f5a1810b7af78caf4bc70a660f0df51e42baf91d4de5b2328de0e83dfc' });
    const result = await this.store.apply(snapshot, empty, mode);
    hilog.info(0x4342, 'HuaweiCloudSync',
      'Applied mode=%{public}s objects=%{public}d reviews=%{public}d media=%{public}d deletedMedia=%{public}d',
      mode, result.updatedObjects, result.addedReviews, result.updatedMedia, result.deletedMedia);
    return result;
  }
  /** @throws 缓存或云文件校验失败时，本次卡库恢复保持未开始。 */
  private async prepareMedia(cache: string, media: CloudMediaFile): Promise<void> {
    const target = `${cache}/${media.hash}`;
    if (!await fs.access(target) || (await fs.stat(target)).size !== media.bytes ||
      await this.digest(target, media.bytes) !== media.hash) {
      const source = this.blob(media.hash);
      if ((await fs.stat(source)).size !== media.bytes) throw new Error('huawei_cloud_invalid');
      const temp = `${cache}/${media.hash}.cloud-pending`;
      try {
        await fs.copyFile(source, temp);
        if (await this.digest(temp, media.bytes) !== media.hash) throw new Error('huawei_cloud_invalid');
        await fs.rename(temp, target);
      } finally {
        if (await fs.access(temp)) await fs.unlink(temp);
      }
    }
  }
  /** @throws 平台或集合错误由设置入口显示。 */
  async confirm(token: string): Promise<void> {
    if (this.backupTokens.includes(token)) return;
    if (this.collectionYielded) await this.store.acquire();
    this.reportFiles('huawei_cloud_confirming', 0, 0);
    await this.store.confirm(token);
  }
  private path(value: CloudGeneration, suffix: string): string {
    return `${this.root}/${value.device}_${value.sequence % 2}.${suffix}`;
  }
  private blob(hash: string): string { return `${this.root}/${hash}.blob`; }

  /** @throws 媒体名及内容标识不符合 Core 的文件边界。 */
  private mediaFiles(index: Record<string, CloudMediaRecord>): CloudMediaFile[] {
    const files: CloudMediaFile[] = [];
    for (const name of Object.keys(index)) {
      const item = index[name];
      const hash = item.version.hash;
      if (hash === '') continue;
      if (!/^[a-f0-9]{64}$/.test(hash) || name === '.' || name === '..' || name.includes('/') || name.includes('\\') ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > MAX_MEDIA_BYTES) throw new Error('huawei_cloud_invalid');
      files.push({ name, hash, bytes: item.bytes });
    }
    return files;
  }

  /** @throws 文件大小或读取失败。 */
  private async digest(path: string, bytes: number): Promise<string> {
    if ((await fs.stat(path)).size !== bytes) throw new Error('huawei_cloud_invalid');
    return this.store.hashFile(path);
  }
  /** start 的 Promise 只表示请求已接受，必须等待进度终态。 */
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async refresh(requiredPaths: string[] = [], mediaProgress: boolean = false, stage: string = ''): Promise<void> {
    if (!await fs.access(this.root)) await fs.mkdir(this.root);
    await this.logCloudInventory();
    const sync = new cloudSync.FileSync();
    let timer: number = -1;
    let historyTimer: number = -1;
    let checkTimer: number = -1;
    let started: boolean = false;
    let listening: boolean = false;
    let callback: (value: cloudSync.SyncProgress) => void = (_value: cloudSync.SyncProgress): void => {};
    try {
      await new Promise<void>((resolve, reject): void => {
        let finished: boolean = false;
        const finish = (error: string): void => {
          if (finished) return;
          finished = true;
          if (error !== '') reject(new Error(error)); else resolve();
        };
        const resetDeadline = (): void => {
          if (timer !== -1) clearTimeout(timer);
          timer = setTimeout((): void => finish('huawei_cloud_timeout'), CLOUD_INACTIVITY_MS);
        };
        let observedWork: boolean = false;
        const pending = new Set<string>(requiredPaths);
        let checking: boolean = false;
        const checkFiles = async (): Promise<void> => {
          if (finished || !started || checking) return;
          checking = true;
          const priorSize = pending.size;
          // 只轮询尚未上云的文件，限制并发以免数千个串行查询阻塞进度。
          const paths = Array.from(pending);
          for (let offset = 0; offset < paths.length && !finished; offset += 32) {
            const batchPending = pending.size;
            await Promise.all(paths.slice(offset, offset + 32).map(async (path: string): Promise<void> => {
              try {
                const location = (await fs.stat(path)).location;
                if (location === 2 || location === 3) pending.delete(path);
              } catch (error) { /* 暂不可读的文件继续等待系统结果。 */ }
            }));
            if (!finished && pending.size < batchPending) {
              resetDeadline();
              this.reportFiles(stage || (mediaProgress ? 'huawei_cloud_uploading_media' : 'huawei_cloud_uploading_snapshot'),
                requiredPaths.length - pending.size, requiredPaths.length);
            }
          }
          checking = false;
          if (finished) return;
          if (pending.size < priorSize) {
            hilog.info(0x4342, 'HuaweiCloudSync', 'Transferred %{public}d/%{public}d requested files',
              requiredPaths.length - pending.size, requiredPaths.length);
          }
          if (pending.size === 0) finish('');
          else checkTimer = setTimeout((): void => { checkFiles(); }, 3000);
        };
        const start = (): void => {
          if (started || finished) return;
          started = true;
          if (historyTimer !== -1) clearTimeout(historyTimer);
          try {
            sync.start().then((): void => {
              // 不等待与本备份无关的系统队列，所需文件仍须逐一确认已上云。
              if (pending.size > 0 && !finished) checkFiles();
            }).catch((error: BusinessError): void => finish(`huawei_cloud_start_${error.code}`));
          } catch (error) { finish(`huawei_cloud_start_${(error as BusinessError).code}`); }
        };
        callback = (value: cloudSync.SyncProgress): void => {
          if (finished) return;
          hilog.info(0x4342, 'HuaweiCloudSync', 'Progress state=%{public}d error=%{public}d history=%{public}s',
            value.state, value.error, String(!started));
          // 系统可能推送历史状态，也可能直接等待 start。短暂等待历史事件后仍主动发起。
          if (!started) {
            start();
            return;
          }
          if (value.state === cloudSync.SyncState.UPLOADING || value.state === cloudSync.SyncState.DOWNLOADING) observedWork = true;
          // start 准备新任务时可能先通知旧任务无错误停止，此时云端请求仍在继续。
          if (value.state === cloudSync.SyncState.STOPPED && value.error === cloudSync.ErrorType.NO_ERROR && !observedWork) return;
          if (value.error !== cloudSync.ErrorType.NO_ERROR) finish(`huawei_cloud_system_${value.error}`);
          // 完成通知也可能属于上一任务；有目标文件时只接受本次文件已上云的证据。
          else if (value.state === cloudSync.SyncState.COMPLETED) {
            if (requiredPaths.length === 0) finish('');
            else {
              if (checkTimer !== -1) clearTimeout(checkTimer);
              checkFiles();
            }
          }
          else if (value.state === cloudSync.SyncState.STOPPED || value.state === cloudSync.SyncState.UPLOAD_FAILED ||
            value.state === cloudSync.SyncState.DOWNLOAD_FAILED) finish(`huawei_cloud_state_${value.state}`);
        };
        resetDeadline();
        historyTimer = setTimeout(start, CLOUD_HISTORY_GRACE_MS);
        try {
          sync.on('progress', callback);
          listening = true;
        } catch (error) { finish(`huawei_cloud_start_${(error as BusinessError).code}`); }
      });
    } finally {
      // 用户界面的等待超时不取消系统端传输。下次可继续核对已上云的文件。
      if (timer !== -1) clearTimeout(timer);
      if (historyTimer !== -1) clearTimeout(historyTimer);
      if (checkTimer !== -1) clearTimeout(checkTimer);
      if (listening) {
        try { sync.off('progress', callback); } catch (error) {
          hilog.warn(0x4342, 'HuaweiCloudSync', 'Could not remove progress listener');
        }
      }
    }
  }
  private async logCloudInventory(): Promise<void> {
    try {
      const names = await fs.listFile(this.root);
      const blobs = names.filter((name: string): boolean => name.endsWith('.blob'));
      const snapshots = names.filter((name: string): boolean => name.endsWith('.snapshot.bin') || name.endsWith('.ready.json'));
      const pending = names.filter((name: string): boolean => name.endsWith('.pending'));
      let local: number = 0;
      let remote: number = 0;
      const sample = snapshots.concat(pending, blobs).slice(0, 32);
      for (const name of sample) {
        const location = (await fs.stat(`${this.root}/${name}`)).location;
        if (location === 1) local++;
        if (location === 2 || location === 3) remote++;
      }
      hilog.info(0x4342, 'HuaweiCloudSync',
        'Inventory blobs=%{public}d snapshots=%{public}d pending=%{public}d sampled=%{public}d local=%{public}d remote=%{public}d',
        blobs.length, snapshots.length, pending.length, sample.length, local, remote);
    } catch (error) {
      // 诊断失败不改变系统同步流程。
    }
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async list(): Promise<CloudGeneration[]> {
    if (await fs.access(this.legacyRoot) && (await fs.listFile(this.legacyRoot)).length > 0) {
      throw new Error('huawei_cloud_legacy');
    }
    const names = await fs.listFile(this.root);
    const manifests = names.filter((name: string): boolean => /^[a-f0-9]{32}_[01]\.ready\.json$/.test(name));
    const result: CloudGeneration[] = [];
    for (const name of manifests) {
      const path = `${this.root}/${name}`;
      const stat = await fs.stat(path);
      if (stat.location !== 2 && stat.location !== 3) continue;
      if (stat.size > 4096) throw new Error('huawei_cloud_invalid');
      // 云文件的异步 read 在需要时由文件系统拉取实体；读取失败不会解释为空云库。
      const value = parseCloudGeneration(await fs.readText(path));
      hilog.info(0x4342, 'HuaweiCloudSync', 'Version device=%{public}s sequence=%{public}d bytes=%{public}d',
        value.device, value.sequence, value.snapshot.bytes);
      if (`${value.device}_${value.sequence % 2}.ready.json` !== name) throw new Error('huawei_cloud_invalid');
      // 旧记录没有发布时间，使用文件系统保留的修改时间。
      if (value.uploadedAt === undefined && Number.isFinite(stat.mtime) && stat.mtime > 0) {
        value.uploadedAt = Math.floor(stat.mtime * 1000);
      }
      result.push(value);
    }
    const latest = latestCloudGenerations(result);
    for (const value of latest) {
      if (value.summary === undefined && value.version === 2) {
        value.summary = legacyCloudSummary(await fs.readText(this.path(value, 'snapshot.bin')));
      }
    }
    return latest;
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async download(value: CloudGeneration): Promise<string> {
    this.downloadedVersion = value.version;
    this.downloadedSummary = value.summary ?? null;
    const descriptor = value.snapshot;
    this.reportFiles('huawei_cloud_downloading_snapshot', 0, descriptor.bytes, 'bytes');
    const path = this.path(value, 'snapshot.bin');
    if ((await fs.stat(path)).size !== descriptor.bytes) throw new Error('huawei_cloud_incomplete');
    const token = await this.store.receiveFile();
    const input = await fs.open(path, fs.OpenMode.READ_ONLY);
    try {
      const buffer = new ArrayBuffer(64 * 1024);
      let offset: number = 0;
      let reported: number = 0;
      while (offset < descriptor.bytes) {
        const count = await fs.read(input.fd, buffer, { length: Math.min(buffer.byteLength, descriptor.bytes - offset) });
        if (count < 1) throw new Error('huawei_cloud_incomplete');
        await this.store.write(token, new Uint8Array(buffer.slice(0, count))); offset += count;
        if (offset === descriptor.bytes || offset - reported >= 1024 * 1024) {
          reported = offset;
          this.reportFiles('huawei_cloud_downloading_snapshot', offset, descriptor.bytes, 'bytes');
        }
      }
    } finally { await fs.close(input); }
    await this.store.verify(token, { token, bytes: descriptor.bytes, hash: descriptor.hash });
    return token;
  }
  /** @throws 写入失败或系统未确认上云。 */
  async publish(value: CloudGeneration, snapshot: ProgressFile): Promise<void> {
    if (value.device !== this.device) throw new Error('huawei_cloud_invalid');
    const pending = `${this.root}/${this.device}.ready.pending`;
    const mediaPending = `${this.root}/${this.device}.blob.pending`;
    for (const path of [pending, mediaPending]) {
      if (await fs.access(path)) await fs.unlink(path);
    }
    const snapshotPath = value.version === 3 ? this.backupPath(snapshot.token) : this.store.packetPath(snapshot.token);
    const index: CloudMediaIndex = value.version === 3 ? { media: {} } : JSON.parse(await fs.readText(snapshotPath)) as CloudMediaIndex;
    const missing = new Map<string, CloudMediaFile>();
    const referenced = new Map<string, CloudMediaFile>();
    const mediaPendingPaths: string[] = [];
    for (const media of this.mediaFiles(index.media)) {
      if (!referenced.has(media.hash)) referenced.set(media.hash, media);
    }
    const uniqueMedia = Array.from(referenced.values());
    const cloudNames = new Set<string>(await fs.listFile(this.root));
    this.reportFiles('huawei_cloud_checking_media', 0, uniqueMedia.length);
    // 限制并发文件查询，避免数千次串行往返拖长无变更上传。
    for (let offset = 0; offset < uniqueMedia.length; offset += 32) {
      const batch = uniqueMedia.slice(offset, offset + 32);
      await Promise.all(batch.map(async (media: CloudMediaFile): Promise<void> => {
        const path = this.blob(media.hash);
        if (cloudNames.has(`${media.hash}.blob`)) {
          const stat = await fs.stat(path);
          if (stat.size !== media.bytes) throw new Error('huawei_cloud_invalid');
          if (stat.location !== 2 && stat.location !== 3) mediaPendingPaths.push(path);
        } else {
          missing.set(media.hash, media);
        }
      }));
      this.reportFiles('huawei_cloud_checking_media', Math.min(offset + batch.length, uniqueMedia.length), uniqueMedia.length);
    }

    // 发布内容地址前验证暂存文件。接收方仍独立校验。
    let staged: number = 0;
    if (missing.size > 0) this.reportFiles('huawei_cloud_staging_media', 0, missing.size);
    for (const media of missing.values()) {
      const source = `${this.filesDir}/collection.media/${media.name}`;
      const temp = mediaPending;
      try {
        // 只校验复制后的暂存实体；它已能检测源文件变化，避免重复全文件哈希。
        await fs.copyFile(source, temp);
        if (await this.digest(temp, media.bytes) !== media.hash) throw new Error('huawei_cloud_invalid');
        await fs.rename(temp, this.blob(media.hash));
        mediaPendingPaths.push(this.blob(media.hash));
        this.reportFiles('huawei_cloud_staging_media', ++staged, missing.size);
      } finally {
        if (await fs.access(temp)) await fs.unlink(temp);
      }
    }
    hilog.info(0x4342, 'HuaweiCloudSync', 'Publish media referenced=%{public}d toSync=%{public}d',
      referenced.size, mediaPendingPaths.length);
    if (this.uploadOnly) {
      this.store.yieldCollection();
      this.collectionYielded = true;
    }
    if (mediaPendingPaths.length > 0) {
      this.reportFiles('huawei_cloud_uploading_media', 0, mediaPendingPaths.length);
      await this.refresh(mediaPendingPaths, true);
    }
    this.reportFiles('huawei_cloud_uploading_snapshot', 0, 1);

    const target = this.path(value, 'snapshot.bin');
    const ready = this.path(value, 'ready.json');
    // 另一槽始终保留最后一次已完成的版本。
    if (await fs.access(ready)) await fs.unlink(ready);
    await fs.copyFile(snapshotPath, target);
    if (await this.digest(target, snapshot.bytes) !== snapshot.hash) throw new Error('huawei_cloud_invalid');
    // 先确认实体已上云，再发布完成标记；其他设备不能提前选到尚未上传完的备份。
    await this.refresh([target]);
    this.reportFiles('huawei_cloud_confirming', 0, 1);
    try {
      const output = await fs.open(pending, fs.OpenMode.CREATE | fs.OpenMode.TRUNC | fs.OpenMode.WRITE_ONLY);
      try {
        const text = JSON.stringify(value);
        let offset = 0;
        while (offset < text.length) {
          const count = await fs.write(output.fd, text.slice(offset));
          if (count < 1 || count > text.length - offset) throw new Error('huawei_cloud_incomplete');
          offset += count;
        }
        await fs.fsync(output.fd);
      } finally { await fs.close(output); }
      await fs.rename(pending, ready);
    } finally {
      if (await fs.access(pending)) await fs.unlink(pending);
    }
    await this.refresh([ready], false, 'huawei_cloud_confirming');
    for (const suffix of ['snapshot.bin', 'ready.json']) {
      const location = (await fs.stat(this.path(value, suffix))).location;
      if (location !== 2 && location !== 3) throw new Error('huawei_cloud_incomplete');
    }
  }
}

/** 单一任务拥有者；离开设置页面不会取消已接受的合并或提早释放集合租约。 */
class HuaweiCloudSyncService {
  private running: boolean = false;
  private uploadProgress: number = -1;
  private currentStage: string = 'huawei_cloud_working';
  stage(): string { return this.currentStage; }
  private publishStage(stage: string, done: number, total: number, unit: string = 'files'): void {
    this.currentStage = stage;
    AppStorage.setOrCreate<string>(HUAWEI_CLOUD_UNIT_KEY, unit);
    AppStorage.setOrCreate<number>(HUAWEI_CLOUD_DONE_KEY, done);
    AppStorage.setOrCreate<number>(HUAWEI_CLOUD_TOTAL_KEY, total);
    AppStorage.setOrCreate<string>(HUAWEI_CLOUD_STAGE_KEY, stage);
    this.publishProgress(total > 0 ? Math.floor(100 * done / total) : -1);
  }
  isBusy(): boolean { return this.running; }
  progress(): number { return this.uploadProgress; }
  private publishProgress(percent: number): void {
    if (this.uploadProgress === percent) return;
    this.uploadProgress = percent;
    AppStorage.setOrCreate<number>(HUAWEI_CLOUD_PROGRESS_KEY, percent);
  }

  supports(context: common.UIAbilityContext): boolean {
    return canIUse('SystemCapability.FileManagement.DistributedFileService.CloudSync.Core') && Boolean(context.cloudFileDir);
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async devices(context: common.UIAbilityContext): Promise<CloudGeneration[]> {
    if (this.running) throw new Error('device_collection_busy');
    this.running = true;
    this.publishStage('huawei_cloud_working', 0, 0);
    try {
      const identity = (await new DevicePairingStore(context).read()).identity;
      const port = new HuaweiCloudPort(context, identity.id);
      await port.refresh();
      return latestCloudGenerations(await port.list());
    } finally { this.running = false; }
  }
  /** @throws 平台及快照发布失败沿任务传播。 */
  async upload(context: common.UIAbilityContext): Promise<CollectionResult> {
    if (this.running) throw new Error('device_collection_busy');
    this.running = true;
    this.publishStage('huawei_cloud_working', 0, 0);
    try {
      const identity = (await new DevicePairingStore(context).read()).identity;
      const port = new HuaweiCloudPort(context, identity.id, true, (stage: string, done: number, total: number, unit: string = 'files'): void => {
        this.publishStage(stage, done, total, unit);
      });
      return await uploadCloudCollection(port, identity.id, await linkRandom(16));
    } finally { this.running = false; this.publishProgress(-1); }
  }
  /** @throws 云端版本变化及备份替换失败沿任务传播。 */
  async download(context: common.UIAbilityContext, source: CloudGeneration): Promise<CollectionResult> {
    if (this.running) throw new Error('device_collection_busy');
    this.running = true;
    this.publishStage('huawei_cloud_working', 0, 0);
    try {
      const identity = (await new DevicePairingStore(context).read()).identity;
      return await downloadCloudCollection(new HuaweiCloudPort(context, identity.id, false,
        (stage: string, done: number, total: number, unit: string = 'files'): void => { this.publishStage(stage, done, total, unit); }), source);
    } finally { this.running = false; this.publishProgress(-1); }
  }
  /** @throws {Error} IO、平台及集合错误沿任务传播，由设置入口显示。 */
  async run(context: common.UIAbilityContext, restoreDevice: string = ''): Promise<CollectionResult> {
    if (this.running) throw new Error('device_collection_busy');
    this.running = true;
    this.publishStage('huawei_cloud_working', 0, 0);
    try {
      const identity = (await new DevicePairingStore(context).read()).identity;
      return await syncCloudCollection(new HuaweiCloudPort(context, identity.id), identity.id, await linkRandom(16), restoreDevice);
    } finally { this.running = false; }
  }
}
export const huaweiCloudSync: HuaweiCloudSyncService = new HuaweiCloudSyncService();
