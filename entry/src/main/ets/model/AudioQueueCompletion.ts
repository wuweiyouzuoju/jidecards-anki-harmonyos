// SPDX-License-Identifier: AGPL-3.0-or-later

/** sound/TTS 共用的队列完成信号；替换或停止队列立即释放旧等待者。 */
export class AudioQueueCompletion {
  private pending: Promise<void> = Promise.resolve();
  private resolve: (() => void) | null = null;

  begin(): void {
    this.finish();
    this.pending = new Promise<void>((resolve: () => void): void => { this.resolve = resolve; });
  }

  finish(): void {
    const resolve: (() => void) | null = this.resolve;
    this.resolve = null;
    if (resolve !== null) resolve();
  }

  wait(): Promise<void> { return this.pending; }
}
