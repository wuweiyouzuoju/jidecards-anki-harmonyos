// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AccountProfile } from './AccountProfile';

export const LEADERBOARD_PREVIEW_KEY: string = 'leaderboardLoopbackPreview';
export const LEADERBOARD_SURFACE: string = 'study_leaderboard';
export const LEADERBOARD_FILTERS: string[] = ['all', 'medicine', 'math', 'physics', 'chemistry',
  'biology', 'computing', 'languages', 'humanities', 'other'];
export const LEADERBOARD_MAX_DURATION_MS: number = 7 * 24 * 60 * 60 * 1000;
export const LEADERBOARD_DAYS: number = 7;
export const LEADERBOARD_MONTH_DAYS: number = 30;
export const LEADERBOARD_PERIODS: string[] = ['today', 'week', 'month'];
export const LEADERBOARD_SAMPLE_LIMIT: number = 6;
export const LEADERBOARD_SCORE_LIMIT: number = 1000000;

export interface LeaderboardSample { deck: string; text: string; }
export interface LeaderboardTotals { score: number; durationMs: number; }
export interface LeaderboardWindows { today: LeaderboardTotals; month: LeaderboardTotals; }
export interface LeaderboardPreview {
  score: number; durationMs?: number; samples: LeaderboardSample[]; windows?: LeaderboardWindows;
}
export interface LeaderboardEntry { alias: string; subject: string; subjects?: string[]; score: number; rank: number; nickname?: string; avatar?: string; }
export interface LeaderboardOwnEntry {
  alias: string; subject: string; subjects?: string[]; score: number | null; rank: number | null; active: boolean;
}
export interface LeaderboardBoard {
  entries: LeaderboardEntry[]; mine: LeaderboardOwnEntry | null; signedIn: boolean; metrics?: string[]; periods?: string[]; anonymous?: boolean; anonymousAlias?: string; profile?: AccountProfile;
}
export interface LeaderboardRequest {
  filter: string; metric?: string; period?: string; score?: number; durationMs?: number;
  anonymous?: boolean; windows?: LeaderboardWindows; samples?: LeaderboardSample[]; profileRevision?: number;
}

/** 交换末尾元素后移除，避免重复抽中同一张卡，也无需排序整个近期集合。 */
export function drawLeaderboardCard(candidates: number[], random: number): number {
  const index: number = Math.floor(candidates.length * random);
  const picked: number = candidates[index];
  candidates[index] = candidates[candidates.length - 1];
  candidates.pop();
  return picked;
}

/** 样本只含界面上可查看的文字片段。截断以 UTF-16 为上限，并保留完整字符。 */
export function leaderboardExcerpt(value: string, limit: number): string {
  return value
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?(?:<\/\s*\1\s*>|$)/gi, ' ')
    .replace(/<[^>]*>|\[(?:sound:|anki:tts)[^\]]*\]/gi, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(?:lt|gt|quot|amp|#\d+|#x[\da-f]+);/gi, ' ')
    .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069\s]+/g, ' ')
    .trim()
    .slice(0, limit)
    .replace(/[\ud800-\udbff]$/, '')
    .trimEnd();
}
