// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 数据迁移意图, 数据迁移模式 } from '../DataTransferIntent';

export interface DataTransferBackend {
  pickDeck(): Promise<string | null>;
  pickCollection(): Promise<string | null>;
  importDeck(uri: string, progress: (stage: number) => void): Promise<void>;
  replaceCollection(uri: string, progress: (stage: number) => void): Promise<void>;
  exportData(intent: 数据迁移意图, progress: (stage: number) => void): Promise<boolean>;
  committed(): void;
}
export interface DataTransferState {
  visible: boolean;
  mode: 数据迁移模式;
  deckId: number;
  allowDeckSelection: boolean;
  phase: 'idle' | 'picking' | 'running' | 'refreshing';
  stage: number;
  replacementStep: number;
  error: string;
}
export function initialTransferState(): DataTransferState {
  return { visible: false, mode: 'exportDeck', deckId: 0, allowDeckSelection: false,
    phase: 'idle', stage: -1, replacementStep: 0, error: '' };
}

/** 文件选择、二次确认和已接受操作共用一个拥有者，避免页面各自维护忙碌布尔量。 */
export class DataTransferSession {
  private state: DataTransferState = initialTransferState();
  private backend: DataTransferBackend;
  private publish: (state: DataTransferState) => void;
  private refresh: () => Promise<void>;
  private success: () => void;
  private alive: boolean = true;

  constructor(backend: DataTransferBackend, publish: (state: DataTransferState) => void,
    refresh: () => Promise<void>, success: () => void) {
    this.backend = backend; this.publish = publish; this.refresh = refresh; this.success = success;
  }
  open(mode: 数据迁移模式, deckId: number, allowDeckSelection: boolean): void {
    if (!this.alive || this.state.phase !== 'idle') return;
    this.state.mode = mode; this.state.deckId = deckId; this.state.allowDeckSelection = allowDeckSelection;
    this.state.visible = true; this.state.error = ''; this.state.replacementStep = 0; this.emit();
  }
  close(): void {
    if (this.state.phase !== 'idle') return;
    this.state.visible = false; this.state.replacementStep = 0; this.emit();
  }
  dispose(): void { this.alive = false; }

  async execute(intent: 数据迁移意图): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle') return;
    if (intent.kind === 'replacePersonalData' && this.state.replacementStep === 0) {
      this.state.replacementStep = 1; this.emit(); return;
    }
    if (intent.kind === 'importDeck' || intent.kind === 'replacePersonalData') {
      this.state.phase = 'picking'; this.emit();
      let uri: string | null = null;
      try { uri = intent.kind === 'importDeck' ? await this.backend.pickDeck() : await this.backend.pickCollection(); }
      catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
      this.state.phase = 'idle'; this.emit();
      if (uri === null || !this.alive) return;
      await this.run(intent, uri);
    } else {
      await this.run(intent, '');
    }
  }

  async importUri(uri: string): Promise<void> {
    if (!this.alive || this.state.phase !== 'idle') return;
    this.open('importDeck', 0, false);
    await this.run({ kind: 'importDeck' }, uri);
  }

  private async run(intent: 数据迁移意图, uri: string): Promise<void> {
    this.state.phase = 'running'; this.state.stage = 0; this.state.error = ''; this.emit();
    const progress = (stage: number): void => { this.state.stage = stage; this.emit(); };
    let committed: boolean = false;
    try {
      if (intent.kind === 'importDeck') {
        await this.backend.importDeck(uri, progress); committed = true;
      } else if (intent.kind === 'replacePersonalData') {
        await this.backend.replaceCollection(uri, progress); committed = true;
      } else if (!await this.backend.exportData(intent, progress)) {
        return;
      }
      if (committed) {
        this.backend.committed();
        if (!this.alive) return;
        this.state.phase = 'refreshing'; this.state.stage = intent.kind === 'importDeck' ? 2 : 4; this.emit();
        await this.refresh();
      }
      if (this.alive) { this.state.visible = false; this.state.replacementStep = 0; this.success(); }
    } catch (error) {
      // 写入已经成功时关闭提交入口；刷新由首页重试，避免用户再次导入/替换。
      if (committed) this.state.visible = false;
      this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.state.phase = 'idle'; this.state.stage = -1; this.emit();
    }
  }
  private fail(message: string): void { this.state.error = message; this.emit(); }
  private emit(): void {
    if (!this.alive) return;
    const s = this.state;
    this.publish({ visible: s.visible, mode: s.mode, deckId: s.deckId, allowDeckSelection: s.allowDeckSelection,
      phase: s.phase, stage: s.stage, replacementStep: s.replacementStep, error: s.error });
  }
}
