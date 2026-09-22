// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { 媒体服务 } from './媒体服务';
import { noteImageExtension } from '../model/NoteImageDraft';

/** @throws {Error} 图片读取、转换或媒体提交失败，调用方保留编辑草稿并显示错误。 */
export async function importNoteImage(uri: string): Promise<string> {
  const file: fs.File = await fs.open(uri, fs.OpenMode.READ_ONLY);
  let source: image.ImageSource | null = null;
  let packer: image.ImagePacker | null = null;
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size <= 0) { throw new Error('Empty image'); }
    const buffer: ArrayBuffer = new ArrayBuffer(size);
    let data: Uint8Array = new Uint8Array(buffer);
    let offset: number = 0;
    // provider 允许短读，只有读满实际文件长度才提交给媒体库。
    while (offset < size) {
      const chunk: ArrayBuffer = new ArrayBuffer(Math.min(64 * 1024, size - offset));
      const length: number = await fs.read(file.fd, chunk, { length: chunk.byteLength });
      if (length <= 0) { throw new Error('Incomplete image'); }
      data.set(new Uint8Array(chunk, 0, length), offset);
      offset += length;
    }
    let extension: string = noteImageExtension(data);
    if (extension === '') {
      source = image.createImageSource(buffer);
      packer = image.createImagePacker();
      const options: image.PackingOption = { format: 'image/png', quality: 100 };
      data = new Uint8Array(await packer.packToData(source, options));
      extension = 'png';
    }
    return await new 媒体服务().添加媒体文件(`note-image.${extension}`, data);
  } finally {
    try {
      if (packer !== null) { await packer.release(); }
    } finally {
      try {
        if (source !== null) { await source.release(); }
      } finally {
        await fs.close(file);
      }
    }
  }
}
