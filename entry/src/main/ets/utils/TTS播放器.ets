// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-TTS-PLAYER
// @名称 TTS 播放器
//
// @作用
// 基于 HarmonyOS CoreSpeechKit 的 TTS 朗读播放器（M7 音频方案）。
// 负责 Anki [anki:tts lang=xxx]text[/anki:tts] 标签的本地朗读，与 SoundPlayer 分轨并行。
// 串行语义：播放队列 / 重播 先停后播；onComplete 自动接续下一首；代次防旧回调污染。
//
// @输入
// 一组 TtsItem（text + language）
//
// @输出
// 通过内置 TextToSpeechEngine 播放音频；无返回值。
//
// @业务规则
// - 引擎缓存 key 必须包含 person + voiceVersion，否则切换同语种音色后引擎不重建（2026-07-21 修）。
// - 鸿蒙 CoreSpeechKit 多数设备只预装 zh-CN 音色；en-US 等需用户在系统设置下载。
// - listVoices 探测音色状态：未 INSTALLED 的语言降级到 zh-CN（zh-CN 引擎也能读英文）。
// - person=0 是 CN_FEMALE_DEFAULT 聆小珊女声默认音色，非"系统自动选"。
// - 劳拉女声（person=8）无法播放中文文本，zh-CN 永远不能返回 8。
// - 优先用用户在设置页选定的 person；未选定时再用 按语言取音色人物 兜底。
//
// @副作用
// 创建 / 销毁 TextToSpeechEngine；通过 hilog 输出全链路诊断日志（tag=TtsPlayer）。
//
// @注意
// 修改这里可能影响 M7 音频方案；诊断方式：hdc shell hilog | grep TtsPlayer。
// ========================================================

import { textToSpeech } from '@kit.CoreSpeechKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { util } from '@kit.ArkTS';
import type { TtsItem } from '../proto/messages/CardRenderingMessages';
import { 加载语音人物, 获取语音版本号 } from '../model/TTS语音存储';
import { AudioFocusCoordinator } from './AudioFocusCoordinator';
import { AudioQueuePlayer } from '../model/CardAudioSession';
import { AudioQueueCompletion } from '../model/AudioQueueCompletion';

const 域: number = 0x0001;
const 标签: string = 'TtsPlayer';

function 记录信息(消息: string, ...参数: (string | number)[]): void {
  hilog.info(域, 标签, 消息, ...参数);
}

function 记录警告(消息: string, ...参数: (string | number)[]): void {
  hilog.warn(域, 标签, 消息, ...参数);
}

function 记录错误(消息: string, ...参数: (string | number)[]): void {
  hilog.error(域, 标签, 消息, ...参数);
}

function 错误文本(异常: BusinessError | undefined): string {
  if (异常 === undefined || 异常 === null) {
    return 'undefined';
  }
  const 错误码: number | undefined = 异常.code;
  const 错误信息: string | undefined = 异常.message;
  if (错误码 !== undefined && 错误信息 !== undefined) {
    return `code=${错误码} msg=${错误信息}`;
  }
  if (错误信息 !== undefined) {
    return `msg=${错误信息}`;
  }
  return `${异常}`;
}

/** Anki 的 lang（如 en_US、zh_CN）转 HarmonyOS CoreSpeechKit 的 language（en-US、zh-CN） */
function 转为鸿蒙语言代码(anki语种: string): string {
  if (anki语种 === '') {
    return 'en-US';
  }
  // en_US → en-US，zh_CN → zh-CN
  const 分段: string[] = anki语种.split('_');
  if (分段.length === 2) {
    return `${分段[0]}-${分段[1]}`;
  }
  return anki语种;
}

