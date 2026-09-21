// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 整库导出选项, 牌组导出选项 } from './数据传输模型';

export type 数据迁移模式 = 'exportDeck' | 'exportPersonalData' | 'importDeck' | 'importPersonalData';

export interface 导出牌组选项 {
  id: number;
  name: string;
}

export interface 导出牌组意图 {
  kind: 'exportDeck';
  deckId: number;
  options: 牌组导出选项;
}

export interface 导出个人数据意图 {
  kind: 'exportPersonalData';
  options: 整库导出选项;
}

export interface 导入牌组意图 {
  kind: 'importDeck';
}

export interface 替换个人数据意图 {
  kind: 'replacePersonalData';
  confirmed: true;
}

export type 数据迁移意图 = 导出牌组意图 | 导出个人数据意图 | 导入牌组意图 | 替换个人数据意图;

