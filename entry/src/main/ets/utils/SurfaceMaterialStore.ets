// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { SURFACE_MATERIAL_KEY, DEFAULT_SURFACE_MATERIAL, GLASS_SUGGESTION_HANDLED_KEY, GLASS_SUGGESTION_PENDING_KEY, isSurfaceMaterial } from '../model/SurfaceMaterial';
import { MODULE_OPACITY_KEY, FLAT_MODULE_OPACITY_KEY, GLASS_MODULE_OPACITY_KEY, MaterialOpacity,
  DEFAULT_MODULE_OPACITY, BUTTON_OPACITY_KEY, FLAT_BUTTON_OPACITY_KEY, GLASS_BUTTON_OPACITY_KEY,
  DEFAULT_BUTTON_OPACITY, DIALOG_OPACITY_KEY, FLAT_DIALOG_OPACITY_KEY, GLASS_DIALOG_OPACITY_KEY,
  DEFAULT_DIALOG_OPACITY, validModuleOpacity } from '../model/SurfaceMaterial';
import { saveLocalPreference } from './LocalPreferenceWrite';

/** @throws {Error} 缺少应用上下文时由设置控件或 JIDE 展示失败。 */
function surfacePreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) { throw new Error('ability_context_unavailable'); }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 新旧安装统一默认扁平，已有选择不覆盖；未回复者在首页空闲时确认玻璃材质。 */
export function initializeSurfaceMaterial(): void {
  let style: string = DEFAULT_SURFACE_MATERIAL;
  let pending: boolean = false;
  let opacity: MaterialOpacity = DEFAULT_MODULE_OPACITY;
  let buttonOpacity: MaterialOpacity = DEFAULT_BUTTON_OPACITY;
  let dialogOpacity: MaterialOpacity = DEFAULT_DIALOG_OPACITY;
  try {
    const store: preferences.Preferences = surfacePreferences();
    opacity = readMaterialOpacity(store, FLAT_MODULE_OPACITY_KEY, GLASS_MODULE_OPACITY_KEY, DEFAULT_MODULE_OPACITY);
    buttonOpacity = readMaterialOpacity(store, FLAT_BUTTON_OPACITY_KEY, GLASS_BUTTON_OPACITY_KEY, DEFAULT_BUTTON_OPACITY);
    dialogOpacity = readMaterialOpacity(store, FLAT_DIALOG_OPACITY_KEY, GLASS_DIALOG_OPACITY_KEY, DEFAULT_DIALOG_OPACITY);
    const saved: preferences.ValueType = store.getSync(SURFACE_MATERIAL_KEY, DEFAULT_SURFACE_MATERIAL);
    if (typeof saved !== 'string' || !isSurfaceMaterial(saved)) { throw new Error('invalid_saved_setting:surface_material'); }
    style = saved;
    pending = style === 'flat' && store.getSync(GLASS_SUGGESTION_HANDLED_KEY, false) !== true;
    const needsMaterial: boolean = !store.hasSync(SURFACE_MATERIAL_KEY);
    const skipSuggestion: boolean = style === 'glass' && !store.hasSync(GLASS_SUGGESTION_HANDLED_KEY);
    if (needsMaterial) store.putSync(SURFACE_MATERIAL_KEY, style);
    if (skipSuggestion) store.putSync(GLASS_SUGGESTION_HANDLED_KEY, true);
    if (needsMaterial || skipSuggestion) store.flushSync();
  } catch (error) { hilog.warn(0x4342, 'jidecards', 'Surface material could not be loaded'); }
  AppStorage.setOrCreate<MaterialOpacity>(MODULE_OPACITY_KEY, opacity);
  AppStorage.setOrCreate<MaterialOpacity>(BUTTON_OPACITY_KEY, buttonOpacity);
  AppStorage.setOrCreate<MaterialOpacity>(DIALOG_OPACITY_KEY, dialogOpacity);
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


function readMaterialOpacity(store: preferences.Preferences, flatKey: string, glassKey: string,
  defaults: MaterialOpacity): MaterialOpacity {
  const flat = store.getSync(flatKey, defaults.flat);
  const glass = store.getSync(glassKey, defaults.glass);
  return {
    flat: typeof flat === 'number' && validModuleOpacity(flat) ? flat : defaults.flat,
    glass: typeof glass === 'number' && validModuleOpacity(glass) ? glass : defaults.glass
  };
}

async function saveMaterialOpacity(material: string, value: number, key: string, flatKey: string, glassKey: string,
  defaults: MaterialOpacity): Promise<void> {
  if (!isSurfaceMaterial(material) || !validModuleOpacity(value)) throw new Error('invalid_surface_opacity');
  const store: preferences.Preferences = surfacePreferences();
  const glass: boolean = material === 'glass';
  await saveLocalPreference(store, glass ? glassKey : flatKey, value, glass ? defaults.glass : defaults.flat);
  AppStorage.setOrCreate<MaterialOpacity>(key, readMaterialOpacity(store, flatKey, glassKey, defaults));
}

export async function saveModuleOpacity(material: string, value: number): Promise<void> {
  await saveMaterialOpacity(material, value, MODULE_OPACITY_KEY, FLAT_MODULE_OPACITY_KEY, GLASS_MODULE_OPACITY_KEY, DEFAULT_MODULE_OPACITY);
}

export async function saveButtonOpacity(material: string, value: number): Promise<void> {
  await saveMaterialOpacity(material, value, BUTTON_OPACITY_KEY, FLAT_BUTTON_OPACITY_KEY, GLASS_BUTTON_OPACITY_KEY, DEFAULT_BUTTON_OPACITY);
}

export async function saveDialogOpacity(material: string, value: number): Promise<void> {
  await saveMaterialOpacity(material, value, DIALOG_OPACITY_KEY, FLAT_DIALOG_OPACITY_KEY, GLASS_DIALOG_OPACITY_KEY, DEFAULT_DIALOG_OPACITY);
}
