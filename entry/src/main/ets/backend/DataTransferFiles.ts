// SPDX-License-Identifier: AGPL-3.0-or-later
// 文件描述符与目录树 IO 的唯一适配；大文件复制不占用 UI 执行线程。
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { ImportOperation } from '../model/ImportOperation';
let transferFileId: number = 0;
function nextTransferFileId(): number { return ++transferFileId; }

/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 复制目录(源路径: string, 目标路径: string): Promise<void> {
  if (!await 路径存在(源路径)) {
    return;
  }
  await 确保目录存在(目标路径);
  for (const 条目 of await fs.listFile(源路径)) {
    const 源子项 = `${源路径}/${条目}`;
    const 目标子项 = `${目标路径}/${条目}`;
    if ((await fs.stat(源子项)).isDirectory()) {
      await 复制目录(源子项, 目标子项);
    } else {
      await 复制文件(源子项, 目标子项);
    }
  }
}

/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 删除目录(路径: string): Promise<void> {
  if (!await 路径存在(路径)) {
    return;
  }
  for (const 条目 of await fs.listFile(路径)) {
    const 子项 = `${路径}/${条目}`;
    if ((await fs.stat(子项)).isDirectory()) {
      await 删除目录(子项);
    } else {
      await fs.unlink(子项);
    }
  }
  await fs.rmdir(路径);
}

/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 确保目录存在(路径: string): Promise<void> {
  if (!await 路径存在(路径)) {
    await fs.mkdir(路径);
  }
}

export async function 路径存在(路径: string): Promise<boolean> {
  try {
    return await fs.access(路径);
  } catch (error) {
    if ((error as BusinessError).code === 13900002) return false;
    throw error;
  }
}

/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 复制文件(源路径: string, 目标路径: string): Promise<void> {
  await fs.copyFile(源路径, 目标路径);
}

/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 复制URI到沙箱(文件目录: string, URI: string, 扩展名: string,
  operation: ImportOperation | null = null): Promise<string> {
  const 导入目录: string = `${文件目录}/imports`;
  if (!await 路径存在(导入目录)) await fs.mkdir(导入目录);
  const 路径: string = `${导入目录}/import-${Date.now()}-${nextTransferFileId()}.${扩展名}`;
  try {
    await 按描述符复制文件(URI, 路径, operation);
    return 路径;
  } catch (error) {
    await 静默删除(路径);
    throw error;
  }
}

/**
 * Streams a sandbox path or a document-provider URI with descriptors. copyFileSync
 * cannot safely consume the temporary provider permissions returned by Harmony pickers.
 */
/** @throws {Error} 文件复制或清理失败，向迁移编排传播以停止替换并执行恢复。 */
export async function 按描述符复制文件(源URI或路径: string, 目标URI或路径: string,
  operation: ImportOperation | null = null): Promise<void> {
  operation?.check();
  const 源文件: fs.File = await fs.open(源URI或路径, fs.OpenMode.READ_ONLY);
  try {
    const total: number = operation === null ? 0 : (await fs.stat(源文件.fd)).size;
    let processed: number = 0;
    const 目标文件: fs.File = await fs.open(
      目标URI或路径, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      const 缓冲区: ArrayBuffer = new ArrayBuffer(64 * 1024);
      let 读取大小: number = await fs.read(源文件.fd, 缓冲区, { length: 缓冲区.byteLength });
      while (读取大小 > 0) {
        operation?.check();
        let 已写入总数: number = 0;
        while (已写入总数 < 读取大小) {
          // fileIo's offset is a file position, not an ArrayBuffer offset.
          const 剩余缓冲: ArrayBuffer = 缓冲区.slice(已写入总数, 读取大小);
          const 写入大小: number = await fs.write(
            目标文件.fd, 剩余缓冲, { length: 剩余缓冲.byteLength });
          if (写入大小 <= 0) {
            throw new Error('Unable to write transferred data.');
          }
          已写入总数 += 写入大小;
        }
        processed += 读取大小;
        operation?.progress('', processed, total);
        读取大小 = await fs.read(源文件.fd, 缓冲区, { length: 缓冲区.byteLength });
      }
      operation?.check();
    } finally {
      await fs.close(目标文件);
    }
  } finally {
    await fs.close(源文件);
  }
}

export async function 静默删除(路径: string): Promise<void> {
  try {
    await fs.unlink(路径);
  } catch (error) {
    // The transfer input/output is temporary; cleanup must not mask the primary result.
  }
}
