// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReviewPreferenceEdit } from '../proto/messages/PreferencesMessages';
import { ReviewPreferences, decodeReviewPreferences, patchReviewPreferences,
  validatePreferenceEdit } from '../proto/messages/PreferencesMessages';
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity, syncActivity } from './SyncSettings';

export interface ReviewPreferencesBackend {
  read(): Promise<Uint8Array>;
  write(bytes: Uint8Array): Promise<void>;
  changed(): void;
}

/** 集合偏好唯一保存队列；接受的编辑快照独立于组件寿命。 */
export class ReviewPreferencesStore {
  private readonly backend: ReviewPreferencesBackend;
  private readonly scheduler: AutoSyncScheduler;
  private readonly activity: SyncActivity;
  private tail: Promise<void> = Promise.resolve();

  constructor(backend: ReviewPreferencesBackend, scheduler: AutoSyncScheduler = autoSyncScheduler,
    activity: SyncActivity = syncActivity) {
    this.backend = backend; this.scheduler = scheduler; this.activity = activity;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const owner: Object = new Object();
    this.scheduler.beginOperation(owner);
    const result: Promise<T> = this.tail.then(async (): Promise<T> => {
      try { await this.activity.waitForCollection(); return await operation(); }
      finally { this.scheduler.endOperation(owner); }
    });
    this.tail = result.then((): void => {}, (): void => {});
    return result;
  }

  read(): Promise<ReviewPreferences> {
    return this.enqueue(async (): Promise<ReviewPreferences> => decodeReviewPreferences(await this.backend.read()));
  }

  save(edits: ReviewPreferenceEdit[], expected?: ReviewPreferences): Promise<ReviewPreferences> {
    const baseline: string | undefined = expected === undefined ? undefined : JSON.stringify(expected);
    const snapshot: ReviewPreferenceEdit[] = edits.map((edit: ReviewPreferenceEdit): ReviewPreferenceEdit =>
      ({ field: edit.field, value: edit.value }));
    for (const edit of snapshot) validatePreferenceEdit(edit);
    return this.enqueue(async (): Promise<ReviewPreferences> => {
      const latest: Uint8Array = await this.backend.read();
      if (baseline !== undefined && JSON.stringify(decodeReviewPreferences(latest)) !== baseline) {
        throw new Error('preferences_changed_since_proposal');
      }
      if (snapshot.length === 0) return decodeReviewPreferences(latest);
      await this.backend.write(patchReviewPreferences(latest, snapshot));
      this.backend.changed();
      this.scheduler.request();
      return decodeReviewPreferences(await this.backend.read());
    });
  }
}

/** UI 使用分钟，协议使用整秒；允许已有非整分钟值精确往返。 */
export function preferenceSeconds(text: string): number {
  if (!new RegExp('^\\d+(\\.\\d+)?$').test(text.trim())) throw new Error('invalid_preference_minutes');
  const seconds: number = Number(text) * 60;
  const rounded: number = Math.round(seconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 999 * 60 || Math.abs(seconds - rounded) > 0.000001) {
    throw new Error('invalid_preference_minutes');
  }
  return rounded;
}
