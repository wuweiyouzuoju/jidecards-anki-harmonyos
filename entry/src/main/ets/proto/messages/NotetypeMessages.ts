// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-NOTETYPE-001
// @名称 笔记类型消息编解码
//
// @作用
// 只读解码 anki.notetypes.proto 消息（Anki 26.05），服务于「添加卡片」动态字段：
// - NotetypeView：笔记类型视图（id/name/fields，按 ord 排序）
// - NotetypeNames：所有笔记类型的 id+name 列表
// 字段来源：third_party/anki/proto/anki/notetypes.proto
//
// @输入
// 编码：notetypeId
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节（NotetypeId 子消息）
// 解码：NotetypeView / NotetypeNameId[]
//
// @业务规则
// 解码：NotetypeView / NotetypeNameId[]
// 编码：UpdateNotetypeLegacyRequest（JSON 路径整体更新，不走完整 Notetype proto 编码）
// NotetypeField.ord 解码后用作排序键，确保字段顺序与 Anki 桌面端一致。
// NotetypeField 内的 Field config 等子字段只读跳过。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔, 线类型_变长整数 } from '../core/ProtoWriter';

/** `anki.notetypes.Notetype.Config.Kind` values. */
export const NOTE_TYPE_KIND_NORMAL: number = 0;
export const NOTE_TYPE_KIND_CLOZE: number = 1;

export interface NotetypeNameId {
  id: number;
  name: string;
}

export interface NotetypeField {
  ord: number;
  name: string;
}

export interface NotetypeView {
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

/** Agent/UI shared structural capabilities for a note type. */
export interface NotetypeCapabilities {
  notetypeId: number;
  name: string;
  kind: number;
  fieldNames: string[];
  clozeFieldOrds: number[];
}

export function encodeNotetypeId(id: number): Uint8Array {
  const writer = new 协议写入器();
  if (id !== 0) {
    writer.写入64位整数(1, id);
  }
  return writer.转为字节();
}

/** 标准笔记类型种类（与 anki.notetypes.proto StockNotetype.Kind 一一对应） */
export const 标准笔记类型种类 = {
  BASIC: 0,
  BASIC_AND_REVERSED: 1,
  BASIC_OPTIONAL_REVERSED: 2,
  BASIC_TYPING: 3,
  CLOZE: 4,
  IMAGE_OCCLUSION: 5
} as const;

/** 编码 StockNotetype{kind}：字段 1 为 varint Kind 枚举。 */
export function encodeStockNotetype(kind: number): Uint8Array {
  const writer = new 协议写入器();
  if (kind !== 0) {
    writer.写入变长整数(1, kind);
  }
  return writer.转为字节();
}

/** 解码 generic.Json（字段 1 为 JSON 字符串）。 */
export function decodeJsonString(bytes: Uint8Array): string {
  const reader = new 协议读取器(bytes);
  let value = '';
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      value = reader.读取字符串();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return value;
}

/** 编码 generic.Json{json}：字段 1 为 JSON 字符串。 */
export function encodeJsonString(json: string): Uint8Array {
  const writer = new 协议写入器();
  if (json.length > 0) {
    writer.写入字符串(1, json);
  }
  return writer.转为字节();
}

function decodeUInt32(bytes: Uint8Array): number {
  const reader = new 协议读取器(bytes);
  let value = 0;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      value = reader.读取变长整数();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return value;
}

function decodeNotetypeField(bytes: Uint8Array): NotetypeField {
  const reader = new 协议读取器(bytes);
  const field: NotetypeField = { ord: 0, name: '' };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      field.ord = decodeUInt32(reader.读取字节());
    } else if (tag.字段号 === 2) {
      field.name = reader.读取字符串();
    } else {
      // Field config and any future fields are read-only for this flow.
      reader.跳过字段(tag.线类型);
    }
  }
  return field;
}

function decodeNotetypeConfig(bytes: Uint8Array, view: NotetypeView): number {
  const reader = new 协议读取器(bytes);
  let kind: number = NOTE_TYPE_KIND_NORMAL;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      kind = reader.读取变长整数();
    } else if (tag.字段号 === 9) {
      view.originalStockKind = reader.读取变长整数();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return kind;
}

