// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { request } from '@kit.BasicServicesKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import type { AgentImageCandidate } from '../../model/agent/AgentTypes';

const COMMONS_API: string = 'https://commons.wikimedia.org/w/api.php';
const UPLOAD_MEDIA_BASE: string = 'https://upload.wikimedia.org/';
const MAX_SEARCH_LIMIT: number = 10;
const MAX_IMAGE_BYTES: number = 8 * 1024 * 1024;
const DOWNLOAD_IDLE_TIMEOUT_MS: number = 90_000;

interface RawMetadataValue { value?: string; }
interface RawImageInfo {
  url?: string;
  thumburl?: string;
  mime?: string;
  size?: number;
  extmetadata?: Record<string, RawMetadataValue>;
}
interface RawWikimediaPage {
  title?: string;
  canonicalurl?: string;
  imageinfo?: RawImageInfo[];
}
interface RawWikimediaQuery { pages?: Record<string, RawWikimediaPage>; }
interface RawWikimediaResponse { query?: RawWikimediaQuery; }

export type WikimediaImageErrorCode =
  'invalid_query' | 'search_http' | 'search_parse' | 'no_candidates' |
  'invalid_candidate' | 'download' | 'download_timeout' | 'invalid_image' |
  'image_too_large' | 'context_unavailable';

export class WikimediaImageServiceError extends Error {
  readonly code: WikimediaImageErrorCode;
  constructor(code: WikimediaImageErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function allowedDownloadUrl(url: string): boolean {
  return url.startsWith(UPLOAD_MEDIA_BASE) && !/\s/.test(url.substring(UPLOAD_MEDIA_BASE.length));
}

function allowedSourceUrl(url: string): boolean {
  return /^https:\/\/commons\.wikimedia\.org\/wiki\/[^\s]+$/i.test(url);
}

function readMetadata(metadata: Record<string, RawMetadataValue> | undefined, key: string): string {
  const value: RawMetadataValue | undefined = metadata === undefined ? undefined : metadata[key];
  return value !== undefined && typeof value.value === 'string' ? value.value.trim() : '';
}

function extensionForMime(mime: string): string {
  switch (mime.toLocaleLowerCase()) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/avif': return 'avif';
    default: return '';
  }
}

// Validate binary magic signatures after download; a 200 response may still be HTML.
function extensionForBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'jpg';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E &&
    bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return 'png';
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return 'gif';
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'webp';
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 &&
    bytes[7] === 0x70 && (bytes[8] === 0x61 || bytes[8] === 0x6D) &&
    bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66) {
    return 'avif';
  }
  return '';
}

function safePartName(draftId: string, index: number): string {
  const safeId: string = draftId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
  return `ai-agent-${safeId}-${index}`;
}

/** @throws {Error} 图片暂存或读取失败，调用方不得返回成功媒体结果。 */
function ensureDirectory(path: string): void {
  if (!fs.accessSync(path)) {
    fs.mkdirSync(path);
  }
}

function silentlyDelete(path: string): void {
  try {
    if (fs.accessSync(path)) { fs.unlinkSync(path); }
  } catch (error) {
    // 保留原始下载或媒体错误。
  }
}

/** @throws {Error} 图片暂存或读取失败，调用方不得返回成功媒体结果。 */
function readImageFile(path: string): Uint8Array {
  if (!fs.accessSync(path)) {
    throw new WikimediaImageServiceError('download', '图片下载文件不存在');
  }
  const stat: fs.Stat = fs.statSync(path);
  if (stat.size <= 0) {
    throw new WikimediaImageServiceError('invalid_image', '图片下载结果为空');
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new WikimediaImageServiceError('image_too_large', '图片超过 8 MiB 限制');
  }
  const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
  try {
    const buffer: ArrayBuffer = new ArrayBuffer(stat.size);
    const bytesRead: number = fs.readSync(file.fd, buffer, { length: stat.size });
    if (bytesRead !== stat.size) {
      throw new WikimediaImageServiceError('download', '图片文件读取不完整');
    }
    const bytes: Uint8Array = new Uint8Array(buffer);
    if (extensionForBytes(bytes).length === 0) {
      throw new WikimediaImageServiceError('invalid_image', '下载内容不是受支持的图片');
    }
    return bytes;
  } finally {
    fs.closeSync(file);
  }
}

/** Wikimedia Commons 搜索与下载边界；不调用 Anki 写入服务。 */
export class WikimediaImageService {
  private sequence: number = 0;

