// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { resourceText } from './UiFeedback';

/** 关闭按钮、背景、系统返回和类型切换共用同一放弃草稿决策。 */
export async function confirmNoteDiscard(context: UIContext): Promise<boolean> {
  try {
    const result = await context.getPromptAction().showDialog({
      title: resourceText(context, $r('app.string.note_editor_discard_title')),
      message: resourceText(context, $r('app.string.note_editor_discard_message')),
      buttons: [
        { text: resourceText(context, $r('app.string.note_editor_keep')), color: '#666666' },
        { text: resourceText(context, $r('app.string.note_editor_discard')), color: '#D94838' }
      ]
    });
    return result.index === 1;
  } catch (error) { return false; }
}
