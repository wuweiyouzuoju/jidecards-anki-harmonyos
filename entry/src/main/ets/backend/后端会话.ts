// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SESSION-001
// @名称 后端会话（句柄与 collection 生命周期单例管理）
//
// @作用
// Rust backend 句柄与 collection 生命周期的唯一管理者：
//   - 单例：通过 获取实例() 拿到唯一实例
//   - 幂等打开：确保已打开() 同时完成 backend 初始化与 collection 打开
//   - 统一调用通道：调用(服务号, 方法号, 输入字节) 错误一律类型化为 后端错误
//   - collection 关闭与消费标记：服务于全量导入/导出场景
// 不持有任何 UI 状态；UI 通过 是否就绪() 感知就绪。
//
// @输入
// 确保已打开(文件目录)：应用沙箱 filesDir
// 调用(服务号, 方法号, 输入字节)：经各 Service 转手的高层调用
// 关闭集合() / 标记集合已消费() / 在集合关闭下调用(...)
//
// @输出
// 确保已打开：Promise<void>（成功后 是否就绪() === true）
// 调用：Promise<Uint8Array>（后端返回字节）
// 关闭集合：Promise<void>（state 切到 collectionClosed）
// 标记集合已消费：Promise<void>（state 从 ready 切到 collectionClosed）
// 在集合关闭下调用：Promise<Uint8Array>
//
// @业务规则
// 状态机：closed → ready → collectionClosed → ready（重开）→ ...
// 并发 确保已打开 共享同一次 opening Promise；失败后关闭半初始化句柄允许重试。
// server=false：本地库模式；26.05 允许空 locale 目录无翻译运行。
// Anki 存储约定：collection.anki2 / collection.media / collection.mdb。
// 关闭集合 只关闭 collection，保留 backend 初始化（用于 BackendImportExportService.ImportCollectionPackage 的 lock_closed_collection 语义）。
// 标记集合已消费 仅修正本地 state，不调后端 CLOSE（用于 export_collection_package 之后——collection 已被 guard.take() 消费）。
//
// @副作用
// 通过 后端客户端 间接调用 NAPI 桥；修改单例 state 与 opening Promise。
//
// @注意
// 改动 state 转换或并发逻辑前请通读 export_collection_package / import_collection_package 的恢复路径。
// ========================================================

import { 后端客户端 } from './后端客户端';
import { 集合方法, 服务号, 原生状态 } from './服务索引';
import { 后端错误, 映射原生错误 } from './错误类型';
import { encodeBackendInit } from '../proto/messages/BackendMessages';
import { encodeCloseCollectionRequest, encodeOpenCollectionRequest } from '../proto/messages/CollectionMessages';

export type 会话状态 = 'closed' | 'collectionClosed' | 'ready';

export class 后端会话 {
  private static 实例: 后端会话 | null = null;

  static 获取实例(): 后端会话 {
    if (后端会话.实例 === null) {
      后端会话.实例 = new 后端会话();
    }
    return 后端会话.实例;
  }

  private readonly 客户端 = new 后端客户端();
  private 状态: 会话状态 = 'closed';
  private 打开中: Promise<void> | null = null;
  private generation: number = 0;

  /**
   * 幂等打开：先开 backend（BackendInit），再开 collection。
   * 并发调用共享同一次打开过程；失败后可重试。
   * 文件目录 为应用沙箱文件目录（context.filesDir）。
   */
  确保已打开(文件目录: string, 验证待提交替换: boolean = false): Promise<void> {
    if (this.状态 === 'ready') {
      return Promise.resolve();
    }
    if (this.打开中 !== null) {
      return this.打开中;
    }
    const generation: number = this.generation;
    this.打开中 = this.内部打开(文件目录, generation, 验证待提交替换)
      .then(() => {
        if (generation !== this.generation) {
          throw new Error('Backend session was closed while opening');
        }
        this.状态 = 'ready';
      })
      .catch((e: unknown) => {
        // 打开失败：关闭半初始化的句柄，允许下次重试
        if (generation === this.generation) {
          this.客户端.关闭();
          this.状态 = 'closed';
        }
        throw e;
      })
      .finally(() => {
        if (generation === this.generation) this.打开中 = null;
      });
    return this.打开中;
  }

