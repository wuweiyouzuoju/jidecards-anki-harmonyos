// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-SOUND-PLAYER-001
// @名称 声音播放器边界
//
// @作用
// 原生 AVPlayer 队列播放器（M7 音频方案）。
// 学习页音频改走原生播放：Web <audio> 自动播放受手势策略拦截，真机无声。
// 串行语义：播放队列/重播 先停后播；completed 自动接续下一首；代次 防旧回调污染。
//
// 状态机：fdSrc → initialized → prepare → prepared → play → playing → completed → 下一首
// 主路径：从指定位置开始 主动调 prepare/play；兜底：状态变更处理 回调里按状态推进；
//        超时：3s 未进入 playing 跳下一首。
//
// 音频焦点：AudioSession 使用 MIX_WITH_OTHERS 与其他应用并发；
//          audioInterruptMode=SHARE_MODE 让本应用内多路音频共享焦点；收到 RESUME 时主动续播。
//
// 诊断：全链路 hilog 输出（tag=SoundPlayer），平板上
//      `hdc shell hilog | grep SoundPlayer` 即可看到每一步状态/文件/错误细节。
//
// @输入
// 一组音频的沙箱绝对路径
//
// @输出
// 通过 AVPlayer 播放音频；不返回数据，状态变化经 hilog 输出
//
// @业务规则
// 串行播放：上一首 completed/error 后自动接下一首；同代次回调才生效。
// 文件不存在或为空时跳过；3 秒内未进入 playing 视为卡死，跳下一首。
//
// @副作用
// 创建/释放 AVPlayer 实例；打开/关闭沙箱文件描述符；注册/卸载播放器事件监听。
// ========================================================

import { media } from '@kit.MediaKit';
import { audio } from '@kit.AudioKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { AudioFocusCoordinator } from './AudioFocusCoordinator';
import { AudioQueuePlayer } from '../model/CardAudioSession';
import { AudioQueueCompletion } from '../model/AudioQueueCompletion';

const 域: number = 0x0001;
const 标签: string = 'SoundPlayer';
const 状态超时毫秒: number = 3000;

function 记录信息(消息: string, ...参数: (string | number)[]): void {
  hilog.info(域, 标签, 消息, ...参数);
}

function 记录警告(消息: string, ...参数: (string | number)[]): void {
  hilog.warn(域, 标签, 消息, ...参数);
}

function 记录错误(消息: string, ...参数: (string | number)[]): void {
  hilog.error(域, 标签, 消息, ...参数);
}

function 错误文本(e: object | undefined): string {
  if (e === undefined || e === null) {
    return 'undefined';
  }
  const 任意错误 = e as Record<string, Object>;
  const 错误码: number | undefined = 任意错误.code as number | undefined;
  const 错误消息: string | undefined = 任意错误.message as string | undefined;
  if (错误码 !== undefined && 错误消息 !== undefined) {
    return `code=${错误码} msg=${错误消息}`;
  }
  if (错误消息 !== undefined) {
    return `msg=${错误消息}`;
  }
  return `${e}`;
}

export class 声音播放器 implements AudioQueuePlayer<string> {
  private readonly 音频焦点协调器: AudioFocusCoordinator = AudioFocusCoordinator.getInstance();
  private 播放器实例: media.AVPlayer | null = null;
  private 队列: string[] = [];
  private 当前索引: number = 0;
  private 文件描述符: number = -1;
  private 代次: number = 0;
  private 状态定时器ID: number = -1;
  private completion: AudioQueueCompletion = new AudioQueueCompletion();

