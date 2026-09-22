// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { request } from '@kit.BasicServicesKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { 云端牌组目录地址 } from '../model/云端牌组配置';
import { 解析云端牌组目录, 云端牌组目录, 云端牌组目录项 } from '../model/云端牌组模型';

export type 云端牌组服务错误代码 =
  'not_configured' | 'invalid_url' | 'http' | 'catalog' | 'download' | 'file';

/** 供首页将技术失败稳定映射为本地化界面状态。 */
export class 云端牌组服务错误 extends Error {
  readonly code: 云端牌组服务错误代码;

  constructor(code: 云端牌组服务错误代码, message: string) {
    super(message);
    this.code = code;
  }
}

export type 云端牌组下载进度回调 = (processed: number, total: number) => void;

const 云端牌组无进度超时毫秒: number = 90000;

function 是HTTPS地址(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url);
}

/** @throws {Error} 下载文件不可用或 IO 失败，停止导入并向任务入口报告。 */
function 确保目录存在(path: string): void {
  if (!fs.accessSync(path)) {
    fs.mkdirSync(path);
  }
}

function 静默删除(path: string): void {
  try {
    if (fs.accessSync(path)) {
      fs.unlinkSync(path);
    }
  } catch (error) {
    // 清理失败不覆盖原始网络或导入错误。
  }
}

/** @throws {Error} 下载文件不可用或 IO 失败，停止导入并向任务入口报告。 */
function 校验下载文件(path: string, expectedSize: number | undefined): void {
  if (!fs.accessSync(path)) {
    throw new 云端牌组服务错误('file', '下载文件不存在');
  }
  const stat: fs.Stat = fs.statSync(path);
  if (stat.size <= 0) {
    throw new 云端牌组服务错误('file', '下载文件为空');
  }
  if (expectedSize !== undefined && expectedSize > 0 && stat.size !== expectedSize) {
    throw new 云端牌组服务错误('file', '下载文件大小不匹配');
  }
  const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
  try {
    const buffer: ArrayBuffer = new ArrayBuffer(4);
    const bytesRead: number = fs.readSync(file.fd, buffer, { length: 4 });
    const signature: Uint8Array = new Uint8Array(buffer);
    const isZip: boolean = bytesRead === 4 && signature[0] === 0x50 && signature[1] === 0x4B &&
      ((signature[2] === 0x03 && signature[3] === 0x04) ||
        (signature[2] === 0x05 && signature[3] === 0x06) ||
        (signature[2] === 0x07 && signature[3] === 0x08));
    if (!isZip) {
      throw new 云端牌组服务错误('file', '下载内容不是有效的 APKG 文件');
    }
  } finally {
    fs.closeSync(file);
  }
}

/** 第三方托管边界：小目录走 HTTP，大牌组走系统文件传输代理。 */
export class 云端牌组服务 {
  private readonly catalogUrl: string;

  constructor(catalogUrl: string = 云端牌组目录地址) {
    this.catalogUrl = catalogUrl.trim();
  }

  /** 清除上次被系统终止后可能留在私有下载目录里的中间文件。 */
  清理残留下载(filesDir: string): void {
    const downloadDir: string = `${filesDir}/cloud-decks`;
    try {
      if (!fs.accessSync(downloadDir)) {
        return;
      }
      for (const name of fs.listFileSync(downloadDir)) {
        if (!name.endsWith('.part') && !name.endsWith('.apkg')) {
          continue;
        }
        const path: string = `${downloadDir}/${name}`;
        try {
          if (!fs.statSync(path).isDirectory()) {
            静默删除(path);
          }
        } catch (error) {
          // 单个残留文件异常不阻断其余文件清理。
        }
      }
    } catch (error) {
      // 下载目录暂时不可读时，后续下载仍会按牌组 ID 清理自身文件。
    }
  }

