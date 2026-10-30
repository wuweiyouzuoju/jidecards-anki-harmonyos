// SPDX-License-Identifier: AGPL-3.0-or-later
export type AppLocale = 'zh-Hans' | 'en-GB' | 'en-US' | 'it-IT' | 'ja-JP' | 'vi-VN' | 'zh-HK' | 'zh-TW' |
  'ko-KR' | 'ru-RU' | 'de-DE' | 'fr-FR';
export interface AppLocaleOption { locale: AppLocale; nativeName: string; resourceDirectory: string; }

/** UI、JIDE 与验收共用此目录。en 是已保存偏好/旧提案的兼容输入。 */
export const APP_LOCALES: AppLocaleOption[] = [
  { locale: 'zh-Hans', nativeName: '简体中文', resourceDirectory: 'base' },
  { locale: 'zh-HK', nativeName: '繁體中文（中國香港）', resourceDirectory: 'zh_Hant_HK' },
  { locale: 'zh-TW', nativeName: '繁體中文（中國台灣）', resourceDirectory: 'zh_Hant_TW' },
  { locale: 'en-GB', nativeName: 'English (United Kingdom)', resourceDirectory: 'en_GB' },
  { locale: 'en-US', nativeName: 'English (United States)', resourceDirectory: 'en_US' },
  { locale: 'it-IT', nativeName: 'Italiano', resourceDirectory: 'it_IT' },
  { locale: 'ja-JP', nativeName: '日本語', resourceDirectory: 'ja_JP' },
  { locale: 'vi-VN', nativeName: 'Tiếng Việt', resourceDirectory: 'vi_VN' },
  { locale: 'ko-KR', nativeName: '한국어', resourceDirectory: 'ko_KR' },
  { locale: 'ru-RU', nativeName: 'Русский', resourceDirectory: 'ru_RU' },
  { locale: 'de-DE', nativeName: 'Deutsch', resourceDirectory: 'de_DE' },
  { locale: 'fr-FR', nativeName: 'Français', resourceDirectory: 'fr_FR' }
];

export function appLocaleValues(): string[] {
  return APP_LOCALES.map((option: AppLocaleOption): string => option.locale).concat(['en']);
}

export function resolveAppLocale(language: string): AppLocale {
  const tag: string = language.replace(/_/g, '-').toLowerCase();
  if (tag === 'en-gb' || tag.startsWith('en-gb-')) return 'en-GB';
  if (tag === 'en' || tag.startsWith('en-')) return 'en-US';
  if (tag === 'it' || tag.startsWith('it-')) return 'it-IT';
  if (tag === 'ja' || tag.startsWith('ja-')) return 'ja-JP';
  if (tag === 'vi' || tag.startsWith('vi-')) return 'vi-VN';
  if (tag === 'ko' || tag.startsWith('ko-')) return 'ko-KR';
  if (tag === 'ru' || tag.startsWith('ru-')) return 'ru-RU';
  if (tag === 'de' || tag.startsWith('de-')) return 'de-DE';
  if (tag === 'fr' || tag.startsWith('fr-')) return 'fr-FR';
  if (tag.startsWith('zh') && (tag.includes('-hk') || tag.includes('-mo'))) return 'zh-HK';
  if (tag.startsWith('zh') && (tag.includes('-tw') || tag.includes('-hant'))) return 'zh-TW';
  return 'zh-Hans';
}

export function appLocaleName(language: string): string {
  const locale: AppLocale = resolveAppLocale(language);
  return APP_LOCALES.find((option: AppLocaleOption): boolean => option.locale === locale)!.nativeName;
}

/** 公告内容由服务端仅提供中英两种版本；其他界面不得借用这一回退。 */
export function announcementLocale(language: string): 'zh-Hans' | 'en' {
  return resolveAppLocale(language).startsWith('zh') ? 'zh-Hans' : 'en';
}
