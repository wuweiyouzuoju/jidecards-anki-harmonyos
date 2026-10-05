// SPDX-License-Identifier: AGPL-3.0-or-later

import { http } from '@kit.NetworkKit';
import { 官方公告地址, OFFICIAL_ANNOUNCEMENTS_ENABLED } from '../model/官方公告配置';
import {
  构建官方公告请求地址,
  官方公告截止剩余毫秒,
  解析可展示官方公告
} from '../model/官方公告模型';
import type { 官方公告语言, 官方公告展示项 } from '../model/官方公告模型';

function HTTPS地址有效(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url);
}

const 总截止毫秒: number = 2000;

export class 官方公告服务 {
  private readonly manifestUrl: string;

  constructor(manifestUrl: string = 官方公告地址) {
    this.manifestUrl = manifestUrl.trim();
  }

  async 加载公告(
    currentVersion: string,
    language: 官方公告语言,
    nowMs: number = Date.now()
  ): Promise<官方公告展示项 | null> {
    if (!OFFICIAL_ANNOUNCEMENTS_ENABLED || !HTTPS地址有效(this.manifestUrl)) return null;
    const startMs: number = Date.now();
    const client: http.HttpRequest = http.createHttp();
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.GET,
      expectDataType: http.HttpDataType.STRING,
      usingCache: false,
      connectTimeout: 2000,
      readTimeout: 2000
    };
    let timerId: number = -1;
    try {
      const url: string = 构建官方公告请求地址(this.manifestUrl, nowMs);
      const requestPromise: Promise<http.HttpResponse> = client.request(url, options);
      // 迟到的请求结果直接忽略，避免截止后 destroy 引发未处理拒绝
      requestPromise.catch((_error: Error): void => {});
      const winner: http.HttpResponse | null = await Promise.race([
        requestPromise,
        new Promise<http.HttpResponse | null>((
          resolve: (value: http.HttpResponse | null) => void
        ): void => {
          timerId = setTimeout(resolve, Math.min(官方公告截止剩余毫秒(startMs, Date.now()), 总截止毫秒));
        })
      ]);
      if (winner === null) return null;
      const response: http.HttpResponse = winner;
      if (response.responseCode < 200 || response.responseCode >= 300 || typeof response.result !== 'string') {
        return null;
      }
      return 解析可展示官方公告(response.result, currentVersion, nowMs, language);
    } catch (error) {
      return null;
    } finally {
      if (timerId >= 0) {
        clearTimeout(timerId);
      }
      client.destroy();
    }
  }
}
