// SPDX-License-Identifier: AGPL-3.0-or-later

import { audio } from '@kit.AudioKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0001;
const TAG: string = 'AudioFocus';

function errorText(error: object | undefined): string {
  if (error === undefined || error === null) {
    return 'undefined';
  }
  const record = error as Record<string, Object>;
  const code: number | undefined = record.code as number | undefined;
  const message: string | undefined = record.message as string | undefined;
  if (code !== undefined && message !== undefined) {
    return `code=${code} msg=${message}`;
  }
  return message === undefined ? `${error}` : `msg=${message}`;
}

/**
 * 协调学习页的卡片音频与 TTS，共享一个“与其他应用混音”的 AudioSession。
 *
 * Invariants:
 * - 第一个播放方起播前激活会话，最后一个播放方结束后停用会话。
 * - 激活与停用任务互斥，避免快速切卡时旧停用任务覆盖新播放。
 */
export class AudioFocusCoordinator {
  private static readonly INSTANCE: AudioFocusCoordinator = new AudioFocusCoordinator();
  private readonly sessionManager: audio.AudioSessionManager = audio.getAudioManager().getSessionManager();
  private readonly owners: Set<Object> = new Set<Object>();
  private isActivated: boolean = false;
  private activationTask: Promise<void> | null = null;
  private deactivationTask: Promise<void> | null = null;

  private constructor() {
    this.sessionManager.on('audioSessionDeactivated', (event: audio.AudioSessionDeactivatedEvent): void => {
      this.isActivated = false;
      hilog.warn(DOMAIN, TAG, 'audioSessionDeactivated: reason=%{public}d', event.reason);
    });
  }

  static getInstance(): AudioFocusCoordinator {
    return AudioFocusCoordinator.INSTANCE;
  }

  /** 在播放流启动前调用，使短音与其他应用的后台音频直接并发播放。 */
  async beginPlayback(owner: Object): Promise<void> {
    this.owners.add(owner);
    if (this.deactivationTask !== null) {
      await this.deactivationTask;
    }
    if (this.owners.size === 0 || this.isActivated) {
      return;
    }
    if (this.activationTask === null) {
      this.activationTask = this.activateMixSession();
    }
    await this.activationTask;
  }

  /** 在播放队列结束、停止或释放时调用；仍有另一播放方工作时保持会话。 */
  async endPlayback(owner: Object): Promise<void> {
    this.owners.delete(owner);
    if (this.owners.size > 0) {
      return;
    }
    if (this.activationTask !== null) {
      await this.activationTask;
    }
    if (this.owners.size > 0 || !this.isActivated) {
      return;
    }
    if (this.deactivationTask === null) {
      this.deactivationTask = this.deactivateSession();
    }
    await this.deactivationTask;
  }

  private async activateMixSession(): Promise<void> {
    const strategy: audio.AudioSessionStrategy = {
      concurrencyMode: audio.AudioConcurrencyMode.CONCURRENCY_MIX_WITH_OTHERS
    };
    try {
      await this.sessionManager.activateAudioSession(strategy);
      this.isActivated = true;
      hilog.info(DOMAIN, TAG, 'activateAudioSession: CONCURRENCY_MIX_WITH_OTHERS');
    } catch (error) {
      this.isActivated = false;
      hilog.error(DOMAIN, TAG, 'activateAudioSession failed: %{public}s', errorText(error as object | undefined));
    }
    this.activationTask = null;
  }

  private async deactivateSession(): Promise<void> {
    try {
      await this.sessionManager.deactivateAudioSession();
      this.isActivated = false;
      hilog.info(DOMAIN, TAG, 'deactivateAudioSession: success');
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'deactivateAudioSession failed: %{public}s', errorText(error as object | undefined));
    }
    this.deactivationTask = null;
  }
}
