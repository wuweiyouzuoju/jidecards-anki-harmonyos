// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { CardActionMenuEntry } from './CardActionMenu';
import { CARD_FLAGS, CardFlagDefinition, FlagLabels, customFlagLabel } from '../../model/CardMarking';
import { namedResourceText } from '../../utils/UiFeedback';

/** 学习与浏览共用七色/清除、用户名称、图标和中性清除样式；宿主提供作用范围与提交。 */
export function flagMenuChoices(context: UIContext, labels: FlagLabels, currentFlag: number,
  busy: boolean, onSelect: (flag: number) => void): CardActionMenuEntry[] {
  return CARD_FLAGS.map((definition: CardFlagDefinition): CardActionMenuEntry => ({
    id: String(definition.value),
    value: customFlagLabel(labels, definition.value) || namedResourceText(context, definition.labelKey),
    icon: definition.value === 0 ? $r('app.media.ic_study_flag_clear') : $r('app.media.ic_study_flag'),
    iconTint: definition.value === 0 ? undefined : `#40${definition.color.slice(-6)}`,
    enabled: !busy, selected: currentFlag === definition.value, selectionUsesAccent: definition.value !== 0,
    action: (): void => { onSelect(definition.value); }
  }));
}
