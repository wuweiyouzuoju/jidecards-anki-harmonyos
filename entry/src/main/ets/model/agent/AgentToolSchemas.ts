// SPDX-License-Identifier: AGPL-3.0-or-later

/** Agent 语义工具的固定参数布局；禁止动态 RPC/数据库/文件参数。 */

import type { AgentToolDiagnostic } from './AgentTypes';
import { agentFunctionTools } from './AgentToolCatalog';
import type { AgentCardStyle } from './AgentCardStyle';
import { validateAgentCardStyle } from './AgentCardStyle';
import { sanitizeAgentToolJson } from './AgentToolDiagnostics';
import type { AgentDocumentSource } from './AgentDocuments';

export interface AgentToolArguments {
  days: number;
  forecastDays: number;
  cardIds: number[];
  noteIds: number[];
  deckIds: number[];
  notetypeIds: number[];
  cursor: string;
  offset: number;
  length: number;
  noteId: number;
  fieldOrd: number;
  query: string;
  limit: number;
  draftId: string;
  targetDeckId: number;
  targetNotetypeId: number;
  fieldUpdatesJson: string;
  fieldMappingJson: string;
  templateMappingJson: string;
  templateJson: string;
  css: string;
  hasCss: boolean;
  hasTemplateJson: boolean;
  style: AgentCardStyle;
  tags: string[];
  reason: string;
  createNotes: AgentCreateNote[];
  imageUpdates: AgentImageUpdate[];
}

export interface AgentImageRequest {
  candidateId: string;
  fieldOrd: number;
  placement: 'append';
  altText: string;
}

export interface AgentImageUpdate extends AgentImageRequest {
  noteId: number;
}

export interface AgentCreateNote {
  fields: string[];
  namedFields: AgentNamedField[];
  images: AgentImageRequest[];
  sources?: AgentDocumentSource[];
}

export interface AgentNamedField {
  name: string;
  value: string;
}

interface RawAgentCreateNote {
  fields?: string[];
  images?: RawAgentImageRequest[];
  sources?: AgentDocumentSource[];
  [key: string]: string | string[] | RawAgentImageRequest[] | AgentDocumentSource[] | undefined;
}

interface RawAgentImageRequest {
  candidateId?: string;
  fieldOrd?: number;
  placement?: string;
  altText?: string;
}

interface RawAgentImageUpdate extends RawAgentImageRequest {
  noteId?: number;
}

interface RawAgentToolArguments {
  days?: number;
  forecastDays?: number;
  cardIds?: number[];
  noteIds?: number[];
  deckIds?: number[];
  notetypeIds?: number[];
  cursor?: string;
  offset?: number;
  length?: number;
  noteId?: number;
  fieldOrd?: number;
  query?: string;
  limit?: number;
  draftId?: string;
  targetDeckId?: number;
  targetNotetypeId?: number;
  fieldUpdatesJson?: string;
  fieldMappingJson?: string;
  templateMappingJson?: string;
  templateJson?: string;
  css?: string;
  style?: AgentCardStyle;
  tags?: string[];
  reason?: string;
  notes?: RawAgentCreateNote[];
  cards?: RawAgentCreateNote[];
  imagesJson?: string;
}

export class AgentToolSchemaError extends Error {
  readonly code: string;
  readonly path: string;
  readonly detailMessage: string;
  readonly receivedKeys: string[];
  readonly allowedKeys: string[];
  readonly validTemplateJson: string;

  constructor(code: string, path: string = '', detailMessage: string = '',
    receivedKeys: string[] = [], allowedKeys: string[] = [], validTemplateJson: string = '') {
    super(code === 'tool_batch_too_large' ? code : 'invalid_tool_arguments');
    this.code = code;
    this.path = path;
    this.detailMessage = detailMessage;
    this.receivedKeys = receivedKeys.slice();
    this.allowedKeys = allowedKeys.slice();
    this.validTemplateJson = validTemplateJson;
  }

  diagnostic(): AgentToolDiagnostic {
    return {
      code: this.code, path: this.path, message: this.detailMessage,
      receivedKeys: this.receivedKeys.slice(), allowedKeys: this.allowedKeys.slice(),
      validTemplateJson: this.validTemplateJson
    };
  }
}

function validTemplate(toolName: string): string {
  const tools = agentFunctionTools(1000, toolName === 'create_flashcards' ? 'create' : 'edit');
  for (const item of tools) {
    if (item.name === toolName) { return item.exampleArgumentsJson; }
  }
  return '{}';
}

