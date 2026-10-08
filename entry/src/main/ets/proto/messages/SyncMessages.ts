// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { SyncSyncStatusResponseRequired, SyncSyncCollectionResponseChangesRequired } from '../generated/CoreMessages';
import { GenericBool, GenericString, SyncFullUploadOrDownloadRequest, SyncMediaSyncProgress, SyncMediaSyncStatusResponse, SyncSyncAuth, SyncSyncCollectionRequest, SyncSyncCollectionResponse, SyncSyncLoginRequest, SyncSyncStatusResponse } from '../generated/CoreMessages';
export interface SyncStatusRequiredValues {
    NO_CHANGES: number;
    NORMAL_SYNC: number;
    FULL_SYNC: number;
}
export const SYNC_STATUS_REQUIRED: SyncStatusRequiredValues = {
    NO_CHANGES: SyncSyncStatusResponseRequired.NO_CHANGES,
    NORMAL_SYNC: SyncSyncStatusResponseRequired.NORMAL_SYNC,
    FULL_SYNC: SyncSyncStatusResponseRequired.FULL_SYNC
};
export interface SyncCollectionRequiredValues {
    NO_CHANGES: number;
    NORMAL_SYNC: number;
    FULL_SYNC: number;
    FULL_DOWNLOAD: number;
    FULL_UPLOAD: number;
}
export const SYNC_COLLECTION_REQUIRED: SyncCollectionRequiredValues = {
    NO_CHANGES: SyncSyncCollectionResponseChangesRequired.NO_CHANGES,
    NORMAL_SYNC: SyncSyncCollectionResponseChangesRequired.NORMAL_SYNC,
    FULL_SYNC: SyncSyncCollectionResponseChangesRequired.FULL_SYNC,
    FULL_DOWNLOAD: SyncSyncCollectionResponseChangesRequired.FULL_DOWNLOAD,
    FULL_UPLOAD: SyncSyncCollectionResponseChangesRequired.FULL_UPLOAD
};
export interface SyncAuth {
    hkey: string;
    endpoint: string;
    ioTimeoutSecs: number;
}
export interface SyncLoginRequest {
    username: string;
    password: string;
    endpoint: string;
}
export interface SyncStatusResponse {
    required: number;
    newEndpoint: string;
}
export interface SyncCollectionRequest {
    auth: SyncAuth;
    syncMedia: boolean;
}
export interface SyncCollectionResponse {
    hostNumber: number;
    serverMessage: string;
    required: number;
    newEndpoint: string;
    serverMediaUsn: number;
}
export interface MediaSyncStatusResponse {
    active: boolean;
    progress: MediaSyncProgress;
}
export interface MediaSyncProgress {
    checked: string;
    added: string;
    removed: string;
}
export interface FullUploadOrDownloadRequest {
    auth: SyncAuth;
    upload: boolean;
    serverUsn: number | null;
}
export function encodeSyncAuth(auth: SyncAuth): Uint8Array {
    const w = new SyncSyncAuth();
    if (auth.hkey !== '') {
        w.setHkey(auth.hkey);
    }
    if (auth.endpoint !== '') {
        w.setEndpoint(auth.endpoint);
    }
    if (auth.ioTimeoutSecs !== 0) {
        w.setIoTimeoutSecs(auth.ioTimeoutSecs);
    }
    return w.转为字节();
}
export function encodeSyncLoginRequest(req: SyncLoginRequest): Uint8Array {
    const w = new SyncSyncLoginRequest();
    if (req.username !== '') {
        w.setUsername(req.username);
    }
    if (req.password !== '') {
        w.setPassword(req.password);
    }
    if (req.endpoint !== '') {
        w.setEndpoint(req.endpoint);
    }
    return w.转为字节();
}
export function encodeSyncCollectionRequest(req: SyncCollectionRequest): Uint8Array {
    const w = new SyncSyncCollectionRequest();
    const authBytes = encodeSyncAuth(req.auth);
    if (authBytes.length > 0) {
        w.setAuth(authBytes);
    }
    if (req.syncMedia) {
        w.setSyncMedia(req.syncMedia);
    }
    return w.转为字节();
}
export function encodeMediaSyncProgress(progress: MediaSyncProgress): Uint8Array {
    const w = new SyncMediaSyncProgress();
    if (progress.checked !== '') {
        w.setChecked(progress.checked);
    }
    if (progress.added !== '') {
        w.setAdded(progress.added);
    }
    if (progress.removed !== '') {
        w.setRemoved(progress.removed);
    }
    return w.转为字节();
}
export function encodeFullUploadOrDownloadRequest(req: FullUploadOrDownloadRequest): Uint8Array {
    const w = new SyncFullUploadOrDownloadRequest();
    const authBytes = encodeSyncAuth(req.auth);
    if (authBytes.length > 0) {
        w.setAuth(authBytes);
    }
    if (req.upload) {
        w.setUpload(req.upload);
    }
    if (req.serverUsn !== null) {
        if (req.serverUsn < 0) {
            w.setServerUsn(req.serverUsn);
        }
        else {
            w.setServerUsn(req.serverUsn);
        }
    }
    return w.转为字节();
}
export function encodeEmptyRequest(): Uint8Array {
    return new Uint8Array(0);
}
export function encodeStringRequest(value: string): Uint8Array {
    const w = new GenericString();
    if (value !== '') {
        w.setVal(value);
    }
    return w.转为字节();
}
export function decodeBoolResponse(bytes: Uint8Array): boolean {
    const r = new GenericBool(bytes);
    let value = false;
    if (r.hasVal()) {
        value = r.getVal();
    }
    return value;
}
export function decodeSyncAuth(bytes: Uint8Array): SyncAuth {
    const r = new SyncSyncAuth(bytes);
    const out: SyncAuth = {
        hkey: '',
        endpoint: '',
        ioTimeoutSecs: 0
    };
    if (r.hasHkey()) {
        out.hkey = r.getHkey();
    }
    if (r.hasEndpoint()) {
        out.endpoint = r.getEndpoint();
    }
    if (r.hasIoTimeoutSecs()) {
        out.ioTimeoutSecs = r.getIoTimeoutSecs();
    }
    return out;
}
export function decodeSyncStatusResponse(bytes: Uint8Array): SyncStatusResponse {
    const r = new SyncSyncStatusResponse(bytes);
    const out: SyncStatusResponse = {
        required: SYNC_STATUS_REQUIRED.NO_CHANGES,
        newEndpoint: ''
    };
    if (r.hasRequired()) {
        out.required = r.getRequired();
    }
    if (r.hasNewEndpoint()) {
        out.newEndpoint = r.getNewEndpoint();
    }
    return out;
}
export function decodeSyncCollectionResponse(bytes: Uint8Array): SyncCollectionResponse {
    const r = new SyncSyncCollectionResponse(bytes);
    const out: SyncCollectionResponse = {
        hostNumber: 0,
        serverMessage: '',
        required: SYNC_COLLECTION_REQUIRED.NO_CHANGES,
        newEndpoint: '',
        serverMediaUsn: 0
    };
    if (r.hasHostNumber()) {
        out.hostNumber = r.getHostNumber();
    }
    if (r.hasServerMessage()) {
        out.serverMessage = r.getServerMessage();
    }
    if (r.hasRequired()) {
        out.required = r.getRequired();
    }
    if (r.hasNewEndpoint()) {
        out.newEndpoint = r.getNewEndpoint();
    }
    if (r.hasServerMediaUsn()) {
        out.serverMediaUsn = r.getServerMediaUsn();
    }
    return out;
}
export function decodeMediaSyncProgress(bytes: Uint8Array): MediaSyncProgress {
    const r = new SyncMediaSyncProgress(bytes);
    const out: MediaSyncProgress = {
        checked: '',
        added: '',
        removed: ''
    };
    if (r.hasChecked()) {
        out.checked = r.getChecked();
    }
    if (r.hasAdded()) {
        out.added = r.getAdded();
    }
    if (r.hasRemoved()) {
        out.removed = r.getRemoved();
    }
    return out;
}
export function decodeMediaSyncStatusResponse(bytes: Uint8Array): MediaSyncStatusResponse {
    const r = new SyncMediaSyncStatusResponse(bytes);
    const out: MediaSyncStatusResponse = {
        active: false,
        progress: {
            checked: '',
            added: '',
            removed: ''
        }
    };
    if (r.hasActive()) {
        out.active = r.getActive();
    }
    if (r.hasProgress()) {
        out.progress = decodeMediaSyncProgress(r.getProgressLast()!);
    }
    return out;
}
