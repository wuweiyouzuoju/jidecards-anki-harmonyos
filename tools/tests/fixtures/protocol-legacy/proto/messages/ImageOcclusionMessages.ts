// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-IMAGEOCCLUSION-001
// @名称 图片遮罩消息编解码
//
// @作用
// 编解码 anki.image_occlusion.proto 消息（Anki 26.05），服务于「图片遮盖建卡」流程：
// - GetImageOcclusionFieldsRequest / Response：取该笔记类型 4 个字段在 fields 数组中的索引
// - ImageOcclusionFieldIndexes：occlusions / image / header / back_extra 的 uint32 索引
// - GetImageForOcclusionRequest / Response：按 path 取图片字节与最终文件名
// - GetImageOcclusionNoteRequest / Response：按 noteId 取已有图片遮罩笔记（含图片字节、遮罩列表）
// - AddImageOcclusionNoteRequest：新建图片遮罩笔记（image_path + occlusions + header + back_extra + tags + notetype_id）
// - UpdateImageOcclusionNoteRequest：更新已有图片遮罩笔记（note_id + occlusions + header + back_extra + tags）
// AddImageOcclusionNotetype 入参为 generic.Empty，无字段，由服务层直接传 new Uint8Array(0)。
// 字段来源：third_party/anki/proto/anki/image_occlusion.proto
//
// @输入
// 编码：notetypeId / path / noteId / AddImageOcclusionNoteRequest / UpdateImageOcclusionNoteRequest
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：ImageOcclusionFieldIndexes / GetImageForOcclusionResponse / GetImageOcclusionNoteResponse
//
// @业务规则
// proto3 默认值（uint32=0、string=''）不在网络上传输，解码时按默认值填充。
// ImageOcclusionFieldIndexes.occlusions=0 是合法值（字段索引 0），解码必须保留。
// repeated string 编码为多个同字段号的 length-delimited 条目（proto3 非打包字符串）。
// GetImageOcclusionNoteResponse 是 oneof：note 与 error 互斥，解码后由调用方检查哪个非空。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

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
  const writer = new 协议写入器();
  if (notetypeId !== 0) {
    writer.写入64位整数(1, notetypeId);
  }
  return writer.转为字节();
}

