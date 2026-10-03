// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { NotetypeImpact, NotetypeStructureChange } from '../model/NotetypeManagement';
import { resourceText } from './UiFeedback';

function changeResource(kind: string): Resource {
  switch (kind) {
    case 'field_removed': return $r('app.string.notetype_change_field_removed');
    case 'field_added': return $r('app.string.notetype_change_field_added');
    case 'field_moved': return $r('app.string.notetype_change_field_moved');
    case 'field_renamed': return $r('app.string.notetype_change_field_renamed');
    case 'template_removed': return $r('app.string.notetype_change_template_removed');
    case 'template_added': return $r('app.string.notetype_change_template_added');
    case 'template_moved': return $r('app.string.notetype_change_template_moved');
    case 'template_renamed': return $r('app.string.notetype_change_template_renamed');
    default: return $r('app.string.notetype_change_template_front');
  }
}

/** 数量来自 Core 搜索；新增卡片依赖字段条件，界面不冒充精确预测。 */
export function notetypeImpactText(context: UIContext, impact: NotetypeImpact, changes: NotetypeStructureChange[], deleting: boolean = false): string {
  const lines: string[] = [resourceText(context, $r('app.string.notetype_impact_totals'), impact.noteIds.length, impact.cardIds.length)];
  if (deleting) lines.push(resourceText(context, $r('app.string.notetype_impact_delete')));
  for (const change of changes) {
    lines.push(resourceText(context, changeResource(change.kind), change.name, change.from, change.to, change.oldName));
  }
  if (!deleting) {
    lines.push(resourceText(context, $r('app.string.notetype_impact_cards'), impact.removedCardIds.length, impact.movedCardIds.length));
    if (changes.some((change: NotetypeStructureChange): boolean => change.kind === 'template_added' || change.kind === 'template_front')) {
      lines.push(resourceText(context, $r('app.string.notetype_impact_generated')));
    }
    lines.push(resourceText(context, $r('app.string.notetype_impact_history')));
    lines.push(resourceText(context, $r('app.string.notetype_impact_sync')));
  }
  return lines.join('\n');
}
