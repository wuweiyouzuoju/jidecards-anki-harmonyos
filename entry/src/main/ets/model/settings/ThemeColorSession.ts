// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ThemeId, ThemeDefinition } from '../ThemeCatalog';
import { THEME_CATALOG } from '../ThemeCatalog';

export interface ThemeColorHost {
  readSavedColor(): Promise<ThemeId>;
  saveColor(theme: ThemeId): Promise<void>;
  applyColor(theme: ThemeId): void;
  isAvailable(theme: ThemeId): boolean;
}
export interface ThemeColorChange {
  status: 'completed' | 'partial';
  theme: ThemeId;
  previousTheme: ThemeId;
  saved: boolean;
  applied: boolean;
  errorCode: string;
}
export function isThemeId(value: string): boolean {
  return THEME_CATALOG.some((theme: ThemeDefinition): boolean => theme.id === value);
}

/** 同一颜色偏好的设置页/助手写入串行；确认前后值，权限和持久化值均在提交时重查。 */
export class ThemeColorSession {
  private readonly host: ThemeColorHost;
  private tail: Promise<void> = Promise.resolve();
  constructor(host: ThemeColorHost) { this.host = host; }

  read(): Promise<ThemeId> { return this.tail.then((): Promise<ThemeId> => this.host.readSavedColor()); }

  setColor(theme: ThemeId, expected: ThemeId | null = null): Promise<ThemeColorChange> {
    const result = this.tail.then(async (): Promise<ThemeColorChange> => {
      if (!isThemeId(theme)) { throw new Error('invalid_theme_color'); }
      if (!this.host.isAvailable(theme)) { throw new Error('theme_color_locked'); }
      const previous: ThemeId = await this.host.readSavedColor();
      if (expected !== null && previous !== expected) { throw new Error('setting_changed_since_proposal'); }
      const change: ThemeColorChange = { status: 'partial', theme: theme, previousTheme: previous,
        saved: false, applied: false, errorCode: '' };
      try {
        await this.host.saveColor(theme);
        if (await this.host.readSavedColor() !== theme) { throw new Error('theme_color_save_mismatch'); }
        change.saved = true;
      } catch (error) { change.errorCode = 'theme_color_save_unverified'; return change; }
      try { this.host.applyColor(theme); change.applied = true; change.status = 'completed'; }
      catch (error) { change.errorCode = 'theme_color_apply_failed'; }
      return change;
    });
    this.tail = result.then((): void => {}, (): void => {});
    return result;
  }
}