function decodeImageOcclusionFieldIndexes(bytes: Uint8Array): ImageOcclusionFieldIndexes {
  const reader = new 协议读取器(bytes);
  const result: ImageOcclusionFieldIndexes = { occlusions: 0, image: 0, header: 0, backExtra: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.occlusions = reader.读取变长整数();
        break;
      case 2:
        result.image = reader.读取变长整数();
        break;
      case 3:
        result.header = reader.读取变长整数();
        break;
      case 4:
        result.backExtra = reader.读取变长整数();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

export function decodeGetImageOcclusionFieldsResponse(bytes: Uint8Array): ImageOcclusionFieldIndexes {
  const reader = new 协议读取器(bytes);
  let result: ImageOcclusionFieldIndexes = { occlusions: 0, image: 0, header: 0, backExtra: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      result = decodeImageOcclusionFieldIndexes(reader.读取字节());
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

export function encodeGetImageForOcclusionRequest(path: string): Uint8Array {
  const writer = new 协议写入器();
  if (path !== '') {
    writer.写入字符串(1, path);
  }
  return writer.转为字节();
}

export function decodeGetImageForOcclusionResponse(bytes: Uint8Array): GetImageForOcclusionResponse {
  const reader = new 协议读取器(bytes);
  const result: GetImageForOcclusionResponse = { data: new Uint8Array(0), name: '' };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.data = reader.读取字节();
        break;
      case 2:
        result.name = reader.读取字符串();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

// ========================================================
// @块ID PROTO-MSG-IMAGEOCCLUSION-002
// @名称 添加图片遮罩笔记请求编解码
//
// @作用
// 编码 AddImageOcclusionNoteRequest：把选好的图片路径（collection.media 中的文件名）、
// 遮罩 cloze 字符串、Header、Back Extra、tags、笔记类型 ID 打包为后端可消费的字节。
//
// @输入
// AddImageOcclusionNoteRequest：imagePath / occlusions / header / backExtra / tags / notetypeId
//
// @输出
// Uint8Array 字节
//
// @业务规则
// proto3 默认值省略：空串 / 0 不写入，与 prost 对齐。
// repeated string tags：每个 tag 作为独立的 field 5 length-delimited 条目（proto3 非打包字符串）。
// notetype_id 为 int64（field 6），用 写入64位整数 编码。
//
// @副作用
// 无
// ========================================================

export interface AddImageOcclusionNoteRequest {
  imagePath: string;
  occlusions: string;
  header: string;
  backExtra: string;
  tags: string[];
  notetypeId: number;
}

export function encodeAddImageOcclusionNoteRequest(req: AddImageOcclusionNoteRequest): Uint8Array {
  const writer = new 协议写入器();
  if (req.imagePath !== '') {
    writer.写入字符串(1, req.imagePath);
  }
  if (req.occlusions !== '') {
    writer.写入字符串(2, req.occlusions);
  }
  if (req.header !== '') {
    writer.写入字符串(3, req.header);
  }
  if (req.backExtra !== '') {
    writer.写入字符串(4, req.backExtra);
  }
  for (const tag of req.tags) {
    writer.写入字符串(5, tag);
  }
  if (req.notetypeId !== 0) {
    writer.写入64位整数(6, req.notetypeId);
  }
  return writer.转为字节();
}

// ========================================================
// @块ID PROTO-MSG-IMAGEOCCLUSION-003
// @名称 获取图片遮罩笔记请求/响应编解码
//
// @作用
// 编码 GetImageOcclusionNoteRequest（noteId），解码 GetImageOcclusionNoteResponse（oneof note/error）。
// 用于编辑已有图片遮罩笔记时把笔记内容回填到编辑器。
//
// @输入
// 编码：noteId（int64）
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：GetImageOcclusionNoteResponse（note 与 error 互斥，两者皆空表示后端返回了空响应）
//
// @业务规则
// oneof value：field 1 = note（ImageOcclusionNote 子消息），field 2 = error（string）。
// 解码后由调用方检查 note !== null 还是 error !== '' 来判断成功/失败。
// ImageOcclusionNote.image_data 是 bytes（field 1），occlusions 是 repeated ImageOcclusion 子消息（field 2）。
// ImageOcclusion.ordinal 是 uint32（field 2），shapes 是 repeated ImageOcclusionShape 子消息（field 1）。
// ImageOcclusionShape.shape 是 string（field 1），properties 是 repeated ImageOcclusionProperty 子消息（field 2）。
// ImageOcclusionProperty.name 是 string（field 1），value 是 string（field 2）。
// occlude_inactive 是 bool（field 7），默认 false。
//
// @副作用
// 无
// ========================================================

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
  const writer = new 协议写入器();
  if (noteId !== 0) {
    writer.写入64位整数(1, noteId);
  }
  return writer.转为字节();
}

export function decodeGetImageOcclusionNoteResponse(bytes: Uint8Array): GetImageOcclusionNoteResponse {
  const reader = new 协议读取器(bytes);
  const result: GetImageOcclusionNoteResponse = { note: null, error: '' };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.note = decodeImageOcclusionNote(reader.读取字节());
        break;
      case 2:
        result.error = reader.读取字符串();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

function decodeImageOcclusionNote(bytes: Uint8Array): ImageOcclusionNote {
  const reader = new 协议读取器(bytes);
  const result: ImageOcclusionNote = {
    imageData: new Uint8Array(0),
    occlusions: [],
    header: '',
    backExtra: '',
    tags: [],
    imageFileName: '',
    occludeInactive: false
  };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.imageData = reader.读取字节();
        break;
      case 2:
        result.occlusions.push(decodeImageOcclusion(reader.读取字节()));
        break;
      case 3:
        result.header = reader.读取字符串();
        break;
      case 4:
        result.backExtra = reader.读取字符串();
        break;
      case 5:
        result.tags.push(reader.读取字符串());
        break;
      case 6:
        result.imageFileName = reader.读取字符串();
        break;
      case 7:
        result.occludeInactive = reader.读取布尔();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

function decodeImageOcclusion(bytes: Uint8Array): ImageOcclusion {
  const reader = new 协议读取器(bytes);
  const result: ImageOcclusion = { shapes: [], ordinal: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.shapes.push(decodeImageOcclusionShape(reader.读取字节()));
        break;
      case 2:
        result.ordinal = reader.读取变长整数();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

function decodeImageOcclusionShape(bytes: Uint8Array): ImageOcclusionShape {
  const reader = new 协议读取器(bytes);
  const result: ImageOcclusionShape = { shape: '', properties: [] };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.shape = reader.读取字符串();
        break;
      case 2:
        result.properties.push(decodeImageOcclusionProperty(reader.读取字节()));
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

function decodeImageOcclusionProperty(bytes: Uint8Array): ImageOcclusionProperty {
  const reader = new 协议读取器(bytes);
  const result: ImageOcclusionProperty = { name: '', value: '' };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        result.name = reader.读取字符串();
        break;
      case 2:
        result.value = reader.读取字符串();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

// ========================================================
// @块ID PROTO-MSG-IMAGEOCCLUSION-004
// @名称 更新图片遮罩笔记请求编解码
//
// @作用
// 编码 UpdateImageOcclusionNoteRequest：按 noteId 更新遮罩字符串、Header、Back Extra、tags。
// 图片本身不更新（沿用原 image_path），因此请求中无 image_path 字段。
//
// @输入
// UpdateImageOcclusionNoteRequest：noteId / occlusions / header / backExtra / tags
//
// @输出
// Uint8Array 字节
//
// @业务规则
// proto3 默认值省略：空串 / 0 不写入，与 prost 对齐。
// note_id 为 int64（field 1），用 写入64位整数 编码。
// repeated string tags：每个 tag 作为独立的 field 5 length-delimited 条目。
//
// @副作用
// 无
// ========================================================

export interface UpdateImageOcclusionNoteRequest {
  noteId: number;
  occlusions: string;
  header: string;
  backExtra: string;
  tags: string[];
}

export function encodeUpdateImageOcclusionNoteRequest(req: UpdateImageOcclusionNoteRequest): Uint8Array {
  const writer = new 协议写入器();
  if (req.noteId !== 0) {
    writer.写入64位整数(1, req.noteId);
  }
  if (req.occlusions !== '') {
    writer.写入字符串(2, req.occlusions);
  }
  if (req.header !== '') {
    writer.写入字符串(3, req.header);
  }
  if (req.backExtra !== '') {
    writer.写入字符串(4, req.backExtra);
  }
  for (const tag of req.tags) {
    writer.写入字符串(5, tag);
  }
  return writer.转为字节();
}
