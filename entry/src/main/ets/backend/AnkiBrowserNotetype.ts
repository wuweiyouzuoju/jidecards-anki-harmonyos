// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BrowserNotetypeBackend } from '../model/browser/BrowserNotetypeSession';
import type { NotetypeNameId, 变更笔记类型信息 } from '../proto/messages/NotetypeMessages';
import { 卡片服务 } from './卡片服务';
import { 笔记服务 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';

export class AnkiBrowserNotetype implements BrowserNotetypeBackend {
  async noteForCard(id: number): Promise<number> { return (await new 卡片服务().获取卡片(id)).noteId; }
  async notetypeForNote(id: number): Promise<number> { return (await new 笔记服务().获取笔记(id)).notetypeId; }
  names(): Promise<NotetypeNameId[]> { return new 笔记类型服务().获取笔记类型名列表(); }
  mapping(oldId: number, newId: number): Promise<变更笔记类型信息> {
    return new 笔记类型服务().获取变更笔记类型信息(oldId, newId);
  }
}
