// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs, fileUri } from '@kit.CoreFileKit';
import { readNoteImageData, NoteImageData } from './NoteImageImport';
import { 媒体服务 } from './媒体服务';
import { MAX_NOTE_VIDEO_BYTES, noteVideoExtension } from '../model/NoteVideoMedia';

/** @throws {Error} provider 短读必须读满；失败保留表单草稿，不提交不完整媒体。 */
async function readBytes(file: fs.File, size: number): Promise<Uint8Array> {
  const data: Uint8Array = new Uint8Array(size);
  let offset: number = 0;
  while (offset < size) {
    const chunk: ArrayBuffer = new ArrayBuffer(Math.min(64 * 1024, size - offset));
    const length: number = await fs.read(file.fd, chunk, { length: chunk.byteLength });
    if (length <= 0) throw new Error('Incomplete visual media');
    data.set(new Uint8Array(chunk, 0, length), offset);
    offset += length;
  }
  return data;
}

/** @throws {Error} 选择器中只探测文件头，视频大小在分配完整缓冲前检查。 */
export async function noteVisualKind(uri: string): Promise<string> {
  const file: fs.File = await fs.open(uri, fs.OpenMode.READ_ONLY);
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size <= 0) throw new Error('Empty visual media');
    const header: Uint8Array = await readBytes(file, Math.min(size, 4096));
    if (noteVideoExtension(header) === '') return 'image';
    if (size > MAX_NOTE_VIDEO_BYTES) throw new Error('note_video_too_large');
    return 'video';
  } finally { await fs.close(file); }
}

/** @throws {Error} 图片保留原解码转换路径；视频按原容器保存，不转码。 */
export async function readNoteVisualData(uri: string, kind: string = 'image'): Promise<NoteImageData> {
  if (kind !== 'video') return readNoteImageData(uri);
  const file: fs.File = await fs.open(uri, fs.OpenMode.READ_ONLY);
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size <= 0 || size > MAX_NOTE_VIDEO_BYTES) throw new Error('note_video_too_large');
    const data: Uint8Array = await readBytes(file, size);
    const extension: string = noteVideoExtension(data);
    if (extension === '') throw new Error('note_video_format_unsupported');
    return { data: data, extension: extension };
  } finally { await fs.close(file); }
}

/** @throws {Error} 必须引用 Core 返回名，继承现有同步、去重和导出。 */
export async function importNoteVisual(uri: string, kind: string = 'image'): Promise<string> {
  const item: NoteImageData = await readNoteVisualData(uri, kind);
  return new 媒体服务().添加媒体文件(`note-${kind}.${item.extension}`, item.data);
}

export interface NoteVideoPreviewFile { source: string; path: string; }

/** @throws {Error} 相册 provider 复制到组件独占缓存；原图库和共享媒体库不由预览删除。 */
export async function prepareNoteVideoPreview(source: string, cacheDir: string): Promise<NoteVideoPreviewFile> {
  if (new RegExp('^https?://', 'i').test(source)) return { source: source, path: '' };
  if (source.startsWith('file:///')) return { source: fileUri.getUriFromPath(decodeURIComponent(source.slice(7))), path: '' };
  const file: fs.File = await fs.open(source, fs.OpenMode.READ_ONLY);
  const path: string = `${cacheDir}/note-video-preview-${Date.now()}-${Math.floor(Math.random() * 1000000)}.mp4`;
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size <= 0 || size > MAX_NOTE_VIDEO_BYTES) throw new Error('note_video_too_large');
    await fs.copyFile(file.fd, path);
    return { source: fileUri.getUriFromPath(path), path: path };
  } catch (error) {
    try { await fs.unlink(path); } catch (cleanupError) { /* 原始读取错误仍交 UI 展示。 */ }
    throw error as Error;
  } finally { await fs.close(file); }
}

/** @throws {Error} 仅释放本组件创建的缓存。 */
export async function releaseNoteVideoPreview(file: NoteVideoPreviewFile): Promise<void> {
  if (file.path !== '') await fs.unlink(file.path);
}
