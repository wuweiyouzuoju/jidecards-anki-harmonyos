// SPDX-License-Identifier: AGPL-3.0-or-later
import { util } from '@kit.ArkTS';
import { fileIo as fs } from '@kit.CoreFileKit';
import { CoreRpc } from '../../proto/generated/CoreRpc';
import { GenericJson } from '../../proto/generated/CoreMessages';
import { encodeExportCollectionPackageRequest } from '../../proto/messages/ImportExportMessages';
import { CloudCollectionSummary, validCloudSummary } from '../../model/cloud-sync/CloudCollectionSync';
import { 后端会话 } from '../后端会话';
import { 集合服务 } from '../集合服务';
import { 替换集合 } from '../数据迁移服务';
import { notifyFsrsStateChanged } from '../../model/FSRS控制器';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';

interface CountQuery { kind: string; sql: string; args: number[]; first_row_only: boolean; }

/** 调用方持有卡库租约；只查询固定计数，不导出正文到前端。
 * @throws Core 查询失败或计数无效时停止备份。 */
export async function readBackupSummary(): Promise<CloudCollectionSummary> {
  const query: CountQuery = { kind: 'query', args: [], first_row_only: false,
    sql: 'select (select count(*) from cards),(select count(*) from notes),(select count(*) from decks),(select count(*) from revlog)' };
  const input = new GenericJson();
  input.setJson(new util.TextEncoder().encodeInto(JSON.stringify(query)));
  const bytes = await new CoreRpc(后端会话.获取实例()).Ankidroid_run_db_command(input.toBytes());
  const rows = JSON.parse(util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new GenericJson(bytes).getJson())) as number[][];
  if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0]) || rows[0].length !== 4) throw new Error('huawei_cloud_invalid');
  const summary: CloudCollectionSummary = { cards: rows[0][0], notes: rows[0][1], decks: rows[0][2], reviews: rows[0][3] };
  if (!validCloudSummary(summary)) throw new Error('huawei_cloud_invalid');
  return summary;
}

/** 内部云备份使用 Core 原生 COLPKG，始终包含媒体；不经过用户文件导出策略。
 * @throws 导出或重开失败时不得发布完成标记。 */
export async function createAnkiCloudBackup(filesDir: string, path: string): Promise<CloudCollectionSummary> {
  const summary = await readBackupSummary();
  const session = 后端会话.获取实例();
  try {
    await new CoreRpc(session).ImportExport_export_collection_package(
      encodeExportCollectionPackageRequest(path, { includeMedia: true, legacy: false }));
  } finally {
    await session.标记集合已消费();
    await session.确保已打开(filesDir);
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }
  return summary;
}

/** 验收在安全副本提交前执行；计数不符或 Core 打不开时沿原恢复流程回滚。
 * @throws 备份、恢复或验收失败时不得显示成功。 */
export async function restoreAnkiCloudBackup(filesDir: string, path: string,
  expected: CloudCollectionSummary): Promise<CloudCollectionSummary> {
  if (!validCloudSummary(expected)) throw new Error('huawei_cloud_invalid');
  const folder = `${filesDir}/backups`;
  if (!await fs.access(folder)) await fs.mkdir(folder);
  await new 集合服务().createBackup(folder, true);
  let actual: CloudCollectionSummary = expected;
  try {
    await 替换集合(filesDir, path, true, undefined, null, async (): Promise<void> => {
      actual = await readBackupSummary();
      if (actual.cards !== expected.cards || actual.notes !== expected.notes ||
        actual.decks !== expected.decks || actual.reviews !== expected.reviews) throw new Error('huawei_cloud_restore_mismatch');
    });
    autoSyncScheduler.request();
    return actual;
  } finally {
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
    AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
    notifyFsrsStateChanged();
  }
}
