// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ThemeModeSession } from '../model/settings/ThemeModeSession';
import { ThemeColorSession } from '../model/settings/ThemeColorSession';
import type { ThemeColorHost } from '../model/settings/ThemeColorSession';
import type { ThemeId } from '../model/ThemeCatalog';
import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../model/ThemeCatalog';
import { readSavedThemeColor, 保存颜色主题 } from '../model/颜色主题存储';
import type { AppThemeMode, ThemeModeHost } from '../model/settings/ThemeModeSession';
import { readSavedThemeMode, 保存主题模式 } from '../model/主题存储';
import { 解析是否深色 } from '../model/主题设置';
import { 颜色主题, 默认颜色主题 } from '../model/颜色主题';
import { 应用主题, readSystemDarkMode } from '../utils/主题控制器';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 刷新桌面卡片数据 } from '../model/FSRS控制器';

class AppThemeHost implements ThemeModeHost {
  /** @throws {Error} 严格读取失败由 ThemeModeSession 传回调用方。 */
  readSavedMode(): Promise<AppThemeMode> { return readSavedThemeMode(); }
  /** @throws {Error} 保存失败由 ThemeModeSession 转为未确认结果。 */
  saveMode(mode: AppThemeMode): Promise<void> { return 保存主题模式(mode); }
  /** @throws {Error} 设备主题读取失败由 ThemeModeSession 保留失败结果。 */
  systemDark(): boolean {
    const value: boolean = readSystemDarkMode();
    AppStorage.setOrCreate<boolean>('systemDarkMode', value);
    return value;
  }
  /** @throws {Error} 应用失败由 ThemeModeSession 返回 saved=true/applied=false。 */
  async applyMode(mode: AppThemeMode): Promise<void> {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { throw new Error('ability_context_unavailable'); }
    const dark: boolean = this.systemDark();
    await 应用主题(context, mode, dark, true);
    AppStorage.setOrCreate<AppThemeMode>('themeMode', mode);
    const color: 颜色主题 = AppStorage.get<颜色主题>('colorTheme') ?? 默认颜色主题;
    应用颜色主题(color, 解析是否深色(mode, this.systemDark()));
    // 桌面推送尽力完成，失败不能推翻已经保存并生效的应用偏好。
    刷新桌面卡片数据().catch((error: Object): void => {
      hilog.warn(0x4342, 'AppThemeService', 'Widget theme refresh failed: %{public}s', `${error}`);
    });
  }
}

/** 主题修改唯一拥有者；设置页、助手和撤销共用同一队列。 */
export const appThemeSession: ThemeModeSession = new ThemeModeSession(new AppThemeHost());

class AppThemeColorHost implements ThemeColorHost {
  /** @throws {Error} 严格读取失败传回调用方。 */
  readSavedColor(): Promise<ThemeId> { return readSavedThemeColor(); }
  /** @throws {Error} 持久化失败由会话返回未确认结果。 */
  saveColor(theme: ThemeId): Promise<void> { return 保存颜色主题(theme); }
  isAvailable(theme: ThemeId): boolean {
    return isThemeAvailable(theme, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? []);
  }
  /** @throws {Error} 读取当前已应用模式，颜色广播同步完成，不改写深浅色偏好。 */
  applyColor(theme: ThemeId): void {
    const mode: AppThemeMode | undefined = AppStorage.get<AppThemeMode>('themeMode');
    if (mode === undefined) { throw new Error('active_theme_unavailable'); }
    const dark: boolean = mode === 'dark' || (mode === 'system' && readSystemDarkMode());
    应用颜色主题(theme, dark);
    AppStorage.setOrCreate<ThemeId>('colorTheme', theme);
    刷新桌面卡片数据().catch((error: Object): void => {
      hilog.warn(0x4342, 'AppThemeService', 'Widget color refresh failed: %{public}s', `${error}`);
    });
  }
}

/** 颜色与深浅色使用不同持久化键；同步应用时读取当前另一维度。 */
export const appThemeColorSession: ThemeColorSession = new ThemeColorSession(new AppThemeColorHost());
