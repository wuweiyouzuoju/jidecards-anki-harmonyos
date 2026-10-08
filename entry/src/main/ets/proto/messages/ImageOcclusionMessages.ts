// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { ImageOcclusionAddImageOcclusionNoteRequest, ImageOcclusionGetImageForOcclusionRequest, ImageOcclusionGetImageForOcclusionResponse, ImageOcclusionGetImageOcclusionFieldsRequest, ImageOcclusionGetImageOcclusionFieldsResponse, ImageOcclusionGetImageOcclusionNoteRequest, ImageOcclusionGetImageOcclusionNoteResponse, ImageOcclusionGetImageOcclusionNoteResponseImageOcclusion, ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionNote, ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionProperty, ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionShape, ImageOcclusionImageOcclusionFieldIndexes, ImageOcclusionUpdateImageOcclusionNoteRequest } from '../generated/CoreMessages';
export interface ImageOcclusionFieldIndexes {
    occlusions: number;
    image: number;
    header: number;
    backExtra: number;
}
export interface GetImageForOcclusionResponse {
    data: Uint8Array;
    name: string;
}
export function encodeGetImageOcclusionFieldsRequest(notetypeId: number): Uint8Array {
    const writer = new ImageOcclusionGetImageOcclusionFieldsRequest();
    if (notetypeId !== 0) {
        writer.setNotetypeId(notetypeId);
    }
    return writer.转为字节();
}
function decodeImageOcclusionFieldIndexes(bytes: Uint8Array): ImageOcclusionFieldIndexes {
    const reader = new ImageOcclusionImageOcclusionFieldIndexes(bytes);
    const result: ImageOcclusionFieldIndexes = { occlusions: 0, image: 0, header: 0, backExtra: 0 };
    if (reader.hasOcclusions()) {
        result.occlusions = reader.getOcclusions();
    }
    if (reader.hasImage()) {
        result.image = reader.getImage();
    }
    if (reader.hasHeader()) {
        result.header = reader.getHeader();
    }
    if (reader.hasBackExtra()) {
        result.backExtra = reader.getBackExtra();
    }
    return result;
}
export function decodeGetImageOcclusionFieldsResponse(bytes: Uint8Array): ImageOcclusionFieldIndexes {
    return decodeImageOcclusionFieldIndexes(new ImageOcclusionGetImageOcclusionFieldsResponse(bytes).getFieldsLast() ?? new Uint8Array(0));
}
export function encodeGetImageForOcclusionRequest(path: string): Uint8Array {
    const writer = new ImageOcclusionGetImageForOcclusionRequest();
    if (path !== '') {
        writer.setPath(path);
    }
    return writer.转为字节();
}
export function decodeGetImageForOcclusionResponse(bytes: Uint8Array): GetImageForOcclusionResponse {
    const reader = new ImageOcclusionGetImageForOcclusionResponse(bytes);
    const result: GetImageForOcclusionResponse = { data: new Uint8Array(0), name: '' };
    if (reader.hasData()) {
        result.data = reader.getData();
    }
    if (reader.hasName()) {
        result.name = reader.getName();
    }
    return result;
}
export interface AddImageOcclusionNoteRequest {
    imagePath: string;
    occlusions: string;
    header: string;
    backExtra: string;
    tags: string[];
    notetypeId: number;
}
export function encodeAddImageOcclusionNoteRequest(req: AddImageOcclusionNoteRequest): Uint8Array {
    const writer = new ImageOcclusionAddImageOcclusionNoteRequest();
    if (req.imagePath !== '') {
        writer.setImagePath(req.imagePath);
    }
    if (req.occlusions !== '') {
        writer.setOcclusions(req.occlusions);
    }
    if (req.header !== '') {
        writer.setHeader(req.header);
    }
    if (req.backExtra !== '') {
        writer.setBackExtra(req.backExtra);
    }
    for (const tag of req.tags) {
        writer.setTags([tag]);
    }
    if (req.notetypeId !== 0) {
        writer.setNotetypeId(req.notetypeId);
    }
    return writer.转为字节();
}
export interface ImageOcclusionProperty {
    name: string;
    value: string;
}
export interface ImageOcclusionShape {
    shape: string;
    properties: ImageOcclusionProperty[];
}
export interface ImageOcclusion {
    shapes: ImageOcclusionShape[];
    ordinal: number;
}
export interface ImageOcclusionNote {
    imageData: Uint8Array;
    occlusions: ImageOcclusion[];
    header: string;
    backExtra: string;
    tags: string[];
    imageFileName: string;
    occludeInactive: boolean;
}
export interface GetImageOcclusionNoteResponse {
    note: ImageOcclusionNote | null;
    error: string;
}
export function encodeGetImageOcclusionNoteRequest(noteId: number): Uint8Array {
    const writer = new ImageOcclusionGetImageOcclusionNoteRequest();
    if (noteId !== 0) {
        writer.setNoteId(noteId);
    }
    return writer.转为字节();
}
export function decodeGetImageOcclusionNoteResponse(bytes: Uint8Array): GetImageOcclusionNoteResponse {
    const reader = new ImageOcclusionGetImageOcclusionNoteResponse(bytes);
    const result: GetImageOcclusionNoteResponse = { note: null, error: '' };
    if (reader.hasNote()) {
        result.note = decodeImageOcclusionNote(reader.getNoteLast()!);
    }
    if (reader.hasError()) {
        result.error = reader.getError();
    }
    return result;
}
function decodeImageOcclusionNote(bytes: Uint8Array): ImageOcclusionNote {
    const reader = new ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionNote(bytes);
    const result: ImageOcclusionNote = {
        imageData: new Uint8Array(0),
        occlusions: [],
        header: '',
        backExtra: '',
        tags: [],
        imageFileName: '',
        occludeInactive: false
    };
    if (reader.hasImageData()) {
        result.imageData = reader.getImageData();
    }
    if (reader.hasOcclusions()) {
        for (const item of reader.getOcclusions())
            result.occlusions.push(decodeImageOcclusion(item));
    }
    if (reader.hasHeader()) {
        result.header = reader.getHeader();
    }
    if (reader.hasBackExtra()) {
        result.backExtra = reader.getBackExtra();
    }
    if (reader.hasTags()) {
        result.tags.push(...reader.getTags());
    }
    if (reader.hasImageFileName()) {
        result.imageFileName = reader.getImageFileName();
    }
    if (reader.hasOccludeInactive()) {
        result.occludeInactive = reader.getOccludeInactive();
    }
    return result;
}
function decodeImageOcclusion(bytes: Uint8Array): ImageOcclusion {
    const reader = new ImageOcclusionGetImageOcclusionNoteResponseImageOcclusion(bytes);
    const result: ImageOcclusion = { shapes: [], ordinal: 0 };
    if (reader.hasShapes()) {
        for (const item of reader.getShapes())
            result.shapes.push(decodeImageOcclusionShape(item));
    }
    if (reader.hasOrdinal()) {
        result.ordinal = reader.getOrdinal();
    }
    return result;
}
function decodeImageOcclusionShape(bytes: Uint8Array): ImageOcclusionShape {
    const reader = new ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionShape(bytes);
    const result: ImageOcclusionShape = { shape: '', properties: [] };
    if (reader.hasShape()) {
        result.shape = reader.getShape();
    }
    if (reader.hasProperties()) {
        for (const item of reader.getProperties())
            result.properties.push(decodeImageOcclusionProperty(item));
    }
    return result;
}
function decodeImageOcclusionProperty(bytes: Uint8Array): ImageOcclusionProperty {
    const reader = new ImageOcclusionGetImageOcclusionNoteResponseImageOcclusionProperty(bytes);
    const result: ImageOcclusionProperty = { name: '', value: '' };
    if (reader.hasName()) {
        result.name = reader.getName();
    }
    if (reader.hasValue()) {
        result.value = reader.getValue();
    }
    return result;
}
export interface UpdateImageOcclusionNoteRequest {
    noteId: number;
    occlusions: string;
    header: string;
    backExtra: string;
    tags: string[];
}
export function encodeUpdateImageOcclusionNoteRequest(req: UpdateImageOcclusionNoteRequest): Uint8Array {
    const writer = new ImageOcclusionUpdateImageOcclusionNoteRequest();
    if (req.noteId !== 0) {
        writer.setNoteId(req.noteId);
    }
    if (req.occlusions !== '') {
        writer.setOcclusions(req.occlusions);
    }
    if (req.header !== '') {
        writer.setHeader(req.header);
    }
    if (req.backExtra !== '') {
        writer.setBackExtra(req.backExtra);
    }
    for (const tag of req.tags) {
        writer.setTags([tag]);
    }
    return writer.转为字节();
}
