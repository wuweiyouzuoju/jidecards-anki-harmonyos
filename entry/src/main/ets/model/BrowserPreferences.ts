// SPDX-License-Identifier: AGPL-3.0-or-later
export interface BrowserPreferences {
  mode: string;
  sortColumn: string;
  sortReverse: boolean;
  subtitleIndex: number;
  cardsColumns: string[];
  notesColumns: string[];
  recentSearches: string[];
}
export interface BrowserPreferencePatch {
  mode?: string;
  sortColumn?: string;
  sortReverse?: boolean;
  subtitleIndex?: number;
  cardsColumns?: string[];
  notesColumns?: string[];
  recentSearch?: string;
}
export const BROWSER_DEFAULT_COLUMNS: string[] = ['question', 'deck', 'cardDue', 'flags', 'answer'];
export function defaultBrowserPreferences(notes: boolean = false): BrowserPreferences {
  return { mode: notes ? 'notes' : 'cards', sortColumn: '', sortReverse: false, subtitleIndex: 1,
    cardsColumns: [], notesColumns: [], recentSearches: [] };
}
function validatedColumns(value: string[]): string[] {
  if (!Array.isArray(value) || value.length > 16 || value.some((key: string): boolean => typeof key !== 'string' || key.length === 0 || key.length > 80))
    throw new Error('Invalid browser columns');
  if (new Set<string>(value).size !== value.length) throw new Error('Duplicate browser columns');
  return value.slice();
}
export function updateBrowserPreferences(previous: BrowserPreferences, patch: BrowserPreferencePatch): BrowserPreferences {
  const mode: string = patch.mode ?? previous.mode;
  const sortColumn: string = patch.sortColumn ?? previous.sortColumn;
  const sortReverse: boolean = patch.sortReverse ?? previous.sortReverse;
  const subtitle: number = patch.subtitleIndex ?? previous.subtitleIndex;
  if ((mode !== 'cards' && mode !== 'notes') || typeof sortColumn !== 'string' || sortColumn.length > 80 ||
    typeof sortReverse !== 'boolean' || ![1, 2, 4].includes(subtitle)) throw new Error('Invalid browser preferences');
  let history: string[] = previous.recentSearches.slice();
  if (patch.recentSearch !== undefined) {
    const text: string = patch.recentSearch.trim();
    if (text.length > 2000) throw new Error('Search too long');
    if (text !== '') history = [text].concat(history.filter((entry: string): boolean => entry !== text)).slice(0, 30);
  }
  return { mode: mode, sortColumn: sortColumn, sortReverse: sortReverse, subtitleIndex: subtitle,
    cardsColumns: validatedColumns(patch.cardsColumns ?? previous.cardsColumns),
    notesColumns: validatedColumns(patch.notesColumns ?? previous.notesColumns), recentSearches: history };
}
export function parseBrowserPreferences(json: string, notes: boolean): BrowserPreferences {
  if (json === '') return defaultBrowserPreferences(notes);
  const value: BrowserPreferences = JSON.parse(json) as BrowserPreferences;
  if (value === null || typeof value !== 'object' || !Array.isArray(value.recentSearches) ||
    value.recentSearches.length > 30 || value.recentSearches.some((text: string): boolean => typeof text !== 'string' || text.length > 2000))
    throw new Error('Invalid browser preferences');
  return updateBrowserPreferences(value, {});
}
/** 隐藏元数据列固定在前，用户列只追加；默认行与自定义列使用同一 Core 快照。 */
export function browserActiveColumns(preferences: BrowserPreferences, notes: boolean): string[] {
  return Array.from(new Set<string>(BROWSER_DEFAULT_COLUMNS.concat(notes ? preferences.notesColumns : preferences.cardsColumns)));
}
export function browserPreferencePatch(json: string): BrowserPreferencePatch {
  const patch: BrowserPreferencePatch = JSON.parse(json) as BrowserPreferencePatch;
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0 ||
    Object.keys(patch).some((key: string): boolean => !['mode', 'sortColumn', 'sortReverse', 'subtitleIndex', 'cardsColumns', 'notesColumns'].includes(key)))
    throw new Error('Invalid browser preferences patch');
  if ((patch.mode !== undefined && typeof patch.mode !== 'string') ||
    (patch.sortColumn !== undefined && typeof patch.sortColumn !== 'string') ||
    (patch.sortReverse !== undefined && typeof patch.sortReverse !== 'boolean') ||
    (patch.subtitleIndex !== undefined && typeof patch.subtitleIndex !== 'number') ||
    (patch.cardsColumns !== undefined && !Array.isArray(patch.cardsColumns)) ||
    (patch.notesColumns !== undefined && !Array.isArray(patch.notesColumns))) throw new Error('Invalid browser preferences patch');
  updateBrowserPreferences(defaultBrowserPreferences(), patch);
  return patch;
}
