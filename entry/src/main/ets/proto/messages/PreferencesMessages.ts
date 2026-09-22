// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议写入器 } from '../core/ProtoWriter';

export function encodeCreateBackup(folder: string, force: boolean): Uint8Array {
  const writer = new 协议写入器();
  if (folder !== '') writer.写入字符串(1, folder);
  if (force) writer.写入布尔(2, true);
  writer.写入布尔(3, true);
  return writer.转为字节();
}
