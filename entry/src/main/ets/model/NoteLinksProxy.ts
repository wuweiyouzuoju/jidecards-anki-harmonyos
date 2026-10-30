// SPDX-License-Identifier: AGPL-3.0-or-later
/** Intents only. Each owning surface validates current document, foreground and blocking state. */
export class NoteLinksProxy {
  dispatch: (guid: string, action: string, version: number) => void = (): void => {};
  onLink(guid: string, action: string, version: number): void {
    if (guid.length > 128 || (action !== 'preview' && action !== 'edit')) return;
    this.dispatch(guid, action, version);
  }
}