function schemaError(toolName: string, code: string, path: string, message: string,
  receivedKeys: string[] = [], allowed: string[] = []): AgentToolSchemaError {
  return new AgentToolSchemaError(code, path, message, receivedKeys, allowed, validTemplate(toolName));
}

function emptyArguments(): AgentToolArguments {
  return {
    days: 7, forecastDays: 7,
    cardIds: [], noteIds: [], deckIds: [], notetypeIds: [],
    cursor: '', offset: 0, length: 12000, noteId: 0, fieldOrd: 0, query: '', limit: 0, draftId: '', targetDeckId: 0, targetNotetypeId: 0,
    fieldUpdatesJson: '', fieldMappingJson: '', templateMappingJson: '',
    templateJson: '', css: '', hasCss: false, hasTemplateJson: false, style: {},
    tags: [], reason: '', createNotes: [], imageUpdates: []
  };
}

interface ToolPropertySchema { properties: Record<string, Object>; }
function allowedKeys(toolName: string): string[] {
  const tools = agentFunctionTools(1000, toolName === 'create_flashcards' ? 'create' : 'edit');
  for (const item of tools) {
    if (item.name === toolName) {
      return Object.keys((JSON.parse(item.parametersJson) as ToolPropertySchema).properties);
    }
  }
  return [];
}

function isAllowed(key: string, allowed: string[]): boolean {
  for (const value of allowed) {
    if (value === key) {
      return true;
    }
  }
  return false;
}

function validateIds(toolName: string, path: string, value: number[] | undefined): number[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw schemaError(toolName, 'invalid_type', path, `${path} must be an array of positive integer IDs`);
  }
  if (value.length > 1000) {
    throw schemaError(toolName, 'tool_batch_too_large', path, `${path} exceeds the 1000 item safety limit`);
  }
  const output: number[] = [];
  const seen: Set<number> = new Set<number>();
  for (let index: number = 0; index < value.length; index++) {
    const id: number = value[index];
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw schemaError(toolName, 'invalid_value', `${path}[${index}]`, 'ID must be a positive safe integer');
    }
    if (!seen.has(id)) {
      seen.add(id);
      output.push(id);
    }
  }
  return output;
}

function stringValue(toolName: string, path: string, value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw schemaError(toolName, 'invalid_type', path, `${path} must be a string`);
  }
  return value;
}

function positiveId(toolName: string, path: string, value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw schemaError(toolName, 'invalid_value', path, `${path} must be a positive safe integer`);
  }
  return value;
}

function validateImageRequest(toolName: string, path: string,
  value: RawAgentImageRequest | undefined): AgentImageRequest {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw schemaError(toolName, 'invalid_type', path, 'Image attachment must be an object');
  }
  const keys: string[] = Object.keys(value);
  for (const key of keys) {
    if (key !== 'candidateId' && key !== 'fieldOrd' && key !== 'placement' && key !== 'altText') {
      throw schemaError(toolName, 'unexpected_property', `${path}.${key}`,
        `${key} is not a declared image attachment property`, keys,
        ['candidateId', 'fieldOrd', 'placement', 'altText']);
    }
  }
  if (typeof value.candidateId !== 'string' || value.candidateId.trim().length === 0 ||
    value.candidateId.length > 200) {
    throw schemaError(toolName, 'invalid_value', `${path}.candidateId`,
      'candidateId must be a non-empty string of at most 200 characters');
  }
  if (!Number.isSafeInteger(value.fieldOrd) || value.fieldOrd === undefined || value.fieldOrd < 0) {
    throw schemaError(toolName, 'invalid_value', `${path}.fieldOrd`,
      'fieldOrd must be a non-negative safe integer');
  }
  if (value.placement !== undefined && value.placement !== 'append') {
    throw schemaError(toolName, 'invalid_value', `${path}.placement`,
      'placement must be append');
  }
  if (value.altText !== undefined &&
    (typeof value.altText !== 'string' || value.altText.length > 200)) {
    throw schemaError(toolName, 'invalid_value', `${path}.altText`,
      'altText must be a string of at most 200 characters');
  }
  return {
    candidateId: value.candidateId.trim(), fieldOrd: value.fieldOrd,
    placement: 'append', altText: value.altText === undefined ? '' : value.altText
  };
}

function validateImageRequests(toolName: string, path: string,
  value: RawAgentImageRequest[] | undefined): AgentImageRequest[] {
  if (value === undefined) { return []; }
  if (!Array.isArray(value) || value.length > 1) {
    throw schemaError(toolName, 'invalid_value', path,
      'Each note may contain at most one image attachment');
  }
  const result: AgentImageRequest[] = [];
  for (let index: number = 0; index < value.length; index++) {
    result.push(validateImageRequest(toolName, `${path}[${index}]`, value[index]));
  }
  return result;
}

