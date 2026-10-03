// SPDX-License-Identifier: AGPL-3.0-or-later

export type AppThemeMode = 'system' | 'light' | 'dark';

export interface ThemeModeHost {
  readSavedMode(): Promise<AppThemeMode>;
  saveMode(mode: AppThemeMode): Promise<void>;
  applyMode(mode: AppThemeMode): Promise<void>;
  systemDark(): boolean;
}

export interface ThemeModeState {
  mode: AppThemeMode;
  systemDark: boolean;
  effectiveDark: boolean;
}

export interface ThemeModeChange {
  status: 'completed' | 'partial';
  mode: AppThemeMode;
  previousMode: AppThemeMode;
  saved: boolean;
  applied: boolean;
  errorCode: string;
  undoId: string;
}

export function isAppThemeMode(value: string): boolean {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 唯一队列串行处理页面、助手和撤销；撤销凭据仅在本进程中有效。 */
export class ThemeModeSession {
  private readonly host: ThemeModeHost;
  private tail: Promise<void> = Promise.resolve();
  private revision: number = 0;
  private undoId: string = '';
  private undoMode: AppThemeMode = 'system';
  private expectedMode: AppThemeMode = 'system';

  constructor(host: ThemeModeHost) { this.host = host; }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result: Promise<T> = this.tail.then(operation);
    this.tail = result.then((): void => {}, (): void => {});
    return result;
  }

  read(): Promise<ThemeModeState> {
    return this.enqueue(async (): Promise<ThemeModeState> => {
      const mode: AppThemeMode = await this.host.readSavedMode();
      const dark: boolean = this.host.systemDark();
      return { mode: mode, systemDark: dark, effectiveDark: mode === 'dark' || (mode === 'system' && dark) };
    });
  }

  setMode(mode: AppThemeMode): Promise<ThemeModeChange> {
    return this.enqueue(async (): Promise<ThemeModeChange> => {
      if (!isAppThemeMode(mode)) { throw new Error('invalid_theme_mode'); }
      const previous: AppThemeMode = await this.host.readSavedMode();
      return this.commit(mode, previous, true);
    });
  }

  undo(id: string): Promise<ThemeModeChange> {
    return this.enqueue(async (): Promise<ThemeModeChange> => {
      if (id.length === 0 || id !== this.undoId) { throw new Error('theme_undo_expired'); }
      const current: AppThemeMode = await this.host.readSavedMode();
      if (current !== this.expectedMode) { throw new Error('theme_undo_conflict'); }
      return this.commit(this.undoMode, current, false);
    });
  }

  private async commit(mode: AppThemeMode, previous: AppThemeMode,
    allowUndo: boolean): Promise<ThemeModeChange> {
    this.revision += 1;
    this.undoId = '';
    const result: ThemeModeChange = { status: 'partial', mode: mode, previousMode: previous,
      saved: false, applied: false, errorCode: '', undoId: '' };
    try {
      await this.host.saveMode(mode);
      if (await this.host.readSavedMode() !== mode) { throw new Error('theme_save_mismatch'); }
      result.saved = true;
    } catch (error) {
      // 保存可能部分完成；禁止盲目重试或宣称回滚，读工具可重新核对。
      result.errorCode = 'theme_save_unverified';
      return result;
    }
    if (allowUndo && mode !== previous) {
      this.undoId = `theme-${this.revision}`;
      this.undoMode = previous;
      this.expectedMode = mode;
      result.undoId = this.undoId;
    }
    try {
      await this.host.applyMode(mode);
      result.applied = true;
      result.status = 'completed';
    } catch (error) { result.errorCode = 'theme_apply_failed'; }
    return result;
  }
}
