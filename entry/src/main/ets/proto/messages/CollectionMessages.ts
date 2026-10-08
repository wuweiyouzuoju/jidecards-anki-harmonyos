// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { CollectionCheckDatabaseResponse, CollectionCloseCollectionRequest, CollectionOpChanges, CollectionOpChangesAfterUndo, CollectionOpChangesWithCount, CollectionOpChangesWithId, CollectionOpenCollectionRequest, CollectionUndoStatus } from '../generated/CoreMessages';
export interface OpenCollectionRequest {
    collectionPath: string;
    mediaFolderPath: string;
    mediaDbPath: string;
}
export function encodeOpenCollectionRequest(req: OpenCollectionRequest): Uint8Array {
    const w = new CollectionOpenCollectionRequest();
    if (req.collectionPath !== '') {
        w.setCollectionPath(req.collectionPath);
    }
    if (req.mediaFolderPath !== '') {
        w.setMediaFolderPath(req.mediaFolderPath);
    }
    if (req.mediaDbPath !== '') {
        w.setMediaDbPath(req.mediaDbPath);
    }
    return w.转为字节();
}
export function encodeCloseCollectionRequest(downgradeToSchema11: boolean = false): Uint8Array {
    const w = new CollectionCloseCollectionRequest();
    if (downgradeToSchema11) {
        w.setDowngradeToSchema11(downgradeToSchema11);
    }
    return w.转为字节();
}
export function decodeOpChangesWithId(bytes: Uint8Array): number {
    return new CollectionOpChangesWithId(bytes).getId();
}
export function decodeOpChangesWithCount(bytes: Uint8Array): number {
    return new CollectionOpChangesWithCount(bytes).getCount();
}
export interface OpChanges {
    card: boolean;
    note: boolean;
    deck: boolean;
    tag: boolean;
    notetype: boolean;
    config: boolean;
    deckConfig: boolean;
    mtime: boolean;
    browserTable: boolean;
    browserSidebar: boolean;
    noteText: boolean;
    studyQueues: boolean;
}
export function decodeOpChanges(bytes: Uint8Array): OpChanges {
    const r = new CollectionOpChanges(bytes);
    const out: OpChanges = {
        card: false,
        note: false,
        deck: false,
        tag: false,
        notetype: false,
        config: false,
        deckConfig: false,
        mtime: false,
        browserTable: false,
        browserSidebar: false,
        noteText: false,
        studyQueues: false
    };
    if (r.hasCard()) {
        out.card = r.getCard();
    }
    if (r.hasNote()) {
        out.note = r.getNote();
    }
    if (r.hasDeck()) {
        out.deck = r.getDeck();
    }
    if (r.hasTag()) {
        out.tag = r.getTag();
    }
    if (r.hasNotetype()) {
        out.notetype = r.getNotetype();
    }
    if (r.hasConfig()) {
        out.config = r.getConfig();
    }
    if (r.hasBrowserTable()) {
        out.browserTable = r.getBrowserTable();
    }
    if (r.hasBrowserSidebar()) {
        out.browserSidebar = r.getBrowserSidebar();
    }
    if (r.hasNoteText()) {
        out.noteText = r.getNoteText();
    }
    if (r.hasStudyQueues()) {
        out.studyQueues = r.getStudyQueues();
    }
    if (r.hasDeckConfig()) {
        out.deckConfig = r.getDeckConfig();
    }
    if (r.hasMtime()) {
        out.mtime = r.getMtime();
    }
    return out;
}
export interface UndoStatus {
    undo: string;
    redo: string;
    lastStep: number;
}
export function decodeUndoStatus(bytes: Uint8Array): UndoStatus {
    const r = new CollectionUndoStatus(bytes);
    const out: UndoStatus = { undo: '', redo: '', lastStep: 0 };
    if (r.hasUndo()) {
        out.undo = r.getUndo();
    }
    if (r.hasRedo()) {
        out.redo = r.getRedo();
    }
    if (r.hasLastStep()) {
        out.lastStep = r.getLastStep();
    }
    return out;
}
export interface OpChangesAfterUndo {
    changes: OpChanges | null;
    operation: string;
    revertedToTimestamp: number;
    newStatus: UndoStatus | null;
    counter: number;
}
export function decodeOpChangesAfterUndo(bytes: Uint8Array): OpChangesAfterUndo {
    const r = new CollectionOpChangesAfterUndo(bytes);
    const out: OpChangesAfterUndo = {
        changes: null,
        operation: '',
        revertedToTimestamp: 0,
        newStatus: null,
        counter: 0
    };
    if (r.hasChanges()) {
        out.changes = decodeOpChanges(r.getChangesLast()!);
    }
    if (r.hasOperation()) {
        out.operation = r.getOperation();
    }
    if (r.hasRevertedToTimestamp()) {
        out.revertedToTimestamp = r.getRevertedToTimestamp();
    }
    if (r.hasNewStatus()) {
        out.newStatus = decodeUndoStatus(r.getNewStatusLast()!);
    }
    if (r.hasCounter()) {
        out.counter = r.getCounter();
    }
    return out;
}
export function decodeCheckDatabaseResponse(bytes: Uint8Array): string[] {
    return new CollectionCheckDatabaseResponse(bytes).getProblems();
}
