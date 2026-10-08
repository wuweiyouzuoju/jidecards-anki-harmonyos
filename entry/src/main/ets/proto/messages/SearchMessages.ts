// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { SearchBrowserRowCellTextElideMode } from '../generated/CoreMessages';
import { SearchSearchNodeFlag, SearchSearchNodeRating, SearchSearchNodeCardState, SearchSearchNodeGroupJoiner, SearchSearchNodeFieldSearchMode, SearchBrowserColumnsSorting, SearchBrowserColumnsAlignment, SearchBrowserRowColor } from '../generated/CoreMessages';
import { 协议写入器 } from '../core/ProtoWriter';
import { GenericInt64, GenericString, GenericStringList, SearchBrowserColumns, SearchBrowserColumnsColumn, SearchBrowserRow, SearchBrowserRowCell, SearchFindAndReplaceRequest, SearchJoinSearchNodesRequest, SearchReplaceSearchNodeRequest, SearchSearchNode, SearchSearchNodeDupe, SearchSearchNodeField, SearchSearchNodeGroup, SearchSearchNodeIdList, SearchSearchNodeRated, SearchSearchRequest, SearchSearchResponse, SearchSortOrder, SearchSortOrderBuiltin } from '../generated/CoreMessages';
export enum SearchNodeFlag {
    FLAG_NONE = SearchSearchNodeFlag.FLAG_NONE,
    FLAG_ANY = SearchSearchNodeFlag.FLAG_ANY,
    FLAG_RED = SearchSearchNodeFlag.FLAG_RED,
    FLAG_ORANGE = SearchSearchNodeFlag.FLAG_ORANGE,
    FLAG_GREEN = SearchSearchNodeFlag.FLAG_GREEN,
    FLAG_BLUE = SearchSearchNodeFlag.FLAG_BLUE,
    FLAG_PINK = SearchSearchNodeFlag.FLAG_PINK,
    FLAG_TURQUOISE = SearchSearchNodeFlag.FLAG_TURQUOISE,
    FLAG_PURPLE = SearchSearchNodeFlag.FLAG_PURPLE
}
export enum SearchNodeRating {
    RATING_ANY = SearchSearchNodeRating.RATING_ANY,
    RATING_AGAIN = SearchSearchNodeRating.RATING_AGAIN,
    RATING_HARD = SearchSearchNodeRating.RATING_HARD,
    RATING_GOOD = SearchSearchNodeRating.RATING_GOOD,
    RATING_EASY = SearchSearchNodeRating.RATING_EASY,
    RATING_BY_RESCHEDULE = SearchSearchNodeRating.RATING_BY_RESCHEDULE
}
export enum SearchNodeCardState {
    CARD_STATE_NEW = SearchSearchNodeCardState.CARD_STATE_NEW,
    CARD_STATE_LEARN = SearchSearchNodeCardState.CARD_STATE_LEARN,
    CARD_STATE_REVIEW = SearchSearchNodeCardState.CARD_STATE_REVIEW,
    CARD_STATE_DUE = SearchSearchNodeCardState.CARD_STATE_DUE,
    CARD_STATE_SUSPENDED = SearchSearchNodeCardState.CARD_STATE_SUSPENDED,
    CARD_STATE_BURIED = SearchSearchNodeCardState.CARD_STATE_BURIED
}
export enum SearchNodeJoiner {
    AND = SearchSearchNodeGroupJoiner.AND,
    OR = SearchSearchNodeGroupJoiner.OR
}
export enum SearchNodeFieldSearchMode {
    FIELD_SEARCH_MODE_NORMAL = SearchSearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NORMAL,
    FIELD_SEARCH_MODE_REGEX = SearchSearchNodeFieldSearchMode.FIELD_SEARCH_MODE_REGEX,
    FIELD_SEARCH_MODE_NOCOMBINING = SearchSearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NOCOMBINING
}
export enum BrowserColumnSorting {
    SORTING_NONE = SearchBrowserColumnsSorting.SORTING_NONE,
    SORTING_ASCENDING = SearchBrowserColumnsSorting.SORTING_ASCENDING,
    SORTING_DESCENDING = SearchBrowserColumnsSorting.SORTING_DESCENDING
}
export enum BrowserColumnAlignment {
    ALIGNMENT_START = SearchBrowserColumnsAlignment.ALIGNMENT_START,
    ALIGNMENT_CENTER = SearchBrowserColumnsAlignment.ALIGNMENT_CENTER
}
export enum BrowserCellTextElideMode {
    ELIDE_LEFT = SearchBrowserRowCellTextElideMode.ElideLeft,
    ELIDE_RIGHT = SearchBrowserRowCellTextElideMode.ElideRight,
    ELIDE_MIDDLE = SearchBrowserRowCellTextElideMode.ElideMiddle,
    ELIDE_NONE = SearchBrowserRowCellTextElideMode.ElideNone
}
export enum BrowserRowColor {
    COLOR_DEFAULT = SearchBrowserRowColor.COLOR_DEFAULT,
    COLOR_MARKED = SearchBrowserRowColor.COLOR_MARKED,
    COLOR_SUSPENDED = SearchBrowserRowColor.COLOR_SUSPENDED,
    COLOR_FLAG_RED = SearchBrowserRowColor.COLOR_FLAG_RED,
    COLOR_FLAG_ORANGE = SearchBrowserRowColor.COLOR_FLAG_ORANGE,
    COLOR_FLAG_GREEN = SearchBrowserRowColor.COLOR_FLAG_GREEN,
    COLOR_FLAG_BLUE = SearchBrowserRowColor.COLOR_FLAG_BLUE,
    COLOR_FLAG_PINK = SearchBrowserRowColor.COLOR_FLAG_PINK,
    COLOR_FLAG_TURQUOISE = SearchBrowserRowColor.COLOR_FLAG_TURQUOISE,
    COLOR_FLAG_PURPLE = SearchBrowserRowColor.COLOR_FLAG_PURPLE,
    COLOR_BURIED = SearchBrowserRowColor.COLOR_BURIED
}
export interface SearchNodeDupe {
    notetypeId: number;
    firstField: string;
}
export interface SearchNodeRated {
    days: number;
    rating: SearchNodeRating;
}
export interface SearchNodeIdList {
    ids: number[];
}
export interface SearchNodeGroup {
    nodes: SearchNode[];
    joiner: SearchNodeJoiner;
}
export interface SearchNodeField {
    fieldName: string;
    text: string;
    mode: SearchNodeFieldSearchMode;
}
export type SearchNodeFilterKind = 'group' | 'negated' | 'parsable_text' | 'template' | 'nid' | 'dupe' | 'field_name' | 'rated' | 'added_in_days' | 'due_in_days' | 'flag' | 'card_state' | 'nids' | 'edited_in_days' | 'deck' | 'due_on_day' | 'tag' | 'note' | 'introduced_in_days' | 'field' | 'literal_text';
export interface SearchNode {
    kind: SearchNodeFilterKind;
    group?: SearchNodeGroup;
    negated?: SearchNode;
    text?: string;
    template?: number;
    nid?: number;
    dupe?: SearchNodeDupe;
    fieldName?: string;
    rated?: SearchNodeRated;
    days?: number;
    flag?: SearchNodeFlag;
    cardState?: SearchNodeCardState;
    nids?: number[];
    day?: number;
    deck?: string;
    tag?: string;
    note?: string;
    field?: SearchNodeField;
}
export type SortOrderKind = 'none' | 'custom' | 'builtin';
export interface SortOrder {
    kind: SortOrderKind;
    custom?: string;
    column?: string;
    reverse?: boolean;
}
export interface SearchRequest {
    search: string;
    order: SortOrder;
}
export interface JoinSearchNodesRequest {
    joiner: SearchNodeJoiner;
    existingNode: SearchNode;
    additionalNode: SearchNode;
}
export interface ReplaceSearchNodeRequest {
    existingNode: SearchNode;
    replacementNode: SearchNode;
}
export interface FindAndReplaceRequest {
    nids: number[];
    search: string;
    replacement: string;
    regex: boolean;
    matchCase: boolean;
    fieldName: string;
}
export interface BrowserColumn {
    key: string;
    cardsModeLabel: string;
    notesModeLabel: string;
    sortingCards: BrowserColumnSorting;
    sortingNotes: BrowserColumnSorting;
    usesCellFont: boolean;
    alignment: BrowserColumnAlignment;
    cardsModeTooltip: string;
    notesModeTooltip: string;
}
export interface BrowserColumns {
    columns: BrowserColumn[];
}
export interface BrowserCell {
    text: string;
    isRtl: boolean;
    elideMode: BrowserCellTextElideMode;
}
export interface BrowserRow {
    cells: BrowserCell[];
    color: BrowserRowColor;
    fontName: string;
    fontSize: number;
}
export function makeParsableTextNode(text: string): SearchNode {
    return { kind: 'parsable_text', text };
}
export function makeDeckNode(deck: string): SearchNode {
    return { kind: 'deck', deck };
}
export function makeTagNode(tag: string): SearchNode {
    return { kind: 'tag', tag };
}
export function makeCardStateNode(state: SearchNodeCardState): SearchNode {
    return { kind: 'card_state', cardState: state };
}
function encodeDupe(value: SearchNodeDupe): 协议写入器 {
    const w = new SearchSearchNodeDupe();
    if (value.notetypeId !== 0) {
        w.setNotetypeId(value.notetypeId);
    }
    if (value.firstField !== '') {
        w.setFirstField(value.firstField);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeDupe(bytes: Uint8Array): SearchNodeDupe {
    const r = new SearchSearchNodeDupe(bytes);
    const out: SearchNodeDupe = { notetypeId: 0, firstField: '' };
    if (r.hasNotetypeId()) {
        out.notetypeId = r.getNotetypeId();
    }
    if (r.hasFirstField()) {
        out.firstField = r.getFirstField();
    }
    return out;
}
function encodeRated(value: SearchNodeRated): 协议写入器 {
    const w = new SearchSearchNodeRated();
    if (value.days !== 0) {
        w.setDays(value.days);
    }
    if (value.rating !== SearchNodeRating.RATING_ANY) {
        w.setRating(value.rating);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeRated(bytes: Uint8Array): SearchNodeRated {
    const r = new SearchSearchNodeRated(bytes);
    const out: SearchNodeRated = { days: 0, rating: SearchNodeRating.RATING_ANY };
    if (r.hasDays()) {
        out.days = r.getDays();
    }
    if (r.hasRating()) {
        out.rating = r.getRating() as SearchNodeRating;
    }
    return out;
}
function encodeIdList(value: SearchNodeIdList): 协议写入器 {
    const w = new SearchSearchNodeIdList();
    if (value.ids.length > 0) {
        w.setIds(value.ids);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeIdList(bytes: Uint8Array): SearchNodeIdList {
    const out: SearchNodeIdList = { ids: new SearchSearchNodeIdList(bytes).getIds() };
    return out;
}
function encodeGroup(value: SearchNodeGroup): 协议写入器 {
    const w = new SearchSearchNodeGroup();
    for (const node of value.nodes) {
        w.setNodesWriter([encodeSearchNode(node)]);
    }
    if (value.joiner !== SearchNodeJoiner.AND) {
        w.setJoiner(value.joiner);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeGroup(bytes: Uint8Array): SearchNodeGroup {
    const r = new SearchSearchNodeGroup(bytes);
    const nodes: SearchNode[] = [];
    let joiner: SearchNodeJoiner = SearchNodeJoiner.AND;
    if (r.hasNodes()) {
        for (const item of r.getNodes())
            nodes.push(decodeSearchNode(item));
    }
    if (r.hasJoiner()) {
        joiner = r.getJoiner() as SearchNodeJoiner;
    }
    return { nodes, joiner };
}
function encodeField(value: SearchNodeField): 协议写入器 {
    const w = new SearchSearchNodeField();
    if (value.fieldName !== '') {
        w.setFieldName(value.fieldName);
    }
    if (value.text !== '') {
        w.setText(value.text);
    }
    if (value.mode !== SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NORMAL) {
        w.setMode(value.mode);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeField(bytes: Uint8Array): SearchNodeField {
    const r = new SearchSearchNodeField(bytes);
    const out: SearchNodeField = {
        fieldName: '',
        text: '',
        mode: SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NORMAL
    };
    if (r.hasFieldName()) {
        out.fieldName = r.getFieldName();
    }
    if (r.hasText()) {
        out.text = r.getText();
    }
    if (r.hasMode()) {
        out.mode = r.getMode() as SearchNodeFieldSearchMode;
    }
    return out;
}
export function encodeSearchNode(node: SearchNode): 协议写入器 {
    const w = new SearchSearchNode();
    switch (node.kind) {
        case 'group':
            if (node.group) {
                w.setGroupWriter(encodeGroup(node.group));
            }
            break;
        case 'negated':
            if (node.negated) {
                w.setNegatedWriter(encodeSearchNode(node.negated));
            }
            break;
        case 'parsable_text':
            if (node.text !== undefined && node.text !== '') {
                w.setParsableText(node.text);
            }
            break;
        case 'template':
            if (node.template !== undefined && node.template !== 0) {
                w.setTemplate(node.template);
            }
            break;
        case 'nid':
            if (node.nid !== undefined && node.nid !== 0) {
                w.setNid(node.nid);
            }
            break;
        case 'dupe':
            if (node.dupe) {
                w.setDupeWriter(encodeDupe(node.dupe));
            }
            break;
        case 'field_name':
            if (node.fieldName !== undefined && node.fieldName !== '') {
                w.setFieldName(node.fieldName);
            }
            break;
        case 'rated':
            if (node.rated) {
                w.setRatedWriter(encodeRated(node.rated));
            }
            break;
        case 'added_in_days':
            if (node.days !== undefined && node.days !== 0) {
                w.setAddedInDays(node.days);
            }
            break;
        case 'due_in_days':
            if (node.days !== undefined && node.days !== 0) {
                w.setDueInDays(node.days);
            }
            break;
        case 'flag':
            if (node.flag !== undefined) {
                w.setFlag(node.flag);
            }
            break;
        case 'card_state':
            if (node.cardState !== undefined && node.cardState !== SearchNodeCardState.CARD_STATE_NEW) {
                w.setCardState(node.cardState);
            }
            break;
        case 'nids':
            if (node.nids) {
                w.setNidsWriter(encodeIdList({ ids: node.nids }));
            }
            break;
        case 'edited_in_days':
            if (node.days !== undefined && node.days !== 0) {
                w.setEditedInDays(node.days);
            }
            break;
        case 'deck':
            if (node.deck !== undefined && node.deck !== '') {
                w.setDeck(node.deck);
            }
            break;
        case 'due_on_day':
            if (node.day !== undefined && node.day !== 0) {
                w.setDueOnDay(node.day);
            }
            break;
        case 'tag':
            if (node.tag !== undefined && node.tag !== '') {
                w.setTag(node.tag);
            }
            break;
        case 'note':
            if (node.note !== undefined && node.note !== '') {
                w.setNote(node.note);
            }
            break;
        case 'introduced_in_days':
            if (node.days !== undefined && node.days !== 0) {
                w.setIntroducedInDays(node.days);
            }
            break;
        case 'field':
            if (node.field) {
                w.setFieldWriter(encodeField(node.field));
            }
            break;
        case 'literal_text':
            if (node.text !== undefined && node.text !== '') {
                w.setLiteralText(node.text);
            }
            break;
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
export function decodeSearchNode(bytes: Uint8Array): SearchNode {
    const r = new SearchSearchNode(bytes);
    const node: SearchNode = { kind: 'parsable_text', text: '' };
    if (r.hasGroup()) {
        node.kind = 'group';
        node.group = decodeGroup(r.getGroupLast()!);
    }
    if (r.hasNegated()) {
        node.kind = 'negated';
        node.negated = decodeSearchNode(r.getNegatedLast()!);
    }
    if (r.hasParsableText()) {
        node.kind = 'parsable_text';
        node.text = r.getParsableText();
    }
    if (r.hasTemplate()) {
        node.kind = 'template';
        node.template = r.getTemplate();
    }
    if (r.hasNid()) {
        node.kind = 'nid';
        node.nid = r.getNid();
    }
    if (r.hasDupe()) {
        node.kind = 'dupe';
        node.dupe = decodeDupe(r.getDupeLast()!);
    }
    if (r.hasFieldName()) {
        node.kind = 'field_name';
        node.fieldName = r.getFieldName();
    }
    if (r.hasRated()) {
        node.kind = 'rated';
        node.rated = decodeRated(r.getRatedLast()!);
    }
    if (r.hasAddedInDays()) {
        node.kind = 'added_in_days';
        node.days = r.getAddedInDays();
    }
    if (r.hasDueInDays()) {
        node.kind = 'due_in_days';
        node.days = r.getDueInDays();
    }
    if (r.hasFlag()) {
        node.kind = 'flag';
        node.flag = r.getFlag() as SearchNodeFlag;
    }
    if (r.hasCardState()) {
        node.kind = 'card_state';
        node.cardState = r.getCardState() as SearchNodeCardState;
    }
    if (r.hasNids()) {
        node.kind = 'nids';
        node.nids = decodeIdList(r.getNidsLast()!).ids;
    }
    if (r.hasEditedInDays()) {
        node.kind = 'edited_in_days';
        node.days = r.getEditedInDays();
    }
    if (r.hasDeck()) {
        node.kind = 'deck';
        node.deck = r.getDeck();
    }
    if (r.hasDueOnDay()) {
        node.kind = 'due_on_day';
        node.day = r.getDueOnDay();
    }
    if (r.hasTag()) {
        node.kind = 'tag';
        node.tag = r.getTag();
    }
    if (r.hasNote()) {
        node.kind = 'note';
        node.note = r.getNote();
    }
    if (r.hasIntroducedInDays()) {
        node.kind = 'introduced_in_days';
        node.days = r.getIntroducedInDays();
    }
    if (r.hasField()) {
        node.kind = 'field';
        node.field = decodeField(r.getFieldLast()!);
    }
    if (r.hasLiteralText()) {
        node.kind = 'literal_text';
        node.text = r.getLiteralText();
    }
    return node;
}
function encodeSortOrder(order: SortOrder): 协议写入器 {
    const w = new SearchSortOrder();
    switch (order.kind) {
        case 'none':
            w.setNone(new Uint8Array(0));
            break;
        case 'custom':
            if (order.custom !== undefined && order.custom !== '')
                w.setCustom(order.custom);
            break;
        case 'builtin':
            if (order.column !== undefined || order.reverse !== undefined) {
                const v = new SearchSortOrderBuiltin();
                if (order.column !== undefined && order.column !== '')
                    v.setColumn(order.column);
                if (order.reverse)
                    v.setReverse(true);
                w.setBuiltin(v.toBytes());
            }
            break;
    }
    const result = new 协议写入器();
    result.写入原始字节(w.toBytes());
    return result;
}
function decodeSortOrder(bytes: Uint8Array): SortOrder {
    const m = new SearchSortOrder(bytes);
    const out: SortOrder = { kind: 'none' };
    if (m.hasCustom()) {
        out.kind = 'custom';
        out.custom = m.getCustom();
    }
    if (m.hasBuiltin()) {
        out.kind = 'builtin';
        const v = new SearchSortOrderBuiltin(m.getBuiltinLast()!);
        if (v.hasColumn())
            out.column = v.getColumn();
        if (v.hasReverse())
            out.reverse = v.getReverse();
    }
    return out;
}
export function encodeSearchRequest(req: SearchRequest): Uint8Array {
    const w = new SearchSearchRequest();
    if (req.search !== '') {
        w.setSearch(req.search);
    }
    if (req.order.kind !== 'none') {
        w.setOrderWriter(encodeSortOrder(req.order));
    }
    return w.转为字节();
}
export function decodeSearchResponse(bytes: Uint8Array): number[] {
    return new SearchSearchResponse(bytes).getIds();
}
export function encodeJoinSearchNodesRequest(req: JoinSearchNodesRequest): Uint8Array {
    const w = new SearchJoinSearchNodesRequest();
    if (req.joiner !== SearchNodeJoiner.AND) {
        w.setJoiner(req.joiner);
    }
    w.setExistingNodeWriter(encodeSearchNode(req.existingNode));
    w.setAdditionalNodeWriter(encodeSearchNode(req.additionalNode));
    return w.转为字节();
}
export function encodeReplaceSearchNodeRequest(req: ReplaceSearchNodeRequest): Uint8Array {
    const w = new SearchReplaceSearchNodeRequest();
    w.setExistingNodeWriter(encodeSearchNode(req.existingNode));
    w.setReplacementNodeWriter(encodeSearchNode(req.replacementNode));
    return w.转为字节();
}
export function encodeFindAndReplaceRequest(req: FindAndReplaceRequest): Uint8Array {
    const w = new SearchFindAndReplaceRequest();
    if (req.nids.length > 0) {
        w.setNids(req.nids);
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
    if (req.fieldName !== '') {
        w.setFieldName(req.fieldName);
    }
    return w.转为字节();
}
function encodeColumn(col: BrowserColumn): 协议写入器 {
    const w = new SearchBrowserColumnsColumn();
    if (col.key !== '') {
        w.setKey(col.key);
    }
    if (col.cardsModeLabel !== '') {
        w.setCardsModeLabel(col.cardsModeLabel);
    }
    if (col.notesModeLabel !== '') {
        w.setNotesModeLabel(col.notesModeLabel);
    }
    if (col.sortingCards !== BrowserColumnSorting.SORTING_NONE) {
        w.setSortingCards(col.sortingCards);
    }
    if (col.usesCellFont) {
        w.setUsesCellFont(true);
    }
    if (col.alignment !== BrowserColumnAlignment.ALIGNMENT_START) {
        w.setAlignment(col.alignment);
    }
    if (col.cardsModeTooltip !== '') {
        w.setCardsModeTooltip(col.cardsModeTooltip);
    }
    if (col.notesModeTooltip !== '') {
        w.setNotesModeTooltip(col.notesModeTooltip);
    }
    if (col.sortingNotes !== BrowserColumnSorting.SORTING_NONE) {
        w.setSortingNotes(col.sortingNotes);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeColumn(bytes: Uint8Array): BrowserColumn {
    const r = new SearchBrowserColumnsColumn(bytes);
    const out: BrowserColumn = {
        key: '',
        cardsModeLabel: '',
        notesModeLabel: '',
        sortingCards: BrowserColumnSorting.SORTING_NONE,
        sortingNotes: BrowserColumnSorting.SORTING_NONE,
        usesCellFont: false,
        alignment: BrowserColumnAlignment.ALIGNMENT_START,
        cardsModeTooltip: '',
        notesModeTooltip: ''
    };
    if (r.hasKey()) {
        out.key = r.getKey();
    }
    if (r.hasCardsModeLabel()) {
        out.cardsModeLabel = r.getCardsModeLabel();
    }
    if (r.hasNotesModeLabel()) {
        out.notesModeLabel = r.getNotesModeLabel();
    }
    if (r.hasSortingCards()) {
        out.sortingCards = r.getSortingCards() as BrowserColumnSorting;
    }
    if (r.hasUsesCellFont()) {
        out.usesCellFont = r.getUsesCellFont();
    }
    if (r.hasAlignment()) {
        out.alignment = r.getAlignment() as BrowserColumnAlignment;
    }
    if (r.hasCardsModeTooltip()) {
        out.cardsModeTooltip = r.getCardsModeTooltip();
    }
    if (r.hasNotesModeTooltip()) {
        out.notesModeTooltip = r.getNotesModeTooltip();
    }
    if (r.hasSortingNotes()) {
        out.sortingNotes = r.getSortingNotes() as BrowserColumnSorting;
    }
    return out;
}
export function decodeBrowserColumns(bytes: Uint8Array): BrowserColumns {
    const out: BrowserColumns = { columns: new SearchBrowserColumns(bytes).getColumns().map((raw: Uint8Array): BrowserColumn => decodeColumn(raw)) };
    return out;
}
function decodeCell(bytes: Uint8Array): BrowserCell {
    const r = new SearchBrowserRowCell(bytes);
    const out: BrowserCell = {
        text: '',
        isRtl: false,
        elideMode: BrowserCellTextElideMode.ELIDE_LEFT
    };
    if (r.hasText()) {
        out.text = r.getText();
    }
    if (r.hasIsRtl()) {
        out.isRtl = r.getIsRtl();
    }
    if (r.hasElideMode()) {
        out.elideMode = r.getElideMode() as BrowserCellTextElideMode;
    }
    return out;
}
export function decodeBrowserRow(bytes: Uint8Array): BrowserRow {
    const r = new SearchBrowserRow(bytes);
    const cells: BrowserCell[] = [];
    const row: BrowserRow = {
        cells,
        color: BrowserRowColor.COLOR_DEFAULT,
        fontName: '',
        fontSize: 0
    };
    if (r.hasCells()) {
        for (const item of r.getCells())
            row.cells.push(decodeCell(item));
    }
    if (r.hasColor()) {
        row.color = r.getColor() as BrowserRowColor;
    }
    if (r.hasFontName()) {
        row.fontName = r.getFontName();
    }
    if (r.hasFontSize()) {
        row.fontSize = r.getFontSize();
    }
    return row;
}
export function encodeEmptyRequest(): Uint8Array {
    return new Uint8Array(0);
}
export function decodeStringResponse(bytes: Uint8Array): string {
    return new GenericString(bytes).getVal();
}
export function encodeStringListRequest(values: string[]): Uint8Array {
    const w = new GenericStringList();
    for (const v of values) {
        if (v !== '') {
            w.setVals([v]);
        }
    }
    return w.转为字节();
}
export function encodeInt64Request(value: number): Uint8Array {
    const w = new GenericInt64();
    if (value !== 0) {
        w.setVal(value);
    }
    return w.转为字节();
}
