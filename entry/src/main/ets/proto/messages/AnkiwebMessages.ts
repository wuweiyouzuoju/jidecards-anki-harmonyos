// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { AnkiwebAddonInfo, AnkiwebCheckForUpdateRequest, AnkiwebCheckForUpdateResponse, AnkiwebGetAddonInfoRequest, AnkiwebGetAddonInfoResponse } from '../generated/CoreMessages';
export interface GetAddonInfoRequest {
    clientVersion: number;
    addonIds: number[];
}
export interface AddonInfo {
    id: number;
    modified: number;
    minVersion: number;
    maxVersion: number;
}
export interface GetAddonInfoResponse {
    info: AddonInfo[];
}
export interface CheckForUpdateRequest {
    version: number;
    buildhash: string;
    os: string;
    installId: number;
    lastMessageId: number;
}
export interface CheckForUpdateResponse {
    newVersion: string;
    currentTime: number;
    message: string;
    lastMessageId: number;
}
export function encodeGetAddonInfoRequest(req: GetAddonInfoRequest): Uint8Array {
    const w = new AnkiwebGetAddonInfoRequest();
    if (req.clientVersion !== 0)
        w.setClientVersion(req.clientVersion);
    w.setAddonIds(req.addonIds);
    return w.toBytes();
}
export function encodeCheckForUpdateRequest(req: CheckForUpdateRequest): Uint8Array {
    const w = new AnkiwebCheckForUpdateRequest();
    if (req.version !== 0) {
        w.setVersion(req.version);
    }
    if (req.buildhash !== '') {
        w.setBuildhash(req.buildhash);
    }
    if (req.os !== '') {
        w.setOs(req.os);
    }
    if (req.installId !== 0) {
        w.setInstallId(req.installId);
    }
    if (req.lastMessageId !== 0) {
        w.setLastMessageId(req.lastMessageId);
    }
    return w.转为字节();
}
export function decodeAddonInfo(bytes: Uint8Array): AddonInfo {
    const r = new AnkiwebAddonInfo(bytes);
    const out: AddonInfo = {
        id: 0,
        modified: 0,
        minVersion: 0,
        maxVersion: 0
    };
    if (r.hasId()) {
        out.id = r.getId();
    }
    if (r.hasModified()) {
        out.modified = r.getModified();
    }
    if (r.hasMinVersion()) {
        out.minVersion = r.getMinVersion();
    }
    if (r.hasMaxVersion()) {
        out.maxVersion = r.getMaxVersion();
    }
    return out;
}
export function decodeGetAddonInfoResponse(bytes: Uint8Array): GetAddonInfoResponse {
    const r = new AnkiwebGetAddonInfoResponse(bytes);
    const out: GetAddonInfoResponse = { info: [] };
    if (r.hasInfo()) {
        for (const item of r.getInfo())
            out.info.push(decodeAddonInfo(item));
    }
    return out;
}
export function decodeCheckForUpdateResponse(bytes: Uint8Array): CheckForUpdateResponse {
    const r = new AnkiwebCheckForUpdateResponse(bytes);
    const out: CheckForUpdateResponse = {
        newVersion: '',
        currentTime: 0,
        message: '',
        lastMessageId: 0
    };
    if (r.hasNewVersion()) {
        out.newVersion = r.getNewVersion();
    }
    if (r.hasCurrentTime()) {
        out.currentTime = r.getCurrentTime();
    }
    if (r.hasMessage()) {
        out.message = r.getMessage();
    }
    if (r.hasLastMessageId()) {
        out.lastMessageId = r.getLastMessageId();
    }
    return out;
}
