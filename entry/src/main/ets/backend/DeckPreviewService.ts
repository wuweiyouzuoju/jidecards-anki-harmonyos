// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { DeckPreviewBackend, DeckPreviewScope } from '../model/DeckPreviewSession';
import { DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds } from '../proto/messages/DeckPreviewMessages';

/** 原生层隔离正式集合；本服务不选择牌组、不评分、不推进学习队列。 */
export class DeckPreviewService implements DeckPreviewBackend {
  async cardIds(deckId: string, scope: DeckPreviewScope): Promise<number[]> {
    const bytes: Uint8Array = await 后端会话.获取实例().调用(
      DECK_PREVIEW_SERVICE, 0, encodeDeckPreviewRequest(deckId, scope));
    return decodeDeckPreviewIds(bytes);
  }
}
