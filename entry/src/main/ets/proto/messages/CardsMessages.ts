// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { 协议读取器 } from '../core/ProtoReader';
import { CardsCard, CardsCardId, CardsCardIds, CardsFsrsMemoryState, CardsRemoveCardsRequest, CardsSetDeckRequest, CardsSetFlagRequest, CardsUpdateCardsRequest } from '../generated/CoreMessages';
import { decodeOpChanges, decodeOpChangesWithCount } from './CollectionMessages';
export function encodeCardId(cid: number): Uint8Array {
    const w = new CardsCardId();
    if (cid !== 0) {
        w.setCid(cid);
    }
    return w.转为字节();
}
export function encodeCardIds(cids: number[]): Uint8Array {
    const w = new CardsCardIds();
    w.setCids(cids);
    return w.转为字节();
}
export enum CardType {
    NEW = 0,
    LEARNING = 1,
    REVIEW = 2,
    RELEARNING = 3
}
export enum CardQueue {
    SUSPENDED = -1,
    BURIED_MANUALLY = -2,
    BURIED_BY_SCHEDULE = -3,
    NEW = 0,
    LEARNING = 1,
    REVIEW = 2,
    DAY_LEARN = 3,
    PREVIEW = 4
}
export interface FsrsMemoryState {
    stability: number;
    difficulty: number;
}
export function decodeFsrsMemoryState(reader: 协议读取器): FsrsMemoryState {
    return memoryStateFromBytes(reader.读取剩余字节());
}
export interface Card {
    id: number;
    noteId: number;
    deckId: number;
    templateIdx: number;
    mtimeSecs: number;
    usn: number;
    ctype: number;
    queue: number;
    due: number;
    interval: number;
    easeFactor: number;
    reps: number;
    lapses: number;
    remainingSteps: number;
    originalDue: number;
    originalDeckId: number;
    flags: number;
    originalPosition?: number;
    memoryState?: FsrsMemoryState;
    desiredRetention?: number;
    decay?: number;
    lastReviewTimeSecs?: number;
    customData: string;
}
export function decodeCard(bytes: Uint8Array): Card {
    const reader = new CardsCard(bytes);
    const card: Card = {
        id: 0,
        noteId: 0,
        deckId: 0,
        templateIdx: 0,
        mtimeSecs: 0,
        usn: 0,
        ctype: 0,
        queue: 0,
        due: 0,
        interval: 0,
        easeFactor: 0,
        reps: 0,
        lapses: 0,
        remainingSteps: 0,
        originalDue: 0,
        originalDeckId: 0,
        flags: 0,
        customData: ''
    };
    if (reader.hasId()) {
        card.id = reader.getId();
    }
    if (reader.hasNoteId()) {
        card.noteId = reader.getNoteId();
    }
    if (reader.hasDeckId()) {
        card.deckId = reader.getDeckId();
    }
    if (reader.hasTemplateIdx()) {
        card.templateIdx = reader.getTemplateIdx();
    }
    if (reader.hasMtimeSecs()) {
        card.mtimeSecs = reader.getMtimeSecs();
    }
    if (reader.hasUsn()) {
        card.usn = reader.getUsn();
    }
    if (reader.hasCtype()) {
        card.ctype = reader.getCtype();
    }
    if (reader.hasQueue()) {
        card.queue = reader.getQueue();
    }
    if (reader.hasDue()) {
        card.due = reader.getDue();
    }
    if (reader.hasInterval()) {
        card.interval = reader.getInterval();
    }
    if (reader.hasEaseFactor()) {
        card.easeFactor = reader.getEaseFactor();
    }
    if (reader.hasReps()) {
        card.reps = reader.getReps();
    }
    if (reader.hasLapses()) {
        card.lapses = reader.getLapses();
    }
    if (reader.hasRemainingSteps()) {
        card.remainingSteps = reader.getRemainingSteps();
    }
    if (reader.hasOriginalDue()) {
        card.originalDue = reader.getOriginalDue();
    }
    if (reader.hasOriginalDeckId()) {
        card.originalDeckId = reader.getOriginalDeckId();
    }
    if (reader.hasFlags()) {
        card.flags = reader.getFlags();
    }
    if (reader.hasOriginalPosition()) {
        card.originalPosition = reader.getOriginalPosition();
    }
    if (reader.hasCustomData()) {
        card.customData = reader.getCustomData();
    }
    if (reader.hasMemoryState()) {
        card.memoryState = memoryStateFromBytes(reader.getMemoryStateLast()!);
    }
    if (reader.hasDesiredRetention()) {
        card.desiredRetention = reader.getDesiredRetention();
    }
    if (reader.hasDecay()) {
        card.decay = reader.getDecay();
    }
    if (reader.hasLastReviewTimeSecs()) {
        card.lastReviewTimeSecs = reader.getLastReviewTimeSecs();
    }
    return card;
}
export function encodeCard(card: Card): Uint8Array {
    const w = new CardsCard();
    if (card.id !== 0)
        w.setId(card.id);
    if (card.noteId !== 0)
        w.setNoteId(card.noteId);
    if (card.deckId !== 0)
        w.setDeckId(card.deckId);
    if (card.templateIdx !== 0)
        w.setTemplateIdx(card.templateIdx);
    if (card.mtimeSecs !== 0)
        w.setMtimeSecs(card.mtimeSecs);
    if (card.usn !== 0)
        w.setUsn(card.usn);
    if (card.ctype !== 0)
        w.setCtype(card.ctype);
    if (card.queue !== 0)
        w.setQueue(card.queue);
    if (card.due !== 0)
        w.setDue(card.due);
    if (card.interval !== 0)
        w.setInterval(card.interval);
    if (card.easeFactor !== 0)
        w.setEaseFactor(card.easeFactor);
    if (card.reps !== 0)
        w.setReps(card.reps);
    if (card.lapses !== 0)
        w.setLapses(card.lapses);
    if (card.remainingSteps !== 0)
        w.setRemainingSteps(card.remainingSteps);
    if (card.originalDue !== 0)
        w.setOriginalDue(card.originalDue);
    if (card.originalDeckId !== 0)
        w.setOriginalDeckId(card.originalDeckId);
    if (card.flags !== 0)
        w.setFlags(card.flags);
    if (card.originalPosition !== undefined)
        w.setOriginalPosition(card.originalPosition);
    if (card.customData !== '')
        w.setCustomData(card.customData);
    return w.转为字节();
}
export function encodeUpdateCardsRequest(cards: Card[], skipUndoEntry: boolean = false): Uint8Array {
    const w = new CardsUpdateCardsRequest();
    for (const card of cards) {
        w.setCards([encodeCard(card)]);
    }
    if (skipUndoEntry) {
        w.setSkipUndoEntry(true);
    }
    return w.转为字节();
}
export function encodeRemoveCardsRequest(cardIds: number[]): Uint8Array {
    const w = new CardsRemoveCardsRequest();
    w.setCardIds(cardIds);
    return w.转为字节();
}
export function encodeSetDeckRequest(cardIds: number[], deckId: number): Uint8Array {
    const w = new CardsSetDeckRequest();
    w.setCardIds(cardIds);
    if (deckId !== 0) {
        w.setDeckId(deckId);
    }
    return w.转为字节();
}
export function encodeSetFlagRequest(cardIds: number[], flag: number): Uint8Array {
    const w = new CardsSetFlagRequest();
    w.setCardIds(cardIds);
    if (flag !== 0) {
        w.setFlag(flag);
    }
    return w.转为字节();
}
export { decodeOpChanges as decodeUpdateCardsResponse, decodeOpChangesWithCount as decodeRemoveCardsResponse, decodeOpChangesWithCount as decodeSetDeckResponse, decodeOpChangesWithCount as decodeSetFlagResponse };
function memoryStateFromBytes(bytes: Uint8Array): FsrsMemoryState { const m = new CardsFsrsMemoryState(bytes); const out: FsrsMemoryState = { stability: m.getStability(), difficulty: m.getDifficulty() }; return out; }
