// SPDX-License-Identifier: AGPL-3.0-or-later
import { ReviewPreferenceField } from '../proto/messages/PreferencesMessages';
export interface ReviewAudioPreference {
  id: string; key: string; titleKey: string; hintKey: string; field: ReviewPreferenceField;
}
export const REVIEW_AUDIO_PREFERENCES: ReviewAudioPreference[] = [
  { id: 'hide_audio_buttons', key: 'hideAudioPlayButtons', titleKey: 'settings_hide_audio_buttons',
    hintKey: 'settings_hide_audio_buttons_hint', field: ReviewPreferenceField.HideAudioPlayButtons },
  { id: 'interrupt_audio', key: 'interruptAudioWhenAnswering', titleKey: 'settings_interrupt_audio',
    hintKey: 'settings_interrupt_audio_hint', field: ReviewPreferenceField.InterruptAudioWhenAnswering }
];
