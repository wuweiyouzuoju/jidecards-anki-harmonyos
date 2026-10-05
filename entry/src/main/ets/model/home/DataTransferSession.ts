// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 数据迁移意图, 数据迁移模式 } from '../DataTransferIntent';
import type { ImportSummary, ImportAnkiPackageOptions } from '../../proto/messages/ImportExportMessages';
import { copyImportAnkiPackageOptions } from '../../proto/messages/ImportExportMessages';
import type { CsvMetadata } from '../../proto/messages/CsvImportMessages';
import { validateCsvMapping } from '../CsvImport';
import type { CsvImportPreview } from '../CsvImport';
import { ImportOperation, ImportCancelled } from '../ImportOperation';
import type { ImportProgress } from '../ImportOperation';
import { importFileKind, importFileName } from '../ImportFile';
import type { ImportFile } from '../ImportFile';

export interface DataTransferBackend {
  importPackagePresets(): Promise<ImportAnkiPackageOptions>;
  pickImportFile(): Promise<ImportFile | null>;
  pickDeck(): Promise<string | null>;
  pickCollection(): Promise<string | null>;
  importDeck(uri: string, progress: (stage: number) => void, options?: ImportAnkiPackageOptions,
    operation?: ImportOperation): Promise<ImportSummary | null>;
  replaceCollection(uri: string, progress: (stage: number) => void, operation?: ImportOperation): Promise<void>;
  pickText(): Promise<string | null>;
  prepareCsv(uri: string, delimiter: number, notetypeId: number, operation: ImportOperation): Promise<CsvImportPreview>;
  importCsv(metadata: CsvMetadata, operation: ImportOperation): Promise<ImportSummary>;
  discardCsv(): Promise<void>;
  exportData(intent: 数据迁移意图, progress: (stage: number) => void): Promise<boolean>;
  committed(): void;
}
export interface DataTransferState {
  visible: boolean;
  mode: 数据迁移模式;
  deckId: number;
  allowDeckSelection: boolean;
  phase: 'idle' | 'picking' | 'loadingOptions' | 'running' | 'refreshing';
  stage: number;
  replacementStep: number;
  error: string;
  result: ImportSummary | null;
  csv: CsvImportPreview | null;
  progress: ImportProgress;
  cancelRequested: boolean;
  cancelled: boolean;
  externalInput: boolean;
  fileName: string;
  importOptions: ImportAnkiPackageOptions | null;
}
export function initialTransferState(): DataTransferState {
  return { visible: false, mode: 'exportDeck', deckId: 0, allowDeckSelection: false,
    phase: 'idle', stage: -1, replacementStep: 0, error: '', result: null, csv: null,
    progress: { text: '', processed: 0, total: 0, cancellable: false }, cancelRequested: false, cancelled: false,
    externalInput: false, fileName: '', importOptions: null };
}

/** 文件选择、二次确认和已接受操作共用一个拥有者，避免页面各自维护忙碌布尔量。 */
export class DataTransferSession {
  private state: DataTransferState = initialTransferState();
  private backend: DataTransferBackend;
  private publish: (state: DataTransferState) => void;
  private refresh: () => Promise<void>;
  private success: () => void;
  private alive: boolean = true;
  private operation: ImportOperation | null = null;
  private externalUri: string = '';
  private selectedUri: string = '';
  private finishExternal: (() => void) | null = null;

