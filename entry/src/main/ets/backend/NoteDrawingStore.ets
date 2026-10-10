// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs, fileUri } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { NoteDrawingDocument, DrawingFile, DRAWING_MAX_BYTES, emptyNoteDrawing, validateNoteDrawing,
  drawingMetadata, embedDrawingMetadata, validDrawingFileName } from '../model/NoteDrawing';
import { NoteFieldImage } from '../model/NoteImageDraft';
import { UTF8编码, UTF8解码 } from '../proto/core/utf8';

const base64: util.Base64Helper = new util.Base64Helper();

/** @throws {Error} 私有编辑器边界显示错误；短读与超限均不生成草稿。 */
async function readDrawingBytes(path: string): Promise<Uint8Array> {
  const file: fs.File = await fs.open(path, fs.OpenMode.READ_ONLY);
  try {
    const size: number = (await fs.stat(file.fd)).size;
    if (size < 0 || size > DRAWING_MAX_BYTES * 2) throw new Error('Drawing file is too large');
    const result: Uint8Array = new Uint8Array(size);
    let offset: number = 0;
    while (offset < size) {
      const chunk: ArrayBuffer = new ArrayBuffer(Math.min(65536, size - offset));
      const length: number = await fs.read(file.fd, chunk, { length: chunk.byteLength });
      if (length <= 0) throw new Error('Incomplete drawing');
      result.set(new Uint8Array(chunk, 0, length), offset); offset += length;
    }
    return result;
  } finally { await fs.close(file); }
}

