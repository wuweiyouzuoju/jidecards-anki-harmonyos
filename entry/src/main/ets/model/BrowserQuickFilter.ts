// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SearchNode } from '../proto/messages/SearchMessages';
import { SearchNodeJoiner, makeParsableTextNode } from '../proto/messages/SearchMessages';

export interface BrowserQuickFilter {
  id: string;
  labelKey: string;
  query: string;
}

export const BROWSER_QUICK_FILTERS: BrowserQuickFilter[] = [
  { id: 'all', labelKey: 'browser_filter_all', query: '' },
  { id: 'due', labelKey: 'browser_filter_due', query: 'is:due' },
  { id: 'new', labelKey: 'browser_filter_new', query: 'is:new' },
  { id: 'learning', labelKey: 'browser_filter_learning', query: 'is:learn' },
  { id: 'suspended', labelKey: 'browser_filter_suspended', query: 'is:suspended' },
  { id: 'marked', labelKey: 'browser_filter_marked', query: 'tag:re:^marked$' },
  { id: 'unmarked', labelKey: 'card_mark_unmarked', query: '-tag:re:^marked$' },
  { id: 'flagged', labelKey: 'card_mark_any_flag', query: '-flag:0' },
  { id: 'flag_0', labelKey: 'browser_action_flag_none', query: 'flag:0' },
  { id: 'flag_1', labelKey: 'card_mark_filter_red', query: 'flag:1' },
  { id: 'flag_2', labelKey: 'card_mark_filter_orange', query: 'flag:2' },
  { id: 'flag_3', labelKey: 'card_mark_filter_green', query: 'flag:3' },
  { id: 'flag_4', labelKey: 'card_mark_filter_blue', query: 'flag:4' },
  { id: 'flag_5', labelKey: 'card_mark_filter_pink', query: 'flag:5' },
  { id: 'flag_6', labelKey: 'card_mark_filter_turquoise', query: 'flag:6' },
  { id: 'flag_7', labelKey: 'card_mark_filter_purple', query: 'flag:7' }
];

/** 用 AND 节点保留原搜索的 OR 分组语义，切换筛选不修改用户输入。 */
export function browserFilterNode(text: string, filterId: string): SearchNode {
  const base: SearchNode = makeParsableTextNode(text);
  const filter: BrowserQuickFilter | undefined = BROWSER_QUICK_FILTERS.find((item: BrowserQuickFilter): boolean =>
    item.id === filterId);
  if (filter === undefined || filter.query === '') return base;
  const condition: SearchNode = makeParsableTextNode(filter.query);
  if (text.trim() === '') return condition;
  return { kind: 'group', group: { joiner: SearchNodeJoiner.AND, nodes: [base, condition] } };
}
