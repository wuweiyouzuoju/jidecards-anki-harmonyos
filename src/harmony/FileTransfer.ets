// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { FileTransferObserver, transferExportName } from '../core/FileTransfer';

/** 源自闪卡 DataTransferFiles：异步描述符复制，处理 provider URI、短读与短写。 */
/** @throws {Error} 文件大小、读取、写入、刷盘或取消失败交给产品处理。 */
export async function copyTransferFile(source: string, destination: string,
  maxBytes: number = Number.MAX_SAFE_INTEGER, observer: FileTransferObserver | null = null): Promise<void> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid transfer size limit');
  observer?.check();
  const input = await fs.open(source, fs.OpenMode.READ_ONLY);
  try {
    const total = (await fs.stat(input.fd)).size;
    if (!Number.isSafeInteger(total) || total < 0 || total > maxBytes) throw new Error('文件超过允许大小');
    const output = await fs.open(destination, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      let processed = 0;
      const buffer = new ArrayBuffer(64 * 1024);
      while (processed < total) {
        observer?.check();
        const count = await fs.read(input.fd, buffer, { length: Math.min(buffer.byteLength, total - processed) });
        if (count <= 0) throw new Error('文件读取未完成');
        let written = 0;
        while (written < count) {
          observer?.check();
          // fileIo offset 是文件位置，不能用作 ArrayBuffer 偏移。
          const remaining = buffer.slice(written, count);
          const size = await fs.write(output.fd, remaining, { length: remaining.byteLength });
          if (size <= 0) throw new Error('文件写入未完成');
          written += size;
        }
        processed += count; observer?.progress(processed, total);
      }
      observer?.check();
      await fs.fsync(output.fd);
    } finally { await fs.close(output); }
  } finally { await fs.close(input); }
}

/** 取消返回 null；平台错误上抛。过滤项只是选择辅助，产品仍须校验文件内容。 */
/** @throws {Error} 选择器失败上抛，只有用户取消返回 null。 */
export async function selectTransferFile(context: common.UIAbilityContext, suffixes: string[]): Promise<string | null> {
  const options = new picker.DocumentSelectOptions();
  options.maxSelectNumber = 1; options.fileSuffixFilters = suffixes;
  const uris = await new picker.DocumentViewPicker(context).select(options);
  return uris.length > 0 ? uris[0] : null;
}

/** 暂存文件由产品拥有者在 finally 释放，保存取消和失败均不擅自删除源文件。 */
/** @throws {Error} 选择器或复制失败上抛，不报告保存成功。 */
export async function saveTransferFile(context: common.UIAbilityContext, source: string, name: string,
  extension: string, maxBytes: number = Number.MAX_SAFE_INTEGER,
  observer: FileTransferObserver | null = null): Promise<string | null> {
  const options = new picker.DocumentSaveOptions();
  options.newFileNames = [transferExportName(name, extension)]; options.fileSuffixChoices = [extension];
  const uris = await new picker.DocumentViewPicker(context).save(options);
  if (!uris.length) return null;
  await copyTransferFile(source, uris[0], maxBytes, observer);
  return uris[0];
}
