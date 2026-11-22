// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProgressFile } from '../device-link/ProgressSync';
import type { CollectionResult } from '../device-link/CollectionSync';

export interface CloudObject { bytes: number; hash: string; }
export interface CloudCollectionSummary { cards: number; notes: number; decks: number; reviews: number; }
export interface CloudCapture extends ProgressFile { version?: number; summary?: CloudCollectionSummary; }
export interface CloudGeneration {
  version: number;
  device: string;
  generation: string;
  sequence: number;
  snapshot: CloudObject;
  uploadedAt?: number;
  summary?: CloudCollectionSummary;
}
export interface CloudCollectionPort {
  acquire(): Promise<void>;
  release(): Promise<void>;
  refresh(): Promise<void>;
  list(): Promise<CloudGeneration[]>;
  download(generation: CloudGeneration): Promise<string>;
  apply(snapshot: string, mode: string): Promise<CollectionResult>;
  capture(): Promise<CloudCapture>;
  publish(generation: CloudGeneration, snapshot: ProgressFile): Promise<void>;
  confirm(snapshot: string): Promise<void>;
}

export function validCloudId(id: string): boolean { return /^[a-f0-9]{32}$/.test(id); }
function validObject(value: CloudObject, limit: number): boolean {
  return value !== null && typeof value === 'object' && Number.isSafeInteger(value.bytes) && value.bytes > 0 &&
    value.bytes <= limit && typeof value.hash === 'string' && /^[a-f0-9]{64}$/.test(value.hash);
}
export function validCloudSummary(value: CloudCollectionSummary): boolean {
  return value !== null && typeof value === 'object' &&
    [value.cards, value.notes, value.decks, value.reviews].every((n: number): boolean => Number.isSafeInteger(n) && n >= 0);
}
interface SnapshotObject { value: Object | null; }
interface LegacySnapshot { version: number; objects: Record<string, SnapshotObject>; }
/** 旧快照的删除标记不计入可恢复数量。 */
export function legacyCloudSummary(text: string): CloudCollectionSummary {
  const snapshot = JSON.parse(text) as LegacySnapshot;
  if (snapshot.version !== 2 || snapshot.objects === null || typeof snapshot.objects !== 'object' || Array.isArray(snapshot.objects)) {
    throw new Error('huawei_cloud_invalid');
  }
  const result: CloudCollectionSummary = { cards: 0, notes: 0, decks: 0, reviews: 0 };
  for (const name of Object.keys(snapshot.objects)) {
    if (snapshot.objects[name].value === null) continue;
    if (name.startsWith('cards:')) result.cards++;
    else if (name.startsWith('notes:')) result.notes++;
    else if (name.startsWith('decks:')) result.decks++;
    else if (name.startsWith('revlog:')) result.reviews++;
  }
  return result;
}
/** @throws 拒绝不兼容、损坏及超限的云端描述符。 */
export function parseCloudGeneration(text: string): CloudGeneration {
  if (text.length > 4096) throw new Error('huawei_cloud_invalid');
  const value = JSON.parse(text) as CloudGeneration;
  if (value === null || (value.version !== 2 && value.version !== 3) || typeof value.device !== 'string' || !validCloudId(value.device) ||
    typeof value.generation !== 'string' || !validCloudId(value.generation) ||
    !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
    !validObject(value.snapshot, value.version === 3 ? 4 * 1024 * 1024 * 1024 : 64 * 1024 * 1024) ||
    (value.version === 3 && !validCloudSummary(value.summary as CloudCollectionSummary)) ||
    (value.summary !== undefined && !validCloudSummary(value.summary)) ||
    (value.uploadedAt !== undefined && (!Number.isSafeInteger(value.uploadedAt) || value.uploadedAt <= 0 ||
      value.uploadedAt > 8640000000000000))) {
    throw new Error('huawei_cloud_invalid');
  }
  return value;
}
/** 每台设备独立发布不可变版本，不用一个共享 head 文件互相覆盖。
 * @throws {Error} 同一序号出现不同版本或描述符无效时停止。 */
export function latestCloudGenerations(values: CloudGeneration[]): CloudGeneration[] {
  const latest = new Map<string, CloudGeneration>();
  for (const raw of values) {
    const value = parseCloudGeneration(JSON.stringify(raw));
    const old = latest.get(value.device);
    if (old !== undefined && old.sequence === value.sequence && old.generation !== value.generation) {
      throw new Error('huawei_cloud_invalid');
    }
    if (old === undefined || old.sequence < value.sequence) latest.set(value.device, value);
  }
  // 使用原始时间排序；新版本在前，无时间的旧记录放在末尾，同时间按设备标识保持稳定。
  return Array.from(latest.values()).sort((a: CloudGeneration, b: CloudGeneration): number =>
    (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0) ||
    a.device.localeCompare(b.device));
}
/** 只有系统确认发布完成后才推进媒体删除基线；下载完整并校验后才进入 Core 事务。
 * restoreDevice 仅由明确的本机恢复确认传入，正常同步从不自动覆盖卡库。
 * @throws 下载、合并或上云失败时如实失败，已提交的本机事务不回滚。 */
