// SPDX-License-Identifier: AGPL-3.0-or-later

/** 广播与返回事件严格串行；失败不毒化后续刷新，销毁后排队任务不再启动。 */
export class HomeRefreshQueue {
  private tail: Promise<void> = Promise.resolve();
  private disposed: boolean = false;

  run(refresh: () => Promise<void>): Promise<void> {
    const execute = async (): Promise<void> => { if (!this.disposed) await refresh(); };
    const result: Promise<void> = this.tail.then(execute, execute);
    this.tail = result;
    return result;
  }

  dispose(): void { this.disposed = true; }
}
