// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { noteTypeDisplayKey, noteFieldDisplayKey } from '../model/NoteTypePresentation';
import { namedResourceText } from './UiFeedback';

/** 仅在渲染时解析当前语言；原始名称继续用于保存、搜索和模板引用。 */
export function noteTypeText(context: UIContext, name: string): string {
  const key: string = noteTypeDisplayKey(name);
  return key === '' ? name : namedResourceText(context, key);
}

export function noteFieldText(context: UIContext, name: string, originalStockKind: number): string {
  const key: string = noteFieldDisplayKey(name, originalStockKind);
  return key === '' ? name : namedResourceText(context, key);
}