  /** @throws Recovery or native open failures are handled by 确保已打开 and reported to its caller. */
  private async 内部打开(文件目录: string, generation: number, 验证待提交替换: boolean): Promise<void> {
    if (!验证待提交替换) {
      // Every ordinary reopen must finish pending recovery, including a failed rollback in this process.
      // Only the replacement owner skips this to validate its new collection before marking it committed.
      const recovery = await import('./TransferRecovery');
      if (generation !== this.generation) throw new Error('Backend session was closed while opening');
      await recovery.recoverInterruptedReplacement(文件目录);
    }
    if (generation !== this.generation) throw new Error('Backend session was closed while opening');
    if (!this.客户端.是否已打开()) {
      // server=false：本地库模式；26.05 允许空 locale 目录无翻译运行
      const init = encodeBackendInit({ preferredLangs: ['zh-Hans', 'en'], localeFolderPath: '', server: false });
      try {
        this.客户端.打开(init);
      } catch (e: unknown) {
        throw 映射原生错误(e);
      }
    }
    // Anki 存储约定：collection.anki2 / collection.media / collection.mdb（with_extension 规则）
    const request = encodeOpenCollectionRequest({
      collectionPath: `${文件目录}/collection.anki2`,
      mediaFolderPath: `${文件目录}/collection.media`,
      mediaDbPath: `${文件目录}/collection.mdb`
    });
    await this.原始调用(服务号.后端集合, 集合方法.打开, request);
  }

  /** 已打开 backend 且 collection 就绪 */
  async 调用进度控制(method: number): Promise<Uint8Array> {
    if (method !== 集合方法.最新进度 && method !== 集合方法.设置中止请求) throw new Error('Invalid progress control');
    return this.原始调用(服务号.后端集合, method, new Uint8Array(0));
  }

  /** 已打开 backend 且 collection 就绪 */
  是否就绪(): boolean {
    return this.状态 === 'ready';
  }

  /** 高层服务的统一调用通道：错误一律类型化为 后端错误 */
  async 调用(服务号: number, 方法号: number, 输入字节: Uint8Array): Promise<Uint8Array> {
    if (!this.是否就绪()) {
      throw new 后端错误('backend session is not ready', 0, '确保已打开', 原生状态.原生致命错误);
    }
    return this.原始调用(服务号, 方法号, 输入字节);
  }

  /**
   * 仅关闭 Anki collection，保留已初始化的原生 backend。
   * 用于 BackendImportExportService.ImportCollectionPackage（Anki 26.05 实现取 lock_closed_collection）。
   */
  async 关闭集合(): Promise<void> {
    if (!this.是否就绪()) {
      throw new 后端错误('backend session is not ready', 0, '确保已打开', 原生状态.原生致命错误);
    }
    const generation: number = this.generation;
    await this.原始调用(
      服务号.后端集合,
      集合方法.关闭,
      encodeCloseCollectionRequest(false)
    );
    if (generation === this.generation) this.状态 = 'collectionClosed';
  }

  /**
   * 标记 collection 已被后端消费（guard.take() 取出不放回），仅修正本地状态。
   * 与 关闭集合() 区别：后者会调后端 CLOSE（collection 仍存在），
   * 而本方法用于 export_collection_package 之后——collection 已不存在，
   * 调 CLOSE 会失败，因此只把 状态 从 'ready' 切到 'collectionClosed'，
   * 让下一次 确保已打开() 能重新打开 collection。
   */
  async 标记集合已消费(): Promise<void> {
    if (this.状态 !== 'ready') {
      // 已非 ready（例如已 closed / collectionClosed）：无需再切
      return;
    }
    this.状态 = 'collectionClosed';
  }

  /** 仅分派在 collection 关闭状态下显式合法的操作 */
  async 在集合关闭下调用(服务号: number, 方法号: number, 输入字节: Uint8Array): Promise<Uint8Array> {
    if (this.状态 !== 'collectionClosed') {
      throw new 后端错误('collection must be closed', 0, '关闭集合', 原生状态.原生致命错误);
    }
    return this.原始调用(服务号, 方法号, 输入字节);
  }

  private async 原始调用(服务号: number, 方法号: number, 输入字节: Uint8Array): Promise<Uint8Array> {
    try {
      return await this.客户端.调用原始(服务号, 方法号, 输入字节);
    } catch (e: unknown) {
      throw 映射原生错误(e);
    }
  }

  /** 关闭 collection 与 backend 句柄；之后可再次 确保已打开 */
  关闭(): void {
    this.generation++;
    this.打开中 = null;
    this.状态 = 'closed';
    this.客户端.关闭();
  }
}
