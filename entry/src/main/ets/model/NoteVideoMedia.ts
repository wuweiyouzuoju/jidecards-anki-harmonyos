// SPDX-License-Identifier: AGPL-3.0-or-later
export const MAX_NOTE_VIDEO_BYTES: number = 64 * 1024 * 1024;
export const NOTE_VIDEO_IMPORT_FORMATS: string[] = ['mp4', 'mov', 'webm'];

/** 与卡片渲染共用：Anki 音视频都使用 sound 引用，编辑器按扩展名分流。 */
export function isNoteVideoFilename(filename: string): boolean {
  return new RegExp('\\.(mp4|webm|mov|m4v|ogv)$', 'i').test(filename);
}

/** 按容器头识别，不能把 HEIC/AVIF 图片或 m4a 音频误写为 MP4。 */
export function noteVideoExtension(data: Uint8Array): string {
  const ascii = (offset: number, value: string): boolean => data.length >= offset + value.length &&
    value.split('').every((char: string, index: number): boolean => data[offset + index] === char.charCodeAt(0));
  if (ascii(4, 'ftyp')) {
    if (ascii(8, 'qt  ')) return 'mov';
    const brands: string[] = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VH', 'M4VP'];
    if (brands.some((brand: string): boolean => ascii(8, brand))) return 'mp4';
  }
  if (data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
    // EBML 的 DocType 元素，避免把 Matroska 文件按 WebM 导入。
    for (let index: number = 4; index + 7 <= data.length; index++) {
      if (data[index] === 0x42 && data[index + 1] === 0x82 && data[index + 2] === 0x84 && ascii(index + 3, 'webm')) return 'webm';
    }
  }
  return '';
}

export function noteVideoHtml(filename: string): string {
  if (filename === '' || new RegExp('[\\]\\r\\n]').test(filename)) throw new Error('Invalid video filename');
  return `[sound:${filename.replace(new RegExp('&', 'g'), '&amp;')
    .replace(new RegExp('<', 'g'), '&lt;').replace(new RegExp('>', 'g'), '&gt;')}]`;
}
