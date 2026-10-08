// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { 媒体服务 } from './媒体服务';
import { MAX_NOTE_AUDIO_BYTES, noteAudioExtension } from '../model/NoteAudioDraft';

/** @throws {Error} 文件读取、格式校验或 Core 写入失败由编辑表单展示，保留草稿。 */
async function readNoteAudio(uri: string): Promise<Uint8Array> {
  const file: fs.File = await fs.open(uri, fs.OpenMode.READ_ONLY);
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size <= 0 || size > MAX_NOTE_AUDIO_BYTES) throw new Error('Invalid audio size');
    const data: Uint8Array = new Uint8Array(size);
    let offset: number = 0;
    while (offset < size) {
      const chunk: ArrayBuffer = new ArrayBuffer(Math.min(64 * 1024, size - offset));
      const length: number = await fs.read(file.fd, chunk, { length: chunk.byteLength });
      if (length <= 0) throw new Error('Incomplete audio');
      data.set(new Uint8Array(chunk, 0, length), offset);
      offset += length;
    }
    noteAudioExtension(data);
    return data;
  } finally { await fs.close(file); }
}

/** @throws {Error} 保存操作的媒体导入边界。 */
export async function importNoteAudio(uri: string): Promise<string> {
  const data: Uint8Array = await readNoteAudio(uri);
  return await new 媒体服务().添加媒体文件(`note-audio.${noteAudioExtension(data)}`, data);
}

/** 选择器 URI 的授权和读取在选择期间完成；缓存副本供试听及失败重试。
 * @throws {Error} 选择无效文件不加入草稿。
 */
export async function stageNoteAudio(uri: string, cacheDir: string): Promise<string> {
  const data: Uint8Array = await readNoteAudio(uri);
  const path: string = `${cacheDir}/note-audio-${Date.now()}-${Math.floor(Math.random() * 1000000)}.${noteAudioExtension(data)}`;
  const file: fs.File = await fs.open(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
  try {
    let offset: number = 0;
    while (offset < data.length) {
      const end: number = Math.min(offset + 64 * 1024, data.length);
      const chunk: ArrayBuffer = new ArrayBuffer(end - offset);
      new Uint8Array(chunk).set(data.subarray(offset, end));
      const length: number = await fs.write(file.fd, chunk, { length: chunk.byteLength });
      if (length <= 0) throw new Error('Incomplete audio copy');
      offset += length;
    }
  } catch (error) {
    try { await fs.unlink(path); } catch (cleanupError) { /* 原始写入错误交由 UI 展示。 */ }
    throw error as Error;
  } finally { await fs.close(file); }
  return path;
}
