// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ToolRisk } from './AgentTypes';
import { extensionToolRisk } from './AgentExtensionTools';

export const DEFAULT_BATCH_LIMIT: number = 100;
export const MAX_BATCH_LIMIT: number = 1000;

export interface AgentSearchSourceEvent {
  kind: 'search_source';
  url: string;
  title: string;
}

export interface AgentTextDeltaEvent {
  kind: 'text_delta';
  text: string;
}

export type SearchEvidenceEvent = AgentSearchSourceEvent | AgentTextDeltaEvent;

export class SearchEvidenceError extends Error {
  readonly code: string = 'web_search_sources_missing';

  constructor() {
    super('web_search_sources_missing');
  }
}

export class SearchExecutionError extends Error {
  readonly code: string = 'web_search_not_executed';

  constructor() {
    super('web_search_not_executed');
  }
}

export function toolRiskOf(toolName: string): ToolRisk {
  switch (toolName) {
    case 'set_theme_mode':
      return 'setting_write';
    case 'list_documents':
    case 'read_document_page':
    case 'ocr_document_page':
    case 'save_document_notes':
    case 'get_app_structure':
    case 'list_settings':
    case 'get_settings':
    case 'list_theme_colors':
    case 'get_deck_options':
    case 'execute_code':
    case 'get_note_type_capabilities':
    case 'get_note_context':
    case 'read_note_field':
    case 'search_cards':
    case 'search_notes':
    case 'list_decks':
    case 'list_notetypes':
    case 'list_tags':
    case 'get_notetype_details':
    case 'get_card_statistics':
    case 'get_learning_overview':
    case 'search_images':
    case 'web_search':
    case 'read_webpage':
    case 'request_clarification':
    case 'request_create_target':
      return 'read';
    case 'create_flashcards':
    case 'propose_update_notes':
    case 'propose_move_cards':
    case 'propose_set_theme_color':
    case 'propose_set_fsrs':
    case 'propose_set_setting':
      return 'write';
    case 'remove_notes':
    case 'remove_cards':
    case 'remove_deck':
    case 'remove_note_type':
    case 'change_note_type':
    case 'update_note_type_templates':
    case 'propose_delete_notes':
    case 'propose_delete_cards':
    case 'propose_delete_deck':
    case 'propose_delete_note_type':
    case 'propose_change_note_type':
    case 'propose_update_note_type_templates':
    case 'propose_update_card_style':
      return 'high_risk';
    default:
      return extensionToolRisk(toolName);
  }
}

export function normalizeBatchLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_BATCH_LIMIT;
  }
  return Math.min(MAX_BATCH_LIMIT, Math.max(1, Math.floor(value)));
}

export function splitAffectedCardIds(cardIds: number[], requestedLimit: number): number[][] {
  const limit: number = normalizeBatchLimit(requestedLimit);
  const batches: number[][] = [];
  for (let offset: number = 0; offset < cardIds.length; offset += limit) {
    batches.push(cardIds.slice(offset, offset + limit));
  }
  return batches;
}

export function registerToolCallId(seenIds: Set<string>, toolCallId: string): boolean {
  if (toolCallId.length === 0 || seenIds.has(toolCallId)) {
    return false;
  }
  seenIds.add(toolCallId);
  return true;
}

export function enforceSearchEvidence(requested: boolean, events: SearchEvidenceEvent[]): void {
  if (!requested) {
    return;
  }
  for (const event of events) {
    if (event.kind === 'search_source' && event.url.startsWith('https://')) {
      return;
    }
  }
  throw new SearchEvidenceError();
}

export function enforceSearchExecution(requested: boolean, executed: boolean): void {
  if (requested && !executed) {
    throw new SearchExecutionError();
  }
}

/** 只识别明确的公网检索意图，避免把“搜索卡库”误判为联网请求。 */
export function explicitWebSearchRequested(text: string): boolean {
  const normalized: string = text.trim().toLocaleLowerCase();
  if (normalized.length === 0) { return false; }
  if (explicitWebSearchForbidden(normalized)) { return false; }
  const markers: string[] = [
    '联网', '上网', '网上', '网络搜索', '搜索网络', '在线查',
    '浏览网页', '访问网页', '读取网页', '抓取网页', '访问网站', '浏览网站', '查阅官网',
    '最新资料', '最新消息', '有道词典', '百度百科', '维基百科',
    'search the web', 'web search', 'browse the web', 'look up online',
    'online source', 'cite sources', 'visit the website', 'browse the website', 'fetch a webpage'
  ];
  for (const marker of markers) {
    if (normalized.includes(marker)) { return true; }
  }
  return false;
}

/** 只有用户明确索要链接、引用或来源时才要求 URL；普通“联网查”只要求真实搜索已执行。 */
export function explicitSourceEvidenceRequested(text: string): boolean {
  const normalized: string = text.trim().toLocaleLowerCase();
  if (normalized.length === 0) { return false; }
  if (explicitWebSearchForbidden(normalized)) { return false; }
  const markers: string[] = [
    '标注来源', '注明来源', '给出来源', '提供来源', '引用来源', '参考来源',
    '网页链接', '网站链接', '原文链接', '出处',
    'cite sources', 'provide sources', 'source links', 'with citations', 'citations'
  ];
  for (const marker of markers) {
    if (normalized.includes(marker)) { return true; }
  }
  return false;
}

/** 识别用户对本轮联网的明确否定；显式否定优先于全局搜索偏好。 */
export function explicitWebSearchForbidden(text: string): boolean {
  const normalized: string = text.trim().toLocaleLowerCase();
  if (normalized.length === 0) { return false; }
  const markers: string[] = [
    '不要联网', '不用联网', '无需联网', '禁止联网', '别联网',
    '不要上网', '不用上网', '无需上网', '离线完成', '只用本地',
    'do not search the web', 'don\'t search the web', 'without web search',
    'do not browse', 'don\'t browse', 'offline only'
  ];
  for (const marker of markers) {
    if (normalized.includes(marker)) { return true; }
  }
  return false;
}
