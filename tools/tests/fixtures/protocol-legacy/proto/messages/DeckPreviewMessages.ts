// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔, 线类型_变长整数 } from '../core/ProtoWriter';
import { DeckPreviewScope } from '../../model/DeckPreviewSession';

// Application-local service; locked Anki RPC IDs remain unchanged.
export const DECK_PREVIEW_SERVICE: number = 1001;

export function encodeDeckPreviewRequest(deckId: string, scope: DeckPreviewScope): Uint8Array {
  const id: number = Number(deckId);
  if (!/^[1-9]\d*$/.test(deckId) || !Number.isSafeInteger(id) || scope < 0 || scope > 3 || !Number.isInteger(scope)) {
    throw new Error('Invalid deck preview request');
  }
  const writer: 协议写入器 = new 协议写入器();
  writer.写入64位整数(1, id);
  writer.写入变长整数(2, scope);
  return writer.转为字节();
}

export function decodeDeckPreviewIds(bytes: Uint8Array): number[] {
  const reader: 协议读取器 = new 协议读取器(bytes);
  const ids: number[] = [];
  while (!reader.已读完) {
    const tag = reader.读取标签();
    if (tag === null) break;
    if (tag.字段号 === 1 && tag.线类型 === 线类型_长度分隔) {
      const packed: number[] = reader.读取打包64位整数();
      for (const id of packed) ids.push(id);
    } else if (tag.字段号 === 1 && tag.线类型 === 线类型_变长整数) {
      ids.push(reader.读取64位整数());
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return ids;
}
