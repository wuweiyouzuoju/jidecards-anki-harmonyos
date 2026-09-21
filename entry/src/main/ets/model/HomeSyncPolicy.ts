// SPDX-License-Identifier: AGPL-3.0-or-later
import { canStartHomeAutoSync } from './HomeActivityPolicy';
import type { HomeActivityState } from './HomeActivityPolicy';

export interface HomeSyncFacts {
  pending: boolean;
  manual: boolean;
  enabled: boolean;
  authenticated: boolean;
  foreground: boolean;
  locationSafe: boolean;
  externalImportPending: boolean;
  startupReady: boolean;
  panelOpen: boolean;
  transferActive: boolean;
  automaticAllowed: boolean;
  activity: HomeActivityState;
}

/** drop 消费无效意图；pause 停止轮询等待生命周期唤醒；wait 保留可重试意图。 */
export function decideHomeSync(facts: HomeSyncFacts): string {
  if (!facts.pending || (!facts.manual && !facts.enabled) || !facts.authenticated) return 'drop';
  if (!facts.foreground || !facts.locationSafe) return 'pause';
  const activity: HomeActivityState = {
    foreground: facts.activity.foreground, atHome: facts.activity.atHome, collectionReady: facts.activity.collectionReady,
    collectionBusy: facts.activity.collectionBusy, interactionBusy: facts.activity.interactionBusy,
    dialogOpen: facts.activity.dialogOpen, startupChecking: facts.manual ? false : facts.activity.startupChecking
  };
  if (facts.externalImportPending || (!facts.manual && !facts.startupReady) ||
    !canStartHomeAutoSync(activity) || facts.panelOpen ||
    (facts.manual ? facts.transferActive : !facts.automaticAllowed)) return 'wait';
  return 'start';
}
