// SPDX-License-Identifier: AGPL-3.0-or-later
import { noteMediaParts } from './NoteMediaParts';
export interface NoteFieldAudio {
  id: number;
  fieldIndex: number;
  uri: string;
  filename: string;
  label: string;
  temporary: boolean;
  reference?: string;
}

export interface NoteAudioPart {
  start: number;
  end: number;
  text: string;
  filename: string;
}

/** 保存原始位置和字节；改文字、移除某一次音频引用不改其他标记。 */
export function noteAudioParts(value: string): NoteAudioPart[] {
  const parts: NoteAudioPart[] = [];
  let offset: number = 0;
  for (const part of noteMediaParts(value)) {
    if (part.kind !== 'audio') continue;
    parts.push({ start: offset, end: part.start, text: value.slice(offset, part.start), filename: '' });
    parts.push({ start: part.start, end: part.end, text: part.text, filename: part.filename });
    offset = part.end;
  }
  parts.push({ start: offset, end: value.length, text: value.slice(offset), filename: '' });
  return parts;
}

export function replaceNoteAudioPart(value: string, index: number, replacement: string): string {
  const part: NoteAudioPart | undefined = noteAudioParts(value)[index];
  if (part === undefined) return value;
  return value.slice(0, part.start) + replacement + value.slice(part.end);
}

export function localNoteAudioPath(filesDir: string, filename: string): string {
  // Anki 媒体库是平面目录；远端地址、路径和控制字符不交给原生播放器。
  if (filename === '' || filename === '.' || filename === '..' ||
    new RegExp('[/\\\\:\\x00-\\x1f\\x7f]').test(filename)) throw new Error('Invalid audio filename');
  return `${filesDir}/collection.media/${filename}`;
}

export const MAX_NOTE_AUDIO_BYTES: number = 64 * 1024 * 1024;

/** 根据实际文件头识别格式，避免把 provider URI 当文件名或把任意文件标成 mp3。 */
export function noteAudioExtension(data: Uint8Array): string {
  const ascii: (start: number, text: string) => boolean = (start: number, text: string): boolean =>
    data.length >= start + text.length && text.split('').every((char: string, i: number): boolean =>
      data[start + i] === char.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
  if (ascii(0, 'OggS')) return 'ogg';
  if (ascii(0, 'fLaC')) return 'flac';
  if (ascii(4, 'ftyp')) return 'm4a';
  if (ascii(0, 'ID3')) return 'mp3';
  if (data.length >= 4 && data[0] === 0xff) {
    if ((data[1] & 0xf6) === 0xf0) return 'aac';
    if ((data[1] & 0xe0) === 0xe0 && (data[1] & 0x18) !== 0x08 && (data[1] & 0x06) !== 0) return 'mp3';
  }
  throw new Error('Unsupported audio format');
}

/** 与图片相同：先落媒体库，引用 Core 返回名称；失败重试复用成功项。 */
export async function prepareNoteAudioFields(fields: string[], audios: NoteFieldAudio[],
  importAudio: (uri: string) => Promise<string>): Promise<string[]> {
  const result: string[] = fields.slice();
  const pending: NoteFieldAudio[] = audios.slice();
  for (const item of pending) {
    if (!Number.isInteger(item.fieldIndex) || item.fieldIndex < 0 || item.fieldIndex >= result.length) {
      throw new Error('Invalid audio field');
    }
  }
  for (const item of pending) {
    if (item.reference !== undefined && result[item.fieldIndex].indexOf(item.reference) < 0) continue;
    if (item.filename === '') {
      const name: string = await importAudio(item.uri);
      if (name === '' || new RegExp('[\\]\\r\\n]').test(name)) throw new Error('Invalid audio import filename');
      item.filename = name;
    }
    const escaped: string = item.filename.replace(new RegExp('&', 'g'), '&amp;')
      .replace(new RegExp('<', 'g'), '&lt;').replace(new RegExp('>', 'g'), '&gt;');
    if (item.reference !== undefined) {
      result[item.fieldIndex] = result[item.fieldIndex].split(item.reference).join(`[sound:${escaped}]`);
    } else {
      result[item.fieldIndex] += `[sound:${escaped}]`;
    }
  }
  return result;
}
