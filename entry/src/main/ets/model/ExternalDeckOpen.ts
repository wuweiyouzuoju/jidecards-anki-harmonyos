// SPDX-License-Identifier: AGPL-3.0-or-later

export const EXTERNAL_DECK_OPEN_REVISION_KEY: string = 'externalDeckOpenRevision';

/** 只接收系统交付的 APKG；解码仅用于识别，读取仍使用原始 URI。 */
export function externalDeckUri(action: string, uri: string, type: string): string | null {
  if (action !== 'ohos.want.action.viewData' || !uri.startsWith('file://')) return null;
  let path: string;
  try {
    path = decodeURIComponent(uri.split('?')[0].split('#')[0]).toLowerCase();
  } catch (_error) {
    return null;
  }
  if (path.endsWith('.apkg')) return uri;
  const name: string = path.substring(path.lastIndexOf('/') + 1);
  // 类型可识别无后缀的授权 URI；明确为其他格式（特别是 colpkg）的文件不能自动导入。
  if (name.length > 0 && name.indexOf('.') < 0 &&
    (type === 'com.jide.kapian.apkg' || type === 'application/apkg' || type === 'application/x-apkg')) return uri;
  return null;
}

/**
 * 保留冷/热启动交付的文件，直到首页可以串行导入。
 * Invariants: 同一 URI 在排队或执行中只保留一份；结束后允许用户再次主动打开。
 * Extension Points: 平台入口只 enqueue，页面经 begin/finish 消费，不使用 UI 状态传递文件。
 */
export class ExternalDeckOpenQueue {
  private pending: string[] = [];
  private active: string | null = null;

  /** 返回是否新增请求，供平台入口决定是否广播。 */
  enqueue(uri: string): boolean {
    if (uri === this.active || this.pending.indexOf(uri) >= 0) return false;
    this.pending.push(uri);
    return true;
  }

  /** 排队和执行中都阻止启动弹层抢占。 */
  hasPending(): boolean {
    return this.active !== null || this.pending.length > 0;
  }

  /** 占用队首直到导入完成，防止异步期间重复消费。 */
  begin(): string | null {
    if (this.active !== null) return null;
    this.active = this.pending.shift() ?? null;
    return this.active;
  }

  /** 成败都释放当前请求，失败由导入面板显示并让用户重试。 */
  finish(): void {
    this.active = null;
  }
}

export const externalDeckOpens: ExternalDeckOpenQueue = new ExternalDeckOpenQueue();
