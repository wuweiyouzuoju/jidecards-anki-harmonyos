// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';

/** 解码器与文件由这里释放；返回的 PixelMap 所有权交给调用组件。
 * @throws {Error} 解码或清理失败交由组件报告，不留下未转移的图片。
 */
export async function loadDeckBackground(path: string): Promise<PixelMap> {
  let pixels: PixelMap | null = null;
  try {
    const file: fileIo.File = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    try {
      const source: image.ImageSource = image.createImageSource(file.fd);
      try { pixels = await source.createPixelMap(); }
      finally { await source.release(); }
    } finally { await fileIo.close(file); }
    return pixels;
  } catch (error) {
    releaseDeckBackground(pixels);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/** 清理失败只记录，不覆盖原操作结果；调用者必须先解除渲染及写入引用。 */
export function releaseDeckBackground(pixels: PixelMap | null): void {
  if (pixels === null) return;
  pixels.release().catch((error: Error): void => {
    console.warn('[deck-background] PixelMap release failed: ' + error.message);
  });
}
