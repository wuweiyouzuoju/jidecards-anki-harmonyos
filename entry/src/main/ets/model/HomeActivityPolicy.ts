// SPDX-License-Identifier: AGPL-3.0-or-later

/** 页面只映射占用来源；各类操作在这里共享准入语义。媒体传输不等同集合占用。 */
export interface HomeActivityState {
  foreground: boolean;
  atHome: boolean;
  collectionReady: boolean;
  collectionBusy: boolean;
  dialogOpen: boolean;
  interactionBusy: boolean;
  startupChecking: boolean;
}

export function canPresentHomePrompt(state: HomeActivityState): boolean {
  return state.foreground && state.atHome && !state.collectionBusy &&
    !state.dialogOpen && !state.interactionBusy;
}

export function canStartHomeAutoSync(state: HomeActivityState): boolean {
  return state.foreground && state.collectionReady && !state.collectionBusy &&
    !state.dialogOpen && !state.interactionBusy && !state.startupChecking;
}
