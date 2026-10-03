// SPDX-License-Identifier: AGPL-3.0-or-later
export enum DeckPreviewScope {
  TodayRemaining = 0,
  Due = 1,
  StudiedToday = 2,
  All = 3
}

export interface DeckPreviewBackend {
  cardIds(deckId: string, scope: DeckPreviewScope): Promise<number[]>;
}

/** 只持有本次列表读取，预览位置与正式学习会话相互独立。 */
export class DeckPreviewSession {
  private generation: number = 0;
  private disposed: boolean = false;

  constructor(private readonly backend: DeckPreviewBackend) {}

  invalidate(): void {
    this.generation++;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  async load(deckId: string, scope: DeckPreviewScope): Promise<number[] | null> {
    if (this.disposed) return null;
    const generation: number = ++this.generation;
    try {
      const ids: number[] = await this.backend.cardIds(deckId, scope);
      if (this.disposed || generation !== this.generation) return null;
      if (ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('Invalid preview card ID');
      }
      // Keep Core order, including today's later learning steps.
      return Array.from(new Set<number>(ids));
    } catch (error) {
      if (this.disposed || generation !== this.generation) return null;
      throw error;
    }
  }
}