/**
 * 按语言选音色 person（createEngine 兜底用）。
 *
 * 官方 person 枚举完整列表（华为生态市场"语音播报组件"文档 + 真机 listVoices 实测，OpenHarmony-6.1.1.120）：
 * | 名称              | 数值 | 说明                |
 * |-------------------|------|---------------------|
 * | CN_FEMALE_DEFAULT | 0    | 聆小珊女声（默认）  |
 * | CN_FEMALE         | 13   | 聆小珊女声          |
 * | CN_MALE           | 21   | 凌飞哲男声（GA 可下载）|
 * | US_FEMALE         | 8    | 劳拉女声（无法播放中文文本）|
 *
 * 重要：person=0 不是"兜底值，让系统自动选"，而是 CN_FEMALE_DEFAULT 聆小珊女声默认音色，
 * 与 person=13（CN_FEMALE）功能等价。系统只内置这 4 个 person 枚举。
 *
 * 注意：劳拉女声（US_FEMALE=8）无法播放中文文本——若 zh-CN 文本路由到劳拉会失败，
 * 因此 zh-CN 永远不能返回 person=8。
 *
 * 鸿蒙 CoreSpeechKit 实际只内置了少量 person 枚举（聆小珊/劳拉/凌飞哲等），
 * 多数小语种（ja/ko/fr/de/es 等）没有独立的 person 值。强行编造 person 值会触发
 * 错误码 1002300003 "person not support!"，让 createEngine 直接失败。
 * 因此非中英语种保持 person=0（CN_FEMALE_DEFAULT 聆小珊）是当前最稳妥做法。
 *
 * 优先级：若用户在设置页选定了某 person（见 TTS语音存储），createEngine 时用用户选定值；
 * 未选定时再用本函数的兜底值。本函数与 TtsVoiceHelper.personForLanguage 保持语义一致。
 */
function 按语言取音色人物(鸿蒙语种: string): number {
  if (鸿蒙语种.startsWith('en')) {
    return 8;
  }
  if (鸿蒙语种.startsWith('zh')) {
    return 0;
  }
  return 0;
}

/**
 * 鸿蒙 CoreSpeechKit 音色状态：INSTALLED 表示已下载到设备可用，GA 表示可下载但未安装。
 * - 多数设备出厂只预装 zh-CN 音色；en-US 等需用户在系统设置下载。
 * - 用 listVoices 探测目标语言是否有 INSTALLED 音色；没有则降级到 zh-CN（zh-CN 引擎也能读英文）。
 * - listVoices 失败时不阻塞：直接用请求语言试一次，让 createEngine 自己报错再由调用方处理。
 */
function 音色是否已安装(音色: textToSpeech.VoiceInfo, 语种: string): boolean {
  // VoiceInfo.language 在 SDK 中已声明（since 4.1.0(11)），status 为可选字段（since 5.1.1(19)）。
  // listVoices 返回的 language 用下划线（en_US），CreateEngineParams.language 用连字符（en-US）。
  const 音色语种: string = 音色.language;
  const 音色状态: string | undefined = 音色.status;
  if (音色状态 === undefined) {
    return false;
  }
  const 归一化音色: string = 音色语种.replace('_', '-');
  return 归一化音色 === 语种 && 音色状态 === 'INSTALLED';
}

export class TTS播放器 implements AudioQueuePlayer<TtsItem> {
  private readonly 音频焦点协调器: AudioFocusCoordinator = AudioFocusCoordinator.getInstance();
  private 引擎: textToSpeech.TextToSpeechEngine | null = null;
  private 引擎语言: string = '';
  // 引擎缓存 key 必须包含 person，否则用户在设置页切换同语种音色后（如 zh-CN 聆小珊→凌飞哲）
  // 引擎语言 没变，缓存命中直接返回旧引擎，新 person 永远不生效（2026-07-21 修）。
  private 引擎人物: number = -1;
  // 全局 voice 版本号快照：与 获取语音版本号() 对比，变了说明用户在 VoiceGroup 改过音色，
  // 即使 language+person 都没变也要重建引擎（保险，覆盖 使引擎缓存失效 路径之外的边界场景）。
  private 引擎语音版本号: number = -1;
  private 队列: TtsItem[] = [];
  private 索引: number = 0;
  private 代次: number = 0;
  private completion: AudioQueueCompletion = new AudioQueueCompletion();
  private activeRequestId: string = '';

  waitForCompletion(): Promise<void> { return this.completion.wait(); }

