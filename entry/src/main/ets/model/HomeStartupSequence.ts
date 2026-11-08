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
  private disposed: boolean = false;

  hasPending(): boolean {
    return this.continuationPending || this.continuationRunning;
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

  /** 已在读取或被弹层阻挡时不推进；宿主不能把这种立即返回当作完成并再次唤醒。 */
  async resume(host: HomeStartupHost): Promise<boolean> {
    if (this.disposed || !this.continuationPending || this.continuationRunning || !host.canPresent()) return false;
    await this.continue(host);
    return true;
  }

  async continue(host: HomeStartupHost): Promise<void> {
    if (this.disposed) return;
    this.continuationPending = true;
    if (this.continuationRunning || !host.canPresent()) return;
    this.continuationRunning = true;
    try {
      const introCompleted: boolean = await host.introCompleted();
      if (this.disposed || !host.canPresent()) return;
      // 欢迎页写入已读并关闭后，首页协调器才会继续检查牌组引导。
      if (!introCompleted) {
        host.showIntro();
        return;
      }
      const cloudCompleted: boolean = await host.cloudCompleted();
      if (this.disposed || !host.canPresent()) return;
      this.continuationPending = false;
      if (!cloudCompleted) host.showCloud();
    } finally {
      this.continuationRunning = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.continuationPending = false;
  }
}
