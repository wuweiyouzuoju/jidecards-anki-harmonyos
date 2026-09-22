// SPDX-License-Identifier: AGPL-3.0-or-later

export interface NoteFieldImage {
  id: number;
  fieldIndex: number;
  uri: string;
  filename: string;
}

function imageHtml(filename: string): string {
  const escaped: string = filename.replace(new RegExp('&', 'g'), '&amp;')
    .replace(new RegExp('"', 'g'), '&quot;')
    .replace(new RegExp('<', 'g'), '&lt;')
    .replace(new RegExp('>', 'g'), '&gt;');
  return `<img src="${escaped}">`;
}

/** 媒体先落库再引用；保留成功文件名，使后续失败重试不重复导入。 */
export async function prepareNoteImageFields(fields: string[], images: NoteFieldImage[],
  importImage: (uri: string) => Promise<string>): Promise<string[]> {
  const result: string[] = fields.slice();
  const pending: NoteFieldImage[] = images.slice();
  for (const attachment of pending) {
    if (!Number.isInteger(attachment.fieldIndex) || attachment.fieldIndex < 0
      || attachment.fieldIndex >= result.length) {
      throw new Error('Invalid image field');
    }
  }
  for (const attachment of pending) {
    if (attachment.filename === '') {
      const filename: string = await importImage(attachment.uri);
      if (filename === '') { throw new Error('Image import returned no filename'); }
      attachment.filename = filename;
    }
    const index: number = attachment.fieldIndex;
    result[index] += (result[index] === '' ? '' : '<br>') + imageHtml(attachment.filename);
  }
  return result;
}

/** 仅透传 Web 支持的常见图片；其他相册格式由平台解码后转为 PNG。 */
export function noteImageExtension(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) { return 'jpg'; }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E
    && bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A
    && bytes[6] === 0x1A && bytes[7] === 0x0A) { return 'png'; }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
    && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) { return 'gif'; }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46
    && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45
    && bytes[10] === 0x42 && bytes[11] === 0x50) { return 'webp'; }
  return '';
}