function parseImageUpdates(toolName: string, json: string): AgentImageUpdate[] {
  if (json.trim().length === 0) { return []; }
  let raw: RawAgentImageUpdate[];
  try {
    raw = JSON.parse(json) as RawAgentImageUpdate[];
  } catch (error) {
    throw schemaError(toolName, 'invalid_json', 'imagesJson', 'imagesJson must be a JSON array');
  }
  if (!Array.isArray(raw) || raw.length > 1000) {
    throw schemaError(toolName, raw !== undefined && Array.isArray(raw) && raw.length > 1000
      ? 'tool_batch_too_large' : 'invalid_value', 'imagesJson',
      'imagesJson must be an array within the safety limit');
  }
  const result: AgentImageUpdate[] = [];
  for (let index: number = 0; index < raw.length; index++) {
    const item: RawAgentImageUpdate = raw[index];
    const keys: string[] = item === null || typeof item !== 'object' ? [] : Object.keys(item);
    for (const key of keys) {
      if (key !== 'noteId' && key !== 'candidateId' && key !== 'fieldOrd' &&
        key !== 'placement' && key !== 'altText') {
        throw schemaError(toolName, 'unexpected_property', `imagesJson[${index}].${key}`,
          `${key} is not a declared image update property`, keys,
          ['noteId', 'candidateId', 'fieldOrd', 'placement', 'altText']);
      }
    }
    if (!Number.isSafeInteger(item?.noteId) || item.noteId === undefined || item.noteId <= 0) {
      throw schemaError(toolName, 'invalid_value', `imagesJson[${index}].noteId`,
        'noteId must be a positive safe integer');
    }
    const imageValue: RawAgentImageRequest = {
      candidateId: item.candidateId, fieldOrd: item.fieldOrd,
      placement: item.placement, altText: item.altText
    };
    const image: AgentImageRequest = validateImageRequest(toolName, `imagesJson[${index}]`, imageValue);
    result.push({ noteId: item.noteId, candidateId: image.candidateId,
      fieldOrd: image.fieldOrd, placement: image.placement, altText: image.altText });
  }
  return result;
}

function validateCreateNotes(toolName: string, value: RawAgentCreateNote[] | undefined): AgentCreateNote[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    const code: string = Array.isArray(value) && value.length > 1000 ? 'tool_batch_too_large' : 'invalid_value';
    throw schemaError(toolName, code, 'cards', 'cards must be a non-empty array within the safety limit');
  }
  const result: AgentCreateNote[] = [];
  for (let noteIndex: number = 0; noteIndex < value.length; noteIndex++) {
    const item: RawAgentCreateNote = value[noteIndex];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw schemaError(toolName, 'invalid_type', `cards[${noteIndex}]`, 'Each cards[] item must be an object');
    }
    const keys: string[] = Object.keys(item);
    const namedFields: AgentNamedField[] = [];
    for (const key of keys) {
      if (key !== 'fields' && key !== 'images' && key !== 'sources') {
        const dictionary: Record<string, string | string[] | RawAgentImageRequest[] | AgentDocumentSource[] | undefined> = item;
        const namedValue: string | string[] | RawAgentImageRequest[] | AgentDocumentSource[] | undefined = dictionary[key];
        if (key.trim().length === 0 || key.length > 200 || typeof namedValue !== 'string') {
          throw schemaError(toolName, 'invalid_type', `cards[${noteIndex}].${key}`,
            'Named note-type fields must have string values', keys, ['fields', 'images']);
        }
        namedFields.push({ name: key, value: namedValue });
      }
    }
    if (item.fields === undefined && namedFields.length === 0) {
      throw schemaError(toolName, 'missing_property', `cards[${noteIndex}].fields`,
        'Each cards[] item requires fields or exact note-type field names', keys, ['fields']);
    }
    if (item.fields !== undefined && !Array.isArray(item.fields)) {
      throw schemaError(toolName, 'invalid_type', `cards[${noteIndex}].fields`, 'fields must be a string array');
    }
    if (item.fields !== undefined && (item.fields.length === 0 || item.fields.length > 100)) {
      throw schemaError(toolName, 'invalid_value', `cards[${noteIndex}].fields`,
        'fields must contain between 1 and 100 strings');
    }
    const fields: string[] = [];
    if (item.fields !== undefined) {
      for (let fieldIndex: number = 0; fieldIndex < item.fields.length; fieldIndex++) {
        const field: string = item.fields[fieldIndex];
        if (typeof field !== 'string') {
          throw schemaError(toolName, 'invalid_type', `cards[${noteIndex}].fields[${fieldIndex}]`,
            'Every field value must be a string');
        }
        fields.push(field);
      }
    }
    const sources: AgentDocumentSource[] = [];
    if (item.sources !== undefined) {
      if (!Array.isArray(item.sources) || item.sources.length > 10) throw schemaError(toolName, 'invalid_value', `cards[${noteIndex}].sources`, 'At most 10 document page sources');
      for (const source of item.sources) {
        if (source === null || typeof source !== 'object' || Array.isArray(source) ||
          Object.keys(source).some((key: string): boolean => key !== 'documentId' && key !== 'page') ||
          typeof source.documentId !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(source.documentId) ||
          !Number.isSafeInteger(source.page) || source.page < 1) throw schemaError(toolName, 'invalid_value', `cards[${noteIndex}].sources`, 'Each source requires a real documentId and positive page');
        sources.push({ documentId: source.documentId, page: source.page });
      }
    }
    result.push({ fields: fields, namedFields: namedFields, sources: sources,
      images: validateImageRequests(toolName, `cards[${noteIndex}].images`, item.images) });
  }
  return result;
}

