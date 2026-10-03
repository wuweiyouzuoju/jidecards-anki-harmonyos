// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export const NOTE_DUPLICATE_SERVICE: number = 1002;
export const NOTE_DUPLICATE_BATCH_SIZE: number = 200;
export interface DuplicateField {
  noteId: number;
  value: string;
}

export function encodeDuplicateFields(ids: number[], notetypeId: number, fieldOrd: number): Uint8Array {
  if (ids.length === 0 || ids.length > NOTE_DUPLICATE_BATCH_SIZE || new Set<number>(ids).size !== ids.length ||
    !Number.isSafeInteger(notetypeId) || notetypeId <= 0 || !Number.isInteger(fieldOrd) || fieldOrd < 0 ||
    fieldOrd > 0xffffffff || ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Invalid duplicate field batch');
  }
  const writer = new 协议写入器();
  for (const id of ids) writer.写入64位整数(1, id);
  writer.写入64位整数(2, notetypeId);
  writer.写入变长整数(3, fieldOrd);
  return writer.转为字节();
}

export function decodeDuplicateFields(bytes: Uint8Array): DuplicateField[] {
  const reader = new 协议读取器(bytes);
  const fields: DuplicateField[] = [];
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 !== 1) { reader.跳过字段(tag.线类型); continue; }
    const item = new 协议读取器(reader.读取字节());
    const field: DuplicateField = { noteId: 0, value: '' };
    let inner;
    while ((inner = item.读取标签()) !== null) {
      if (inner.字段号 === 1) field.noteId = item.读取64位整数();
      else if (inner.字段号 === 2) field.value = item.读取字符串();
      else item.跳过字段(inner.线类型);
    }
    fields.push(field);
  }
  return fields;
}
