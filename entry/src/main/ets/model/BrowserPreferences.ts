// SPDX-License-Identifier: AGPL-3.0-or-later
export interface BrowserPreferences {
  traditionalMode?: boolean;
  traditionalCardsColumns?: string[];
  traditionalNotesColumns?: string[];
  mode: string;
  sortColumn: string;
  sortReverse: boolean;
  subtitleIndex: number;
  cardsColumns: string[];
  notesColumns: string[];
  recentSearches: string[];
}
export interface BrowserPreferencePatch {
  traditionalMode?: boolean;
  traditionalCardsColumns?: string[];
  traditionalNotesColumns?: string[];
  mode?: string;
  sortColumn?: string;
  sortReverse?: boolean;
  subtitleIndex?: number;
  cardsColumns?: string[];
  notesColumns?: string[];
  recentSearch?: string;
}
// AnkiDroid BrowserConfig.kt 的持久化默认值；ViewModel 的两列只是加载前占位。
export const BROWSER_TRADITIONAL_CARD_COLUMNS: string[] = ['noteFld', 'template', 'cardDue', 'deck'];
export const BROWSER_TRADITIONAL_NOTE_COLUMNS: string[] = ['noteFld', 'note', 'template', 'noteTags'];
export const BROWSER_DEFAULT_COLUMNS: string[] = ['question', 'deck', 'cardDue', 'flags', 'answer'];
export function defaultBrowserPreferences(notes: boolean = false): BrowserPreferences {
  return { traditionalMode: false, traditionalCardsColumns: BROWSER_TRADITIONAL_CARD_COLUMNS.slice(), traditionalNotesColumns: BROWSER_TRADITIONAL_NOTE_COLUMNS.slice(), mode: notes ? 'notes' : 'cards', sortColumn: '', sortReverse: false, subtitleIndex: 1,
    cardsColumns: [], notesColumns: [], recentSearches: [] };
}
function validatedColumns(value: string[], limit: number = 16): string[] {
  if (!Array.isArray(value) || value.length > limit || value.some((key: string): boolean => typeof key !== 'string' || key.length === 0 || key.length > 80))
    throw new Error('Invalid browser columns');
  if (new Set<string>(value).size !== value.length) throw new Error('Duplicate browser columns');
  return value.slice();
}
export function updateBrowserPreferences(previous: BrowserPreferences, patch: BrowserPreferencePatch): BrowserPreferences {
  const traditionalMode: boolean = patch.traditionalMode ?? previous.traditionalMode ?? false;
  if (typeof traditionalMode !== 'boolean') throw new Error('Invalid browser layout');
  const traditionalCardsColumns: string[] = validatedColumns(patch.traditionalCardsColumns ?? previous.traditionalCardsColumns ?? BROWSER_TRADITIONAL_CARD_COLUMNS, 64);
  const traditionalNotesColumns: string[] = validatedColumns(patch.traditionalNotesColumns ?? previous.traditionalNotesColumns ?? BROWSER_TRADITIONAL_NOTE_COLUMNS, 64);
  if (traditionalCardsColumns.length === 0 || traditionalNotesColumns.length === 0) throw new Error('Browser needs a column');
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
  return { traditionalMode: traditionalMode, traditionalCardsColumns: traditionalCardsColumns, traditionalNotesColumns: traditionalNotesColumns, mode: mode, sortColumn: sortColumn, sortReverse: sortReverse, subtitleIndex: subtitle,
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
  return Array.from(new Set<string>(BROWSER_DEFAULT_COLUMNS.concat(browserDisplayKeys(preferences, notes))));
}
export function browserPreferencePatch(json: string): BrowserPreferencePatch {
  const patch: BrowserPreferencePatch = JSON.parse(json) as BrowserPreferencePatch;
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0 ||
    Object.keys(patch).some((key: string): boolean => !['mode', 'sortColumn', 'sortReverse', 'subtitleIndex', 'cardsColumns', 'notesColumns', 'traditionalMode', 'traditionalCardsColumns', 'traditionalNotesColumns'].includes(key)))
    throw new Error('Invalid browser preferences patch');
  if ((patch.traditionalMode !== undefined && typeof patch.traditionalMode !== 'boolean') ||
    (patch.traditionalCardsColumns !== undefined && !Array.isArray(patch.traditionalCardsColumns)) ||
    (patch.traditionalNotesColumns !== undefined && !Array.isArray(patch.traditionalNotesColumns)) ||
    (patch.mode !== undefined && typeof patch.mode !== 'string') ||
    (patch.sortColumn !== undefined && typeof patch.sortColumn !== 'string') ||
    (patch.sortReverse !== undefined && typeof patch.sortReverse !== 'boolean') ||
    (patch.subtitleIndex !== undefined && typeof patch.subtitleIndex !== 'number') ||
    (patch.cardsColumns !== undefined && !Array.isArray(patch.cardsColumns)) ||
    (patch.notesColumns !== undefined && !Array.isArray(patch.notesColumns))) throw new Error('Invalid browser preferences patch');
  updateBrowserPreferences(defaultBrowserPreferences(), patch);
  return patch;
}

/** 两种外观各自保留列顺序；传统模式使用上游持久化默认列，手机也始终并排。 */
export function browserDisplayKeys(preferences: BrowserPreferences, notes: boolean): string[] {
  if (preferences.traditionalMode) return browserTraditionalColumns(preferences, notes);
  return (notes ? preferences.notesColumns : preferences.cardsColumns).slice();
}
/** 点标题只替换该位置，已在其它位置使用的列不作为候选。 */
export function replaceBrowserColumn(keys: string[], target: string, replacement: string): string[] {
  const index: number = keys.indexOf(target);
  if (index < 0 || replacement === '' || (replacement !== target && keys.includes(replacement))) throw new Error('Invalid browser column replacement');
  const result: string[] = keys.slice(); result[index] = replacement; return result;
}

export function browserTraditionalColumns(preferences: BrowserPreferences, notes: boolean): string[] {
  return (notes ? preferences.traditionalNotesColumns ?? BROWSER_TRADITIONAL_NOTE_COLUMNS : preferences.traditionalCardsColumns ?? BROWSER_TRADITIONAL_CARD_COLUMNS).slice();
}
