// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 集合方法 } from './服务索引';
import { 协议读取器 } from '../proto/core/ProtoReader';
import { ImportOperation, ImportCancelled } from '../model/ImportOperation';
import { 后端错误 } from './错误类型';

export function importProgressText(bytes: Uint8Array): string {
  const reader = new 协议读取器(bytes);
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 7) return reader.读取字符串();
    reader.跳过字段(tag.线类型);
  }
  return '';
}

/** A recursive timer permits at most one status query. Stop and drain before releasing ownership. */
export async function withImportProgress<T>(operation: ImportOperation | null,
  run: () => Promise<T>): Promise<T> {
  if (operation === null) return await run();
  operation.check();
  operation.progress('');
  let active: boolean = true;
  let timer: number = -1;
  let polling: Promise<void> = Promise.resolve();
  const poll = async (): Promise<void> => {
    try {
      if (operation.cancelled) await 后端会话.获取实例().调用进度控制(集合方法.设置中止请求);
      if (active) {
        const bytes = await 后端会话.获取实例().调用进度控制(集合方法.最新进度);
        if (active) operation.progress(importProgressText(bytes));
      }
    } catch (_error) {
      // Status failure cannot change the outcome of the import; the next tick retries cancellation.
    } finally {
      if (active) timer = setTimeout((): void => { polling = poll(); }, 150);
    }
  };
  timer = setTimeout((): void => { polling = poll(); }, 150);
  try {
    return await run();
  } catch (error) {
    if (error instanceof 后端错误 && error.kind === 2) throw new ImportCancelled();
    throw error;
  } finally {
    active = false;
    if (timer >= 0) clearTimeout(timer);
    await polling;
  }
}
