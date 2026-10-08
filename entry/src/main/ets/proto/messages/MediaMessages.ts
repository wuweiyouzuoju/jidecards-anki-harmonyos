// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { GenericStringList, MediaCheckMediaResponse, MediaTrashMediaFilesRequest } from '../generated/CoreMessages';
export interface CheckMediaResponse {
    unused: string[];
    missing: string[];
    missingMediaNotes: number[];
    report: string;
    haveTrash: boolean;
}
export interface CheckMediaSummary {
    unused: string[];
    unusedCount: number;
    missingCount: number;
    report: string;
    haveTrash: boolean;
}
export function decodeCheckMediaSummary(bytes: Uint8Array): CheckMediaSummary {
    const m = new MediaCheckMediaResponse(bytes);
    const result: CheckMediaSummary = { unused: m.getUnused(), unusedCount: m.getUnused().length,
        missingCount: m.countMissing(), report: m.getReport(), haveTrash: m.getHaveTrash() };
    return result;
}
export function encodeEmpty(): Uint8Array {
    return new Uint8Array(0);
}
export function decodeCheckMediaResponse(bytes: Uint8Array): CheckMediaResponse {
    const r = new MediaCheckMediaResponse(bytes);
    const out: CheckMediaResponse = {
        unused: [],
        missing: [],
        missingMediaNotes: [],
        report: '',
        haveTrash: false
    };
    if (r.hasUnused()) {
        out.unused.push(...r.getUnused());
    }
    if (r.hasMissing()) {
        out.missing.push(...r.getMissing());
    }
    if (r.hasMissingMediaNotes()) {
        out.missingMediaNotes.push(...r.getMissingMediaNotes());
    }
    if (r.hasReport()) {
        out.report = r.getReport();
    }
    if (r.hasHaveTrash()) {
        out.haveTrash = r.getHaveTrash();
    }
    return out;
}
export function encodeTrashMediaFilesRequest(fnames: string[]): Uint8Array {
    const w = new MediaTrashMediaFilesRequest();
    for (let i = 0; i < fnames.length; i++) {
        w.setFnames([fnames[i]]);
    }
    return w.转为字节();
}
export function decodeStringList(bytes: Uint8Array): string[] {
    return new GenericStringList(bytes).getVals();
}
