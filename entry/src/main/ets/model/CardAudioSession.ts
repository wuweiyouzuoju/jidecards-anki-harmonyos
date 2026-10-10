// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AvTagsResult, AvItem, TtsItem } from '../proto/messages/CardRenderingMessages';
import { orderedAvItems } from '../proto/messages/CardRenderingMessages';
import { isNoteVideoFilename } from './NoteVideoMedia';

/** 原生播放器与行为测试共用的最小队列边界。 */
export interface AudioQueuePlayer<T> {
  播放队列(items: T[]): Promise<void>;
  waitForCompletion(): Promise<void>;
  停止(): Promise<void>;
  释放(): Promise<void>;
}
export interface CardAudioOptions { itemIndex?: number; continuePrevious?: boolean; }

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
  private preparation: Promise<void> = Promise.resolve();
  private activePlayback: number = 0;

  isPlaying(): boolean { return this.activePlayback > 0; }

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
    this.preparation = Promise.resolve();
    this.activePlayback = 0;
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
    replayQuestionHtml: string = '', onReady: (hasAudio: boolean) => void = (): void => {},
    options: CardAudioOptions = {}): Promise<boolean | null> {
    if (this.released) { return null; }
    if (!options.continuePrevious) this.stop();
    const version: number = this.version;
    if (autoplay) this.activePlayback++;
    try {
      // 解析不占原生播放队列，慢旧请求不能阻塞新卡。
      const prepare = async (): Promise<AvTagsResult[]> => {
        const groups: AvTagsResult[] = [];
        if (!this.isCurrent(version)) return groups;
        if (replayQuestionHtml !== '') groups.push(await this.extract(replayQuestionHtml, true));
        if (!this.isCurrent(version)) return groups;
        groups.push(await this.extract(html, question));
        return groups;
      };
      const prepared: Promise<AvTagsResult[]> = options.continuePrevious ? this.preparation.then(prepare) : prepare();
      this.preparation = prepared.then((): void => {}, (): void => {});
      const groups: AvTagsResult[] = await prepared;
      if (!this.isCurrent(version)) return null;
      const selectedItems = (group: AvTagsResult): AvItem[] => {
        const allItems: AvItem[] = orderedAvItems(group);
        const selected: AvItem[] = options.itemIndex === undefined ? allItems : Number.isInteger(options.itemIndex) && options.itemIndex >= 0 ?
          allItems.slice(options.itemIndex, options.itemIndex + 1) : [];
        // 先按 Core 原索引选项再分流；视频由卡面播放器负责，不能重复以音频播放。
        return selected.filter((item: AvItem): boolean => {
          if (item.soundFile === null) return true;
          let filename: string = item.soundFile;
          try { filename = decodeURIComponent(filename); } catch (error) { /* 字面百分号仍按原名识别。 */ }
          return !isNoteVideoFilename(filename);
        });
      };
      const hasAudio: boolean = groups.some((group: AvTagsResult): boolean => selectedItems(group).length > 0);
      onReady(hasAudio);
      if (!autoplay) { return hasAudio; }
      const playback: Promise<void> = this.work.then(async (): Promise<void> => {
        for (const group of groups) {
          if (!this.isCurrent(version)) { return; }
          const items: AvItem[] = selectedItems(group);
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
      if (autoplay && this.isCurrent(version)) this.activePlayback--;
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
