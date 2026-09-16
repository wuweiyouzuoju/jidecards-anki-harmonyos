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

  /** 防止两个面板同时进入 Rust 同步流程。 */
  acquire(owner: Object): boolean {
    if (this.owner !== null) return false;
    this.owner = owner;
    return true;
  }

  /** 面板离开后开始冷却，避免手动同步返回首页立刻再次同步。 */
  release(owner: Object, now: number): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.lastFinishedAt = now;
  }

  /** 自动请求等待当前流程结束，并合并三十秒内的重复生命周期通知。 */
  canAutoSync(now: number): boolean {
    return this.owner === null && (this.lastFinishedAt < 0 || now < this.lastFinishedAt ||
      now - this.lastFinishedAt >= 30000);
  }
}

export const syncActivity: SyncActivity = new SyncActivity();
