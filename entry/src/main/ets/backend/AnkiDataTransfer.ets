// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileUri } from '@kit.CoreFileKit';
import { DataTransferBackend } from '../model/home/DataTransferSession';
import { 数据迁移意图 } from '../model/DataTransferIntent';
import { 选取数据文件 } from '../utils/文件导入助手';
import { 后端会话 } from './后端会话';
import { 执行牌组导入, 暂存导入文件, 替换集合 } from './数据迁移服务';
import { exportPersonalData } from './DataExportWorkflow';
import { ImportAnkiPackageOptions, ImportSummary, decodeImportResponse,
  decodeImportAnkiPackageOptions } from '../proto/messages/ImportExportMessages';
import { CsvMetadata, decodeCsvMetadata, encodeCsvMetadataRequest, encodeCsvImport } from '../proto/messages/CsvImportMessages';
import { CsvImportPreview, CsvNotetype } from '../model/CsvImport';
import { ImportOperation } from '../model/ImportOperation';
import { ImportFile } from '../model/ImportFile';
import { 复制URI到沙箱, 静默删除 } from './DataTransferFiles';
import { withImportProgress } from './ImportProgressService';
import { 服务号, 导入导出方法 } from './服务索引';
import { 笔记类型服务 } from './笔记类型服务';

export class AnkiDataTransfer implements DataTransferBackend {
  private csvPath: string = '';
  private context(): common.UIAbilityContext {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) throw new Error('Ability context unavailable');
    return context;
  }
  async pickDeck(): Promise<string | null> { return 选取数据文件(this.context(), ['.apkg']); }
  /** @throws Core 偏好读取失败交由迁移会话显示，不能用本机默认值替代。 */
  async importPackagePresets(): Promise<ImportAnkiPackageOptions> {
    const session = 后端会话.获取实例();
    await session.确保已打开(this.context().filesDir);
    return decodeImportAnkiPackageOptions(await session.调用(服务号.后端导入导出,
      导入导出方法.getImportAnkiPackagePresets, new Uint8Array()));
  }
  /** @throws 选择器错误由 DataTransferSession 展示。 */
  async pickImportFile(): Promise<ImportFile | null> {
    const uri = await 选取数据文件(this.context(), ['.apkg,.csv,.tsv,.txt']);
    return uri === null ? null : { uri, name: new fileUri.FileUri(uri).name };
  }
  async pickCollection(): Promise<string | null> { return 选取数据文件(this.context(), ['.colpkg']); }
  async pickText(): Promise<string | null> { return 选取数据文件(this.context(), ['.csv', '.tsv', '.txt']); }
  /** @throws 文件暂存或导入失败由 DataTransferSession 展示。 */
  async importDeck(uri: string, progress: (stage: number) => void,
    options?: ImportAnkiPackageOptions, operation: ImportOperation | null = null): Promise<ImportSummary> {
    const context = this.context();
    await 后端会话.获取实例().确保已打开(context.filesDir);
    const path: string = await 暂存导入文件(context.filesDir, uri, operation);
    progress(1);
    return await 执行牌组导入(path, options, operation);
  }
  /** @throws 集合替换失败由 DataTransferSession 展示。 */
  async replaceCollection(uri: string, progress: (stage: number) => void,
    operation: ImportOperation | null = null): Promise<void> {
    await 替换集合(this.context().filesDir, uri, true, progress, operation);
  }
  /** @throws CSV metadata or file errors are presented by the transfer session. */
  async prepareCsv(uri: string, delimiter: number, notetypeId: number, operation: ImportOperation): Promise<CsvImportPreview> {
    await 后端会话.获取实例().确保已打开(this.context().filesDir);
    if (uri !== '') {
      await this.discardCsv();
      this.csvPath = await 复制URI到沙箱(this.context().filesDir, uri, 'csv', operation);
    }
    operation.check();
    const response = await 后端会话.获取实例().调用(服务号.后端导入导出,
      导入导出方法.获取CSV元数据, encodeCsvMetadataRequest(this.csvPath, delimiter, notetypeId));
    const service = new 笔记类型服务();
    const notetypes: CsvNotetype[] = [];
    for (const item of await service.获取笔记类型名列表()) {
      operation.check();
      const view = await service.获取笔记类型(item.id);
      notetypes.push({ id: item.id, name: item.name, fields: view.fieldNames });
    }
    return { metadata: decodeCsvMetadata(response), notetypes };
  }
  /** @throws Core import errors are presented by the transfer session. */
  async importCsv(metadata: CsvMetadata, operation: ImportOperation): Promise<ImportSummary> {
    try {
      const bytes = await withImportProgress(operation, async (): Promise<Uint8Array> =>
        await 后端会话.获取实例().调用(服务号.后端导入导出, 导入导出方法.导入CSV, encodeCsvImport(this.csvPath, metadata)));
      return decodeImportResponse(bytes);
    } finally { await this.discardCsv(); }
  }
  async discardCsv(): Promise<void> {
    const path: string = this.csvPath; this.csvPath = '';
    if (path !== '') await 静默删除(path);
  }
  /** @throws 导出失败由 DataTransferSession 展示。 */
  async exportData(intent: 数据迁移意图, progress: (stage: number) => void): Promise<boolean> {
    if (intent.kind !== 'exportDeck' && intent.kind !== 'exportPersonalData' && intent.kind !== 'exportText') return false;
    return await exportPersonalData(this.context(), intent, progress) !== null;
  }
  committed(): void { AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); }
}
