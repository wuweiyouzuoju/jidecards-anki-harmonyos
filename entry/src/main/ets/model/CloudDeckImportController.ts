// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 云端牌组目录项 } from './云端牌组模型';

export interface CloudDeckImportProgress {
  name: string;
  stage: string;
  percent: number;
  processed: number;
  total: number;
  successIds: string[];
  failedIds: string[];
}

export interface CloudDeckImportBackend {
  prepare(): Promise<void>;
  download(deck: 云端牌组目录项, progress: (processed: number, total: number) => void): Promise<string>;
  importDeck(path: string): Promise<void>;
}

/** 固定任务顺序与累计成功结果，单项失败继续；页面只映射进度和持久化配额。 */
export class CloudDeckImportController {
  private running: boolean = false;

  async run(decks: 云端牌组目录项[], previousSuccess: string[], backend: CloudDeckImportBackend,
    publish: (progress: CloudDeckImportProgress) => void): Promise<CloudDeckImportProgress> {
    if (this.running) throw new Error('Cloud deck import already running');
    this.running = true;
    const tasks: 云端牌组目录项[] = decks.slice();
    const successIds: string[] = previousSuccess.slice();
    const failedIds: string[] = [];
    let processed: number = 0;
    const emit = (name: string, stage: string, percent: number): CloudDeckImportProgress => {
      const state: CloudDeckImportProgress = { name, stage, percent, processed, total: tasks.length,
        successIds: successIds.slice(), failedIds: failedIds.slice() };
      publish(state);
      return state;
    };
    try {
      await backend.prepare();
      for (const deck of tasks) {
        if (successIds.indexOf(deck.id) >= 0) { processed++; continue; }
        emit(deck.name, 'downloading', 0);
        let downloading: boolean = true;
        try {
          const path: string = await backend.download(deck, (received: number, total: number): void => {
            if (!downloading) return;
            const expected: number = total > 0 ? total : (deck.size ?? 0);
            emit(deck.name, 'downloading', expected > 0 ? Math.min(99, Math.floor(received * 100 / expected)) : 0);
          });
          downloading = false;
          emit(deck.name, 'importing', 100);
          await backend.importDeck(path);
          successIds.push(deck.id);
        } catch (_error) {
          failedIds.push(deck.id);
        } finally {
          downloading = false;
        }
        processed++;
        emit(deck.name, '', 100);
      }
    } catch (_error) {
      for (const deck of tasks) {
        if (successIds.indexOf(deck.id) < 0 && failedIds.indexOf(deck.id) < 0) failedIds.push(deck.id);
      }
    } finally {
      this.running = false;
    }
    return emit('', '', 0);
  }
}
