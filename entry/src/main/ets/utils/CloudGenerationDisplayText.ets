// SPDX-License-Identifier: AGPL-3.0-or-later
import { CloudGeneration } from '../model/cloud-sync/CloudCollectionSync';
import { cloudGenerationText } from './CloudGenerationText';
import { localeNumber } from './LocaleFormatting';
import { namedResourceText } from './UiFeedback';

/** UI 与 JIDE 的版本标签同时显示真实卡片数，空备份明确显示为零。 */
export function cloudGenerationDisplayText(context: UIContext, value: CloudGeneration, locale: string): string {
  const count = value.summary === undefined ? '' : namedResourceText(context, 'huawei_cloud_card_count', localeNumber(value.summary.cards, locale));
  return cloudGenerationText(value, locale, count);
}