export async function syncCloudCollection(port: CloudCollectionPort, device: string, generation: string,
  restoreDevice: string = ''): Promise<CollectionResult> {
  if (!validCloudId(device) || !validCloudId(generation) ||
    (restoreDevice !== '' && (!validCloudId(restoreDevice) || restoreDevice === device))) throw new Error('huawei_cloud_invalid');
  await port.acquire();
  try {
    await port.refresh();
    const latest = latestCloudGenerations(await port.list());
    const result: CollectionResult = { updatedObjects: 0, addedReviews: 0, updatedMedia: 0, deletedMedia: 0 };
    const peers = latest.filter((item: CloudGeneration): boolean => item.device !== device &&
      (restoreDevice === '' || item.device === restoreDevice));
    if (restoreDevice !== '' && peers.length !== 1) throw new Error('huawei_cloud_missing');
    for (const peer of peers) {
      const snapshot = await port.download(peer);
      const applied = await port.apply(snapshot, restoreDevice === '' ? 'cloud' : 'cloud_replace');
      result.updatedObjects += applied.updatedObjects; result.addedReviews += applied.addedReviews;
      result.updatedMedia += applied.updatedMedia; result.deletedMedia += applied.deletedMedia;
    }
    const snapshot = await port.capture();
    const own = latest.find((item: CloudGeneration): boolean => item.device === device);
    const sequence = (own?.sequence ?? 0) + 1;
    if (own?.snapshot.hash !== snapshot.hash) {
      const next: CloudGeneration = { version: snapshot.version ?? 2, device, generation, sequence,
        snapshot: { bytes: snapshot.bytes, hash: snapshot.hash }, uploadedAt: Date.now(), summary: snapshot.summary };
      parseCloudGeneration(JSON.stringify(next));
      await port.publish(next, snapshot);
    }
    await port.confirm(snapshot.token);
    return result;
  } finally { await port.release(); }
}

/** 首页与设置共用系统失败原因，反馈保持一致。 */
export function cloudSyncFailureKey(message: string): string {
  if (message.includes('device_collection_full_required') || message === 'huawei_cloud_full_required') return 'huawei_cloud_full_required';
  if (message.includes('huawei_cloud_legacy')) return 'huawei_cloud_legacy';
  if (message === 'huawei_cloud_start_22400001') return 'huawei_cloud_enable_required';
  if (message === 'huawei_cloud_start_22400003' || message === 'huawei_cloud_system_3' ||
    message === 'huawei_cloud_system_4') return 'huawei_cloud_low_battery';
  if (message === 'huawei_cloud_timeout') return 'huawei_cloud_timeout';
  if (message === 'huawei_cloud_incomplete') return 'huawei_cloud_incomplete';
  return 'huawei_cloud_failed';
}

/** 单向上传保留本机卡库，只发布当前设备版本。
 * @throws 平台、快照及发布失败由界面显示。 */
export async function uploadCloudCollection(port: CloudCollectionPort, device: string,
  generation: string): Promise<CollectionResult> {
  if (!validCloudId(device) || !validCloudId(generation)) throw new Error('huawei_cloud_invalid');
  await port.acquire();
  try {
    const latest = latestCloudGenerations(await port.list());
    const snapshot = await port.capture();
    const own = latest.find((item: CloudGeneration): boolean => item.device === device);
    if (own?.snapshot.hash !== snapshot.hash) {
      const next: CloudGeneration = { version: snapshot.version ?? 2, device, generation, sequence: (own?.sequence ?? 0) + 1,
        snapshot: { bytes: snapshot.bytes, hash: snapshot.hash }, uploadedAt: Date.now(), summary: snapshot.summary };
      parseCloudGeneration(JSON.stringify(next));
      await port.publish(next, snapshot);
    }
    await port.confirm(snapshot.token);
    return { updatedObjects: 0, addedReviews: 0, updatedMedia: 0, deletedMedia: 0 };
  } finally { await port.release(); }
}

/** 显式下载选定版本，通过 Core 备份事务替换本机，包含本设备之前上传的版本。
 * @throws 选定版本变化、下载校验或备份替换失败由界面显示。 */
export async function downloadCloudCollection(port: CloudCollectionPort, source: CloudGeneration): Promise<CollectionResult> {
  parseCloudGeneration(JSON.stringify(source));
  await port.acquire();
  try {
    await port.refresh();
    const current = (await port.list()).find((item: CloudGeneration): boolean =>
      item.device === source.device && item.generation === source.generation && item.sequence === source.sequence);
    if (!current) throw new Error('huawei_cloud_missing');
    const snapshot = await port.download(current);
    return await port.apply(snapshot, 'cloud_replace');
  } finally { await port.release(); }
}
