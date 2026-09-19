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
  { id: 'marked', labelKey: 'browser_filter_marked', query: 'tag:marked' }
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
