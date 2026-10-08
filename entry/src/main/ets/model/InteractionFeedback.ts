// SPDX-License-Identifier: AGPL-3.0-or-later
import type { UndoStatus } from '../proto/messages/CollectionMessages';
export interface FeedbackAction { id: string; titleKey: string; }
export const FEEDBACK_ACTIONS: FeedbackAction[] = [
  { id: 'retry', titleKey: 'common_retry' },
  { id: 'result_undo', titleKey: 'collection_history_undo' }
];
export const MENU_SLIDE_HOLD_MS: number = 200;
export const MENU_SLIDE_BRANCH_MS: number = 220;
/** 只有此次单步写入产生的新记录才提供就近撤销；无变化或多步/并发变化降级为结果。 */
export function resultUndoStatus(before: UndoStatus | null, after: UndoStatus | null): UndoStatus | null {
  return before !== null && after !== null && after.undo !== '' && after.lastStep === before.lastStep + 1 ? after : null;
}
export interface InteractionFeedbackSupport {
  resultActions: FeedbackAction[];
  menuInput: string;
  holdMillis: number;
  branchDwellMillis: number;
  ratingRecovery: string;
  undoProtection: string;
  cardFlipAnimation: boolean;
  pageMotion: string;
  dialogMotion: string;
  execution: string;
}
export const INTERACTION_FEEDBACK_SUPPORT: InteractionFeedbackSupport = {
  resultActions: FEEDBACK_ACTIONS, menuInput: 'manual_hold_slide_release_or_click',
  holdMillis: MENU_SLIDE_HOLD_MS, branchDwellMillis: MENU_SLIDE_BRANCH_MS,
  ratingRecovery: 'probe_core_step_and_card_before_resubmission',
  undoProtection: 'core_expected_history_step', cardFlipAnimation: false,
  pageMotion: 'shared_navigation_and_local_sections; fade_in_only_with_optional_direction_offset; preview_overlay_fades',
  dialogMotion: 'shared_surface_transition; inline_scale_and_fade_in_then_fade_out; native_window_owns_platform_geometry; one_owner_per_surface',
  execution: 'feedback_buttons_are_manual_ui_callbacks; existing_agent_domain_tools_keep_their_confirmation_rules'
};
