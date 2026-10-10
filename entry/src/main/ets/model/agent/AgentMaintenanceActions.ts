// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReviewPreferences } from '../../proto/messages/PreferencesMessages';
import type { StudyControls } from '../StudyControls';
import type { BrowserPreferences, BrowserPreferencePatch } from '../BrowserPreferences';
import type { BrowserColumn } from '../../proto/messages/SearchMessages';
export interface BrowserPreferencesAction { before: BrowserPreferences; patch: BrowserPreferencePatch; columns: BrowserColumn[]; }
export interface CollectionPreferencesAction { before: ReviewPreferences; changesJson: string; }
export interface StudyControlsAction { before: StudyControls; after: StudyControls; }
export interface ExportSubsetAction {
  ids: number[]; mode: string; format: string; withMedia: boolean; withScheduling: boolean;
  snapshots: string[];
}
export interface RestoreNotetypeAction { forceKind?: number; stockJson: string; }
