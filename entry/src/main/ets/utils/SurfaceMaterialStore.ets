// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { SURFACE_MATERIAL_KEY, DEFAULT_SURFACE_MATERIAL, GLASS_SUGGESTION_HANDLED_KEY, GLASS_SUGGESTION_PENDING_KEY, isSurfaceMaterial } from '../model/SurfaceMaterial';
import { saveLocalPreference } from './LocalPreferenceWrite';

/** @throws {Error} 缺少应用上下文时由设置控件或 JIDE 展示失败。 */
function surfacePreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) { throw new Error('ability_context_unavailable'); }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 首屏前恢复；空偏好为新安装，已有偏好保留旧默认。首次判定立即落盘，避免下次启动重新分类。 */
export function initializeSurfaceMaterial(): void {
  let style: string = DEFAULT_SURFACE_MATERIAL;
  let pending: boolean = false;
  try {
    const store: preferences.Preferences = surfacePreferences();
    const existing: boolean = Object.keys(store.getAllSync()).length > 0;
    const saved: preferences.ValueType = store.getSync(SURFACE_MATERIAL_KEY, existing ? 'flat' : DEFAULT_SURFACE_MATERIAL);
    if (typeof saved !== 'string' || !isSurfaceMaterial(saved)) { throw new Error('invalid_saved_setting:surface_material'); }
    style = saved;
    pending = existing && style === 'flat' && store.getSync(GLASS_SUGGESTION_HANDLED_KEY, false) !== true;
    const needsMaterial: boolean = !store.hasSync(SURFACE_MATERIAL_KEY);
    const skipSuggestion: boolean = style === 'glass' && !store.hasSync(GLASS_SUGGESTION_HANDLED_KEY);
    if (needsMaterial) store.putSync(SURFACE_MATERIAL_KEY, style);
    if (skipSuggestion) store.putSync(GLASS_SUGGESTION_HANDLED_KEY, true);
    if (needsMaterial || skipSuggestion) store.flushSync();
  } catch (error) { hilog.warn(0x4342, 'jidecards', 'Surface material could not be loaded'); }
  AppStorage.setOrCreate<string>(SURFACE_MATERIAL_KEY, style);
  AppStorage.setOrCreate<boolean>(GLASS_SUGGESTION_PENDING_KEY, pending);
}

/** 回复只记录一次；确认切换失败时不吞掉推荐，也不覆盖原材质。 */
export async function completeGlassSuggestion(useGlass: boolean): Promise<void> {
  if (useGlass) await saveSurfaceMaterial('glass');
  await saveLocalPreference(surfacePreferences(), GLASS_SUGGESTION_HANDLED_KEY, true, false);
  AppStorage.setOrCreate<boolean>(GLASS_SUGGESTION_PENDING_KEY, false);
}

/** @throws {Error} 设置页与 JIDE 共用确认保存、回读和广播；写入不随页面离开取消。 */
export async function saveSurfaceMaterial(style: string, expected: string | null = null): Promise<void> {
  if (!isSurfaceMaterial(style)) { throw new Error('invalid_setting_value'); }
  await saveLocalPreference(surfacePreferences(), SURFACE_MATERIAL_KEY, style, DEFAULT_SURFACE_MATERIAL, expected);
}

