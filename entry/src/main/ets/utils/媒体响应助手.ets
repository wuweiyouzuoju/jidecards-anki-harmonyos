// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-MEDIA-RESPONSE-001
// @名称 媒体响应助手边界
//
// @作用
// 学习页与预览页共用的 ArkWeb 媒体响应：自建域名 → collection.media/ 文件。
//
// @输入
// Web 请求 / 媒体目录路径 / 媒体基地址
//
// @输出
// MIME 字符串 / 解码后文件名 / WebResourceResponse 或 null
//
// @业务规则
// GET/HEAD 支持 200/206/416；本地域名缺失资源返回 404，其他域名放行。
//
// @副作用
// 异步打开和读取沙箱文件；完整资源的文件描述符交 ArkWeb 关闭。
// ========================================================

import { fileIo as fs } from '@kit.CoreFileKit';

/**
 * 扩展名 → MIME 的查找表。
 * 覆盖 Anki 媒体目录中常见的图片/音频/视频/字体/前端资源类型。
 */
const 按扩展名的MIME表: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'mov': 'video/quicktime',
  'm4v': 'video/mp4',
  'ogv': 'video/ogg',
  'css': 'text/css',
  'js': 'text/javascript',
  'html': 'text/html',
  'ttf': 'font/ttf',
  'otf': 'font/otf',
  'woff': 'font/woff',
  'woff2': 'font/woff2'
};

/**
 * ========================================================
 * @块ID UTIL-MEDIA-RESPONSE-002
 * @名称 取MIME类型
 *
 * @作用
 * 按扩展名推断 MIME（小写、无点），未知返回 application/octet-stream。
 *
 * @输入
 * fileName: 文件名（可能含扩展名）
 *
 * @输出
 * MIME 字符串
 *
 * @副作用
 * 无
 * ========================================================
 */
export function 取MIME类型(文件名: string): string {
  const 点位置: number = 文件名.lastIndexOf('.');
  if (点位置 < 0 || 点位置 === 文件名.length - 1) {
    return 'application/octet-stream';
  }
  const 扩展名: string = 文件名.substring(点位置 + 1).toLowerCase();
  const mime: string | undefined = 按扩展名的MIME表[扩展名];
  return mime === undefined ? 'application/octet-stream' : mime;
}

/**
 * ========================================================
 * @块ID UTIL-MEDIA-RESPONSE-003
 * @名称 解码文件名
 *
 * @作用
 * 解码 URL 编码的文件名（如 %E4%B8%AD%E6%96%87.mp3 → 中文.mp3）。
 * Anki 卡片 HTML 中 [sound:xxx] 标签的文件名可能以 URL 编码形式存在，
 * 后端 extract_av_tags 提取的是字面字符串，需解码才能匹配磁盘上的实际文件名。
 * 解码失败（如含非编码 %）时回退原字面名，避免抛错中断播放。
 *
 * @输入
 * fileName: 可能 URL 编码的文件名
 *
 * @输出
 * 解码后文件名；失败时回退原文件名
 *
 * @副作用
 * 无
 * ========================================================
 */
export function 解码文件名(文件名: string): string {
  try {
    return decodeURIComponent(文件名);
  } catch (错误) {
    return 文件名;
  }
}

/** 单区间响应计划；length 始终等于响应正文长度。 */
interface MediaRange {
  code: number;
  start: number;
  length: number;
  contentRange: string;
}

/** 解析闭合、开放和后缀范围；未知单位、非法语法和多区间按 HTTP 允许的方式回退完整响应。 */
function resolveMediaRange(value: string, size: number): MediaRange {
  const full: MediaRange = { code: 200, start: 0, length: size, contentRange: '' };
  const match: RegExpExecArray | null = new RegExp('^bytes=(\\d*)-(\\d*)$', 'i').exec(value.trim());
  if (match === null || (match[1] === '' && match[2] === '')) { return full; }
  const first: number = match[1] === '' ? 0 : Number(match[1]);
  const last: number = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) { return full; }
  if (match[1] !== '' && match[2] !== '' && last < first) { return full; }
  const start: number = match[1] === '' ? Math.max(0, size - last) : first;
  const end: number = match[1] === '' ? size - 1 : Math.min(last, size - 1);
  if (size === 0 || start >= size) {
    return { code: 416, start: 0, length: 0, contentRange: `bytes */${size}` };
  }
  return { code: 206, start: start, length: end - start + 1, contentRange: `bytes ${start}-${end}/${size}` };
}

/** 请求头名称不区分大小写。 */
function requestHeader(request: WebResourceRequest, name: string): string {
  for (const header of request.getRequestHeader()) {
    if (header.headerKey.toLowerCase() === name) { return header.headerValue; }
  }
  return '';
}

/** 设置可终结加载的空响应，避免文件失败后回落到虚拟域名网络请求。 */
function emptyMediaResponse(response: WebResourceResponse, code: number, reason: string): void {
  response.setResponseCode(code);
  response.setReasonMessage(reason);
  response.setResponseMimeType('text/plain');
  response.setResponseHeader([{ headerKey: 'Content-Length', headerValue: '0' }]);
  response.setResponseData('');
}

