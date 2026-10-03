// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 整库导出选项, 牌组导出选项 } from './数据传输模型';
import type { ImportAnkiPackageOptions } from '../proto/messages/ImportExportMessages';
import type { CsvMetadata } from '../proto/messages/CsvImportMessages';
import type { TextExportOptions } from '../proto/messages/TextExportMessages';

export type 数据迁移模式 = 'exportDeck' | 'exportPersonalData' | 'importDeck' | 'importPersonalData' | 'importText' | 'importFile';

export interface ExportTextIntent { kind: 'exportText'; deckId: number; options: TextExportOptions; }

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
  options?: ImportAnkiPackageOptions;
}

export interface ImportTextIntent { kind: 'importText'; metadata?: CsvMetadata; }
export interface ChooseImportIntent { kind: 'chooseImportFile'; }

export interface 替换个人数据意图 {
  kind: 'replacePersonalData';
  confirmed: true;
}

export type 数据迁移意图 = 导出牌组意图 | 导出个人数据意图 | 导入牌组意图 | 替换个人数据意图 | ImportTextIntent | ChooseImportIntent | ExportTextIntent;

