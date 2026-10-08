// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { BackendBackendError, BackendBackendInit } from '../generated/CoreMessages';
export interface BackendInit {
    preferredLangs: string[];
    localeFolderPath: string;
    server: boolean;
}
export function encodeBackendInit(init: BackendInit): Uint8Array {
    const w = new BackendBackendInit();
    for (const lang of init.preferredLangs) {
        if (lang !== '') {
            w.setPreferredLangs([lang]);
        }
    }
    if (init.localeFolderPath !== '') {
        w.setLocaleFolderPath(init.localeFolderPath);
    }
    if (init.server) {
        w.setServer(true);
    }
    return w.转为字节();
}
export interface BackendErrorInfo {
    message: string;
    kind: number;
    context: string;
}
export function decodeBackendError(bytes: Uint8Array): BackendErrorInfo {
    const r = new BackendBackendError(bytes);
    const info: BackendErrorInfo = { message: '', kind: 0, context: '' };
    if (r.hasMessage()) {
        info.message = r.getMessage();
    }
    if (r.hasKind()) {
        info.kind = r.getKind();
    }
    if (r.hasContext()) {
        info.context = r.getContext();
    }
    return info;
}