export function resolveCreateNoteFields(note: AgentCreateNote, fieldNames: string[]): string[] {
  if (note.fields.length > 0) { return note.fields.slice(); }
  const fields: string[] = [];
  let matched: number = 0;
  for (const fieldName of fieldNames) {
    let value: string = '';
    for (const named of note.namedFields) {
      if (named.name === fieldName) {
        value = named.value;
        matched += 1;
        break;
      }
    }
    fields.push(value);
  }
  if (matched === 0) {
    throw schemaError('create_flashcards', 'missing_property', 'cards[].fields',
      'Named card properties must match the selected note-type field names');
  }
  return fields;
}

/** 不修补或猜测模型内容；把解析器原因反馈给模型，避免只回传空字段列表。 */
export function parseAgentToolJsonObject(toolName: string, argumentsJson: string): Object {
  let raw: Object;
  try {
    raw = JSON.parse(argumentsJson) as Object;
  } catch (error) {
    const reason: string = sanitizeAgentToolJson(error instanceof Error ? error.message : 'JSON syntax error', 512).text;
    throw schemaError(toolName, 'invalid_json', '$',
      `JSON syntax error (${argumentsJson.length} characters): ${reason}. ` +
      'Return one complete JSON object. Escape quotes, backslashes and line breaks inside string values; ' +
      'do not wrap it in markdown or an arguments property. No tool was executed.');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw schemaError(toolName, 'invalid_type', '$', 'Tool arguments must be one JSON object');
  }
  return raw;
}

