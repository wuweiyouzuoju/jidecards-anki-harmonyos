// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议写入器 } from '../core/ProtoWriter';
export interface ExportSubset { mode: string; ids: number[]; }
/** Core ExportLimit 的 oneof：绝不把空 ID 集合编码成全库范围。 */
export function encodeExportSubset(value: ExportSubset): Uint8Array {
  if (!['notes', 'cards'].includes(value.mode) || !Array.isArray(value.ids) || value.ids.length === 0 ||
    value.ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0) ||
    new Set<number>(value.ids).size !== value.ids.length) throw new Error('invalid_export_subset');
  const writer = new 协议写入器();
  const ids = new 协议写入器();
  ids.写入打包64位整数(1, value.ids);
  writer.写入子消息(value.mode === 'notes' ? 3 : 4, ids);
  return writer.转为字节();
}
