// SPDX-License-Identifier: AGPL-3.0-or-later
import { JideDeckPreviewRequest, JideDeckPreviewResponse } from '../generated/CoreMessages';
import { DeckPreviewRpc } from '../generated/PrivateRpc';
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
// Application-local service; locked Anki RPC IDs remain unchanged.
export const DECK_PREVIEW_SERVICE: number = DeckPreviewRpc.SERVICE;
export function encodeDeckPreviewRequest(deckId: string, scope: DeckPreviewScope): Uint8Array {
    const id: number = Number(deckId);
    if (!/^[1-9]\d*$/.test(deckId) || !Number.isSafeInteger(id) || scope < 0 || scope > 3 || !Number.isInteger(scope)) {
        throw new Error('Invalid deck preview request');
    }
    const writer = new JideDeckPreviewRequest();
    writer.setDeckId(id);
    writer.setScope(scope);
    return writer.转为字节();
}
export function decodeDeckPreviewIds(bytes: Uint8Array): number[] {
    return new JideDeckPreviewResponse(bytes).getCardIds();
}