  /** 顺序朗读一组 TTS items；空列表等价 停止 */
  async 播放队列(条目列表: TtsItem[]): Promise<void> {
    this.代次++;
    const generation: number = this.代次;
    this.activeRequestId = '';
    this.completion.begin();
    this.队列 = 条目列表;
    记录信息('playQueue: gen=%{public}d count=%{public}d', this.代次, 条目列表.length);
    for (let i: number = 0; i < 条目列表.length; i++) {
      记录信息('  queue[%{public}d]=%{public}s lang=%{public}s', i, 条目列表[i].text, 条目列表[i].language);
    }
    await this.内部停止();
    if (generation !== this.代次) return;
    if (条目列表.length > 0) {
      await this.音频焦点协调器.beginPlayback(this);
      await this.从指定位置开始(0, generation);
    } else {
      this.completion.finish();
      await this.音频焦点协调器.endPlayback(this);
    }
  }

  /** 从头重播当前队列 */
  async 重播(): Promise<void> {
    if (this.队列.length === 0) {
      记录警告('replay: queue empty, nothing to replay');
      return;
    }
    await this.播放队列(this.队列.slice());
  }

  /** 停止并清空队列 */
  async 停止(): Promise<void> {
    this.代次++;
    this.activeRequestId = '';
    this.completion.finish();
    记录信息('stop: gen=%{public}d', this.代次);
    this.队列 = [];
    await this.内部停止();
    await this.音频焦点协调器.endPlayback(this);
  }

  /** 页面销毁时释放引擎 */
  async 释放(): Promise<void> {
    记录信息('release: enter');
    await this.停止();
    if (this.引擎 !== null) {
      try {
        await this.引擎.shutdown();
        记录信息('release: engine.shutdown() ok');
      } catch (错误) {
        记录警告('release: engine.shutdown() threw %{public}s', 错误文本(错误 as BusinessError | undefined));
      }
      this.引擎 = null;
      this.引擎语言 = '';
      this.引擎人物 = -1;
      this.引擎语音版本号 = -1;
    }
  }

  /**
   * 让引擎缓存失效（不立即销毁，下次 确保引擎 时按当前 已存储音色人物 重建）。
   * VoiceGroup onSelectClick 后调用，确保用户切换音色后下一张卡用新 person 朗读。
   */
  使引擎缓存失效(): void {
    记录信息('invalidateEngineCache: mark stale (was lang=%{public}s person=%{public}d)',
      this.引擎语言, this.引擎人物);
    this.引擎人物 = -1;
    this.引擎语音版本号 = -1;
  }

  private async 内部停止(): Promise<void> {
    if (this.引擎 !== null) {
      try {
        await this.引擎.stop();
        记录信息('stopInternal: engine.stop() ok');
      } catch (错误) {
        记录警告('stopInternal: engine.stop() threw %{public}s', 错误文本(错误 as BusinessError | undefined));
      }
    }
  }

  /**
   * 探测系统已安装的音色，决定 createEngine 时实际使用的语言。
   * - 已 INSTALLED：用请求语言
   * - 未 INSTALLED：降级到 'zh-CN'（zh-CN 是鸿蒙设备出厂必装的兜底音色）
   * - listVoices 失败：不阻塞，用请求语言直接试（让 createEngine 自己报错由调用方处理）
   */
  private async 选取可用语言(请求语种: string): Promise<string> {
    try {
      const 查询: textToSpeech.VoiceQuery = { requestId: `probe-${Date.now()}`, online: 1 };
      const 音色列表: textToSpeech.VoiceInfo[] = await textToSpeech.listVoices(查询);
      记录信息('pickUsableLanguage: listVoices count=%{public}d for requested=%{public}s',
        音色列表.length, 请求语种);
      for (let i: number = 0; i < 音色列表.length; i++) {
        const 当前音色: textToSpeech.VoiceInfo = 音色列表[i];
        const 已安装: boolean = 音色是否已安装(当前音色, 请求语种);
        记录信息('  voice[%{public}d] installed=%{public}s %{public}s',
          i, 已安装 ? 'YES' : 'NO', JSON.stringify(当前音色));
        if (已安装) {
          return 请求语种;
        }
      }
      // 请求语言无 INSTALLED 音色 → 检查 zh-CN 是否 INSTALLED
      for (let i: number = 0; i < 音色列表.length; i++) {
        if (音色是否已安装(音色列表[i], 'zh-CN')) {
          记录警告('pickUsableLanguage: requested=%{public}s not installed, fallback to zh-CN',
            请求语种);
          return 'zh-CN';
        }
      }
      // zh-CN 也没装（极少见）：仍降级 zh-CN，让 createEngine 走默认路径
      记录警告('pickUsableLanguage: no INSTALLED voice found, fallback zh-CN anyway');
      return 'zh-CN';
    } catch (错误) {
      记录警告('pickUsableLanguage: listVoices FAILED %{public}s, use requested lang',
        错误文本(错误 as BusinessError | undefined));
      return 请求语种;
    }
  }

