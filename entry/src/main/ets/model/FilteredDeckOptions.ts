// SPDX-License-Identifier: AGPL-3.0-or-later
import { 过滤牌组排序 } from '../proto/messages/DeckMessages';

export interface FilteredDeckOrderChoice { value: number; titleKey: string; }
/** 手动表单与 JIDE 确认使用同一组 Core 排序值和显示名称。 */
export const FILTERED_DECK_ORDERS: FilteredDeckOrderChoice[] = [
  { value: 过滤牌组排序.最旧复习优先, titleKey: 'filtered_deck_order_oldest' },
  { value: 过滤牌组排序.随机, titleKey: 'filtered_deck_order_random' },
  { value: 过滤牌组排序.间隔升序, titleKey: 'filtered_deck_order_interval_asc' },
  { value: 过滤牌组排序.间隔降序, titleKey: 'filtered_deck_order_interval_desc' },
  { value: 过滤牌组排序.遗忘次数, titleKey: 'filtered_deck_order_lapses' },
  { value: 过滤牌组排序.添加顺序, titleKey: 'filtered_deck_order_added' },
  { value: 过滤牌组排序.到期日, titleKey: 'filtered_deck_order_due' },
  { value: 过滤牌组排序.逆添加顺序, titleKey: 'filtered_deck_order_reverse_added' },
  { value: 过滤牌组排序.可回忆率升序, titleKey: 'filtered_deck_order_retr_asc' },
  { value: 过滤牌组排序.可回忆率降序, titleKey: 'filtered_deck_order_retr_desc' },
  { value: 过滤牌组排序.相对逾期程度, titleKey: 'filtered_deck_order_relative' }
];

export function filteredDeckOrderTitleKey(value: number): string {
  return FILTERED_DECK_ORDERS.find((choice: FilteredDeckOrderChoice): boolean => choice.value === value)?.titleKey ?? '';
}
