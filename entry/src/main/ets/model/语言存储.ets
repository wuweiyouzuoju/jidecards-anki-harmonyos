// SPDX-License-Identifier: AGPL-3.0-or-later
import { i18n } from '@kit.LocalizationKit';
import { AppLocale, resolveAppLocale } from './AppLocales';

export type 语言模式 = AppLocale | 'en';

/** 系统拥有持久化；保留地区身份，旧 en 偏好按 en-US 显示。 */
export function 当前语言模式(): AppLocale {
  return resolveAppLocale(i18n.System.getAppPreferredLanguage());
}

/** @throws {Error} 系统设置失败时由调用方显示失败；配置通知负责刷新 UI。 */
export function 设置语言模式(模式: 语言模式): void {
  const locale: AppLocale = resolveAppLocale(模式);
  if (当前语言模式() === locale) return;
  i18n.System.setAppPreferredLanguage(locale);
}
