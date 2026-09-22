// SPDX-License-Identifier: AGPL-3.0-or-later

import { BackupCoordinator, backupCoordinator } from './BackupCoordinator';
import type { BackupBackend } from './BackupCoordinator';

export interface HomeBackupHost {
  isDisposed: () => boolean;
  isForeground: () => boolean;
  canRun: () => boolean;
  canReschedule: () => boolean;
  filesDir: () => string | null;
  loadEnabled: () => Promise<boolean>;
  warn: (error: Error) => void;
}

export interface HomeBackupClock {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
}

export type HomeBackupBackendFactory = (filesDir: string) => BackupBackend;

/** 页面报告占用，控制器拥有延迟任务；已接受的备份不随页面销毁中断。 */
export class HomeBackupController {
  private readonly hostFactory: () => HomeBackupHost;
  private readonly coordinator: BackupCoordinator;
  private readonly backendFactory: HomeBackupBackendFactory;
  private readonly clock: HomeBackupClock;
  private timer: number = -1;
  private disposed: boolean = false;
  private running: boolean = false;
  private generation: number = 0;

  constructor(hostFactory: () => HomeBackupHost,
    backendFactory: HomeBackupBackendFactory,
    coordinator: BackupCoordinator = backupCoordinator,
    clock: HomeBackupClock = { now: (): number => Date.now(),
      setTimeout: (callback: () => void, delay: number): number => setTimeout(callback, delay),
      clearTimeout: (timer: number): void => clearTimeout(timer) }) {
    this.hostFactory = hostFactory;
    this.coordinator = coordinator;
    this.backendFactory = backendFactory;
    this.clock = clock;
  }

  schedule(): void {
    const host: HomeBackupHost = this.hostFactory();
    if (this.disposed || this.running || this.timer >= 0 || !host.isForeground() || host.isDisposed()) return;
    const generation: number = this.generation;
    this.timer = this.clock.setTimeout((): void => {
      if (generation !== this.generation) return;
      this.timer = -1;
      this.run();
    }, 5000);
  }

  stop(): void {
    this.generation++;
    if (this.timer >= 0) this.clock.clearTimeout(this.timer);
    this.timer = -1;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private async run(): Promise<void> {
    const host: HomeBackupHost = this.hostFactory();
    if (this.disposed || host.isDisposed() || !host.isForeground() || !host.canRun()) {
      if (!this.disposed && host.isForeground() && host.canReschedule()) this.schedule();
      return;
    }
    if (this.running) return;
    this.running = true;
    const generation: number = this.generation;
    try {
      const filesDir: string | null = host.filesDir();
      if (filesDir === null || !(await host.loadEnabled()) || generation !== this.generation) return;
      await this.coordinator.automatic(this.backendFactory(filesDir), this.clock.now(),
        (): boolean => !this.disposed && !host.isDisposed() && host.isForeground() && host.canRun());
    } catch (error) {
      host.warn(error as Error);
    } finally {
      this.running = false;
    }
  }
}