export function decodeAgentToolArguments(toolName: string, argumentsJson: string): AgentToolArguments {
  const allowed: string[] = allowedKeys(toolName);
  if (allowed.length === 0) {
    throw new AgentToolSchemaError('invalid_tool_arguments');
  }
  const raw: RawAgentToolArguments = parseAgentToolJsonObject(toolName, argumentsJson) as RawAgentToolArguments;
  const receivedKeys: string[] = Object.keys(raw);
  for (const key of receivedKeys) {
    if (!isAllowed(key, allowed)) {
      throw schemaError(toolName, 'unexpected_property', key, `${key} is not a declared tool argument`,
        receivedKeys, allowed);
    }
  }
  const output: AgentToolArguments = emptyArguments();
  output.cardIds = validateIds(toolName, 'cardIds', raw.cardIds);
  output.noteIds = validateIds(toolName, 'noteIds', raw.noteIds);
  output.deckIds = validateIds(toolName, 'deckIds', raw.deckIds);
  if (toolName === 'propose_delete_deck' && output.deckIds.length === 0) {
    throw schemaError(toolName, 'invalid_value', 'deckIds', 'deckIds must contain at least one discovered deck ID');
  }
  output.notetypeIds = validateIds(toolName, 'notetypeIds', raw.notetypeIds);
  if (toolName === 'propose_delete_note_type' && output.notetypeIds.length !== 1) {
    throw schemaError(toolName, 'invalid_value', 'notetypeIds',
      'propose_delete_note_type requires exactly one discovered note type ID');
  }
  output.cursor = stringValue(toolName, 'cursor', raw.cursor);
  output.noteId = positiveId(toolName, 'noteId', raw.noteId);
  for (const key of ['offset', 'length', 'fieldOrd']) {
    const value: number | undefined = key === 'offset' ? raw.offset : (key === 'length' ? raw.length : raw.fieldOrd);
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw schemaError(toolName, 'invalid_value', key, 'Expected a nonnegative integer');
    }
  }
  output.offset = raw.offset ?? 0; output.fieldOrd = raw.fieldOrd ?? 0;
  output.length = Math.min(12000, Math.max(1, raw.length ?? 12000));
  output.query = stringValue(toolName, 'query', raw.query).trim();
  if (toolName === 'get_learning_overview') {
    if (typeof raw.query !== 'string' || raw.query.length > 2000) {
      throw schemaError(toolName, 'invalid_value', 'query', 'query must be a string of at most 2000 characters');
    }
    if (raw.days === undefined || !Number.isSafeInteger(raw.days) || raw.days < 1 || raw.days > 90) {
      throw schemaError(toolName, 'invalid_value', 'days', 'days must be an integer between 1 and 90');
    }
    if (raw.forecastDays === undefined || !Number.isSafeInteger(raw.forecastDays) ||
      raw.forecastDays < 1 || raw.forecastDays > 30) {
      throw schemaError(toolName, 'invalid_value', 'forecastDays', 'forecastDays must be an integer between 1 and 30');
    }
    output.days = raw.days; output.forecastDays = raw.forecastDays;
  }
  output.draftId = stringValue(toolName, 'draftId', raw.draftId).trim();
  output.fieldUpdatesJson = stringValue(toolName, 'fieldUpdatesJson', raw.fieldUpdatesJson);
  output.fieldMappingJson = stringValue(toolName, 'fieldMappingJson', raw.fieldMappingJson);
  output.templateMappingJson = stringValue(toolName, 'templateMappingJson', raw.templateMappingJson);
  output.templateJson = stringValue(toolName, 'templateJson', raw.templateJson);
  output.css = stringValue(toolName, 'css', raw.css);
  output.hasCss = raw.css !== undefined;
  output.hasTemplateJson = raw.templateJson !== undefined;
  if (toolName === 'propose_update_card_style') {
    if (raw.style === undefined) {
      throw schemaError(toolName, 'missing_property', 'style', 'Provide at least one appearance property.', receivedKeys, allowed);
    }
    try { output.style = validateAgentCardStyle(raw.style); } catch (error) {
      throw schemaError(toolName, 'invalid_value', 'style',
        error instanceof Error ? error.message : 'invalid_card_style', receivedKeys, allowed);
    }
  }
  if (toolName === 'propose_update_note_type_templates' && !output.hasCss && !output.hasTemplateJson) {
    throw schemaError(toolName, 'missing_property', 'css', 'Provide css or templateJson; omitted values stay unchanged.', receivedKeys, allowed);
  }
  output.imageUpdates = parseImageUpdates(toolName, stringValue(toolName, 'imagesJson', raw.imagesJson));
  output.reason = stringValue(toolName, 'reason', raw.reason).trim();
  output.targetDeckId = positiveId(toolName, 'targetDeckId', raw.targetDeckId);
  output.targetNotetypeId = positiveId(toolName, 'targetNotetypeId', raw.targetNotetypeId);
  if (toolName === 'create_flashcards') {
    output.createNotes = validateCreateNotes(toolName, raw.cards);
  }
  if (raw.limit !== undefined) {
    const maxLimit: number = toolName === 'search_images' ? 10 :
      (toolName === 'get_card_statistics' ? 200 : 1000);
    if (!Number.isSafeInteger(raw.limit) || raw.limit <= 0 || raw.limit > maxLimit) {
      throw schemaError(toolName, 'invalid_value', 'limit',
        `limit must be an integer between 1 and ${maxLimit}`);
    }
    output.limit = raw.limit;
  }
  if (toolName === 'search_images' && output.query.length === 0) {
    throw schemaError(toolName, 'invalid_value', 'query', 'query must not be empty');
  }
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 100) {
      throw schemaError(toolName, 'invalid_value', 'tags', 'tags must be an array with at most 100 items');
    }
    for (let tagIndex: number = 0; tagIndex < raw.tags.length; tagIndex++) {
      const tag: string = raw.tags[tagIndex];
      if (typeof tag !== 'string' || tag.length > 200) {
        throw schemaError(toolName, 'invalid_value', `tags[${tagIndex}]`, 'tag must be a string of at most 200 characters');
      }
      output.tags.push(tag);
    }
  }
  return output;
}
