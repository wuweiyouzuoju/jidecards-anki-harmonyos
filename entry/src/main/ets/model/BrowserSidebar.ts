// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
export interface BrowserSavedSearch { name: string; search: string; }
export interface BrowserSidebarBackend {
  decks(): Promise<DeckTreeNode>;
  tags(): Promise<TagTreeNode>;
  savedSearches(): Promise<string>;
  collapsed(key: ConfigKeyBool): Promise<boolean>;
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
    const parsed: BrowserSavedSearch[] = JSON.parse(json) as BrowserSavedSearch[];
    if (!Array.isArray(parsed)) return [];
    const output: BrowserSavedSearch[] = [];
    for (const item of parsed) {
      if (item !== null && typeof item === 'object' && typeof item.name === 'string' &&
        typeof item.search === 'string' && item.name !== '' && item.search !== '') {
        output.push({ name: item.name, search: item.search });
      }
    }
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
