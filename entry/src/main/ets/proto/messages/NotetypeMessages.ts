// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { NotetypesNotetypeConfigKind, NotetypesStockNotetypeKind } from '../generated/CoreMessages';
import { UTF8编码, UTF8解码 } from '../core/utf8';
import { GenericJson, GenericUInt32, NotetypesChangeNotetypeInfo, NotetypesChangeNotetypeRequest, NotetypesGetChangeNotetypeInfoRequest, NotetypesGetClozeFieldOrdsResponse, NotetypesNotetype, NotetypesNotetypeConfig, NotetypesNotetypeField, NotetypesNotetypeFieldConfig, NotetypesNotetypeId, NotetypesNotetypeNameId, NotetypesNotetypeNames, NotetypesNotetypeTemplate, NotetypesNotetypeTemplateConfig, NotetypesStockNotetype, NotetypesUpdateNotetypeLegacyRequest } from '../generated/CoreMessages';
import type { NoteFieldEditingOptions } from '../../model/NoteFieldEditing';
export const NOTE_TYPE_KIND_NORMAL: number = NotetypesNotetypeConfigKind.KIND_NORMAL;
export const NOTE_TYPE_KIND_CLOZE: number = NotetypesNotetypeConfigKind.KIND_CLOZE;
export interface NotetypeNameId {
    id: number;
    name: string;
}
export interface NotetypeField extends NoteFieldEditingOptions {
    ord: number;
    name: string;
    sticky?: boolean;
}
export interface NotetypeTemplateView {
    ord: number;
    name: string;
    questionFormat: string;
    answerFormat: string;
}
export interface NotetypeTemplatePreview extends NotetypeTemplateView {
    truncated: boolean;
}
export interface NotetypeView {
    templates?: NotetypeTemplateView[];
    optionalReverseFieldOrd?: number;
    originalStockKind?: number;
    clozeFieldOrds?: number[];
    imageOcclusionFields?: number[];
    id: number;
    name: string;
    kind: number;
    fields: NotetypeField[];
    fieldNames: string[];
}
export interface NotetypeCapabilities {
    templateCount?: number;
    templatePreviews?: NotetypeTemplatePreview[];
    notetypeId: number;
    name: string;
    kind: number;
    fieldNames: string[];
    clozeFieldOrds: number[];
}
export function encodeNotetypeId(id: number): Uint8Array {
    const writer = new NotetypesNotetypeId();
    if (id !== 0) {
        writer.setNtid(id);
    }
    return writer.转为字节();
}
export const 标准笔记类型种类 = {
    BASIC: NotetypesStockNotetypeKind.KIND_BASIC,
    BASIC_AND_REVERSED: NotetypesStockNotetypeKind.KIND_BASIC_AND_REVERSED,
    BASIC_OPTIONAL_REVERSED: NotetypesStockNotetypeKind.KIND_BASIC_OPTIONAL_REVERSED,
    BASIC_TYPING: NotetypesStockNotetypeKind.KIND_BASIC_TYPING,
    CLOZE: NotetypesStockNotetypeKind.KIND_CLOZE,
    IMAGE_OCCLUSION: NotetypesStockNotetypeKind.KIND_IMAGE_OCCLUSION
} as const;
export function encodeStockNotetype(kind: number): Uint8Array {
    const writer = new NotetypesStockNotetype();
    if (kind !== 0) {
        writer.setKind(kind);
    }
    return writer.转为字节();
}
export function decodeJsonString(bytes: Uint8Array): string {
    return UTF8解码(new GenericJson(bytes).getJson() ?? new Uint8Array(0));
}
export function encodeJsonString(json: string): Uint8Array {
    const m = new GenericJson();
    if (json !== '')
        m.setJson(UTF8编码(json));
    return m.toBytes();
}
function decodeUInt32(bytes: Uint8Array): number {
    return new GenericUInt32(bytes).getVal();
}
function decodeNotetypeField(bytes: Uint8Array): NotetypeField {
    const m = new NotetypesNotetypeField(bytes);
    const field: NotetypeField = { ord: m.hasOrd() ? decodeUInt32(m.getOrdLast()!) : 0, name: m.getName() };
    if (m.hasConfig()) {
        const c = new NotetypesNotetypeFieldConfig(m.getConfigLast()!);
        if (c.hasSticky())
            field.sticky = c.getSticky();
        if (c.hasRtl())
            field.rtl = c.getRtl();
        if (c.hasFontName())
            field.fontName = c.getFontName();
        if (c.hasFontSize())
            field.fontSize = c.getFontSize();
        if (c.hasDescription())
            field.description = c.getDescription();
        if (c.hasPlainText())
            field.plainText = c.getPlainText();
        if (c.hasCollapsed())
            field.collapsed = c.getCollapsed();
    }
    return field;
}
function decodeNotetypeConfig(bytes: Uint8Array, view: NotetypeView): number {
    const m = new NotetypesNotetypeConfig(bytes);
    if (m.hasOriginalStockKind())
        view.originalStockKind = m.getOriginalStockKind();
    return m.getKind();
}
function decodeTemplateConfig(bytes: Uint8Array, template: NotetypeTemplateView): void {
    const m = new NotetypesNotetypeTemplateConfig(bytes);
    if (m.hasQFormat())
        template.questionFormat = m.getQFormat();
    if (m.hasAFormat())
        template.answerFormat = m.getAFormat();
}
function decodeNotetypeTemplate(bytes: Uint8Array): NotetypeTemplateView {
    const m = new NotetypesNotetypeTemplate(bytes);
    const out: NotetypeTemplateView = { ord: m.hasOrd() ? decodeUInt32(m.getOrdLast()!) : 0, name: m.getName(), questionFormat: '', answerFormat: '' };
    if (m.hasConfig())
        decodeTemplateConfig(m.getConfigLast()!, out);
    return out;
}
export function previewNotetypeTemplates(templates: NotetypeTemplateView[]): NotetypeTemplatePreview[] {
    return templates.slice(0, 4).map((template: NotetypeTemplateView): NotetypeTemplatePreview => ({
        ord: template.ord, name: template.name,
        questionFormat: template.questionFormat.slice(0, 500),
        answerFormat: template.answerFormat.slice(0, 500),
        truncated: template.questionFormat.length > 500 || template.answerFormat.length > 500
    }));
}
export function decodeNotetype(bytes: Uint8Array): NotetypeView {
    const m = new NotetypesNotetype(bytes);
    const result: NotetypeView = { id: m.getId(), name: m.getName(), kind: NOTE_TYPE_KIND_NORMAL, fields: m.getFields().map((raw: Uint8Array): NotetypeField => decodeNotetypeField(raw)), fieldNames: [], templates: m.getTemplates().map((raw: Uint8Array): NotetypeTemplateView => decodeNotetypeTemplate(raw)) };
    if (m.hasConfig())
        result.kind = decodeNotetypeConfig(m.getConfigLast()!, result);
    result.fields.sort((a: NotetypeField, b: NotetypeField): number => a.ord - b.ord);
    result.fieldNames = result.fields.map((f: NotetypeField): string => f.name);
    result.templates!.sort((a: NotetypeTemplateView, b: NotetypeTemplateView): number => a.ord - b.ord);
    return result;
}
export function decodeClozeFieldOrds(bytes: Uint8Array): number[] {
    return Array.from(new Set<number>(new NotetypesGetClozeFieldOrdsResponse(bytes).getOrds())).sort((a: number, b: number): number => a - b);
}
function decodeNotetypeNameId(bytes: Uint8Array): NotetypeNameId {
    const m = new NotetypesNotetypeNameId(bytes);
    const out: NotetypeNameId = { id: m.getId(), name: m.getName() };
    return out;
}
export function decodeNotetypeNames(bytes: Uint8Array): NotetypeNameId[] {
    return new NotetypesNotetypeNames(bytes).getEntries().map((raw: Uint8Array): NotetypeNameId => decodeNotetypeNameId(raw));
}
export function encodeUpdateNotetypeLegacyRequest(json: string, skipChecks: boolean): Uint8Array {
    const writer = new NotetypesUpdateNotetypeLegacyRequest();
    if (json.length > 0) {
        writer.setJson(UTF8编码(json));
    }
    if (skipChecks) {
        writer.setSkipChecks(skipChecks);
    }
    return writer.转为字节();
}
export function encodeGetChangeNotetypeInfoRequest(旧笔记类型ID: number, 新笔记类型ID: number): Uint8Array {
    const writer = new NotetypesGetChangeNotetypeInfoRequest();
    if (旧笔记类型ID !== 0) {
        writer.setOldNotetypeId(旧笔记类型ID);
    }
    if (新笔记类型ID !== 0) {
        writer.setNewNotetypeId(新笔记类型ID);
    }
    return writer.转为字节();
}
export interface 变更笔记类型信息 {
    oldFieldNames: string[];
    oldTemplateNames: string[];
    newFieldNames: string[];
    newTemplateNames: string[];
    input: 变更笔记类型请求;
    oldNotetypeName: string;
}
export interface 变更笔记类型请求 {
    noteIds: number[];
    newFields: number[];
    newTemplates: number[];
    oldNotetypeId: number;
    newNotetypeId: number;
    currentSchema: number;
    oldNotetypeName: string;
    isCloze: boolean;
}
function decodeChangeNotetypeRequest(bytes: Uint8Array): 变更笔记类型请求 {
    const reader = new NotetypesChangeNotetypeRequest(bytes);
    const out: 变更笔记类型请求 = {
        noteIds: [],
        newFields: [],
        newTemplates: [],
        oldNotetypeId: 0,
        newNotetypeId: 0,
        currentSchema: 0,
        oldNotetypeName: '',
        isCloze: false
    };
    if (reader.hasNoteIds()) {
        out.noteIds.push(...reader.getNoteIds());
    }
    if (reader.hasNewFields()) {
        out.newFields.push(...reader.getNewFields());
    }
    if (reader.hasNewTemplates()) {
        out.newTemplates.push(...reader.getNewTemplates());
    }
    if (reader.hasOldNotetypeId()) {
        out.oldNotetypeId = reader.getOldNotetypeId();
    }
    if (reader.hasNewNotetypeId()) {
        out.newNotetypeId = reader.getNewNotetypeId();
    }
    if (reader.hasCurrentSchema()) {
        out.currentSchema = reader.getCurrentSchema();
    }
    if (reader.hasOldNotetypeName()) {
        out.oldNotetypeName = reader.getOldNotetypeName();
    }
    if (reader.hasIsCloze()) {
        out.isCloze = reader.getIsCloze();
    }
    return out;
}
export function decodeChangeNotetypeInfo(bytes: Uint8Array): 变更笔记类型信息 {
    const reader = new NotetypesChangeNotetypeInfo(bytes);
    const out: 变更笔记类型信息 = {
        oldFieldNames: [],
        oldTemplateNames: [],
        newFieldNames: [],
        newTemplateNames: [],
        input: {
            noteIds: [],
            newFields: [],
            newTemplates: [],
            oldNotetypeId: 0,
            newNotetypeId: 0,
            currentSchema: 0,
            oldNotetypeName: '',
            isCloze: false
        },
        oldNotetypeName: ''
    };
    if (reader.hasOldFieldNames()) {
        out.oldFieldNames.push(...reader.getOldFieldNames());
    }
    if (reader.hasOldTemplateNames()) {
        out.oldTemplateNames.push(...reader.getOldTemplateNames());
    }
    if (reader.hasNewFieldNames()) {
        out.newFieldNames.push(...reader.getNewFieldNames());
    }
    if (reader.hasNewTemplateNames()) {
        out.newTemplateNames.push(...reader.getNewTemplateNames());
    }
    if (reader.hasInput()) {
        out.input = decodeChangeNotetypeRequest(reader.getInputLast()!);
    }
    if (reader.hasOldNotetypeName()) {
        out.oldNotetypeName = reader.getOldNotetypeName();
    }
    return out;
}
export function encodeChangeNotetypeRequest(req: 变更笔记类型请求): Uint8Array {
    const writer = new NotetypesChangeNotetypeRequest();
    if (req.noteIds.length > 0) {
        writer.setNoteIds(req.noteIds);
    }
    if (req.newFields.length > 0) {
        writer.setNewFields(req.newFields);
    }
    if (req.newTemplates.length > 0) {
        writer.setNewTemplates(req.newTemplates);
    }
    if (req.oldNotetypeId !== 0) {
        writer.setOldNotetypeId(req.oldNotetypeId);
    }
    if (req.newNotetypeId !== 0) {
        writer.setNewNotetypeId(req.newNotetypeId);
    }
    if (req.currentSchema !== 0) {
        writer.setCurrentSchema(req.currentSchema);
    }
    if (req.oldNotetypeName !== '') {
        writer.setOldNotetypeName(req.oldNotetypeName);
    }
    if (req.isCloze) {
        writer.setIsCloze(true);
    }
    return writer.转为字节();
}
