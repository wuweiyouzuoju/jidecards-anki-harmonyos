// SPDX-License-Identifier: AGPL-3.0-or-later

export const EXTERNAL_DECK_OPEN_REVISION_KEY: string = 'externalDeckOpenRevision';

export interface ExternalDeckOpenSupport {
  action: string;
  scheme: string;
  entities: string[];
  extension: string;
  packageTypes: string[];
  fallbackTypes: string[];
  requiresImportConfirmation: boolean;
  opensFilePicker: boolean;
  acceptsCollectionRestore: boolean;
}

/** 系统声明由回归核对；接收校验和 JIDE 能力目录共用此边界。 */
export const EXTERNAL_DECK_OPEN_SUPPORT: ExternalDeckOpenSupport = {
  action: 'ohos.want.action.viewData', scheme: 'file', entities: ['entity.system.default'], extension: '.apkg',
  packageTypes: ['com.jide.kapian.apkg', 'application/apkg', 'application/x-apkg', 'application/vnd.anki'],
  // 通用类型只用于让系统列出候选；不能据此把无后缀文件当作 APKG。
  fallbackTypes: ['general.octet-stream', 'application/octet-stream', 'general.zip-archive',
    'application/zip', 'application/x-zip-compressed'],
  requiresImportConfirmation: true, opensFilePicker: false, acceptsCollectionRestore: false
};

/** 只接收系统交付的 APKG；解码仅用于识别，读取仍使用原始 URI。 */
export function externalDeckUri(action: string, uri: string, type: string): string | null {
  if (action !== EXTERNAL_DECK_OPEN_SUPPORT.action ||
    !uri.toLowerCase().startsWith(EXTERNAL_DECK_OPEN_SUPPORT.scheme + '://')) return null;
  let path: string;
  try {
    path = decodeURIComponent(uri.split('?')[0].split('#')[0]).toLowerCase();
  } catch (_error) {
    return null;
  }
  if (path.endsWith(EXTERNAL_DECK_OPEN_SUPPORT.extension)) return uri;
  const name: string = path.substring(path.lastIndexOf('/') + 1);
  // 类型可识别无后缀的授权 URI；明确为其他格式（特别是 colpkg）的文件不能自动导入。
  if (name.length > 0 && name.indexOf('.') < 0 &&
    EXTERNAL_DECK_OPEN_SUPPORT.packageTypes.includes(type.toLowerCase())) return uri;
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