  private async 确保引擎(语种: string): Promise<textToSpeech.TextToSpeechEngine> {
    // 鸿蒙 CoreSpeechKit 多数设备只预装 zh-CN 音色；en-US 等需用户在系统设置下载后才能 createEngine。
    // 这里先按 listVoices 探测音色状态，未 INSTALLED 的语言直接降级到 zh-CN（zh-CN 引擎也能读英文，发音不标准但出声）。
    const 兜底语种: string = await this.选取可用语言(语种);
    // 优先用用户在设置页选定的 person（聆小珊 13 / 凌飞哲 21 等）；未选定时再用 按语言取音色人物 兜底。
    // 注意：若用户选定的 person 不在 兜底语种 对应的音色列表中（比如选定 en-US 的 person=8 但降级到 zh-CN），
    // createEngine 会报错 1002300003 person not support。这里按 兜底语种 读取选定的 person；
    // 若该 language 没有选定（返回 0），再用 按语言取音色人物 兜底，避免传入无效 person。
    const 已存储音色人物: number = await 加载语音人物(兜底语种);
    const 音色人物: number = 已存储音色人物 !== 0 ? 已存储音色人物 : 按语言取音色人物(兜底语种);
    const 当前语音版本号: number = 获取语音版本号();
    // 缓存命中条件：engine 存在 + language 一致 + person 一致 + voiceVersion 没变。
    // person 与 voiceVersion 都必须参与缓存 key，否则 VoiceGroup 切换同语种音色后引擎不会重建（2026-07-21 修）。
    if (this.引擎 !== null && this.引擎语言 === 兜底语种
      && this.引擎人物 === 音色人物 && this.引擎语音版本号 === 当前语音版本号) {
      记录信息('ensureEngine: cache hit, language=%{public}s person=%{public}d voiceVersion=%{public}d',
        兜底语种, 音色人物, 当前语音版本号);
      return this.引擎;
    }
    // 语言、person 或 voiceVersion 变了，重建引擎
    if (this.引擎 !== null) {
      try {
        await this.引擎.shutdown();
        记录信息('ensureEngine: old engine.shutdown() ok (lang was %{public}s person was %{public}d voiceVersion was %{public}d)',
          this.引擎语言, this.引擎人物, this.引擎语音版本号);
      } catch (错误) {
        记录警告('ensureEngine: old engine.shutdown() threw %{public}s', 错误文本(错误 as BusinessError | undefined));
      }
      this.引擎 = null;
      this.引擎语言 = '';
      this.引擎人物 = -1;
      this.引擎语音版本号 = -1;
    }
    记录信息('ensureEngine: creating engine, requested=%{public}s using=%{public}s person=%{public}d (stored=%{public}d) voiceVersion=%{public}d',
      语种, 兜底语种, 音色人物, 已存储音色人物, 当前语音版本号);
    const 创建参数: textToSpeech.CreateEngineParams = {
      language: 兜底语种,
      person: 音色人物,
      online: 1,
      extraParams: {}
    };
    this.引擎 = await textToSpeech.createEngine(创建参数);
    this.引擎语言 = 兜底语种;
    this.引擎人物 = 音色人物;
    this.引擎语音版本号 = 当前语音版本号;
    this.引擎.setListener({
      onStart: (请求ID: string, 响应: textToSpeech.StartResponse): void => {
        记录信息('onStart: requestId=%{public}d', 请求ID);
      },
      onComplete: (请求ID: string, 响应: textToSpeech.CompleteResponse): void => {
        if (请求ID !== this.activeRequestId || 请求ID === '') return;
        this.activeRequestId = '';
        记录信息('onComplete: requestId=%{public}d → advance to next', 请求ID);
        this.前进到下一项();
      },
      onStop: (请求ID: string, 响应: textToSpeech.StopResponse): void => {
        记录信息('onStop: requestId=%{public}d', 请求ID);
      },
      onData: (请求ID: string, 音频: ArrayBuffer, 响应: textToSpeech.SynthesisResponse): void => {
        // 流式音频回调（本端直接由引擎内部播放，无需处理）
      },
      onError: (请求ID: string, 错误码: number, 错误信息: string): void => {
        if (请求ID !== this.activeRequestId || 请求ID === '') return;
        this.activeRequestId = '';
        记录错误('onError: requestId=%{public}d code=%{public}d msg=%{public}s → advance', 请求ID, 错误码, 错误信息);
        this.前进到下一项();
      }
    });
    记录信息('ensureEngine: created, language=%{public}s', 语种);
    return this.引擎;
  }

