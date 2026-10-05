// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组配置表单 } from './牌组配置表单';
import { 牌组选项编辑 } from './牌组选项编辑';
import type { DeckConfigSettings } from '../proto/messages/DeckConfigMessages';
import { compatibleNewSortOrder } from './DeckOptionsCatalog';

/** UI 与 JIDE 共用 Core 单位的字段编辑；仅改草稿，不写入集合。 */
export function applyDeckOptionEdit(form: 牌组配置表单, options: 牌组选项编辑, key: string, value: string, kind: string): void {
  const enabled: boolean = value === 'true';
  switch (key) {
    case 'newPerDay': form.每日新卡数文本 = value; break;
    case 'reviewsPerDay': form.每日复习数文本 = value; break;
    case 'desiredRetention': form.目标保留率文本 = value; break;
    case 'newLimit': options.新卡限额文本 = value; break;
    case 'reviewLimit': options.复习限额文本 = value; break;
    case 'newToday': options.今日新卡文本 = value; options.今日新卡启用 = value.trim() !== ''; break;
    case 'reviewToday': options.今日复习文本 = value; options.今日复习启用 = value.trim() !== ''; break;
    case 'desiredRetentionOverride': options.目标保留率覆盖文本 = value; break;
    case 'learnSteps': form.学习步骤文本 = value; break;
    case 'relearnSteps': form.重学步骤文本 = value; break;
    case 'fsrsParameters': {
      const length: number = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
      form.设置浮点数组字段('fsrsParams4', length === 17 ? value : '');
      form.设置浮点数组字段('fsrsParams5', length === 19 ? value : '');
      form.设置浮点数组字段('fsrsParams6', length === 21 ? value : ''); break;
    }
    case 'easyDaysPercentages': form.设置浮点数组字段('easyDaysPercentages', value); break;
    case 'fsrsEnabled': options.是否启用FSRS = enabled; break;
    case 'fsrsReschedule': options.FSRS重排 = enabled; break;
    case 'fsrsHealthCheck': options.FSRS健康检查 = enabled; break;
    case 'newCardsIgnoreReviewLimit': options.新卡忽略复习限额 = enabled; break;
    case 'applyAllParentLimits': options.应用所有父级限额 = enabled; break;
    case 'newCardGatherPriority':
      form.设置数值字段('newCardGatherPriority', value);
      form.设置数值字段('newCardSortOrder', String(compatibleNewSortOrder(Number(value), form.取配置().newCardSortOrder))); break;
    default:
      if (kind === 'boolean') form.设置布尔字段(key as keyof DeckConfigSettings, enabled);
      else if (kind === 'text') form.设置文本字段(key as keyof DeckConfigSettings, value);
      else form.设置数值字段(key as keyof DeckConfigSettings, value);
  }
}
