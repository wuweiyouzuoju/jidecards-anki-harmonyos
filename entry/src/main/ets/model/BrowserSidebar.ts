// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
export interface BrowserSavedSearch { name: string; search: string; }
export interface BrowserSidebarBackend {
  decks(): Promise<DeckTreeNode>;
  tags(): Promise<TagTreeNode>;
  savedSearches(): Promise<string>;
  saveSavedSearches(json: string): Promise<void>;
  collapsed(key: ConfigKeyBool): Promise<boolean>;
}

interface BrowserSavedSearchMap {
  [name: string]: string;
}

export interface SavedSearchMutation {
  ok: boolean;
  items: BrowserSavedSearch[];
  reason: string;
}

function normalizedSavedSearchName(name: string): string {
  return name.trim();
}

function normalizedSavedSearchQuery(search: string): string {
  return search.trim();
}

/** Applies the Anki saved-search list semantics without touching persistence or UI. */
export function upsertBrowserSavedSearch(
  items: BrowserSavedSearch[], name: string, search: string, existingName: string = ''): SavedSearchMutation {
  const nextName: string = normalizedSavedSearchName(name);
  const nextSearch: string = normalizedSavedSearchQuery(search);
  if (nextName === '') return { ok: false, items: [], reason: 'empty_name' };
  if (nextSearch === '') return { ok: false, items: [], reason: 'empty_search' };
  const oldName: string = normalizedSavedSearchName(existingName);
  const duplicate: boolean = items.some((item: BrowserSavedSearch): boolean =>
    item.name === nextName && item.name !== oldName);
  if (duplicate) return { ok: false, items: [], reason: 'duplicate_name' };
  const next: BrowserSavedSearch[] = items.map((item: BrowserSavedSearch): BrowserSavedSearch =>
    item.name === oldName && oldName !== ''
      ? { name: nextName, search: nextSearch }
      : { name: item.name, search: item.search });
  if (oldName === '') next.push({ name: nextName, search: nextSearch });
  else if (!items.some((item: BrowserSavedSearch): boolean => item.name === oldName)) {
    return { ok: false, items: [], reason: 'missing' };
  }
  return { ok: true, items: next, reason: '' };
}

export function removeBrowserSavedSearch(items: BrowserSavedSearch[], name: string): SavedSearchMutation {
  const target: string = normalizedSavedSearchName(name);
  if (target === '' || !items.some((item: BrowserSavedSearch): boolean => item.name === target)) {
    return { ok: false, items: [], reason: 'missing' };
  }
  return { ok: true, items: items.filter((item: BrowserSavedSearch): boolean => item.name !== target), reason: '' };
}

export function serializeBrowserSavedSearches(items: BrowserSavedSearch[]): string {
  const output: BrowserSavedSearchMap = {};
  items.forEach((item: BrowserSavedSearch): void => { output[item.name] = item.search; });
  return JSON.stringify(output);
}
export interface BrowserSidebarSnapshot {
  decks: DeckTreeNode | null;
  tags: TagTreeNode | null;
  saved: BrowserSavedSearch[];
  collapsed: boolean[];
  errors: string[];
}
export function parseBrowserSavedSearches(json: string): BrowserSavedSearch[] {
  try {
    const output: BrowserSavedSearch[] = [];
    const parsed: object = JSON.parse(json) as object;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item !== null && typeof item === 'object' && typeof (item as BrowserSavedSearch).name === 'string' &&
          typeof (item as BrowserSavedSearch).search === 'string' &&
          (item as BrowserSavedSearch).name !== '' && (item as BrowserSavedSearch).search !== '') {
          output.push({ name: (item as BrowserSavedSearch).name, search: (item as BrowserSavedSearch).search });
        }
      }
      return output;
    }
    if (parsed === null || typeof parsed !== 'object') return [];
    const map: BrowserSavedSearchMap = parsed as BrowserSavedSearchMap;
    Object.keys(map).forEach((name: string): void => {
      const search: string = map[name];
      if (name !== '' && typeof search === 'string' && search !== '') output.push({ name, search });
    });
    return output;
  } catch (error) { return []; }
}
export async function loadBrowserSidebar(backend: BrowserSidebarBackend,
  cachedDecks: DeckTreeNode | null): Promise<BrowserSidebarSnapshot> {
  const snapshot: BrowserSidebarSnapshot = { decks: cachedDecks, tags: null, saved: [], collapsed: [false, false, false], errors: [] };
  const decks: Promise<void> = cachedDecks !== null ? Promise.resolve() : backend.decks()
    .then((value: DeckTreeNode): void => { snapshot.decks = value; })
    .catch((error: Error): void => { snapshot.errors.push((error instanceof Error ? error.message : `${error}`).slice(0, 40)); });
  const tags: Promise<void> = backend.tags().then((value: TagTreeNode): void => { snapshot.tags = value; })
    .catch((error: Error): void => { snapshot.errors.push((error instanceof Error ? error.message : `${error}`).slice(0, 40)); });
  const saved: Promise<void> = backend.savedSearches().then((json: string): void => { snapshot.saved = parseBrowserSavedSearches(json); })
    .catch((): void => {});
  const keys: ConfigKeyBool[] = [ConfigKeyBool.COLLAPSE_DECKS, ConfigKeyBool.COLLAPSE_TAGS, ConfigKeyBool.COLLAPSE_SAVED_SEARCHES];
  const collapse: Promise<void>[] = keys.map((key: ConfigKeyBool, index: number): Promise<void> =>
    backend.collapsed(key).then((value: boolean): void => { snapshot.collapsed[index] = value; }).catch((): void => {}));
  await Promise.all([decks, tags, saved, ...collapse]);
  return snapshot;
}
