// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadPlatformModule } from './platform-module-harness.mjs';

export function localPreferenceApi(AppStorage) {
  return loadPlatformModule('utils/LocalPreferenceWrite.ets',
    '({ saveLocalPreference, readLocalPreference, LocalPreferenceWriteError })', { AppStorage });
}