  waitForCompletion(): Promise<void> { return this.completion.wait(); }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-002
   * @名称 播放队列
   *
   * @作用
   * 顺序播放一组音频（沙箱绝对路径）；空列表等价 停止。
   *
   * @输入
   * paths: 一组音频的沙箱绝对路径
   *
   * @输出
   * Promise<void>：首项启动流程结束后 resolve；后续队列由 completed 事件推进。
   *
   * @业务规则
   * 代次+1 让旧回调失效；先停后播避免并发。
   *
   * @副作用
   * 重置播放器状态、打开新文件描述符。
   * ========================================================
   */
  /** @throws {Error} 播放器创建失败，由音频命令边界显示失败并允许重试。 */
  async 播放队列(路径列表: string[]): Promise<void> {
    this.代次++;
    const generation: number = this.代次;
    this.completion.begin();
    this.队列 = 路径列表;
    记录信息('playQueue: gen=%{public}d count=%{public}d', this.代次, 路径列表.length);
    for (let i: number = 0; i < 路径列表.length; i++) {
      记录信息('  queue[%{public}d]=%{public}s', i, 路径列表[i]);
    }
    await this.停止播放器();
    if (generation !== this.代次) return;
    if (路径列表.length > 0) {
      await this.音频焦点协调器.beginPlayback(this);
      await this.从指定位置开始(0, generation);
    } else {
      this.completion.finish();
      await this.音频焦点协调器.endPlayback(this);
    }
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-003
   * @名称 重播
   *
   * @作用
   * 从头重播当前队列（学习页重播按钮）。
   *
   * @输入
   * 无（使用当前队列）
   *
   * @输出
   * Promise<void>
   *
   * @副作用
   * 代次+1；先停后播。
   * ========================================================
   */
  /** @throws {Error} 播放器创建失败，由音频命令边界显示失败并允许重试。 */
  async 重播(): Promise<void> {
    if (this.队列.length === 0) {
      记录警告('replay: queue empty, nothing to replay');
      return;
    }
    await this.播放队列(this.队列.slice());
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-004
   * @名称 停止
   *
   * @作用
   * 停止并清空队列。
   *
   * @输入
   * 无
   *
   * @输出
   * Promise<void>
   *
   * @副作用
   * 代次+1；清空队列；调用 停止播放器。
   * ========================================================
   */
  async 停止(): Promise<void> {
    this.代次++;
    this.completion.finish();
    记录信息('stop: gen=%{public}d', this.代次);
    this.队列 = [];
    await this.停止播放器();
    await this.音频焦点协调器.endPlayback(this);
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-005
   * @名称 释放
   *
   * @作用
   * 页面销毁时释放播放器。
   *
   * @输入
   * 无
   *
   * @输出
   * Promise<void>
   *
   * @副作用
   * 调用 AVPlayer.release()；置空播放器实例；清除定时器。
   * ========================================================
   */
  async 释放(): Promise<void> {
    记录信息('release: enter');
    await this.停止();
    this.清除状态定时器();
    if (this.播放器实例 !== null) {
      try {
        await this.播放器实例.release();
        记录信息('release: player.release() ok');
      } catch (错误) {
        记录警告('release: player.release() threw %{public}s', 错误文本(错误 as object | undefined));
      }
      this.播放器实例 = null;
    }
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-006
   * @名称 停止播放器
   *
   * @作用
   * 内部停止：清除定时器 + reset 播放器 + 关闭文件描述符。
   *
   * @输入
   * 无
   *
   * @输出
   * Promise<void>
   *
   * @副作用
   * 调用 AVPlayer.reset()；关闭文件描述符。
   * ========================================================
   */
  private async 停止播放器(): Promise<void> {
    this.清除状态定时器();
    if (this.播放器实例 !== null) {
      try {
        await this.播放器实例.reset();
        记录信息('stopPlayer: reset() ok');
      } catch (错误) {
        记录警告('stopPlayer: reset() threw %{public}s', 错误文本(错误 as object | undefined));
      }
    }
    this.关闭文件描述符();
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-007
   * @名称 确保播放器
   *
   * @作用
   * 懒创建 AVPlayer 实例并挂载监听器；已存在则直接返回。
   *
   * @输入
   * 无
   *
   * @输出
   * Promise<media.AVPlayer>
   *
   * @副作用
   * 首次调用会创建 AVPlayer 并挂载事件监听。
   * ========================================================
   */
  /** @throws {Error} 平台播放器创建失败，交由播放入口处理。 */
  private async 确保播放器(): Promise<media.AVPlayer> {
    if (this.播放器实例 === null) {
      记录信息('ensurePlayer: creating new AVPlayer');
      this.播放器实例 = await media.createAVPlayer();
      this.挂载监听器(this.播放器实例);
      记录信息('ensurePlayer: created, state=%{public}s', this.播放器实例.state);
    }
    return this.播放器实例;
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-008
   * @名称 挂载监听器
   *
   * @作用
   * 挂载状态机/错误/音频焦点三类监听器。
   * - audioInterruptMode=SHARE_MODE：同应用内的 AVPlayer 与 TTS 共享焦点。
   * - on('audioInterrupt')：系统强制暂停后，收到 RESUME 提示时主动调用 play 恢复。
   *
   * @输入
   * player: AVPlayer 实例
   *
   * @输出
   * 无
   *
   * @副作用
   * 注册 stateChange/error/audioInterrupt 监听；设置 audioInterruptMode。
   * ========================================================
   */
  private 挂载监听器(播放器: media.AVPlayer): void {
    播放器.on('stateChange', (状态: media.AVPlayerState): void => {
      this.状态变更处理(状态);
    });
    播放器.on('error', (错误: Object): void => {
      记录错误('AVPlayer error event: %{public}s', 错误文本(错误 as object | undefined));
    });
    try {
      播放器.audioInterruptMode = audio.InterruptMode.SHARE_MODE;
      记录信息('attachListeners: audioInterruptMode=SHARE_MODE set');
    } catch (错误) {
      记录警告('attachListeners: audioInterruptMode set failed %{public}s', 错误文本(错误 as object | undefined));
    }
    播放器.on('audioInterrupt', (信息: audio.InterruptEvent): void => {
      记录信息('onAudioInterrupt: eventType=%{public}d forceType=%{public}d hintType=%{public}d',
        信息.eventType, 信息.forceType, 信息.hintType);
      if (信息.hintType === audio.InterruptHint.INTERRUPT_HINT_RESUME && this.队列.length > 0
        && this.播放器实例 !== null && this.播放器实例.state === 'paused') {
        this.播放器实例.play().then((): void => {
          记录信息('onAudioInterrupt: resumed playback');
        }).catch((错误: Object): void => {
          记录错误('onAudioInterrupt: resume failed %{public}s', 错误文本(错误 as object | undefined));
        });
      }
    });
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-009
   * @名称 从指定位置开始
   *
   * @作用
   * 主播放路径：检查文件存在性 → reset → 设 fdSrc → 启动状态超时 →
   * 主动 prepare/play 推进状态机；任意阶段代次过期则中止。
   *
   * @输入
   * index: 队列索引
   * gen: 调用时的代次
   *
   * @输出
   * Promise<void>
   *
   * @业务规则
   * 文件不存在/为空 → 递归到下一首；代次过期 → 直接返回；
   * prepare/play 失败不放弃，依赖 状态变更处理 兜底重试。
   *
   * @副作用
   * 打开文件描述符；调用 AVPlayer 的 reset/prepare/play；启动状态超时定时器。
   * ========================================================
   */
  /** @throws {Error} 平台播放器创建失败，播放入口或队列回调负责结束本轮播放。 */
  private async 从指定位置开始(索引: number, 代次: number): Promise<void> {
    if (代次 !== this.代次) {
      记录信息('startAt[%{public}d]: gen stale (got %{public}d, current %{public}d), abort', 索引, 代次, this.代次);
      return;
    }
    if (索引 >= this.队列.length) {
      this.completion.finish();
      记录信息('startAt[%{public}d]: end of queue', 索引);
      await this.音频焦点协调器.endPlayback(this);
      return;
    }
    this.当前索引 = 索引;
    const 播放器: media.AVPlayer = await this.确保播放器();
    if (代次 !== this.代次) {
      记录信息('startAt[%{public}d]: gen stale after ensurePlayer, abort', 索引);
      return;
    }
    const 路径: string = this.队列[索引];
    记录信息('startAt[%{public}d]: path=%{public}s state=%{public}s', 索引, 路径, 播放器.state);

    // 检查文件是否存在
    let 文件存在: boolean = false;
    let 文件大小: number = 0;
    try {
      const 文件信息: fs.Stat = fs.statSync(路径);
      文件存在 = true;
      文件大小 = 文件信息.size;
      记录信息('startAt[%{public}d]: file exists, size=%{public}d bytes', 索引, 文件大小);
    } catch (错误) {
      记录错误('startAt[%{public}d]: fs.statSync FAILED %{public}s', 索引, 错误文本(错误 as object | undefined));
    }
    if (!文件存在) {
      记录错误('startAt[%{public}d]: SKIP - file does not exist', 索引);
      await this.从指定位置开始(索引 + 1, 代次);
      return;
    }
    if (文件大小 <= 0) {
      记录错误('startAt[%{public}d]: SKIP - file is empty', 索引);
      await this.从指定位置开始(索引 + 1, 代次);
      return;
    }

    try {
      // completed/error 后必须回 idle 才能换源
      await 播放器.reset();
      记录信息('startAt[%{public}d]: reset() ok, state=%{public}s', 索引, 播放器.state);
    } catch (错误) {
      记录警告('startAt[%{public}d]: reset() threw %{public}s, state=%{public}s', 索引,
        错误文本(错误 as object | undefined), 播放器.state);
    }
    if (代次 !== this.代次) {
      记录信息('startAt[%{public}d]: gen stale after reset, abort', 索引);
      return;
    }
    try {
      const 文件: fs.File = fs.openSync(路径, fs.OpenMode.READ_ONLY);
      this.文件描述符 = 文件.fd;
      播放器.fdSrc = { fd: 文件.fd, offset: 0, length: 文件大小 };
      记录信息('startAt[%{public}d]: fdSrc set, fd=%{public}d, state=%{public}s', 索引, 文件.fd, 播放器.state);
      // 启动状态超时定时器：3s 内未进入 playing 则跳下一首，避免 prepare/play hang 住
      this.安排状态超时(索引, 代次);
      // 主动 prepare 推进到 prepared：部分系统版本 fdSrc 赋值后不触发 initialized 事件，会导致卡在 idle 无声
      try {
        await 播放器.prepare();
        记录信息('startAt[%{public}d]: prepare() ok, state=%{public}s', 索引, 播放器.state);
      } catch (prepare错误) {
        记录错误('startAt[%{public}d]: prepare() FAILED %{public}s, state=%{public}s', 索引,
          错误文本(prepare错误 as object | undefined), 播放器.state);
        // 不放弃：stateChange('initialized') 兜底会再调一次 prepare()
      }
      if (代次 !== this.代次) {
        记录信息('startAt[%{public}d]: gen stale after prepare, abort', 索引);
        return;
      }
      // prepare 完成后显式触发 play，不依赖 stateChange('prepared') 回调（部分版本回调时机不稳）
      try {
        await 播放器.play();
        记录信息('startAt[%{public}d]: play() ok, state=%{public}s', 索引, 播放器.state);
      } catch (play错误) {
        记录错误('startAt[%{public}d]: play() FAILED %{public}s, state=%{public}s', 索引,
          错误文本(play错误 as object | undefined), 播放器.state);
        // 不放弃：stateChange('prepared') 兜底会再调一次 play()
      }
    } catch (错误) {
      记录错误('startAt[%{public}d]: prepare or openSync FAILED %{public}s', 索引, 错误文本(错误 as object | undefined));
      this.关闭文件描述符();
      this.清除状态定时器();
      await this.从指定位置开始(索引 + 1, 代次);
    }
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-010
   * @名称 安排状态超时
   *
   * @作用
   * 状态超时定时器：3s 内未进入 playing 状态则跳下一首。
   * 避免 prepare/play hang 住导致整条队列卡死（社区案例：reset 不回 idle、url 更新不同步）。
   *
   * @输入
   * index: 当前队列索引
   * gen: 当前代次
   *
   * @输出
   * 无
   *
   * @副作用
   * 设置 setTimeout，触发时关闭 fd 并递归到下一首。
   * ========================================================
   */
  private 安排状态超时(索引: number, 代次: number): void {
    this.清除状态定时器();
    this.状态定时器ID = setTimeout((): void => {
      if (代次 !== this.代次) {
        记录信息('scheduleStateTimeout[%{public}d]: gen stale, skip', 索引);
        return;
      }
      const 状态: string = this.播放器实例 !== null ? this.播放器实例.state : 'null';
      记录警告('scheduleStateTimeout[%{public}d]: 3s timeout, state=%{public}s, advance to next', 索引, 状态);
      this.关闭文件描述符();
      this.从指定位置开始(索引 + 1, 代次).catch((e: Object): void => {
        if (代次 === this.代次) this.completion.finish();
        记录错误('scheduleStateTimeout: startAt(next) rejected %{public}s', 错误文本(e as object | undefined));
      });
    }, 状态超时毫秒);
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-011
   * @名称 清除状态定时器
   *
   * @作用
   * 清除已设置的状态超时定时器（若存在）。
   *
   * @输入
   * 无
   *
   * @输出
   * 无
   *
   * @副作用
   * 调用 clearTimeout；重置 状态定时器ID 为 -1。
   * ========================================================
   */
  private 清除状态定时器(): void {
    if (this.状态定时器ID !== -1) {
      clearTimeout(this.状态定时器ID);
      this.状态定时器ID = -1;
    }
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-012
   * @名称 状态变更处理
   *
   * @作用
   * AVPlayer stateChange 回调入口，按状态推进播放流程。
   * - playing：清除超时
   * - initialized：兜底调 prepare
   * - prepared：兜底调 play
   * - completed/error：跳下一首
   *
   * @输入
   * state: AVPlayer 新状态
   *
   * @输出
   * 无（异步推进播放或递归到下一首）
   *
   * @副作用
   * 调用 AVPlayer.prepare/play；递归 从指定位置开始。
   * ========================================================
   */
  private 状态变更处理(状态: media.AVPlayerState): void {
    const 代次: number = this.代次;
    记录信息('stateChange: state=%{public}s gen=%{public}d index=%{public}d', 状态, 代次, this.当前索引);
    if (状态 === 'playing') {
      // 进入播放态，清除超时定时器
      this.清除状态定时器();
    } else if (状态 === 'initialized' && this.播放器实例 !== null) {
      // 兜底：fdSrc 赋值后触发 initialized，若 从指定位置开始 中 prepare 失败这里再尝试
      this.播放器实例.prepare().then((): void => {
        记录信息('stateChange(initialized): prepare() resolved');
      }).catch((e: Object): void => {
        记录错误('stateChange(initialized): prepare() rejected %{public}s', 错误文本(e as object | undefined));
      });
    } else if (状态 === 'prepared' && this.播放器实例 !== null) {
      // 兜底：若 从指定位置开始 中 play() 已失败，这里再尝试一次
      this.播放器实例.play().then((): void => {
        记录信息('stateChange(prepared): play() resolved');
      }).catch((e: Object): void => {
        记录错误('stateChange(prepared): play() rejected %{public}s', 错误文本(e as object | undefined));
      });
    } else if (状态 === 'completed' || 状态 === 'error') {
      记录信息('stateChange: %{public}s → advance to next track', 状态);
      this.清除状态定时器();
      this.关闭文件描述符();
      this.从指定位置开始(this.当前索引 + 1, 代次).catch((e: Object): void => {
        if (代次 === this.代次) this.completion.finish();
        记录错误('stateChange: startAt(next) rejected %{public}s', 错误文本(e as object | undefined));
      });
    }
  }

  /**
   * ========================================================
   * @块ID UTIL-SOUND-PLAYER-013
   * @名称 关闭文件描述符
   *
   * @作用
   * 关闭已打开的文件描述符（若有效）；失败仅记录警告。
   *
   * @输入
   * 无
   *
   * @输出
   * 无
   *
   * @副作用
   * 调用 fs.closeSync；重置 文件描述符 为 -1。
   * ========================================================
   */
  private 关闭文件描述符(): void {
    if (this.文件描述符 >= 0) {
      try {
        fs.closeSync(this.文件描述符);
        记录信息('closeFd: closed fd=%{public}d', this.文件描述符);
      } catch (错误) {
        记录警告('closeFd: closeSync(fd=%{public}d) threw %{public}s', this.文件描述符, 错误文本(错误 as object | undefined));
      }
      this.文件描述符 = -1;
    }
  }
}
