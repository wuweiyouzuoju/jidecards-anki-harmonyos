// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigsForUpdateView, UpdateDeckConfigsInput } from '../../proto/messages/DeckConfigMessages';
import { buildDeckConfigRequest, copyDeckConfig } from '../DeckConfigSave';
import type { DeckConfigRequestOptions } from '../DeckConfigSave';

export interface DeckOptionsBackend {
  load(deckId: number): Promise<DeckConfigsForUpdateView>;
  save(request: UpdateDeckConfigsInput): Promise<void>;
  committed(): void;
}

export interface DeckOptionsSnapshot {
  phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error';
  view: DeckConfigsForUpdateView | null;
  config: DeckConfig | null;
  error: string;
}

/** 一个弹层实例拥有一次编辑会话。已接受写入继续，销毁后不再通知 UI。 */
export class DeckOptionsSession {
  private backend: DeckOptionsBackend;
  private publish: (state: DeckOptionsSnapshot) => void;
  private deckId: number;
  private version: number = 0;
  private alive: boolean = true;
  private saving: boolean = false;
  private completed: boolean = false;
  private view: DeckConfigsForUpdateView | null = null;
  private original: DeckConfig | null = null;

  constructor(deckId: number, backend: DeckOptionsBackend, publish: (state: DeckOptionsSnapshot) => void) {
    this.deckId = deckId;
    this.backend = backend;
    this.publish = publish;
  }

  async load(): Promise<void> {
    if (!this.alive || this.saving || this.completed) return;
    const version: number = ++this.version;
    this.emit('loading', '');
    try {
      const view: DeckConfigsForUpdateView = await this.backend.load(this.deckId);
      if (!this.alive || version !== this.version) return;
      const entry = view.allConfigs.find(item => item.config.id === view.currentDeck?.configId);
      if (entry === undefined || entry.config.config === null) throw new Error('deck config not found');
      this.view = view;
      this.original = copyDeckConfig(entry.config);
      this.emit('ready', '');
    } catch (error) {
      if (this.alive && version === this.version) this.emit('error', error instanceof Error ? error.message : String(error));
    }
  }

  async save(draft: DeckConfig, shared: boolean, options: DeckConfigRequestOptions): Promise<boolean> {
    if (!this.alive || this.saving || this.completed || this.view === null || this.original === null) return false;
    const request: UpdateDeckConfigsInput = buildDeckConfigRequest(this.deckId, this.view, this.original, draft, shared, options);
    this.saving = true;
    this.emit('saving', '');
    try {
      await this.backend.save(request);
    } catch (error) {
      this.saving = false;
      this.emit('ready', error instanceof Error ? error.message : String(error));
      return false;
    }
    // 成功广播不依赖弹层是否仍挂载；刷新失败不得把已提交写入变回可重试。
    this.completed = true;
    this.saving = false;
    let notificationError: string = '';
    try { this.backend.committed(); }
    catch (error) { notificationError = error instanceof Error ? error.message : String(error); }
    this.emit('saved', notificationError);
    return true;
  }

  dispose(): void { this.alive = false; this.version++; }

  private emit(phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error', error: string): void {
    if (this.alive) this.publish({ phase: phase, view: this.view, config: this.original, error: error });
  }
}
