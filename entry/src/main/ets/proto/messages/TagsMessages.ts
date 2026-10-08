// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { GenericString, TagsCompleteTagRequest, TagsCompleteTagResponse, TagsFindAndReplaceTagRequest, TagsNoteIdsAndTagsRequest, TagsRenameTagsRequest, TagsSetTagCollapsedRequest, TagsTagTreeNode } from '../generated/CoreMessages';
import { decodeOpChanges } from './CollectionMessages';
export { decodeOpChanges, decodeOpChangesWithCount } from './CollectionMessages';
export interface TagTreeNode {
    name: string;
    children: TagTreeNode[];
    level: number;
    collapsed: boolean;
}
export interface SetTagCollapsedRequest {
    name: string;
    collapsed: boolean;
}
export function decodeTagTreeNode(bytes: Uint8Array): TagTreeNode {
    const r = new TagsTagTreeNode(bytes);
    const node: TagTreeNode = {
        name: '',
        children: [],
        level: 0,
        collapsed: false
    };
    if (r.hasName()) {
        node.name = r.getName();
    }
    if (r.hasChildren()) {
        for (const item of r.getChildren())
            node.children.push(decodeTagTreeNode(item));
    }
    if (r.hasLevel()) {
        node.level = r.getLevel();
    }
    if (r.hasCollapsed()) {
        node.collapsed = r.getCollapsed();
    }
    return node;
}
export function encodeSetTagCollapsedRequest(req: SetTagCollapsedRequest): Uint8Array {
    const w = new TagsSetTagCollapsedRequest();
    if (req.name !== '') {
        w.setName(req.name);
    }
    if (req.collapsed) {
        w.setCollapsed(req.collapsed);
    }
    return w.转为字节();
}
export function encodeEmptyRequest(): Uint8Array {
    return new Uint8Array(0);
}
export function encodeStringRequest(值: string): Uint8Array {
    const w = new GenericString();
    if (值 !== '') {
        w.setVal(值);
    }
    return w.转为字节();
}
export interface RenameTagsRequest {
    currentPrefix: string;
    newPrefix: string;
}
export function encodeRenameTagsRequest(req: RenameTagsRequest): Uint8Array {
    const w = new TagsRenameTagsRequest();
    if (req.currentPrefix !== '') {
        w.setCurrentPrefix(req.currentPrefix);
    }
    if (req.newPrefix !== '') {
        w.setNewPrefix(req.newPrefix);
    }
    return w.转为字节();
}
export interface FindAndReplaceTagRequest {
    noteIds: number[];
    search: string;
    replacement: string;
    regex: boolean;
    matchCase: boolean;
}
export function encodeFindAndReplaceTagRequest(req: FindAndReplaceTagRequest): Uint8Array {
    const w = new TagsFindAndReplaceTagRequest();
    if (req.noteIds.length > 0) {
        w.setNoteIds(req.noteIds);
    }
    if (req.search !== '') {
        w.setSearch(req.search);
    }
    if (req.replacement !== '') {
        w.setReplacement(req.replacement);
    }
    if (req.regex) {
        w.setRegex(true);
    }
    if (req.matchCase) {
        w.setMatchCase(true);
    }
    return w.转为字节();
}
export interface CompleteTagRequest {
    input: string;
    matchLimit: number;
}
export interface CompleteTagResponse {
    tags: string[];
}
export function encodeCompleteTagRequest(req: CompleteTagRequest): Uint8Array {
    const w = new TagsCompleteTagRequest();
    if (req.input !== '') {
        w.setInput(req.input);
    }
    if (req.matchLimit > 0) {
        w.setMatchLimit(req.matchLimit);
    }
    return w.转为字节();
}
export function decodeCompleteTagResponse(bytes: Uint8Array): CompleteTagResponse {
    const result: CompleteTagResponse = { tags: new TagsCompleteTagResponse(bytes).getTags() };
    return result;
}
export interface NoteIdsAndTagsRequest {
    noteIds: number[];
    tags: string;
}
export function encodeNoteIdsAndTagsRequest(req: NoteIdsAndTagsRequest): Uint8Array {
    const w = new TagsNoteIdsAndTagsRequest();
    if (req.noteIds.length > 0) {
        w.setNoteIds(req.noteIds);
    }
    if (req.tags !== '') {
        w.setTags(req.tags);
    }
    return w.转为字节();
}
