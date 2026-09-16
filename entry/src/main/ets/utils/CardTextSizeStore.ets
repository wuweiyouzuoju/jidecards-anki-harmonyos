// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CARD_TEXT_SIZE_KEY, DEFAULT_CARD_TEXT_SIZE, normalizeCardTextSize } from '../model/CardTextSize';

/** 复用应用本机偏好，字号不写入集合或模板。 */
function getCardTextPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) {
    throw new Error('Ability context unavailable');
  }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 在首屏创建前恢复字号，直接进入学习也能沿用上次设置。 */
export function initializeCardTextSize(): void {
  let size: number = DEFAULT_CARD_TEXT_SIZE;
  try {
    const stored: preferences.ValueType = getCardTextPreferences().getSync(CARD_TEXT_SIZE_KEY, size);
    if (typeof stored === 'number') {
      size = normalizeCardTextSize(stored);
    }
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Card text size could not be loaded');
  }
  AppStorage.setOrCreate<number>(CARD_TEXT_SIZE_KEY, size);
}

/** 落盘成功后通知学习与预览；失败交由设置界面显示。 */
export async function saveCardTextSize(value: number): Promise<void> {
  const size: number = normalizeCardTextSize(value);
  const store: preferences.Preferences = getCardTextPreferences();
  const previous: preferences.ValueType = store.getSync(CARD_TEXT_SIZE_KEY, DEFAULT_CARD_TEXT_SIZE);
  store.putSync(CARD_TEXT_SIZE_KEY, size);
  try {
    await store.flush();
  } catch (error) {
    store.putSync(CARD_TEXT_SIZE_KEY, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
  AppStorage.setOrCreate<number>(CARD_TEXT_SIZE_KEY, size);
}
