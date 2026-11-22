// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CloudGeneration } from '../model/cloud-sync/CloudCollectionSync';
import { localeDate } from './LocaleFormatting';

/** 版本列表、恢复确认和 JIDE 使用同一个设备与时间标签。 */
export function cloudGenerationText(value: CloudGeneration, locale: string, cardCountLabel: string = ''): string {
  return `${value.device.slice(0, 8)} · ${localeDate(value.uploadedAt ?? 0, locale)}${cardCountLabel === '' ? '' : ` · ${cardCountLabel}`}`;
}