/** @throws {Error} 调用方在写入失败时保留原图和编辑草稿。 */
async function writeDrawingBytes(path: string, bytes: Uint8Array): Promise<void> {
  const file: fs.File = await fs.open(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
  try {
    let offset: number = 0;
    while (offset < bytes.length) {
      const chunk: ArrayBuffer = bytes.slice(offset).buffer as ArrayBuffer;
      const written: number = await fs.write(file.fd, chunk);
      if (written <= 0) throw new Error('Incomplete drawing write');
      offset += written;
    }
  } finally { await fs.close(file); }
}

/** @throws {Error} PNG 源损坏须报错，不把合成图静默当作可编辑原图。 */
export async function loadNoteDrawing(uri: string, editable: boolean = true): Promise<NoteDrawingDocument> {
  if (uri === '') return emptyNoteDrawing();
  const bytes: Uint8Array = await readDrawingBytes(uri);
  const metadata: Uint8Array | null = drawingMetadata(bytes);
  if (editable && metadata !== null) {
    const document: NoteDrawingDocument = JSON.parse(UTF8解码(metadata)) as NoteDrawingDocument;
    validateNoteDrawing(document); return document;
  }
  const source: image.ImageSource = image.createImageSource(bytes.buffer as ArrayBuffer);
  try {
    const info: image.ImageInfo = await source.getImageInfo();
    const ratio: number = Math.min(1, 2048 / Math.max(info.size.width, info.size.height));
    const document: NoteDrawingDocument = emptyNoteDrawing(Math.max(64, Math.round(info.size.width * ratio)),
      Math.max(64, Math.round(info.size.height * ratio)));
    const pixels: image.PixelMap = await source.createPixelMap({ desiredSize: { width: document.width, height: document.height } });
    try { document.base = base64.encodeToStringSync(await packDrawingImage(pixels)); }
    finally { await pixels.release(); }
    return document;
  } finally { await source.release(); }
}

/** @throws {Error} 编辑器负责生命周期与最终错误展示。 */
export async function drawingBaseImage(document: NoteDrawingDocument): Promise<image.PixelMap | null> {
  if (document.base === '') return null;
  const source: image.ImageSource = image.createImageSource(base64.decodeSync(document.base).buffer as ArrayBuffer);
  try { return await source.createPixelMap({ desiredSize: { width: document.width, height: document.height } }); }
  finally { await source.release(); }
}

/** @throws {Error} 调用方必须释放输入 PixelMap。 */
export async function packDrawingImage(pixels: image.PixelMap): Promise<Uint8Array> {
  const packer: image.ImagePacker = image.createImagePacker();
  try { return new Uint8Array(await packer.packToData(pixels, { format: 'image/png', quality: 100 })); }
  finally { await packer.release(); }
}

/** @throws {Error} 仅创建本次编辑器独占目录。 */
export async function createDrawingWorkspace(cacheDir: string): Promise<string> {
  const root: string = `${cacheDir}/note-drawing-work-${Date.now()}-${Math.floor(Math.random() * 1000000000)}`;
  await fs.mkdir(root); return root;
}

/** @throws {Error} 所有路径经模型校验，不能从嵌入图片逃逸到其他沙箱文件。 */
export async function restoreDrawingInk(root: string, files: DrawingFile[]): Promise<void> {
  for (const file of files) {
    if (!validDrawingFileName(file.name)) throw new Error('Invalid ink path');
    const path: string = `${root}/${file.name}`;
    const parent: string = path.slice(0, path.lastIndexOf('/'));
    if (!await fs.access(parent)) await fs.mkdir(parent, true);
    await writeDrawingBytes(path, base64.decodeSync(file.data));
  }
}

/** @throws {Error} SDK save 的公开路径可为文件或目录，保留其不透明内容。 */
export async function snapshotDrawingInk(root: string): Promise<DrawingFile[]> {
  const path: string = `${root}/ink`;
  const stat: fs.Stat = await fs.stat(path);
  const names: string[] = stat.isDirectory() ? (await fs.listFile(path, { recursion: true }))
    .map((name: string): string => 'ink/' + (name.startsWith('/') ? name.slice(1) : name)) : ['ink'];
  if (names.length > 128) throw new Error('Too many ink files');
  const files: DrawingFile[] = [];
  let total: number = 0;
  for (const name of names) {
    if (!validDrawingFileName(name)) throw new Error('Invalid saved ink path');
    if ((await fs.stat(`${root}/${name}`)).isDirectory()) continue;
    const bytes: Uint8Array = await readDrawingBytes(`${root}/${name}`);
    total += bytes.length;
    if (total > DRAWING_MAX_BYTES) throw new Error('Ink is too large');
    files.push({ name: name, data: base64.encodeToStringSync(bytes) });
  }
  return files;
}

/** @throws {Error} 只写独立缓存，确认笔记时沿原媒体入口导入 Core。 */
export async function saveNoteDrawing(cacheDir: string, pixels: image.PixelMap,
  document: NoteDrawingDocument): Promise<string> {
  validateNoteDrawing(document);
  const bytes: Uint8Array = embedDrawingMetadata(await packDrawingImage(pixels), UTF8编码(JSON.stringify(document)));
  if (bytes.length > DRAWING_MAX_BYTES * 2) throw new Error('Drawing file is too large');
  const path: string = `${cacheDir}/note-drawing-image-${Date.now()}-${Math.floor(Math.random() * 1000000000)}.png`;
  try { await writeDrawingBytes(path, bytes); }
  catch (error) { await removeDrawingPath(path, cacheDir, false); throw error as Error; }
  return fileUri.getUriFromPath(path);
}

async function removeDrawingPath(path: string, cacheDir: string, directory: boolean): Promise<void> {
  const prefix: string = cacheDir + (directory ? '/note-drawing-work-' : '/note-drawing-image-');
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/') || path.includes('..')) return;
  try { if (directory) await fs.rmdir(path); else await fs.unlink(path); }
  catch (error) { console.warn(`Drawing cache cleanup failed: ${error}`); }
}
export async function disposeDrawingWorkspace(root: string, cacheDir: string): Promise<void> {
  await removeDrawingPath(root, cacheDir, true);
}
export async function discardNoteDrawingImages(images: NoteFieldImage[], cacheDir: string): Promise<void> {
  for (const item of images) {
    if (!item.uri.startsWith('file://')) continue;
    try { await removeDrawingPath(new fileUri.FileUri(item.uri).path, cacheDir, false); }
    catch (error) { console.warn(`Drawing URI cleanup failed: ${error}`); }
  }
}
