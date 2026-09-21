// SPDX-License-Identifier: AGPL-3.0-or-later

export interface HomeStartupHost {
  canPresent: () => boolean;
  checkAnnouncement: () => Promise<boolean>;
  activateAnnouncementChecks: () => void;
  cloudCompleted: () => Promise<boolean>;
  introCompleted: () => Promise<boolean>;
  showCloud: () => void;
  showIntro: () => void;
}

/**
 * 启动引导拥有待展示和读取中的状态，已读持久化仍由用户确认触发。
 * Invariants: await 后重查准入；同类读取不重入；销毁使所有迟到结果失效。
 */
export class HomeStartupSequence {
  private started: boolean = false;
  private continuationPending: boolean = false;
  private continuationRunning: boolean = false;
  private introPending: boolean = false;
  private introRunning: boolean = false;
  private disposed: boolean = false;

  hasPending(): boolean {
    return this.continuationPending || this.continuationRunning || this.introPending || this.introRunning;
  }

  /** 首次检查结束前不读取引导偏好；有公告时由确认事件继续序列。 */
  async start(host: HomeStartupHost): Promise<void> {
    if (this.disposed || this.started) return;
    this.started = true;
    const found: boolean = await host.checkAnnouncement();
    if (this.disposed || found) return;
    host.activateAnnouncementChecks();
    await this.continue(host);
  }

  async resume(host: HomeStartupHost): Promise<void> {
    if (this.continuationPending) await this.continue(host);
    else if (this.introPending) await this.welcome(host);
  }

  async continue(host: HomeStartupHost): Promise<void> {
    if (this.disposed) return;
    this.continuationPending = true;
    if (this.continuationRunning || !host.canPresent()) return;
    this.continuationRunning = true;
    try {
      const completed: boolean = await host.cloudCompleted();
      if (this.disposed || !host.canPresent()) return;
      this.continuationPending = false;
      if (!completed) host.showCloud();
      else await this.welcome(host);
    } finally {
      this.continuationRunning = false;
    }
  }

  async welcome(host: HomeStartupHost): Promise<void> {
    if (this.disposed) return;
    this.introPending = true;
    if (this.introRunning) return;
    this.introRunning = true;
    try {
      const shown: boolean = await host.introCompleted();
      if (this.disposed) return;
      if (shown) { this.introPending = false; return; }
      if (!host.canPresent()) return;
      this.introPending = false;
      host.showIntro();
    } finally {
      this.introRunning = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.continuationPending = false;
    this.introPending = false;
  }
}
