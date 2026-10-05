// SPDX-License-Identifier: AGPL-3.0-or-later
import { 注入拼写结果, 剥除拼写标记, 提取拼写标记 } from './学习卡片HTML构建器';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { Card } from '../proto/messages/CardsMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';
export interface StudyAnswerNotetype { fieldNames: string[]; }
export interface StudyAnswerBackend {
  note(id: number): Promise<EditableNote>;
  notetype(id: number): Promise<StudyAnswerNotetype>;
  compareAnswer(expected: string, provided: string, combining: boolean): Promise<string>;
  extractClozeForTyping(text: string, ordinal: number): Promise<string>;
}
export interface StudyAnswerRequest {
  noteId: number;
  fieldName: string;
  cloze: boolean;
  ordinal: number;
  input: string;
  combining: boolean;
}
export interface PreviewAnswerBackend extends StudyAnswerBackend {
  card(id: number): Promise<Card>;
}

/** 只读预览使用空输入显示正确答案；普通卡不额外读取，填空编号取当前卡片。 */
export async function renderPreviewAnswer(answerHtml: string, rendered: RenderedCard, cardId: number,
  backend: PreviewAnswerBackend): Promise<string> {
  const marker = 提取拼写标记(rendered.questionNodes) ?? 提取拼写标记(rendered.answerNodes);
  if (marker === null) return 剥除拼写标记(answerHtml);
  const card = await backend.card(cardId);
  const request: StudyAnswerRequest = {
    noteId: card.noteId, fieldName: marker.fieldName, cloze: marker.cloze,
    ordinal: card.templateIdx, input: '', combining: marker.combining
  };
  return renderStudyAnswer(answerHtml, request, backend);
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
        expected = await backend.extractClozeForTyping(fieldValue, request.ordinal + 1);
        if (expected === '') {
          return 剥除拼写标记(answerHtml);
        }
      } else {
        expected = fieldValue;
      }
      const resultHtml = await backend.compareAnswer(expected, request.input, request.combining);
      // 注入比对结果；若 answerHtml 不含 [[type:...]] 占位符（标记仅在 questionNodes），
      // 在末尾追加 <hr> + 比对结果，与 Anki 桌面端行为一致。
      const injected = 注入拼写结果(answerHtml, resultHtml);
      if (injected === answerHtml) {
        return `${answerHtml}<hr>${resultHtml}`;
      }
      return injected;
    } catch (error) {
      return 剥除拼写标记(answerHtml);
    }
}
