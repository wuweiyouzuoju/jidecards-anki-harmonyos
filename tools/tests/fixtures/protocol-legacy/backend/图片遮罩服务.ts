// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-IMAGEOCCLUSION-001
// @名称 图片遮罩服务边界
//
// @作用
// 包装后端图片遮罩服务的 6 个 RPC：
//   - 获取遮罩用图片（GetImageForOcclusion）：按磁盘文件路径读取图片字节（后端 read_file 直读，无 media 解析）
//   - 获取图片遮罩笔记（GetImageOcclusionNote）：按 noteId 取已有笔记（含遮罩列表）用于编辑回填
//   - 获取图片遮罩字段（GetImageOcclusionFields）：取该笔记类型 4 个字段在 fields 数组中的索引
//   - 添加图片遮罩笔记类型（AddImageOcclusionNotetype）：幂等确保 ImageOcclusion 笔记类型存在
//   - 添加图片遮罩笔记（AddImageOcclusionNote）：选图 + 画遮罩后一键落库（image_path + occlusions + ...）
//   - 更新图片遮罩笔记（UpdateImageOcclusionNote）：按 noteId 更新遮罩/Header/Back Extra/tags
// 编解码 + 经 后端会话 调用；不持有 UI 状态，失败抛 后端错误。
//
// @输入
// 获取遮罩用图片：path（磁盘文件路径，string；后端按相对进程 CWD 解析，必须传绝对路径）
// 获取图片遮罩笔记：noteId（number）
// 获取图片遮罩字段：notetypeId（number）
// 添加图片遮罩笔记类型：无
// 添加图片遮罩笔记：AddImageOcclusionNoteRequest（imagePath / occlusions / header / backExtra / tags / notetypeId）
// 更新图片遮罩笔记：UpdateImageOcclusionNoteRequest（noteId / occlusions / header / backExtra / tags）
//
// @输出
// 获取遮罩用图片：Promise<GetImageForOcclusionResponse>（data 图片字节 + name 最终文件名）
// 获取图片遮罩笔记：Promise<GetImageOcclusionNoteResponse>（note 或 error，oneof）
// 获取图片遮罩字段：Promise<图片遮罩字段索引>（遮罩/图片/标题/额外 4 个字段索引）
// 添加图片遮罩笔记类型：Promise<void>
// 添加图片遮罩笔记：Promise<OpChanges>（实体变更标记）
// 更新图片遮罩笔记：Promise<OpChanges>（实体变更标记）
//
// @业务规则
// AddImageOcclusionNotetype 入参为 generic.Empty，传空字节。
// 字段索引映射：proto occlusions→遮罩、image→图片、header→标题、back_extra→额外。
// 添加图片遮罩笔记 的 imagePath 应为应用沙箱内真实存在的图片文件绝对路径（如 cacheDir 临时文件）——
// 后端第一步 read_file(image_path) 直读磁盘，再以文件名为期望名写入 collection.media 并登记媒体库；
// 传 media 文件名会因相对路径解析失败报 "Failed to read 'xxx': No such file or directory"。
// 更新图片遮罩笔记 不含 image_path——图片本身不更新，沿用原值。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥；添加图片遮罩笔记类型 / 添加图片遮罩笔记 / 更新图片遮罩笔记 会修改 Anki collection。
// ========================================================

import { 后端会话 } from './后端会话';
import { 图片遮罩方法, 服务号 } from './服务索引';
import { decodeOpChanges } from '../proto/messages/CollectionMessages';
import type { OpChanges } from '../proto/messages/CollectionMessages';
import {
  decodeGetImageForOcclusionResponse,
  decodeGetImageOcclusionFieldsResponse,
  decodeGetImageOcclusionNoteResponse,
  encodeAddImageOcclusionNoteRequest,
  encodeGetImageForOcclusionRequest,
  encodeGetImageOcclusionFieldsRequest,
  encodeGetImageOcclusionNoteRequest,
  encodeUpdateImageOcclusionNoteRequest
} from '../proto/messages/ImageOcclusionMessages';
import type {
  AddImageOcclusionNoteRequest,
  GetImageForOcclusionResponse,
  GetImageOcclusionNoteResponse,
  UpdateImageOcclusionNoteRequest
} from '../proto/messages/ImageOcclusionMessages';

export interface 图片遮罩字段索引 {
  遮罩: number;
  图片: number;
  标题: number;
  额外: number;
}

/** 图片遮盖建卡与编辑的后端边界；封装 6 个 RPC，不持有 UI 状态。 */
export class 图片遮罩服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 获取遮罩用图片：按磁盘文件路径读取图片字节与文件名（后端 read_file 直读，须传绝对路径）。
   * 失败以 后端错误 抛出，message 可直接展示。
   */
  async 获取遮罩用图片(路径: string): Promise<GetImageForOcclusionResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.获取遮罩用图片,
      encodeGetImageForOcclusionRequest(路径));
    return decodeGetImageForOcclusionResponse(响应字节);
  }

  /**
   * 获取图片遮罩笔记：按 noteId 读取笔记的图片数据、遮罩列表、Header/Back Extra、tags 等。
   * 用于编辑已有图片遮罩笔记时回填编辑器。后端返回 oneof：note 或 error。
   * 失败以 后端错误 抛出；后端业务错误（如 note 不存在）通过 response.error 返回，不抛异常。
   */
  async 获取图片遮罩笔记(笔记ID: number): Promise<GetImageOcclusionNoteResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.获取图片遮罩笔记,
      encodeGetImageOcclusionNoteRequest(笔记ID));
    return decodeGetImageOcclusionNoteResponse(响应字节);
  }

  async 获取图片遮罩字段(notetypeId: number): Promise<图片遮罩字段索引> {
    const 响应字节 = await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.获取图片遮罩字段,
      encodeGetImageOcclusionFieldsRequest(notetypeId));
    const fields = decodeGetImageOcclusionFieldsResponse(响应字节);
    return {
      遮罩: fields.occlusions,
      图片: fields.image,
      标题: fields.header,
      额外: fields.backExtra
    };
  }

  async 添加图片遮罩笔记类型(): Promise<void> {
    await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.添加图片遮罩笔记类型, new Uint8Array(0));
  }

  /**
   * 添加图片遮罩笔记：把选好的图片文件路径、遮罩 cloze 字符串、Header/Back Extra、tags 一并落库。
   * imagePath 必须是应用沙箱内真实存在的图片文件绝对路径（后端直读磁盘并把字节写入 collection.media），
   * 文件名会直接作为媒体文件名，扩展名需为 Anki 支持的图片格式（jpg/png/webp/gif 等）。
   * 返回 OpChanges（实体变更标记，UI 据此刷新对应区域）。
   * 失败以 后端错误 抛出，message 可直接展示。
   */
  async 添加图片遮罩笔记(请求: AddImageOcclusionNoteRequest): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.添加图片遮罩笔记,
      encodeAddImageOcclusionNoteRequest(请求));
    return decodeOpChanges(响应字节);
  }

  /**
   * 更新图片遮罩笔记：按 noteId 更新遮罩 cloze 字符串、Header/Back Extra、tags。
   * 图片本身不更新（沿用原 image_path）。
   * 返回 OpChanges（实体变更标记）。
   * 失败以 后端错误 抛出，message 可直接展示。
   */
  async 更新图片遮罩笔记(请求: UpdateImageOcclusionNoteRequest): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端图片遮罩, 图片遮罩方法.更新图片遮罩笔记,
      encodeUpdateImageOcclusionNoteRequest(请求));
    return decodeOpChanges(响应字节);
  }
}