/**
 * 异步准备媒体响应；完整资源由 ArkWeb 读取，部分资源只读取请求区间。
 * Invariants: 请求独占句柄；仅完整正文将关闭责任移交 ArkWeb；短读不会返回补零的伪数据。
 */
async function prepareMediaResponse(response: WebResourceResponse, request: WebResourceRequest,
  path: string, fileName: string): Promise<void> {
  let file: fs.File | null = null;
  let transferred: boolean = false;
  try {
    file = await fs.open(path, fs.OpenMode.READ_ONLY);
    const stat: fs.Stat = await fs.stat(file.fd);
    if (!stat.isFile()) {
      emptyMediaResponse(response, 404, 'Not Found');
      return;
    }
    // 未提供资源验证器，不能满足 If-Range 条件；HEAD 按完整 GET 的元信息响应。
    const rangeValue: string = request.getRequestMethod() === 'GET' && requestHeader(request, 'if-range') === ''
      ? requestHeader(request, 'range') : '';
    const range: MediaRange = resolveMediaRange(rangeValue, stat.size);
    const headers: Header[] = [
      { headerKey: 'Accept-Ranges', headerValue: 'bytes' },
      { headerKey: 'Content-Length', headerValue: String(range.length) },
      { headerKey: 'Content-Type', headerValue: 取MIME类型(fileName) }
    ];
    if (range.contentRange !== '') {
      headers.push({ headerKey: 'Content-Range', headerValue: range.contentRange });
    }
    response.setResponseCode(range.code);
    response.setReasonMessage(range.code === 206 ? 'Partial Content' : range.code === 416 ? 'Range Not Satisfiable' : 'OK');
    response.setResponseMimeType(取MIME类型(fileName));
    response.setResponseHeader(headers);
    if (request.getRequestMethod() === 'HEAD' || range.length === 0) {
      response.setResponseData('');
    } else if (range.start === 0 && range.length === stat.size) {
      // 包括 bytes=0-；不为整文件在 ArkTS 堆中分配等大的 ArrayBuffer。
      response.setResponseData(file.fd);
      transferred = true;
    } else {
      const data: ArrayBuffer = new ArrayBuffer(range.length);
      const output: Uint8Array = new Uint8Array(data);
      const chunk: ArrayBuffer = new ArrayBuffer(Math.min(range.length, 64 * 1024));
      let completed: number = 0;
      fs.lseek(file.fd, range.start, fs.WhenceType.SEEK_SET);
      while (completed < range.length) {
        const length: number = Math.min(chunk.byteLength, range.length - completed);
        const count: number = await fs.read(file.fd, chunk, { length: length });
        if (count <= 0 || count > length) { throw new Error('Incomplete media range'); }
        output.set(new Uint8Array(chunk, 0, count), completed);
        completed += count;
      }
      response.setResponseData(data);
    }
  } catch (error) {
    // 打开失败是缺失资源；打开后的 IO 失败不能伪装成成功或错误的部分内容。
    emptyMediaResponse(response, file === null ? 404 : 500, file === null ? 'Not Found' : 'Internal Server Error');
  } finally {
    try {
      if (file !== null && !transferred) { await fs.close(file); }
    } finally {
      response.setResponseIsReady(true);
    }
  }
}

/**
 * 学习与预览唯一的本地媒体 HTTP 入口。
 * Invariants: 只服务 collection.media 内的单个文件名；异步响应每次新建，不共享请求状态。
 * Extension Points: MIME 扩展集中在本模块表中，页面无需再处理状态码或读取文件。
 */
export function interceptMediaRequest(request: WebResourceRequest, mediaDirectory: string,
  mediaBase: string): WebResourceResponse | null {
  const url: string = request.getRequestUrl();
  if (!url.startsWith(mediaBase)) { return null; }
  const response: WebResourceResponse = new WebResourceResponse();
  const fileName: string = 解码文件名(url.substring(mediaBase.length).split(new RegExp('[?#]'))[0]);
  if (fileName === '') {
    response.setResponseCode(200);
    response.setReasonMessage('OK');
    response.setResponseMimeType('text/html');
    response.setResponseEncoding('UTF-8');
    response.setResponseData('<!DOCTYPE html><html><body></body></html>');
    return response;
  }
  if (fileName === '.' || fileName === '..' || new RegExp('[/\\\\\\x00]').test(fileName)) {
    emptyMediaResponse(response, 404, 'Not Found');
    return response;
  }
  const method: string = request.getRequestMethod();
  if (method !== 'GET' && method !== 'HEAD') {
    emptyMediaResponse(response, 405, 'Method Not Allowed');
    response.setResponseHeader([
      { headerKey: 'Allow', headerValue: 'GET, HEAD' }, { headerKey: 'Content-Length', headerValue: '0' }
    ]);
    return response;
  }
  response.setResponseIsReady(false);
  prepareMediaResponse(response, request, `${mediaDirectory}/${fileName}`, fileName).catch((): void => {
    // finally 即使遇到关闭失败也已释放响应等待；不让清理失败成为未处理的 Promise。
  });
  return response;
}
