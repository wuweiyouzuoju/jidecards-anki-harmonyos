// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ThemePalette {
  page: string;
  surface: string;
  text: string;
  secondaryText: string;
  border: string;
  action: string;
}

/** 语义色来自当前闪卡资源；调用返回独立值，不暴露共享可变对象。 */
export function themePalette(dark: boolean): ThemePalette {
  if (dark) {
    return { page: '#10151D', surface: '#18202B', text: '#F1F5F9',
      secondaryText: '#B8C1CE', border: '#77869A', action: '#5C84E6' };
  }
  return { page: '#F5F7FA', surface: '#FFFFFF', text: '#182230',
    secondaryText: '#5D6878', border: '#CFD7E3', action: '#2F5FD0' };
}

/** 系统颜色由宿主显式传入，不能从已被应用强制的资源模式推测。 */
export function resolveDarkMode(mode: string, systemDark: boolean): boolean {
  if (mode === 'light') { return false; }
  if (mode === 'dark') { return true; }
  if (mode === 'auto') { return systemDark; }
  throw new Error('Invalid theme mode');
}
