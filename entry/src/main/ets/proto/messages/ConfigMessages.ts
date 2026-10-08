// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { ConfigConfigKeyBool } from '../generated/CoreMessages';
import { UTF8编码, UTF8解码 } from '../core/utf8';
import { ConfigGetConfigBoolRequest, ConfigSetConfigBoolRequest, ConfigSetConfigJsonRequest, GenericBool, GenericJson, GenericString } from '../generated/CoreMessages';
export { decodeOpChanges } from './CollectionMessages';
export enum ConfigKeyBool {
    BROWSER_TABLE_SHOW_NOTES_MODE = ConfigConfigKeyBool.BROWSER_TABLE_SHOW_NOTES_MODE,
    COLLAPSE_TAGS = ConfigConfigKeyBool.COLLAPSE_TAGS,
    COLLAPSE_DECKS = ConfigConfigKeyBool.COLLAPSE_DECKS,
    COLLAPSE_SAVED_SEARCHES = ConfigConfigKeyBool.COLLAPSE_SAVED_SEARCHES
}
export function encodeStringRequest(value: string): Uint8Array {
    const w = new GenericString();
    if (value !== '') {
        w.setVal(value);
    }
    return w.转为字节();
}
export function decodeJsonResponse(bytes: Uint8Array): string {
    return UTF8解码(new GenericJson(bytes).getJson() ?? new Uint8Array(0));
}
export function decodeBoolResponse(bytes: Uint8Array): boolean {
    return new GenericBool(bytes).getVal();
}
export function encodeEmptyRequest(): Uint8Array {
    return new Uint8Array(0);
}
export function encodeGetConfigBoolRequest(key: ConfigKeyBool): Uint8Array {
    const w = new ConfigGetConfigBoolRequest();
    if ((key as number) !== 0) {
        w.setKey(key);
    }
    return w.转为字节();
}
export interface SetConfigBoolRequest {
    key: ConfigKeyBool;
    value: boolean;
    undoable: boolean;
}
export function encodeSetConfigBoolRequest(req: SetConfigBoolRequest): Uint8Array {
    const w = new ConfigSetConfigBoolRequest();
    if ((req.key as number) !== 0) {
        w.setKey(req.key);
    }
    if (req.value) {
        w.setValue(req.value);
    }
    if (req.undoable) {
        w.setUndoable(req.undoable);
    }
    return w.转为字节();
}
export interface SetConfigJsonRequest {
    key: string;
    valueJson: string;
    undoable: boolean;
}
export function encodeSetConfigJsonRequest(req: SetConfigJsonRequest): Uint8Array {
    const w = new ConfigSetConfigJsonRequest();
    if (req.key !== '')
        w.setKey(req.key);
    if (req.valueJson !== '')
        w.setValueJson(UTF8编码(req.valueJson));
    if (req.undoable)
        w.setUndoable(true);
    return w.toBytes();
}
