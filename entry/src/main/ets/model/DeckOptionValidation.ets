// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组配置表单 } from './牌组配置表单';
import type { 校验问题 } from './牌组配置表单';
import { 牌组选项编辑 } from './牌组选项编辑';
import type { DeckConfigSettings } from '../proto/messages/DeckConfigMessages';

/** 用既有表单规则验证单项候选值，不修改当前表单或其他尚未保存的字段。 */
export function validateDeckOptionText(form: 牌组配置表单, key: string, value: string): string {
  const candidate: 牌组配置表单 = 牌组配置表单.从配置创建(form.取配置());
  const limits: 牌组选项编辑 = 牌组选项编辑.从视图创建(null, false, false, false, false);
  switch (key) {
    case 'newPerDay': candidate.每日新卡数文本 = value; break;
    case 'reviewsPerDay': candidate.每日复习数文本 = value; break;
    case 'learnSteps': candidate.学习步骤文本 = value; break;
    case 'relearnSteps': candidate.重学步骤文本 = value; break;
    case 'desiredRetention': candidate.目标保留率文本 = value; break;
    case 'reviewLimit': limits.复习限额文本 = value; break;
    case 'newLimit': limits.新卡限额文本 = value; break;
    case 'reviewToday': limits.今日复习文本 = value; break;
    case 'newToday': limits.今日新卡文本 = value; break;
    case 'desiredRetentionOverride': limits.目标保留率覆盖文本 = value; break;
    case 'fsrsParams4': case 'fsrsParams5': case 'fsrsParams6': case 'easyDaysPercentages':
      candidate.设置浮点数组字段(key as keyof DeckConfigSettings, value); break;
    case 'paramSearch': case 'ignoreRevlogsBeforeDate':
      candidate.设置文本字段(key as keyof DeckConfigSettings, value); break;
    default: candidate.设置数值字段(key as keyof DeckConfigSettings, value); break;
  }
  const issue: 校验问题 | undefined = candidate.校验().concat(limits.校验())
    .find((item: 校验问题): boolean => item.字段键 === key);
  return issue === undefined ? '' : issue.消息键;
}