  /** 获取并校验云端 JSON 目录。 */
  async 加载目录(): Promise<云端牌组目录> {
    if (this.catalogUrl.length === 0) {
      throw new 云端牌组服务错误('not_configured', '云端牌组目录尚未配置');
    }
    if (!是HTTPS地址(this.catalogUrl)) {
      throw new 云端牌组服务错误('invalid_url', '云端牌组目录必须使用 HTTPS');
    }

    const client: http.HttpRequest = http.createHttp();
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.GET,
      expectDataType: http.HttpDataType.STRING,
      usingCache: false,
      connectTimeout: 15000,
      readTimeout: 30000
    };
    try {
      const response: http.HttpResponse = await client.request(this.catalogUrl, options);
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw new 云端牌组服务错误('http', `云端牌组目录请求失败：${response.responseCode}`);
      }
      if (typeof response.result !== 'string') {
        throw new 云端牌组服务错误('catalog', '云端牌组目录响应格式错误');
      }
      try {
        return 解析云端牌组目录(response.result);
      } catch (error) {
        const detail: string = error instanceof Error ? error.message : `${error}`;
        throw new 云端牌组服务错误('catalog', detail);
      }
    } catch (error) {
      if (error instanceof 云端牌组服务错误) {
        throw error;
      }
      const detail: string = error instanceof Error ? error.message : `${error}`;
      throw new 云端牌组服务错误('http', detail);
    } finally {
      client.destroy();
    }
  }

  /** 将一个公开 `.apkg` 下载到沙箱；完成前持续上报已处理与总字节数。 */
  /** @throws {Error} 下载文件不可用或 IO 失败，停止导入并向任务入口报告。 */
  async 下载牌组(
    context: common.UIAbilityContext,
    filesDir: string,
    deck: 云端牌组目录项,
    onProgress: 云端牌组下载进度回调
  ): Promise<string> {
    if (deck.accessType !== 'public' || !是HTTPS地址(deck.downloadUrl)) {
      throw new 云端牌组服务错误('invalid_url', '牌组下载地址不可用');
    }

    const downloadDir: string = `${filesDir}/cloud-decks`;
    确保目录存在(downloadDir);
    const safeId: string = deck.id.replace(/[^A-Za-z0-9._-]/g, '_');
    const outputPath: string = `${downloadDir}/${safeId}.apkg`;
    const partPath: string = `${downloadDir}/${safeId}.part`;
    静默删除(outputPath);
    静默删除(partPath);

    const config: request.agent.Config = {
      action: request.agent.Action.DOWNLOAD,
      url: deck.downloadUrl,
      title: deck.name,
      description: deck.description,
      mode: request.agent.Mode.FOREGROUND,
      overwrite: true,
      method: 'GET',
      saveas: partPath,
      network: request.agent.Network.ANY,
      metered: true
    };

    let task: request.agent.Task;
    try {
      task = await request.agent.create(context, config);
    } catch (error) {
      const detail: string = error instanceof Error ? error.message : `${error}`;
      throw new 云端牌组服务错误('download', detail);
    }

    return new Promise<string>((resolve: (value: string) => void,
      reject: (reason: Error) => void): void => {
      let settled: boolean = false;
      let timeoutId: number = -1;
      let lastProcessed: number = -1;

      const progressCallback = (progress: request.agent.Progress): void => {
        const total: number = progress.sizes.length > progress.index ? progress.sizes[progress.index] : 0;
        try {
          onProgress(progress.processed, total);
        } catch (error) {
          // 界面进度回调失败不应中断系统下载任务。
        }
        if (progress.processed > lastProcessed) {
          lastProcessed = progress.processed;
          resetIdleTimeout();
        }
      };
      const removeListeners = (): void => {
        if (timeoutId !== -1) {
          clearTimeout(timeoutId);
          timeoutId = -1;
        }
        try {
          task.off('progress', progressCallback);
        } catch (error) {
          // 监听器可能已经被系统移除；不能因此阻断 Promise 收尾。
        }
        try {
          task.off('completed', completedCallback);
        } catch (error) {
          // 同上。
        }
        try {
          task.off('failed', failedCallback);
        } catch (error) {
          // 同上。
        }
        try {
          task.off('pause', pauseCallback);
        } catch (error) {
          // 同上。
        }
      };
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        removeListeners();
        静默删除(partPath);
        reject(new Error(message));
      };
      const removeTask = (): void => {
        try {
          request.agent.remove(task.tid).then((): void => {
            静默删除(partPath);
          }).catch((): void => {
            静默删除(partPath);
          });
        } catch (error) {
          静默删除(partPath);
        }
      };
      const resetIdleTimeout = (): void => {
        if (timeoutId !== -1) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout((): void => {
          fail('牌组长时间无下载进度，请检查网络后重试');
          removeTask();
        }, 云端牌组无进度超时毫秒);
      };
      const completedCallback = (progress: request.agent.Progress): void => {
        if (settled) return;
        try {
          progressCallback(progress);
          校验下载文件(partPath, deck.size);
          静默删除(outputPath);
          fs.renameSync(partPath, outputPath);
          settled = true;
          removeListeners();
          resolve(outputPath);
        } catch (error) {
          const detail: string = error instanceof Error ? error.message : `${error}`;
          fail(detail);
        }
      };
      const failedCallback = (progress: request.agent.Progress): void => {
        fail(`牌组下载失败：${progress.state}`);
      };
      const pauseCallback = (progress: request.agent.Progress): void => {
        fail(`牌组下载已暂停：${progress.state}`);
        removeTask();
      };

      try {
        task.on('progress', progressCallback);
        task.on('completed', completedCallback);
        task.on('failed', failedCallback);
        task.on('pause', pauseCallback);
        resetIdleTimeout();
        task.start().catch((error: Error): void => {
          fail(error.message);
          removeTask();
        });
      } catch (error) {
        const detail: string = error instanceof Error ? error.message : `${error}`;
        fail(detail);
        removeTask();
      }
    });
  }
}
