// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';

interface PreparedCard {
  id: number;
  startedAt: number;
  result: Promise<RenderedCard | null>;
}

/** 只准备一张候选卡的 Core HTML；不执行模板、不播放媒体、不缓存调度状态。 */
export class CardRenderPrefetch {
  private render: (id: number) => Promise<RenderedCard>;
  private now: () => number;
  private prepared: PreparedCard | null = null;

  constructor(render: (id: number) => Promise<RenderedCard>, now: () => number = (): number => Date.now()) {
    this.render = render;
    this.now = now;
  }

  clear(): void { this.prepared = null; }

  async prepare(id: number): Promise<void> {
    if (id <= 0) return;
    if (this.prepared !== null && this.prepared.id === id) return;
    const entry: PreparedCard = {
      id: id, startedAt: this.now(),
      // 候选失败不影响当前卡；真正需要这张卡时通过正常读取再报告错误。
      result: Promise.resolve().then((): Promise<RenderedCard> => this.render(id)).catch((): null => null)
    };
    this.prepared = entry;
    await entry.result;
  }

  async read(id: number): Promise<RenderedCard> {
    const entry: PreparedCard | null = this.prepared;
    this.prepared = null;
    const age: number = entry === null ? -1 : this.now() - entry.startedAt;
    if (entry !== null && entry.id === id && age >= 0 && age <= 30000) {
      const rendered: RenderedCard | null = await entry.result;
      if (rendered !== null) return rendered;
    }
    return this.render(id);
  }
}