export function decodeNotetype(bytes: Uint8Array): NotetypeView {
  const reader = new 协议读取器(bytes);
  const result: NotetypeView = {
    id: 0,
    name: '',
    kind: NOTE_TYPE_KIND_NORMAL,
    fields: [],
    fieldNames: []
  };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      result.id = reader.读取64位整数();
    } else if (tag.字段号 === 2) {
      result.name = reader.读取字符串();
    } else if (tag.字段号 === 7) {
      result.kind = decodeNotetypeConfig(reader.读取字节(), result);
    } else if (tag.字段号 === 8) {
      result.fields.push(decodeNotetypeField(reader.读取字节()));
    } else {
      // This UI never writes Notetype protobufs, so preserve its source bytes in Anki.
      reader.跳过字段(tag.线类型);
    }
  }
  result.fields.sort((left: NotetypeField, right: NotetypeField): number => left.ord - right.ord);
  result.fieldNames = result.fields.map((field: NotetypeField): string => field.name);
  return result;
}

/** Decode `GetClozeFieldOrdsResponse.ords`, accepting packed and unpacked uint32. */
export function decodeClozeFieldOrds(bytes: Uint8Array): number[] {
  const reader = new 协议读取器(bytes);
  const unique: Set<number> = new Set<number>();
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 !== 1) {
      reader.跳过字段(tag.线类型);
    } else if (tag.线类型 === 线类型_变长整数) {
      unique.add(reader.读取变长整数());
    } else if (tag.线类型 === 线类型_长度分隔) {
      const packed = new 协议读取器(reader.读取字节());
      while (!packed.已读完) {
        unique.add(packed.读取变长整数());
      }
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  const ords: number[] = Array.from(unique);
  ords.sort((left: number, right: number): number => left - right);
  return ords;
}

