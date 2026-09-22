// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { BackupBackend, isBackupName } from '../model/BackupCoordinator';
import { 集合服务 } from './集合服务';
import { 后端会话 } from './后端会话';
import { 替换集合 } from './数据迁移服务';
import { syncActivity } from '../model/SyncSettings';

export async function loadAutomaticBackup(context: common.UIAbilityContext): Promise<boolean> {
  const store: preferences.Preferences = await preferences.getPreferences(context, 'jidecards_settings');
  return (await store.get('automatic_backups', true)) !== false;
}

export async function saveAutomaticBackup(context: common.UIAbilityContext, enabled: boolean): Promise<void> {
  const store: preferences.Preferences = await preferences.getPreferences(context, 'jidecards_settings');
  await store.put('automatic_backups', enabled);
  await store.flush();
}

export class LocalBackups implements BackupBackend {
  private filesDir: string;
  constructor(filesDir: string) { this.filesDir = filesDir; }
  private folder(): string {
    const folder: string = this.filesDir + '/backups';
    if (!fs.accessSync(folder)) fs.mkdirSync(folder);
    return folder;
  }
  async create(force: boolean): Promise<boolean> {
    await syncActivity.waitForCollection();
    await 后端会话.获取实例().确保已打开(this.filesDir);
    return new 集合服务().createBackup(this.folder(), force);
  }
  async list(): Promise<string[]> {
    return fs.listFileSync(this.folder()).filter((name: string): boolean =>
      isBackupName(name) && fs.statSync(this.folder() + '/' + name).isFile()).sort().reverse();
  }
  async restore(name: string): Promise<void> {
    if (!isBackupName(name)) throw new Error('Invalid backup file');
    await syncActivity.waitForCollection();
    const source: string = this.folder() + '/' + name;
    // 创建恢复前备份可能触发清理，先固定已选择的文件，避免其在清理中消失。
    const staged: string = this.filesDir + '/backup-restore-' + Date.now() + '.colpkg';
    fs.copyFileSync(source, staged);
    try {
      await this.create(true);
      await 替换集合(this.filesDir, staged, true);
      AppStorage.setOrCreate<number>('cardContentChangedTick',
        (AppStorage.get<number>('cardContentChangedTick') ?? 0) + 1);
    } finally {
      try { fs.unlinkSync(staged); } catch (error) { /* 残留副本不改变恢复结果。 */ }
    }
  }
}
