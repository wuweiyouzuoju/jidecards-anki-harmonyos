// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigSettings } from '../proto/messages/DeckConfigMessages';
import type { ComputeFsrsParamsInput, SimulateFsrsInput } from '../proto/messages/FsrsMessages';
import type { DeckConfigRequestOptions } from './DeckConfigSave';

/** Matches Core DeckConfig::fsrs_params; [] asks Core to use its own defaults. */
export function fsrsParams(config: DeckConfigSettings): number[] {
  return (config.fsrsParams6.length > 0 ? config.fsrsParams6 :
    (config.fsrsParams5.length > 0 ? config.fsrsParams5 : config.fsrsParams4)).slice();
}

export function applyFsrsParams(config: DeckConfigSettings, params: number[]): void {
  if (!params.every(value => Number.isFinite(value))) throw new Error('Invalid Core FSRS parameters');
  if (params.length === 0) { config.fsrsParams4 = []; config.fsrsParams5 = []; config.fsrsParams6 = []; }
  else if (params.length === 21) config.fsrsParams6 = params.slice();
  else if (params.length === 19) { config.fsrsParams5 = params.slice(); config.fsrsParams6 = []; }
  else if (params.length === 17) { config.fsrsParams4 = params.slice(); config.fsrsParams5 = []; config.fsrsParams6 = []; }
  else throw new Error('Invalid Core FSRS parameter count');
}

interface FsrsLegacyDeck { id: number; conf?: number; dyn: number; }

/** ID scope avoids ambiguous duplicate preset names and Core 26.05's literal preset-name escapes. */
export function fsrsPresetIdSearch(presetId: number, json: string): string {
  const decks = JSON.parse(json) as Record<string, FsrsLegacyDeck>;
  if (decks === null || typeof decks !== 'object' || Array.isArray(decks) ||
    !Number.isSafeInteger(presetId) || presetId <= 0) throw new Error('Invalid Core deck list');
  const ids: number[] = [];
  for (const deck of Object.values(decks)) {
    if (deck === null || !Number.isSafeInteger(deck.id) || deck.id <= 0 ||
      (deck.dyn !== 0 && deck.dyn !== 1) ||
      (deck.dyn === 0 && (!Number.isSafeInteger(deck.conf) || deck.conf! <= 0))) {
      throw new Error('Invalid Core deck list');
    }
    if (deck.dyn === 0 && deck.conf === presetId) ids.push(deck.id);
  }
  return 'did:' + (ids.length === 0 ? '0' : ids.join(',')) + ' -is:suspended';
}

export function fsrsOptimizeInput(config: DeckConfig, healthCheck: boolean,
  presetSearch: string): ComputeFsrsParamsInput {
  if (config.config === null) throw new Error('Missing deck config');
  const settings = config.config;
  const date = settings.ignoreRevlogsBeforeDate;
  const timestamp = date === '' ? 0 : Date.parse(date + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp)) throw new Error('Invalid FSRS history date');
  const search = settings.paramSearch.trim() === '' ? presetSearch : settings.paramSearch;
  if (search.trim() === '') throw new Error('Missing FSRS preset scope');
  return { search: search,
    currentParams: fsrsParams(settings), ignoreRevlogsBeforeMs: timestamp,
    numOfRelearningSteps: settings.relearnSteps.length, healthCheck: healthCheck };
}

export function fsrsWorkloadInput(config: DeckConfig, options: DeckConfigRequestOptions,
  days: number, presetSearch: string): SimulateFsrsInput {
  if (config.config === null) throw new Error('Missing deck config');
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Invalid simulation duration');
  if (presetSearch.trim() === '') throw new Error('Missing FSRS preset scope');
  const s = config.config;
  return { params: fsrsParams(s), desiredRetention: s.desiredRetention, deckSize: 0,
    daysToSimulate: days, newLimit: s.newPerDay, reviewLimit: s.reviewsPerDay,
    maxInterval: s.maximumReviewInterval, search: presetSearch,
    newCardsIgnoreReviewLimit: options.newCardsIgnoreReviewLimit, easyDaysPercentages: s.easyDaysPercentages.slice(),
    reviewOrder: s.reviewOrder, suspendAfterLapseCount: s.leechAction === 0 && s.leechThreshold > 0 ? s.leechThreshold : null,
    historicalRetention: s.historicalRetention, learningStepCount: s.learnSteps.length,
    relearningStepCount: s.relearnSteps.length };
}
