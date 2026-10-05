// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AvTagsResult, AvItem, TtsItem } from '../proto/messages/CardRenderingMessages';
import { orderedAvItems } from '../proto/messages/CardRenderingMessages';

/** 原生播放器与行为测试共用的最小队列边界。 */
export interface AudioQueuePlayer<T> {
  播放队列(items: T[]): Promise<void>;
  waitForCompletion(): Promise<void>;
  停止(): Promise<void>;
  释放(): Promise<void>;
}

/**
 * 学习与预览共用的卡面音频生命周期。
 * Invariants: 过期解析不启动播放；原生初始化结束后仍会清理；音频失败不改变卡片状态。
 * Extension Points: 调用方提供一次提取 sound/TTS 的读操作，评分不进入此边界。
 */
export class CardAudioSession {
  private sound: AudioQueuePlayer<string>;
  private tts: AudioQueuePlayer<TtsItem>;
  private extract: (html: string, question: boolean) => Promise<AvTagsResult>;
  private soundPath: (directory: string, filename: string) => string;
  private version: number = 0;
  private released: boolean = false;
  private work: Promise<void> = Promise.resolve();
  private playing: boolean = false;

  isPlaying(): boolean { return this.playing; }

  constructor(sound: AudioQueuePlayer<string>, tts: AudioQueuePlayer<TtsItem>,
    extract: (html: string, question: boolean) => Promise<AvTagsResult>,
    soundPath: (directory: string, filename: string) => string =
      (directory: string, filename: string): string => `${directory}/${filename}`) {
    this.sound = sound;
    this.tts = tts;
    this.extract = extract;
    this.soundPath = soundPath;
  }

  /** 立即使旧请求失效，并在初始化结束后再停止一次，防止迟到的原生播放。 */
  stop(): Promise<void> {
    this.version += 1;
    this.playing = false;
    this.sound.停止().catch((error: Object): void => { console.info(`Card audio stop: ${error}`); });
    this.tts.停止().catch((error: Object): void => { console.info(`Card TTS stop: ${error}`); });
    this.work = this.work.then(async (): Promise<void> => {
      await this.sound.停止();
      await this.tts.停止();
    }).catch((error: Object): void => { console.info(`Card audio cleanup: ${error}`); });
    return this.work;
  }

  /** 一次解析当前卡面；null 表示已取消，false 表示该面无音频。 */
  async play(html: string, question: boolean, mediaDirectory: string, autoplay: boolean = true,
    replayQuestionHtml: string = '', onReady: (hasAudio: boolean) => void = (): void => {}): Promise<boolean | null> {
    if (this.released) { return null; }
    this.stop();
    const version: number = this.version;
    this.playing = autoplay;
    try {
      // 解析不占原生播放队列，慢旧请求不能阻塞新卡。
      const groups: AvTagsResult[] = [];
      if (replayQuestionHtml !== '') groups.push(await this.extract(replayQuestionHtml, true));
      if (!this.isCurrent(version)) return null;
      const tags: AvTagsResult = await this.extract(html, question);
      if (!this.isCurrent(version)) { return null; }
      groups.push(tags);
      const hasAudio: boolean = groups.some((group: AvTagsResult): boolean => orderedAvItems(group).length > 0);
      onReady(hasAudio);
      if (!autoplay) { return hasAudio; }
      const playback: Promise<void> = this.work.then(async (): Promise<void> => {
        for (const group of groups) {
          if (!this.isCurrent(version)) { return; }
          const items: AvItem[] = orderedAvItems(group);
          let index: number = 0;
          // 只合并相邻同类项目；跨播放器切换必须等待上一段真正结束。
          while (index < items.length) {
            if (!this.isCurrent(version)) return;
            const sounds: string[] = [];
            const speech: TtsItem[] = [];
            const isSound: boolean = items[index].soundFile !== null;
            while (index < items.length && (items[index].soundFile !== null) === isSound) {
              const item: AvItem = items[index++];
              if (item.soundFile !== null) {
                let decoded: string = item.soundFile;
                try { decoded = decodeURIComponent(decoded); } catch (_) { /* 保留文件名中的字面 %。 */ }
                sounds.push(this.soundPath(mediaDirectory, decoded));
              } else if (item.tts !== null) speech.push(item.tts);
            }
            if (isSound) {
              await this.sound.播放队列(sounds);
              await this.sound.waitForCompletion();
            } else {
              await this.tts.播放队列(speech);
              await this.tts.waitForCompletion();
            }
          }
        }
      });
      // 保持队列可继续使用，错误仍通过本次 play 返回调用页面。
      this.work = playback.catch((): void => {});
      await playback;
      return this.isCurrent(version) ? hasAudio : null;
    } catch (error) {
      if (!this.isCurrent(version)) { return null; }
      this.stop();
      throw error;
    } finally {
      if (this.isCurrent(version)) this.playing = false;
    }
  }

  /** 销毁后禁止新播放，等待原生操作结束再释放。 */
  release(): Promise<void> {
    if (this.released) { return this.work; }
    this.released = true;
    this.stop();
    this.work = this.work.then(async (): Promise<void> => {
      await this.sound.释放();
      await this.tts.释放();
    }).catch((error: Object): void => { console.info(`Card audio release: ${error}`); });
    return this.work;
  }

  private isCurrent(version: number): boolean {
    return !this.released && version === this.version;
  }
}