  private async 从指定位置开始(位置: number, 代次: number): Promise<void> {
    if (代次 !== this.代次) {
      记录信息('startAt[%{public}d]: gen stale (got %{public}d, current %{public}d), abort', 位置, 代次, this.代次);
      return;
    }
    if (位置 >= this.队列.length) {
      this.completion.finish();
      记录信息('startAt[%{public}d]: end of queue', 位置);
      await this.音频焦点协调器.endPlayback(this);
      return;
    }
    this.索引 = 位置;
    const 当前条目: TtsItem = this.队列[位置];
    const 鸿蒙语种: string = 转为鸿蒙语言代码(当前条目.language);
    记录信息('startAt[%{public}d]: text="%{public}s" lang=%{public}s → %{public}s',
      位置, 当前条目.text, 当前条目.language, 鸿蒙语种);

    let 当前引擎: textToSpeech.TextToSpeechEngine;
    try {
      当前引擎 = await this.确保引擎(鸿蒙语种);
    } catch (错误) {
      记录错误('startAt[%{public}d]: ensureEngine FAILED %{public}s', 位置, 错误文本(错误 as BusinessError | undefined));
      // 引擎创建失败（如系统不支持此语言）：跳到下一项
      await this.从指定位置开始(位置 + 1, 代次);
      return;
    }
    if (代次 !== this.代次) {
      记录信息('startAt[%{public}d]: gen stale after ensureEngine, abort', 位置);
      return;
    }
    // requestId 在同一实例内只能用一次，每次 speak 生成新 ID
    const 请求ID: string = `tts-${代次}-${位置}-${Date.now()}`;
    this.activeRequestId = 请求ID;
    const 朗读参数: textToSpeech.SpeakParams = {
      requestId: 请求ID,
      extraParams: {}
    };
    try {
      当前引擎.speak(当前条目.text, 朗读参数);
      记录信息('startAt[%{public}d]: engine.speak("%{public}s") called, requestId=%{public}s',
        位置, 当前条目.text, 请求ID);
    } catch (错误) {
      记录错误('startAt[%{public}d]: engine.speak() threw %{public}s → advance', 位置,
        错误文本(错误 as BusinessError | undefined));
      await this.从指定位置开始(位置 + 1, 代次);
    }
  }

  private 前进到下一项(): void {
    const 当后代次: number = this.代次;
    this.从指定位置开始(this.索引 + 1, 当后代次).catch((异常: Object): void => {
      if (当后代次 === this.代次) this.completion.finish();
      记录错误('advance: startAt(next) rejected %{public}s', 错误文本(异常 as BusinessError | undefined));
    });
  }
}