  constructor(backend: DataTransferBackend, publish: (state: DataTransferState) => void,
    refresh: () => Promise<void>, success: () => void) {
    this.backend = backend; this.publish = publish; this.refresh = refresh; this.success = success;
  }
  async open(mode: 数据迁移模式, deckId: number, allowDeckSelection: boolean, loadPresets: boolean = true): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle' || this.finishExternal !== null) return;
    this.selectedUri = ''; this.state.fileName = '';
    this.state.mode = mode; this.state.deckId = deckId; this.state.allowDeckSelection = allowDeckSelection;
    this.state.result = null; this.state.cancelled = false;
    this.state.importOptions = null;
    this.state.visible = true; this.state.error = ''; this.state.replacementStep = 0; this.emit();
    if (mode === 'importDeck' && loadPresets) {
      this.state.phase = 'loadingOptions'; this.emit();
      try { await this.readImportOptions(); }
      catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
      finally { this.state.phase = 'idle'; this.emit(); }
    }
  }

  private async readImportOptions(): Promise<void> {
    const options = await this.backend.importPackagePresets();
    if (this.alive) this.state.importOptions = copyImportAnkiPackageOptions(options);
  }

  /** 先选文件再展示该格式的配置；选择阶段即占用会话，迟到结果不能启动导入。 */
  async startImport(): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle' || this.finishExternal !== null) return;
    if (this.state.csv !== null) { this.state.csv = null; void this.backend.discardCsv(); }
    this.selectedUri = ''; this.state.fileName = '';
    this.open('importFile', 0, false);
    this.state.phase = 'picking'; this.state.progress.cancellable = false; this.emit();
    try {
      const file = await this.backend.pickImportFile();
      if (!this.alive) return;
      if (file === null) { this.state.visible = false; return; }
      const kind = importFileKind(file.name);
      if (kind === 'unsupported') { this.fail('transfer_file_unsupported'); return; }
      this.state.fileName = file.name; this.state.mode = kind;
      if (kind === 'importDeck') {
        this.state.phase = 'loadingOptions'; this.emit();
        await this.readImportOptions();
        if (this.alive) this.selectedUri = file.uri;
      }
      else await this.prepareCsv(file.uri);
    } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
    finally { this.state.phase = 'idle'; this.emit(); }
  }
  close(): void {
    if (this.state.phase !== 'idle') return;
    if (this.state.csv !== null) {
      this.state.csv = null;
      // The adapter owns staged input; closing an uncommitted preview only removes that input.
      void this.backend.discardCsv();
    }
    this.releaseExternal();
    this.selectedUri = ''; this.state.fileName = '';
    this.state.visible = false; this.state.replacementStep = 0; this.emit();
  }
  dispose(): void {
    this.alive = false;
    if (this.state.phase === 'idle' && this.state.csv !== null) void this.backend.discardCsv();
    if (this.state.phase === 'idle' || this.state.phase === 'picking' || this.state.phase === 'loadingOptions') this.releaseExternal();
  }

  private releaseExternal(): void {
    this.externalUri = ''; this.state.externalInput = false;
    const finish = this.finishExternal; this.finishExternal = null; finish?.(); this.emit();
  }

  cancel(): void {
    if (this.operation === null || !this.state.progress.cancellable) return;
    this.state.cancelRequested = true; this.operation.cancel(); this.emit();
  }

  private beginOperation(): ImportOperation {
    this.state.cancelRequested = false; this.state.cancelled = false;
    const operation = new ImportOperation((progress: ImportProgress): void => {
      if (this.operation !== operation) return;
      this.state.progress = progress; this.emit();
    });
    this.operation = operation;
    operation.progress('');
    return operation;
  }

  async reparseCsv(delimiter: number, notetypeId: number): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle' || this.state.csv === null) return;
    await this.prepareCsv('', delimiter, notetypeId);
  }

  private async prepareCsv(uri: string, delimiter: number = -1, notetypeId: number = 0): Promise<void> {
    this.state.phase = 'running'; this.state.stage = 0; this.state.error = '';
    this.state.result = null;
    const operation = this.beginOperation();
    try {
      const preview = await this.backend.prepareCsv(uri, delimiter, notetypeId, operation);
      operation.check();
      if (!this.alive) { await this.backend.discardCsv(); return; }
      this.state.csv = preview;
    } catch (error) {
      await this.backend.discardCsv(); this.state.csv = null;
      if (error instanceof ImportCancelled) this.state.cancelled = true;
      else this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.operation = null; this.state.progress.cancellable = false;
      this.state.phase = 'idle'; this.state.stage = -1; this.emit();
    }
  }

  async execute(intent: 数据迁移意图): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle') return;
    if (this.state.result !== null) return;
    if (intent.kind === 'importDeck' && this.state.importOptions === null) return;
    if (intent.kind === 'chooseImportFile') { await this.startImport(); return; }
    if (this.externalUri !== '') {
      if (intent.kind === 'importDeck') {
        try { await this.run(intent, this.externalUri); } finally { this.releaseExternal(); }
      }
      return;
    }
    if (intent.kind === 'importText' && intent.metadata !== undefined) {
      if (this.state.csv === null || !validateCsvMapping(intent.metadata)) { this.fail('transfer_csv_mapping_invalid'); return; }
      await this.run(intent, ''); return;
    }
    if (intent.kind === 'importDeck' && this.selectedUri !== '') {
      await this.run(intent, this.selectedUri); return;
    }
    if (intent.kind === 'replacePersonalData' && this.state.replacementStep === 0) {
      this.state.replacementStep = 1; this.emit(); return;
    }
    if (intent.kind === 'importDeck' || intent.kind === 'replacePersonalData' || intent.kind === 'importText') {
      this.state.phase = 'picking'; this.emit();
      let uri: string | null = null;
      try { uri = intent.kind === 'importDeck' ? await this.backend.pickDeck() :
        intent.kind === 'importText' ? await this.backend.pickText() : await this.backend.pickCollection(); }
      catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
      this.state.phase = 'idle'; this.emit();
      if (uri === null || !this.alive) return;
      if (intent.kind === 'importText') { this.state.mode = 'importText'; await this.prepareCsv(uri); return; }
      await this.run(intent, uri);
    } else {
      await this.run(intent, '');
    }
  }

  async importUri(uri: string, confirmOptions: boolean = false): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle' || this.finishExternal !== null) return;
    const ready = this.open('importDeck', 0, false, confirmOptions);
    if (confirmOptions) {
      this.externalUri = uri; this.state.externalInput = true; this.state.fileName = importFileName(uri);
      const completion = new Promise<void>((resolve: () => void): void => { this.finishExternal = resolve; });
      this.emit();
      await ready;
      await completion;
      return;
    }
    await this.run({ kind: 'importDeck' }, uri);
  }

  private async run(intent: 数据迁移意图, uri: string): Promise<void> {
    this.state.phase = 'running'; this.state.stage = 0; this.state.error = ''; this.emit();
    const progress = (stage: number): void => {
      this.state.stage = stage; this.state.progress = { text: '', processed: 0, total: 0, cancellable: false }; this.emit();
    };
    const operation = this.beginOperation();
    if (intent.kind === 'exportDeck' || intent.kind === 'exportPersonalData' || intent.kind === 'exportText') operation.progress('', 0, 0, false);
    let committed: boolean = false;
    try {
      if (intent.kind === 'importDeck') {
        this.state.result = await this.backend.importDeck(uri, progress,
          intent.options ?? this.state.importOptions ?? undefined, operation); committed = true;
      } else if (intent.kind === 'importText' && intent.metadata !== undefined) {
        this.state.stage = 1;
        this.state.result = await this.backend.importCsv(intent.metadata, operation); committed = true;
        this.state.csv = null;
      } else if (intent.kind === 'replacePersonalData') {
        await this.backend.replaceCollection(uri, progress, operation); committed = true;
      } else if (!await this.backend.exportData(intent, progress)) {
        return;
      }
      if (committed) {
        this.backend.committed();
        if (!this.alive) return;
        this.state.progress.cancellable = false;
        this.state.phase = 'refreshing'; this.state.stage = intent.kind === 'replacePersonalData' ? 4 : 2; this.emit();
        await this.refresh();
      }
      if (this.alive) { this.state.visible = this.state.result !== null; this.state.replacementStep = 0; this.success(); }
    } catch (error) {
      // 写入已经成功时关闭提交入口；刷新由首页重试，避免用户再次导入/替换。
      if (committed) this.state.visible = false;
      if (intent.kind === 'importText') this.state.csv = null;
      if (error instanceof ImportCancelled) this.state.cancelled = true;
      else this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.operation = null; this.state.progress.cancellable = false;
      this.state.phase = 'idle'; this.state.stage = -1; this.emit();
    }
  }
  private fail(message: string): void { this.state.error = message; this.emit(); }
  private emit(): void {
    if (!this.alive) return;
    const s = this.state;
    this.publish({ visible: s.visible, mode: s.mode, deckId: s.deckId, allowDeckSelection: s.allowDeckSelection,
      phase: s.phase, stage: s.stage, replacementStep: s.replacementStep, error: s.error,
      result: s.result, csv: s.csv, progress: s.progress, cancelRequested: s.cancelRequested, cancelled: s.cancelled,
      externalInput: s.externalInput, fileName: s.fileName, importOptions: s.importOptions });
  }
}
