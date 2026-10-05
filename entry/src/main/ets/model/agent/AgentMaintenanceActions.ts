// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReviewPreferences } from '../../proto/messages/PreferencesMessages';
import type { StudyControls } from '../StudyControls';
export interface CollectionPreferencesAction { before: ReviewPreferences; changesJson: string; }
export interface StudyControlsAction { before: StudyControls; after: StudyControls; }
export interface ExportSubsetAction {
  ids: number[]; mode: string; format: string; withMedia: boolean; withScheduling: boolean;
  snapshots: string[];
}
export interface RestoreNotetypeAction { forceKind?: number; stockJson: string; }
