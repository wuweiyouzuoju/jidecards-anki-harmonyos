// SPDX-License-Identifier: AGPL-3.0-or-later
import { 比对答案 } from './拼写比对器';
import { 提取拼写填空内容 } from './填空解析器';
import { 注入拼写结果, 剥除拼写标记 } from './学习卡片HTML构建器';
import type { EditableNote } from '../proto/messages/NoteMessages';
export interface StudyAnswerNotetype { fieldNames: string[]; }
export interface StudyAnswerBackend {
  note(id: number): Promise<EditableNote>;
  notetype(id: number): Promise<StudyAnswerNotetype>;
}
export interface StudyAnswerRequest {
  noteId: number;
  fieldName: string;
  cloze: boolean;
  ordinal: number;
  input: string;
  combining: boolean;
}
/** 调用者提供翻面时的快照；读取失败仍展示原答案，异步结果是否可见由会话代次决定。 */
export async function renderStudyAnswer(answerHtml: string, request: StudyAnswerRequest | null,
  backend: StudyAnswerBackend): Promise<string> {
  if (request === null) return 剥除拼写标记(answerHtml);
    try {
      const note = await backend.note(request.noteId);
      const notetype = await backend.notetype(note.notetypeId);
      const fieldIdx = notetype.fieldNames.indexOf(request.fieldName);
      const fieldValue = fieldIdx >= 0 && fieldIdx < note.fields.length ? note.fields[fieldIdx] : '';
      // Cloze 卡：从字段值中提取当前 cardOrd 的预期答案；无匹配则降级为剥除标记。
      let expected: string;
      if (request.cloze) {
        expected = 提取拼写填空内容(fieldValue, request.ordinal + 1);
        if (expected === '') {
          return 剥除拼写标记(answerHtml);
        }
      } else {
        expected = fieldValue;
      }
      const resultHtml = 比对答案(expected, request.input, request.combining);
      // 注入比对结果；若 answerHtml 不含 [[type:...]] 占位符（标记仅在 questionNodes），
      // 在末尾追加 <hr> + 比对结果，与 Anki 桌面端行为一致。
      const injected = 注入拼写结果(answerHtml, resultHtml);
      if (injected === answerHtml) {
        return `${answerHtml}<hr><code id=typeans>${resultHtml}</code>`;
      }
      return injected;
    } catch (error) {
      return 剥除拼写标记(answerHtml);
    }
}
