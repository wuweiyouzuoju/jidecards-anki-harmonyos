// SPDX-License-Identifier: AGPL-3.0-or-later
import { 标准笔记类型种类 } from '../proto/messages/NotetypeMessages';
/** 沿用已支持的 Core 标准类型译名，初始化和字段展示共用同一目录。 */
export class NoteTypeCatalog {
  static readonly 图片遮盖笔记类型名集合: string[] = ['Image Occlusion', '图片遮盖', '影像遮擋'];
  static readonly 填空笔记类型名集合: string[] = ['Cloze', '填空题'];
  static readonly Basic笔记类型名集合: string[] = ['Basic', '问答题'];
  static readonly Basic反转笔记类型名集合: string[] = ['Basic (and reversed card)', '问答题（附翻转卡片）'];
  static readonly Basic可选反转笔记类型名集合: string[] = ['Basic (optional reversed card)', '问答题（可选附翻转卡片）'];
  static readonly Basic输入答案笔记类型名集合: string[] = ['Basic (type in the answer)', '问答题（输入答案）'];
  static readonly Header字段名集合: string[] = ['Header', '标题'];
  static readonly BackExtra字段名集合: string[] = ['Back Extra', '背面额外'];
  static readonly TextField名集合: string[] = ['Text', '文字'];

}
export interface StockNoteType { kind: number; names: string[]; }
export function standardNoteTypes(): StockNoteType[] {
  return [
    { kind: 标准笔记类型种类.BASIC, names: NoteTypeCatalog.Basic笔记类型名集合 },
    { kind: 标准笔记类型种类.CLOZE, names: NoteTypeCatalog.填空笔记类型名集合 },
    { kind: 标准笔记类型种类.BASIC_AND_REVERSED, names: NoteTypeCatalog.Basic反转笔记类型名集合 },
    { kind: 标准笔记类型种类.BASIC_OPTIONAL_REVERSED, names: NoteTypeCatalog.Basic可选反转笔记类型名集合 },
    { kind: 标准笔记类型种类.BASIC_TYPING, names: NoteTypeCatalog.Basic输入答案笔记类型名集合 }
  ];
}
