// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { DataTransferBackend } from '../model/home/DataTransferSession';
import { 数据迁移意图 } from '../model/DataTransferIntent';
import { 选取数据文件 } from '../utils/文件导入助手';
import { 后端会话 } from './后端会话';
import { 执行牌组导入, 暂存导入文件, 替换集合 } from './数据迁移服务';
import { exportPersonalData } from './DataExportWorkflow';

export class AnkiDataTransfer implements DataTransferBackend {
  private context(): common.UIAbilityContext {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) throw new Error('Ability context unavailable');
    return context;
  }
  async pickDeck(): Promise<string | null> { return 选取数据文件(this.context(), ['.apkg']); }
  async pickCollection(): Promise<string | null> { return 选取数据文件(this.context(), ['.colpkg']); }
  /** @throws 文件暂存或导入失败由 DataTransferSession 展示。 */
  async importDeck(uri: string, progress: (stage: number) => void): Promise<void> {
    const context = this.context();
    await 后端会话.获取实例().确保已打开(context.filesDir);
    progress(1);
    const path: string = 暂存导入文件(context.filesDir, uri);
    await 执行牌组导入(path);
  }
  /** @throws 集合替换失败由 DataTransferSession 展示。 */
  async replaceCollection(uri: string, progress: (stage: number) => void): Promise<void> {
    await 替换集合(this.context().filesDir, uri, true, progress);
  }
  /** @throws 导出失败由 DataTransferSession 展示。 */
  async exportData(intent: 数据迁移意图, progress: (stage: number) => void): Promise<boolean> {
    if (intent.kind !== 'exportDeck' && intent.kind !== 'exportPersonalData') return false;
    return await exportPersonalData(this.context(), intent, progress) !== null;
  }
  committed(): void { AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); }
}
