// SPDX-License-Identifier: AGPL-3.0-or-later
export interface StudyScreenAwakeBackend {
  read(): Promise<boolean>;
  set(value: boolean): Promise<void>;
}
/** 串行借用窗口状态；迟到启用也必须随后恢复，后台/离页不能留下常亮。 */
export class StudyScreenAwakeSession {
  private backend: StudyScreenAwakeBackend;
  private tail: Promise<void> = Promise.resolve();
  private original: boolean | null = null;
  private applied: boolean = false;
  constructor(backend: StudyScreenAwakeBackend) { this.backend = backend; }
  update(enabled: boolean): Promise<void> {
    const result: Promise<void> = this.tail.then(async (): Promise<void> => {
      if (enabled) {
        if (this.applied) return;
        if (this.original === null) this.original = await this.backend.read();
        await this.backend.set(true);
        this.applied = true;
      } else if (this.original !== null) {
        const previous: boolean = this.original;
        await this.backend.set(previous);
        this.original = null;
        this.applied = false;
      }
    });
    this.tail = result.then((): void => {}, (): void => {});
    return result;
  }
}
