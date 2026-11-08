// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { CUSTOM_ACCENT_KEY, WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, WALLPAPER_LIGHT_KEY, WALLPAPER_DARK_KEY,
  DEFAULT_CUSTOM_ACCENT, normalizedAccent, maskOpacity, ACCENT_LIGHT_ADAPTATION_KEY, ACCENT_DARK_ADAPTATION_KEY, adaptationStrength } from '../model/AppearanceCustomization';
import { saveLocalPreference, readLocalPreference } from './LocalPreferenceWrite';
function context(): common.UIAbilityContext {
  const value: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (value === undefined) throw new Error('ability_context_unavailable');
  return value;
}
function store(): preferences.Preferences {
  return preferences.getPreferencesSync(context(), { name: 'jidecards_settings' });
}
/** 首屏主题应用前恢复；失败交给启动偏好读取边界。 */
export async function loadAppearanceCustomization(): Promise<void> {
  const saved: preferences.Preferences = store();
  const accent: preferences.ValueType = await readLocalPreference(saved, CUSTOM_ACCENT_KEY, DEFAULT_CUSTOM_ACCENT);
  const lightAdaptation: preferences.ValueType = await readLocalPreference(saved, ACCENT_LIGHT_ADAPTATION_KEY, 100);
  const darkAdaptation: preferences.ValueType = await readLocalPreference(saved, ACCENT_DARK_ADAPTATION_KEY, 100);
  const path: preferences.ValueType = await readLocalPreference(saved, WALLPAPER_KEY, '');
  const opacity: preferences.ValueType = await readLocalPreference(saved, WALLPAPER_OPACITY_KEY, 100);
  AppStorage.setOrCreate<number>(WALLPAPER_OPACITY_KEY,
    typeof opacity === 'number' && Number.isInteger(opacity) && opacity >= 0 && opacity <= 100 ? opacity : 100);
  const light: preferences.ValueType = await readLocalPreference(saved, WALLPAPER_LIGHT_KEY, 0.2);
  const dark: preferences.ValueType = await readLocalPreference(saved, WALLPAPER_DARK_KEY, 0.45);
  AppStorage.setOrCreate<number>(ACCENT_LIGHT_ADAPTATION_KEY, adaptationStrength(lightAdaptation as number));
  AppStorage.setOrCreate<number>(ACCENT_DARK_ADAPTATION_KEY, adaptationStrength(darkAdaptation as number));
  AppStorage.setOrCreate<string>(CUSTOM_ACCENT_KEY, normalizedAccent(accent as string));
  AppStorage.setOrCreate<string>(WALLPAPER_KEY, path as string);
  AppStorage.setOrCreate<number>(WALLPAPER_LIGHT_KEY, maskOpacity(light as number));
  AppStorage.setOrCreate<number>(WALLPAPER_DARK_KEY, maskOpacity(dark as number));
}
export async function saveCustomAccent(value: string): Promise<void> {
  await saveLocalPreference(store(), CUSTOM_ACCENT_KEY, normalizedAccent(value), DEFAULT_CUSTOM_ACCENT);
}
export async function saveWallpaperOpacity(value: number): Promise<void> {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('invalid_wallpaper_opacity');
  await saveLocalPreference(store(), WALLPAPER_OPACITY_KEY, value, 100);
}
export async function saveWallpaperMask(dark: boolean, value: number): Promise<void> {
  await saveLocalPreference(store(), dark ? WALLPAPER_DARK_KEY : WALLPAPER_LIGHT_KEY,
    maskOpacity(value), dark ? 0.45 : 0.2);
}
/** 新图先完整编码并关闭文件，再发布路径；旧图只在保存确认后移除。 */
export async function saveWallpaper(pixels: PixelMap | null, lossless: boolean = false): Promise<void> {
  const saved: preferences.Preferences = store();
  const previous: string = await readLocalPreference(saved, WALLPAPER_KEY, '') as string;
  let path: string = '';
  if (pixels !== null) {
    const extension: string = lossless ? '.png' : '.jpg';
    path = context().filesDir + '/wallpaper-' + Date.now().toString() + extension;
    const packer: image.ImagePacker = image.createImagePacker();
    try {
      const data: ArrayBuffer = await packer.packToData(pixels, {
        format: lossless ? 'image/png' : 'image/jpeg', quality: lossless ? 100 : 90
      });
      const file: fileIo.File = fileIo.openSync(path, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC);
      try { fileIo.writeSync(file.fd, data); } finally { fileIo.closeSync(file); }
    } catch (error) {
      if (fileIo.accessSync(path)) fileIo.unlinkSync(path);
      throw new Error(error instanceof Error ? error.message : 'wallpaper_encode_failed');
    } finally { packer.release(); }
  }
  // 回读失败时保留新旧文件，以免磁盘实际已保存却删掉所引用的新图。
  await saveLocalPreference(saved, WALLPAPER_KEY, path, '', previous);
  if (previous !== '' && previous !== path && previous.startsWith(context().filesDir + '/wallpaper-')) {
    try { if (fileIo.accessSync(previous)) fileIo.unlinkSync(previous); }
    catch (error) { console.warn('[appearance] Old wallpaper cleanup failed'); }
  }
}
