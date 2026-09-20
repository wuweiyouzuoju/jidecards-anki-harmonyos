// SPDX-License-Identifier: AGPL-3.0-or-later

/** 校验服务器基础地址；补齐末尾斜杠，避免 Anki 的 URL.join 丢弃反代子路径。 */
export function normalizeSyncServer(input: string): string {
  const value: string = input.trim();
  if (value === '') return '';
  const match: RegExpExecArray | null = new RegExp('^(https?)://([^/?#]+)(/[^?#]*)?$', 'i').exec(value);
  if (match === null || new RegExp('[\\s\\\\@]').test(value)) {
    throw new Error('Invalid sync server URL');
  }
  const authority: string = match[2];
  const host: RegExpExecArray | null = new RegExp('^(\\[[0-9a-fA-F:.]+\\]|[a-zA-Z0-9.-]+)(?::([0-9]+))?$').exec(authority);
  if (host === null || host[1] === '.' || host[1] === '..' ||
    (host[2] !== undefined && (Number(host[2]) < 1 || Number(host[2]) > 65535))) {
    throw new Error('Invalid sync server host or port');
  }
  const path: string = match[3] || '/';
  // 不接受会被 URL 解析器折叠的路径段，避免显示地址与实际发送目标不一致。
  for (const segment of path.split('/')) {
    const decoded: string = decodeURIComponent(segment);
    if (decoded === '.' || decoded === '..' || new RegExp('[\\\\\\x00-\\x20]').test(decoded)) {
      throw new Error('Invalid sync server path');
    }
  }
  return match[1].toLowerCase() + '://' + authority.toLowerCase() + path + (path.endsWith('/') ? '' : '/');
}

/**
 * 手动和自动同步共享的进程内互斥与节流。
 * Invariants: 冲突等待和媒体轮询仍持有租约；只有持有者可以释放。
 */
export class SyncActivity {
  private owner: Object | null = null;
  private lastFinishedAt: number = -1;
  private backgroundHandler: (() => void) | null = null;
  private collectionBusy: boolean = false;
  private collectionWaiters: Array<() => void> = [];
  private studyYieldHandler: (() => boolean) | null = null;
  private studyPriorityRequested: boolean = false;

  /** 在自动面板挂载前预留集合，封住“点击恢复学习”与组件创建之间的窗口。 */
  reserveCollection(): void {
    this.studyPriorityRequested = false;
    this.collectionBusy = true;
  }

  /** 学习优先于增量同步；预留到组件挂载之间的请求也必须保留。 */
  requestStudyPriority(): boolean {
    if (!this.collectionBusy) return false;
    this.studyPriorityRequested = true;
    return this.studyYieldHandler === null || this.studyYieldHandler();
  }

  setStudyYieldHandler(owner: Object, handler: () => boolean): void {
    if (this.owner !== owner) return;
    this.studyYieldHandler = handler;
    if (this.studyPriorityRequested) handler();
  }

  cancelReservation(): void {
    if (this.owner !== null) return;
    this.collectionBusy = false;
    this.studyPriorityRequested = false;
    this.resolveCollectionWaiters();
  }

  /** 学习恢复等待集合安全释放；媒体传输与尚未选择覆盖方向的冲突不占集合。 */
  async waitForCollection(): Promise<void> {
    while (this.collectionBusy) {
      await new Promise<void>((resolve: () => void): void => { this.collectionWaiters.push(resolve); });
    }
  }

  setCollectionBusy(owner: Object, busy: boolean): void {
    if (this.owner !== owner) return;
    this.collectionBusy = busy;
    if (!busy) this.resolveCollectionWaiters();
  }

  private resolveCollectionWaiters(): void {
    const waiters: Array<() => void> = this.collectionWaiters;
    this.collectionWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** 账户与服务器变更必须等待当前同步（包括媒体）结束。 */
  isActive(): boolean {
    return this.owner !== null;
  }

  /** 防止两个面板同时进入 Rust 同步流程。 */
  acquire(owner: Object, backgroundHandler: (() => void) | null = null): boolean {
    if (this.owner !== null) return false;
    this.owner = owner;
    this.collectionBusy = true;
    this.backgroundHandler = backgroundHandler;
    return true;
  }

  /** 任务完成或宿主离开后开始冷却；旧状态条不能释放新任务的租约。 */
  release(owner: Object, now: number): void {
    if (this.owner !== owner) return;
    this.setCollectionBusy(owner, false);
    this.owner = null;
    this.backgroundHandler = null;
    this.studyYieldHandler = null;
    this.studyPriorityRequested = false;
    this.lastFinishedAt = now;
  }

  /** 在 Ability 的 onBackground 内同步申请配额，避免状态监听延迟至挂起后。 */
  continueInBackground(): void {
    if (this.backgroundHandler !== null) this.backgroundHandler();
  }

  /** 自动请求等待当前流程结束，并合并三十秒内的重复生命周期通知。 */
  canAutoSync(now: number): boolean {
    return this.owner === null && !this.collectionBusy && (this.lastFinishedAt < 0 || now < this.lastFinishedAt ||
      now - this.lastFinishedAt >= 30000);
  }
}

export const syncActivity: SyncActivity = new SyncActivity();