function decodeNotetypeNameId(bytes: Uint8Array): NotetypeNameId {
  const reader = new 协议读取器(bytes);
  const result: NotetypeNameId = { id: 0, name: '' };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      result.id = reader.读取64位整数();
    } else if (tag.字段号 === 2) {
      result.name = reader.读取字符串();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

export function decodeNotetypeNames(bytes: Uint8Array): NotetypeNameId[] {
  const reader = new 协议读取器(bytes);
  const entries: NotetypeNameId[] = [];
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      entries.push(decodeNotetypeNameId(reader.读取字节()));
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return entries;
}

/**
 * 编码 UpdateNotetypeLegacyRequest{json: bytes, skip_checks: bool}。
 * 用于 UpdateNotetypeLegacy RPC（方法号 3），走 JSON 路径整体更新笔记类型，
 * 避免前端编写完整 Notetype protobuf。
 * proto 定义：anki/notetypes.proto UpdateNotetypeLegacyRequest
 */
export function encodeUpdateNotetypeLegacyRequest(json: string, skipChecks: boolean): Uint8Array {
  const writer = new 协议写入器();
  if (json.length > 0) {
    // bytes json = 1（wire type 2，与 string 编码方式一致）
    writer.写入字符串(1, json);
  }
  if (skipChecks) {
    writer.写入布尔(2, skipChecks);
  }
  return writer.转为字节();
}

// ========================================================
// ChangeNotetype（更改笔记类型）相关编解码
// 来源：proto/anki/notetypes.proto
// 用于浏览页 T8 批量操作「更改笔记类型」：
//   GetChangeNotetypeInfo(method 14) → ChangeNotetypeInfo（含字段/模板名 + 默认 input）
//   ChangeNotetype(method 15) → OpChanges
// ========================================================

/** 编码 GetChangeNotetypeInfoRequest{old_notetype_id, new_notetype_id}。 */
export function encodeGetChangeNotetypeInfoRequest(旧笔记类型ID: number, 新笔记类型ID: number): Uint8Array {
  const writer = new 协议写入器();
  if (旧笔记类型ID !== 0) {
    writer.写入64位整数(1, 旧笔记类型ID);
  }
  if (新笔记类型ID !== 0) {
    writer.写入64位整数(2, 新笔记类型ID);
  }
  return writer.转为字节();
}

/**
 * anki.notetypes.ChangeNotetypeInfo 的解码视图。
 * - old/newFieldNames / old/newTemplateNames：字段名/模板名列表（UI 渲染映射表用）
 * - input：后端给出的 ChangeNotetypeRequest 默认值（含 current_schema / old_notetype_name 等前端不直接构造的字段）
 * - oldNotetypeName：旧笔记类型名（UI 展示用）
 *
 * Invariants: input.new_fields / input.new_templates 元素值含义：
 *   -1 = 该新字段/模板不映射任何旧项（即丢弃/留空）
 *   ≥0 = 映射到旧字段/模板的 ord 索引
 * Extension Points: UI 默认显示 input 的映射；用户可改 new_fields/new_templates 后回传。
 */
export interface 变更笔记类型信息 {
  oldFieldNames: string[];
  oldTemplateNames: string[];
  newFieldNames: string[];
  newTemplateNames: string[];
  input: 变更笔记类型请求;
  oldNotetypeName: string;
}

/** anki.notetypes.ChangeNotetypeRequest 的可编辑视图。 */
export interface 变更笔记类型请求 {
  noteIds: number[];
  /** 新字段映射：每个新字段对应的旧字段 ord（-1=不映射）；长度 = 新字段数 */
  newFields: number[];
  /** 新模板映射：每个新模板对应的旧模板 ord（-1=不映射）；长度 = 新模板数 */
  newTemplates: number[];
  oldNotetypeId: number;
  newNotetypeId: number;
  currentSchema: number;
  oldNotetypeName: string;
  isCloze: boolean;
}

/** 解码 ChangeNotetypeRequest 嵌套消息（int32 数组用 packed 也可 unpacked，需兼容两种）。 */
function decodeChangeNotetypeRequest(bytes: Uint8Array): 变更笔记类型请求 {
  const reader = new 协议读取器(bytes);
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
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        // repeated int64 note_ids：packed 与 unpacked 都可能出现
        if (tag.线类型 === 2) {
          out.noteIds = out.noteIds.concat(reader.读取打包64位整数());
        } else {
          out.noteIds.push(reader.读取64位整数());
        }
        break;
      case 2:
        // repeated int32 new_fields（可为 -1，proto3 int32 负数走 10 字节补码，与 int64 同编码）
        if (tag.线类型 === 2) {
          out.newFields = out.newFields.concat(reader.读取打包64位整数().map((v: number): number => v | 0));
        } else {
          out.newFields.push(reader.读取64位整数() | 0);
        }
        break;
      case 3:
        // repeated int32 new_templates
        if (tag.线类型 === 2) {
          out.newTemplates = out.newTemplates.concat(reader.读取打包64位整数().map((v: number): number => v | 0));
        } else {
          out.newTemplates.push(reader.读取64位整数() | 0);
        }
        break;
      case 4:
        out.oldNotetypeId = reader.读取64位整数();
        break;
      case 5:
        out.newNotetypeId = reader.读取64位整数();
        break;
      case 6:
        out.currentSchema = reader.读取64位整数();
        break;
      case 7:
        out.oldNotetypeName = reader.读取字符串();
        break;
      case 8:
        out.isCloze = reader.读取布尔();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 ChangeNotetypeInfo（GetChangeNotetypeInfo 的返回）。 */
export function decodeChangeNotetypeInfo(bytes: Uint8Array): 变更笔记类型信息 {
  const reader = new 协议读取器(bytes);
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
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.oldFieldNames.push(reader.读取字符串());
        break;
      case 2:
        out.oldTemplateNames.push(reader.读取字符串());
        break;
      case 3:
        out.newFieldNames.push(reader.读取字符串());
        break;
      case 4:
        out.newTemplateNames.push(reader.读取字符串());
        break;
      case 5:
        out.input = decodeChangeNotetypeRequest(reader.读取字节());
        break;
      case 6:
        out.oldNotetypeName = reader.读取字符串();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return out;
}

/**
 * 编码 ChangeNotetypeRequest（method 15 入参）。
 * noteIds / newFields / newTemplates 都用 packed 编码；
 * newFields / newTemplates 中的 -1 需用 64 位补码编码（prost int32 负数走 zigzag 是错的，proto3 int32 负数等同于 int64 补码）。
 *
 * Invariants: oldNotetypeId / newNotetypeId / currentSchema / oldNotetypeName / isCloze 必须从
 *   GetChangeNotetypeInfo 返回的 input 原样回传，前端不修改这些字段。
 */
export function encodeChangeNotetypeRequest(req: 变更笔记类型请求): Uint8Array {
  const writer = new 协议写入器();
  if (req.noteIds.length > 0) {
    writer.写入打包64位整数(1, req.noteIds);
  }
  if (req.newFields.length > 0) {
    // int32 负数（-1）走 64 位补码编码（10 字节全 0xFF），与 prost int32 一致
    writer.写入打包64位整数(2, req.newFields);
  }
  if (req.newTemplates.length > 0) {
    writer.写入打包64位整数(3, req.newTemplates);
  }
  if (req.oldNotetypeId !== 0) {
    writer.写入64位整数(4, req.oldNotetypeId);
  }
  if (req.newNotetypeId !== 0) {
    writer.写入64位整数(5, req.newNotetypeId);
  }
  if (req.currentSchema !== 0) {
    writer.写入64位整数(6, req.currentSchema);
  }
  if (req.oldNotetypeName !== '') {
    writer.写入字符串(7, req.oldNotetypeName);
  }
  if (req.isCloze) {
    writer.写入布尔(8, true);
  }
  return writer.转为字节();
}
