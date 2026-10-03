// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { 声音播放器 } from './声音播放器';

/** 一个表单拥有一条试听队列；新试听停止旧试听，离页释放。 */
export class NoteAudioPreview {
  private player: 声音播放器 = new 声音播放器();
  private generation: number = 0;
  private disposed: boolean = false;
  private failed: boolean = false;
  private changed: (playing: boolean) => void = (_playing: boolean): void => {};

  /** @throws {Error} 缺失文件/播放器失败交给音频条目显示。 */
  async play(uri: string, changed: (playing: boolean) => void): Promise<void> {
    if (this.disposed) return;
    const generation: number = ++this.generation;
    this.player.onPlaybackError = (): void => {};
    this.changed(false);
    this.changed = changed;
    changed(true);
    try {
      await this.player.停止();
      if (generation !== this.generation || this.disposed) return;
      this.failed = false;
      this.player.onPlaybackError = (): void => { if (generation === this.generation) this.failed = true; };
      const stat: fs.Stat = await fs.stat(uri);
      if (stat.size <= 0) throw new Error('Empty audio');
      if (generation !== this.generation || this.disposed) return;
      await this.player.播放队列([uri]);
      if (generation !== this.generation || this.disposed) return;
      await this.player.waitForCompletion();
      if (generation === this.generation && this.failed) throw new Error('Audio playback failed');
    } finally {
      if (generation === this.generation) this.changed(false);
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    this.changed(false);
    this.player.onPlaybackError = (): void => {};
    await this.player.停止();
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stop();
    await this.player.释放();
  }
}
