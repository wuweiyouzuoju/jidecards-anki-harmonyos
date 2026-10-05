// SPDX-License-Identifier: AGPL-3.0-or-later
import { BURY_SUSPEND_MODE_SUSPEND, BURY_SUSPEND_MODE_BURY_USER } from '../proto/messages/SchedulerMessages';

export type BrowserCardStateKind = 'suspend' | 'bury';
export interface BrowserCardStateBackend {
  queue: (id: number) => Promise<number>;
  buryOrSuspend: (ids: number[], mode: number) => Promise<void>;
  restore: (ids: number[]) => Promise<void>;
}

/** 与 AnkiDroid 一致：全体处于目标状态才解除，混合选择统一暂停/今日跳过。 */
export async function toggleBrowserCardState(backend: BrowserCardStateBackend, input: number[],
  kind: BrowserCardStateKind): Promise<void> {
  const ids: number[] = Array.from(new Set<number>(input));
  if (ids.length === 0) return;
  let allInState: boolean = true;
  for (const id of ids) {
    const queue: number = await backend.queue(id);
    if (kind === 'suspend' ? queue !== -1 : queue !== -2 && queue !== -3) allInState = false;
  }
  if (allInState) await backend.restore(ids);
  else await backend.buryOrSuspend(ids, kind === 'suspend' ? BURY_SUSPEND_MODE_SUSPEND : BURY_SUSPEND_MODE_BURY_USER);
}