  async search(query: string, limit: number): Promise<AgentImageCandidate[]> {
    const normalizedQuery: string = query.trim();
    const normalizedLimit: number = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(limit)));
    if (normalizedQuery.length === 0) {
      throw new WikimediaImageServiceError('invalid_query', '图片搜索关键词不能为空');
    }
    const url: string = `${COMMONS_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(normalizedQuery)}` +
      `&gsrnamespace=6&gsrlimit=${normalizedLimit}&prop=imageinfo%7Cinfo` +
      '&iiprop=url%7Cmime%7Csize%7Cextmetadata&iiurlwidth=1280&inprop=url&format=json&origin=*';
    const client: http.HttpRequest = http.createHttp();
    try {
      const response: http.HttpResponse = await client.request(url, {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.STRING,
        usingCache: false,
        connectTimeout: 15000,
        readTimeout: 30000
      });
      if (response.responseCode < 200 || response.responseCode >= 300 || typeof response.result !== 'string') {
        throw new WikimediaImageServiceError('search_http', `Wikimedia 搜索失败：${response.responseCode}`);
      }
      let parsed: RawWikimediaResponse;
      try {
        parsed = JSON.parse(response.result) as RawWikimediaResponse;
      } catch (error) {
        throw new WikimediaImageServiceError('search_parse', 'Wikimedia 搜索响应不是有效 JSON');
      }
      const pages: Record<string, RawWikimediaPage> = parsed.query?.pages ?? {};
      const candidates: AgentImageCandidate[] = [];
      for (const pageKey of Object.keys(pages)) {
        const page: RawWikimediaPage = pages[pageKey];
        const info: RawImageInfo | undefined = page.imageinfo === undefined ? undefined : page.imageinfo[0];
        if (info === undefined || typeof info.url !== 'string' || !allowedDownloadUrl(info.url)) { continue; }
        const sourceUrl: string = typeof page.canonicalurl === 'string' ? page.canonicalurl :
          `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`;
        if (!allowedSourceUrl(sourceUrl)) { continue; }
        const mime: string = typeof info.mime === 'string' ? info.mime.toLocaleLowerCase() : '';
        if (extensionForMime(mime).length === 0) { continue; }
        const metadata: Record<string, RawMetadataValue> | undefined = info.extmetadata;
        const downloadUrl: string = typeof info.thumburl === 'string' && allowedDownloadUrl(info.thumburl)
          ? info.thumburl : info.url;
        candidates.push({
          candidateId: `commons-${Date.now()}-${this.sequence++}`,
          title: page.title ?? 'Wikimedia Commons image',
          thumbnailUrl: downloadUrl,
          downloadUrl: downloadUrl,
          sourceUrl: sourceUrl,
          mime: mime,
          license: readMetadata(metadata, 'LicenseShortName'),
          credit: readMetadata(metadata, 'Credit') || readMetadata(metadata, 'Artist')
        });
        if (candidates.length >= normalizedLimit) { break; }
      }
      if (candidates.length === 0) {
        throw new WikimediaImageServiceError('no_candidates', '没有找到可下载的 Wikimedia 图片');
      }
      return candidates;
    } catch (error) {
      if (error instanceof WikimediaImageServiceError) { throw error; }
      throw new WikimediaImageServiceError('search_http', error instanceof Error ? error.message : `${error}`);
    } finally {
      client.destroy();
    }
  }

  /** @throws {Error} 下载目录或下载任务失败，调用方不得提交图片。 */
  async download(context: common.UIAbilityContext, candidate: AgentImageCandidate,
    draftId: string, index: number): Promise<Uint8Array> {
    if (!allowedDownloadUrl(candidate.downloadUrl) || extensionForMime(candidate.mime).length === 0) {
      throw new WikimediaImageServiceError('invalid_candidate', '图片候选下载地址或格式不可用');
    }
    const directory: string = `${context.cacheDir}/ai-agent-media`;
    ensureDirectory(directory);
    const baseName: string = safePartName(draftId, index);
    const partPath: string = `${directory}/${baseName}.part`;
    silentlyDelete(partPath);
    const config: request.agent.Config = {
      action: request.agent.Action.DOWNLOAD,
      url: candidate.downloadUrl,
      title: 'AI 卡片图片',
      description: candidate.title,
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
      throw new WikimediaImageServiceError('download', error instanceof Error ? error.message : `${error}`);
    }

    return new Promise<Uint8Array>((resolve: (value: Uint8Array) => void,
      reject: (reason: Error) => void): void => {
      let settled: boolean = false;
      let timeoutId: number = -1;
      const cleanListeners = (): void => {
        if (timeoutId !== -1) { clearTimeout(timeoutId); timeoutId = -1; }
        try { task.off('completed', completed); } catch (error) { /* ignore cleanup */ }
        try { task.off('failed', failed); } catch (error) { /* ignore cleanup */ }
        try { task.off('progress', progress); } catch (error) { /* ignore cleanup */ }
      };
      const removeTask = (): void => {
        try { request.agent.remove(task.tid).catch((): void => { /* ignore cleanup */ }); }
        catch (error) { /* ignore cleanup */ }
      };
      const fail = (code: WikimediaImageErrorCode, message: string): void => {
        if (settled) { return; }
        settled = true;
        cleanListeners();
        removeTask();
        silentlyDelete(partPath);
        // ArkTS Promise reject 接口只接受 Error；把内部错误码带入消息，外层仍会统一归类。
        reject(new Error(`${code}:${message}`));
      };
      const resetTimeout = (): void => {
        if (timeoutId !== -1) { clearTimeout(timeoutId); }
        timeoutId = setTimeout((): void => {
          fail('download_timeout', '图片下载长时间没有进度');
        }, DOWNLOAD_IDLE_TIMEOUT_MS);
      };
      const progress = (_value: request.agent.Progress): void => { resetTimeout(); };
      const completed = (_value: request.agent.Progress): void => {
        if (settled) { return; }
        try {
          const bytes: Uint8Array = readImageFile(partPath);
          settled = true;
          cleanListeners();
          removeTask();
          silentlyDelete(partPath);
          resolve(bytes);
        } catch (error) {
          if (error instanceof WikimediaImageServiceError) {
            fail(error.code, error.message);
          } else {
            fail('invalid_image', error instanceof Error ? error.message : `${error}`);
          }
        }
      };
      const failed = (value: request.agent.Progress): void => {
        fail('download', `图片下载失败：${value.state}`);
      };
      try {
        task.on('completed', completed);
        task.on('failed', failed);
        task.on('progress', progress);
        resetTimeout();
        task.start().catch((error: Error): void => {
          fail('download', error.message);
        });
      } catch (error) {
        fail('download', error instanceof Error ? error.message : `${error}`);
      }
    });
  }

  static extensionForBytes(bytes: Uint8Array): string { return extensionForBytes(bytes); }
}
