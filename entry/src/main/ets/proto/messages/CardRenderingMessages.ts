// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { 协议写入器 } from '../core/ProtoWriter';
import { UTF8编码 } from '../core/utf8';
import { CardRenderingAVTag, CardRenderingCompareAnswerRequest, CardRenderingEmptyCardsReport, CardRenderingEmptyCardsReportNoteWithEmptyCards, CardRenderingExtractAvTagsRequest, CardRenderingExtractAvTagsResponse, CardRenderingExtractClozeForTypingRequest, CardRenderingExtractLatexRequest, CardRenderingExtractLatexResponse, CardRenderingRenderCardResponse, CardRenderingRenderExistingCardRequest, CardRenderingRenderUncommittedCardLegacyRequest, CardRenderingRenderedTemplateNode, CardRenderingRenderedTemplateReplacement, CardRenderingTTSTag, GenericString } from '../generated/CoreMessages';
import type { EditableNote } from './NoteMessages';
import { encodeNote } from './NoteMessages';
export function encodeRenderUncommittedCardRequest(note: EditableNote, ordinal: number, template: string, fillEmpty: boolean = false): Uint8Array {
    const writer = new CardRenderingRenderUncommittedCardLegacyRequest();
    writer.setNote(encodeNote(note));
    writer.setCardOrd(ordinal);
    writer.setTemplate(UTF8编码(template));
    writer.setFillEmpty(fillEmpty);
    writer.setPartialRender(true);
    return writer.转为字节();
}
export function encodeRenderExistingCardRequest(cardId: number): Uint8Array {
    const w = new CardRenderingRenderExistingCardRequest();
    if (cardId !== 0) {
        w.setCardId(cardId);
    }
    w.setPartialRender(true);
    return w.转为字节();
}
export function encodeExtractAvTagsRequest(text: string, questionSide: boolean): Uint8Array {
    const w = new CardRenderingExtractAvTagsRequest();
    if (text !== '') {
        w.setText(text);
    }
    if (questionSide) {
        w.setQuestionSide(true);
    }
    return w.转为字节();
}
export function encodeExtractLatexRequest(text: string, svg: boolean): Uint8Array {
    const w = new CardRenderingExtractLatexRequest();
    if (text !== '') {
        w.setText(text);
    }
    if (svg) {
        w.setSvg(true);
    }
    return w.转为字节();
}
export function decodeExtractLatexResponse(bytes: Uint8Array): string {
    return new CardRenderingExtractLatexResponse(bytes).getText();
}
export interface AvTagsResult {
    text: string;
    soundFiles: string[];
    ttsItems: TtsItem[];
    items?: AvItem[];
}
export function encodeRenderingString(text: string): Uint8Array {
    const writer = new GenericString();
    writer.setVal(text);
    return writer.转为字节();
}
export function encodeCompareAnswerRequest(expected: string, provided: string, combining: boolean): Uint8Array {
    const writer = new CardRenderingCompareAnswerRequest();
    writer.setExpected(expected);
    writer.setProvided(provided);
    writer.setCombining(combining);
    return writer.转为字节();
}
export function encodeExtractClozeForTypingRequest(text: string, ordinal: number): Uint8Array {
    const writer = new CardRenderingExtractClozeForTypingRequest();
    writer.setText(text);
    writer.setOrdinal(ordinal);
    return writer.转为字节();
}
export interface AvItem {
    soundFile: string | null;
    tts: TtsItem | null;
}
export interface TtsItem {
    text: string;
    language: string;
    voices: string[];
    speed: number;
    otherArgs: string[];
}
function decodeAvTag(bytes: Uint8Array): AvItem | null {
    const m = new CardRenderingAVTag(bytes);
    if (m.hasSoundOrVideo()) {
        const out: AvItem = { soundFile: m.getSoundOrVideo(), tts: null };
        return out;
    }
    if (m.hasTts()) {
        const out: AvItem = { soundFile: null, tts: decodeTtsTag(m.getTtsLast()!) };
        return out;
    }
    return null;
}
export function orderedAvItems(tags: AvTagsResult): AvItem[] {
    if (tags.items !== undefined)
        return tags.items;
    const items: AvItem[] = tags.soundFiles.map((name: string): AvItem => ({ soundFile: name, tts: null }));
    for (const tts of tags.ttsItems)
        items.push({ soundFile: null, tts: tts });
    return items;
}
function decodeTtsTag(bytes: Uint8Array): TtsItem {
    const r = new CardRenderingTTSTag(bytes);
    const out: TtsItem = { text: '', language: '', voices: [], speed: 1, otherArgs: [] };
    if (r.hasFieldText()) {
        out.text = r.getFieldText();
    }
    if (r.hasLang()) {
        out.language = r.getLang();
    }
    if (r.hasVoices()) {
        out.voices.push(...r.getVoices());
    }
    if (r.hasSpeed()) {
        out.speed = r.getSpeed();
    }
    if (r.hasOtherArgs()) {
        out.otherArgs.push(...r.getOtherArgs());
    }
    return out;
}
export function decodeExtractAvTagsResponse(bytes: Uint8Array): AvTagsResult {
    const m = new CardRenderingExtractAvTagsResponse(bytes);
    const items: AvItem[] = [];
    const out: AvTagsResult = { text: m.getText(), soundFiles: [], ttsItems: [], items: items };
    for (const raw of m.getAvTags()) {
        const item = decodeAvTag(raw);
        if (item !== null) {
            items.push(item);
            if (item.soundFile !== null)
                out.soundFiles.push(item.soundFile);
            if (item.tts !== null)
                out.ttsItems.push(item.tts);
        }
    }
    return out;
}
export interface TemplateReplacement {
    fieldName: string;
    currentText: string;
    filters: string[];
}
export interface TemplateNode {
    text: string | null;
    replacement: TemplateReplacement | null;
}
export interface RenderedCard {
    questionAudio?: AvTagsResult;
    answerAudio?: AvTagsResult;
    questionNodes: TemplateNode[];
    answerNodes: TemplateNode[];
    css: string;
    latexSvg: boolean;
    isEmpty: boolean;
    questionHtml?: string;
    answerHtml?: string;
}
function decodeReplacement(bytes: Uint8Array): TemplateReplacement {
    const r = new CardRenderingRenderedTemplateReplacement(bytes);
    const out: TemplateReplacement = { fieldName: '', currentText: '', filters: [] };
    if (r.hasFieldName()) {
        out.fieldName = r.getFieldName();
    }
    if (r.hasCurrentText()) {
        out.currentText = r.getCurrentText();
    }
    if (r.hasFilters()) {
        out.filters.push(...r.getFilters());
    }
    return out;
}
function decodeTemplateNode(bytes: Uint8Array): TemplateNode {
    const m = new CardRenderingRenderedTemplateNode(bytes);
    const out: TemplateNode = { text: null, replacement: null };
    if (m.hasText())
        out.text = m.getText();
    if (m.hasReplacement())
        out.replacement = decodeReplacement(m.getReplacementLast()!);
    return out;
}
export function decodeRenderCardResponse(bytes: Uint8Array): RenderedCard {
    const r = new CardRenderingRenderCardResponse(bytes);
    const out: RenderedCard = {
        questionNodes: [],
        answerNodes: [],
        css: '',
        latexSvg: false,
        isEmpty: false
    };
    if (r.hasQuestionNodes()) {
        for (const item of r.getQuestionNodes())
            out.questionNodes.push(decodeTemplateNode(item));
    }
    if (r.hasAnswerNodes()) {
        for (const item of r.getAnswerNodes())
            out.answerNodes.push(decodeTemplateNode(item));
    }
    if (r.hasCss()) {
        out.css = r.getCss();
    }
    if (r.hasLatexSvg()) {
        out.latexSvg = r.getLatexSvg();
    }
    if (r.hasIsEmpty()) {
        out.isEmpty = r.getIsEmpty();
    }
    return out;
}
export interface 笔记空卡 {
    笔记ID: number;
    卡片IDs: number[];
    删除后无卡: boolean;
}
export interface 空卡报告 {
    报告HTML: string;
    笔记列表: 笔记空卡[];
}
function decode笔记空卡(bytes: Uint8Array): 笔记空卡 {
    const r = new CardRenderingEmptyCardsReportNoteWithEmptyCards(bytes);
    const out: 笔记空卡 = { 笔记ID: 0, 卡片IDs: [], 删除后无卡: false };
    if (r.hasNoteId()) {
        out.笔记ID = r.getNoteId();
    }
    if (r.hasCardIds()) {
        out.卡片IDs.push(...r.getCardIds());
    }
    if (r.hasWillDeleteNote()) {
        out.删除后无卡 = r.getWillDeleteNote();
    }
    return out;
}
export function decode空卡报告(bytes: Uint8Array): 空卡报告 {
    const m = new CardRenderingEmptyCardsReport(bytes);
    const out: 空卡报告 = { 报告HTML: m.getReport(), 笔记列表: m.getNotes().map((raw: Uint8Array): 笔记空卡 => decode笔记空卡(raw)) };
    return out;
}
export function encode空请求(): Uint8Array {
    return new 协议写入器().转为字节();
}
