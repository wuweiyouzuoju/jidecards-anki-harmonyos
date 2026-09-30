// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NotetypeView } from '../proto/messages/NotetypeMessages';
import { NoteTypeCatalog } from './NoteTypeCatalog';

interface LegacyEditorTemplate { qfmt: string; afmt: string; }
interface LegacyEditorType { tmpls: LegacyEditorTemplate[]; }

/** 只把标准的条件反向模板转成开关；改名/重排仍按真实字段引用识别。 */
export function optionalReverseField(view: NotetypeView, json: string): number {
  if (view.originalStockKind !== 3 || view.fieldNames.length !== 3) return -1;
  const type = JSON.parse(json) as LegacyEditorType;
  if (!Array.isArray(type.tmpls) || type.tmpls.length !== 2) return -1;
  for (let gate: number = 0; gate < view.fieldNames.length; gate++) {
    const name: string = view.fieldNames[gate];
    for (const front of view.fieldNames) {
      if (front === name) continue;
      const back: string | undefined = view.fieldNames.find((field: string): boolean => field !== name && field !== front);
      if (back === undefined) continue;
      const forward: LegacyEditorTemplate = type.tmpls[0];
      const reverse: LegacyEditorTemplate = type.tmpls[1];
      if (forward.qfmt.trim() === `{{${front}}}` && reverse.qfmt.trim() === `{{#${name}}}{{${back}}}{{/${name}}}` &&
        forward.afmt.trim() === `{{FrontSide}}\n\n<hr id=answer>\n\n{{${back}}}` &&
        reverse.afmt.trim() === `{{FrontSide}}\n\n<hr id=answer>\n\n{{${front}}}`) return gate;
    }
  }
  return -1;
}

/** 仅展示别名，不重命名用户库；自定义名称保持原样。 */
export function noteTypeDisplayKey(name: string): string {
  if (NoteTypeCatalog.Basic可选反转笔记类型名集合.indexOf(name) >= 0) return 'note_type_optional_reverse';
  if (NoteTypeCatalog.Basic反转笔记类型名集合.indexOf(name) >= 0) return 'note_type_both_directions';
  return '';
}
