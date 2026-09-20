// SPDX-License-Identifier: AGPL-3.0-or-later

/** 可替换的媒体边界用于验证检查失败、共享引用和同步竞争。 */
export interface DeckMediaCleanupBackend {
  isSyncing(): Promise<boolean>;
  unused(): Promise<string[]>;
  trash(files: string[]): Promise<void>;
}

/**
 * 仅清理删除牌组后新增的未引用媒体，确认前后的检查缺一不可。
 * Invariants: 不清理原有闲置文件；任何检查失败均不删除媒体；执行前重新核对引用。
 */
export class DeckMediaCleanup {
  private backend: DeckMediaCleanupBackend;

  constructor(backend: DeckMediaCleanupBackend) {
    this.backend = backend;
  }

  /** 媒体同步中不采用可能变化的检查结果。 */
  async snapshot(): Promise<string[]> {
    if (await this.backend.isSyncing()) throw new Error('Media sync active');
    const files: string[] = await this.backend.unused();
    if (await this.backend.isSyncing()) throw new Error('Media sync active');
    return files;
  }

  /** 前后差集限定为此次删除释放的文件，不波及历史闲置媒体。 */
  async candidates(before: string[]): Promise<string[]> {
    const previous: Set<string> = new Set<string>(before);
    return (await this.snapshot()).filter((file: string): boolean => !previous.has(file));
  }

  /** 用户确认后再次检查，只把仍未引用的已确认文件移入回收站。 */
  async cleanup(confirmed: string[]): Promise<number> {
    const unused: Set<string> = new Set<string>(await this.snapshot());
    const safe: string[] = confirmed.filter((file: string): boolean => unused.has(file));
    if (safe.length > 0) await this.backend.trash(safe);
    return safe.length;
  }
}
