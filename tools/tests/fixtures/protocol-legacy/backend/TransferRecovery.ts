// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs, statfs } from '@kit.CoreFileKit';
import { 复制目录, 删除目录, 确保目录存在, 复制文件, 路径存在 } from './DataTransferFiles';
import { ImportOperation } from '../model/ImportOperation';

const RECOVERY_DIR: string = 'transfer-recovery';
const COLLECTION_FILES: string[] = ['collection.anki2', 'collection.mdb'];
const recovering: Map<string, Promise<void>> = new Map<string, Promise<void>>();

/** @throws IO failures stop the space check before the collection is closed. */
async function sizeOf(path: string): Promise<number> {
  if (!await 路径存在(path)) return 0;
  const stat = await fs.stat(path);
  if (!stat.isDirectory()) return stat.size;
  let size: number = 0;
  for (const name of await fs.listFile(path)) size += await sizeOf(`${path}/${name}`);
  return size;
}

/** Minimum working-space check; archive expansion can still exceed this estimate.
 * @throws IO or capacity failure stops replacement before closing the collection.
 */
export async function checkReplacementSpace(root: string, packagePath: string): Promise<void> {
  let required: number = 64 * 1024 * 1024 + (await fs.stat(packagePath)).size * 2;
  for (const file of COLLECTION_FILES) required += await sizeOf(`${root}/${file}`);
  required += await sizeOf(`${root}/collection.media`);
  if (await statfs.getFreeSize(root) < required) throw new Error('transfer_space_insufficient');
}

/** All paths are private constants. Markers are only created after their preceding IO completes.
 * @throws Backup failure leaves the current collection intact and prevents import.
 */
export async function prepareReplacementRecovery(root: string, operation: ImportOperation | null): Promise<void> {
  const backup: string = `${root}/${RECOVERY_DIR}`;
  if (await 路径存在(backup)) throw new Error('transfer_recovery_pending');
  await 确保目录存在(backup);
  try {
    for (const file of COLLECTION_FILES) {
      operation?.check();
      if (await 路径存在(`${root}/${file}`)) await 复制文件(`${root}/${file}`, `${backup}/${file}`);
    }
    operation?.check();
    await 复制目录(`${root}/collection.media`, `${backup}/collection.media`);
    operation?.check();
    await fs.mkdir(`${backup}/prepared`);
  } catch (error) {
    await 删除目录(backup);
    throw error;
  }
}

/** @throws Marker failure makes the caller close the collection and restore the retained backup. */
export async function markReplacementCommitted(root: string): Promise<void> {
  await fs.mkdir(`${root}/${RECOVERY_DIR}/committed`);
}

/** Called before opening a collection after process restart, or with the collection closed on failure.
 * Recovery is repeatable: its source is retained until every restore step has succeeded.
 * @throws Restore failures retain the prepared backup and prevent opening inconsistent data.
 */
export async function recoverInterruptedReplacement(root: string): Promise<void> {
  const pending = recovering.get(root);
  if (pending !== undefined) return await pending;
  const work = restoreReplacement(root);
  recovering.set(root, work);
  try { await work; } finally { recovering.delete(root); }
}

/** @throws Failed restores retain the prepared copy for the next startup. */
async function restoreReplacement(root: string): Promise<void> {
  const backup: string = `${root}/${RECOVERY_DIR}`;
  if (!await 路径存在(backup)) { await cleanupReplacementRecovery(root); return; }
  if (await 路径存在(`${backup}/prepared`) && !await 路径存在(`${backup}/committed`)) {
    if (!await 路径存在(`${backup}/collection.anki2`)) throw new Error('transfer_recovery_incomplete');
    for (const file of COLLECTION_FILES) {
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        const target: string = `${root}/${file}${suffix}`;
        if (await 路径存在(target)) await fs.unlink(target);
      }
      if (await 路径存在(`${backup}/${file}`)) await 复制文件(`${backup}/${file}`, `${root}/${file}`);
    }
    await 删除目录(`${root}/collection.media`);
    await 复制目录(`${backup}/collection.media`, `${root}/collection.media`);
    // A completed rollback is also committed: interrupted cleanup must not replay a partial backup.
    await fs.mkdir(`${backup}/committed`);
  }
  await cleanupReplacementRecovery(root);
}

export async function cleanupReplacementRecovery(root: string): Promise<void> {
  const backup: string = `${root}/${RECOVERY_DIR}`;
  // Rename first so a partially deleted backup can never become a recovery source again.
  const discarded: string = `${root}/transfer-recovery-discarded`;
  try {
    await 删除目录(discarded);
    if (await 路径存在(backup)) await fs.rename(backup, discarded);
    await 删除目录(discarded);
  } catch (_error) { /* Cleanup is retried on the next collection open; committed data remains authoritative. */ }
}
