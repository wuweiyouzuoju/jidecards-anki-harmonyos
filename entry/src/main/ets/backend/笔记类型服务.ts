// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-NOTETYPE-001
// @名称 笔记类型服务边界
//
// @作用
// 包装后端笔记类型服务的 7 个 RPC：
// - 获取笔记类型名列表 / 获取笔记类型 / 获取笔记类型旧版（只读）
// - 获取标准笔记类型JSON / 添加笔记类型旧版（用于兜底恢复缺失的标准类型）
// - 更新笔记类型旧版（T3 模板编辑器整体提交）
// - 移除笔记类型（T3 模板编辑器删除类型）
// 编解码 + 经 后端会话 调用；不持有 UI 状态。
//
// @输入
// ID（笔记类型 ID，number）/ kind（标准类型枚举，number）/ json（旧版 JSON 字符串）
//
// @输出
// Promise<NotetypeNameId[]> / Promise<NotetypeView>
// Promise<string>（标准类型 JSON / 旧版 JSON）/ Promise<number>（新类型 ID）
// Promise<void>（更新/移除，成功无返回值）
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥；只读方法不修改 collection，写入方法会修改。
// ========================================================

import { 后端会话 } from './后端会话';
import { decodeOpChangesWithId } from '../proto/messages/CollectionMessages';
import { 笔记类型方法, 服务号 } from './服务索引';
import type {
  NotetypeCapabilities,
  NotetypeNameId,
  NotetypeView,
  变更笔记类型信息,
  变更笔记类型请求
} from '../proto/messages/NotetypeMessages';
import {
  decodeClozeFieldOrds,
  decodeNotetype,
  decodeNotetypeNames,
  decodeJsonString,
  decodeChangeNotetypeInfo,
  encodeNotetypeId,
  encodeJsonString,
  encodeStockNotetype,
  encodeUpdateNotetypeLegacyRequest,
  encodeGetChangeNotetypeInfoRequest,
  encodeChangeNotetypeRequest,
  NOTE_TYPE_KIND_CLOZE
} from '../proto/messages/NotetypeMessages';

/** AddNotePanel 所属页面使用的 Anki 笔记类型边界。 */
export class 笔记类型服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  async 获取笔记类型名列表(): Promise<NotetypeNameId[]> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取笔记类型名列表, new Uint8Array(0));
    return decodeNotetypeNames(响应字节);
  }

  async 获取笔记类型(ID: number): Promise<NotetypeView> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取笔记类型, encodeNotetypeId(ID));
    return decodeNotetype(响应字节);
  }

  /** Return the exact field ordinals that accept cloze markers for this note type. */
  async 获取填空字段序号(ID: number): Promise<number[]> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取填空字段序号, encodeNotetypeId(ID));
    return decodeClozeFieldOrds(响应字节);
  }

  /** Build one structural capability view without relying on localized note-type names. */
  async 获取笔记类型能力(ID: number): Promise<NotetypeCapabilities> {
    const 视图: NotetypeView = await this.获取笔记类型(ID);
    let 填空字段序号: number[] = [];
    if (视图.kind === NOTE_TYPE_KIND_CLOZE) {
      填空字段序号 = await this.获取填空字段序号(ID);
    }
    return {
      notetypeId: 视图.id,
      name: 视图.name,
      kind: 视图.kind,
      fieldNames: 视图.fieldNames.slice(),
      clozeFieldOrds: 填空字段序号
    };
  }

  /**
   * 获取标准笔记类型的 JSON 表示（Anki 桌面版「管理笔记类型 → 添加 → 选择基础类型」同款流程第一步）。
   * kind 取值见 标准笔记类型种类。
   */
  async 获取标准笔记类型JSON(kind: number): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取标准笔记类型JSON, encodeStockNotetype(kind));
    return decodeJsonString(响应字节);
  }

  /**
   * 用旧版 JSON 添加笔记类型到 collection（GetStockNotetypeLegacy 拿到的 JSON 直接传入即可）。
   * 返回新笔记类型的 ID。失败以 后端错误 抛出。
   */
  async 添加笔记类型旧版(json: string): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.添加笔记类型旧版, encodeJsonString(json));
    // Anki 返回 OpChangesWithId，字段 2 才是新类型 ID。
    const id: number = decodeOpChangesWithId(响应字节);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid note type ID in backend response');
    }
    return id;
  }

  /**
   * 获取笔记类型的完整 JSON 表示（含 fields/templates/css/config）。
   * T3 模板编辑器加载初始数据用。失败以 后端错误 抛出。
   */
  async 获取笔记类型旧版(ID: number): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取笔记类型旧版, encodeNotetypeId(ID));
    return decodeJsonString(响应字节);
  }

  /**
   * 用旧版 JSON 更新笔记类型（整体提交字段/模板/CSS 的修改）。
   * 走 JSON 路径避免前端编写完整 Notetype protobuf。
   * 成功无返回值（后端返回 OpChanges，前端只需知道不报错即成功）。
   * 失败以 后端错误 抛出。
   */
  async 更新笔记类型旧版(json: string, skipChecks: boolean = false): Promise<void> {
    await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.更新笔记类型旧版,
      encodeUpdateNotetypeLegacyRequest(json, skipChecks));
  }

  /**
   * 删除笔记类型。后端会递归删除使用该类型的所有卡片和笔记。
   * 成功无返回值。失败以 后端错误 抛出。
   */
  async 移除笔记类型(ID: number): Promise<void> {
    await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.移除笔记类型, encodeNotetypeId(ID));
  }

  /**
   * 获取变更笔记类型信息（GetChangeNotetypeInfo, method 14）。浏览页 T8 批量操作「更改笔记类型」用。
   * 返回新旧笔记类型的字段名/模板名列表 + 后端给出的默认映射 input（含 current_schema 等）。
   * UI 拿到 input 后让用户调整 newFields / newTemplates 映射，再回传给 变更笔记类型。
   *
   * Invariants: 同一批选中卡片必须同属一个旧笔记类型；不同旧类型需分批调用。
   * Extension Points: 浏览页 T8 批量操作栏「更改笔记类型」第一步调用此方法。
   */
  async 获取变更笔记类型信息(旧笔记类型ID: number, 新笔记类型ID: number): Promise<变更笔记类型信息> {
    const 响应字节 = await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.获取变更笔记类型信息,
      encodeGetChangeNotetypeInfoRequest(旧笔记类型ID, 新笔记类型ID));
    return decodeChangeNotetypeInfo(响应字节);
  }

  /**
   * 变更笔记类型（ChangeNotetype, method 15）。浏览页 T8 批量操作「更改笔记类型」第二步调用。
   * 把 请求.noteIds 对应的笔记批量改成 请求.newNotetypeId，并按 请求.newFields / newTemplates 映射字段/模板。
   * 成功无返回值（后端返回 OpChanges，前端只需知道不报错即成功）。
   *
   * Invariants: 请求必须由 获取变更笔记类型信息 返回的 input 改造而来，
   *   只动 noteIds / newFields / newTemplates，其余字段（oldNotetypeId / newNotetypeId /
   *   currentSchema / oldNotetypeName / isCloze）原样回传，否则后端 schema 校验会失败。
   * Extension Points: 浏览页 T8 批量操作栏「更改笔记类型」第二步调用此方法。
   */
  async 变更笔记类型(请求: 变更笔记类型请求): Promise<void> {
    await this.会话.调用(
      服务号.后端笔记类型, 笔记类型方法.变更笔记类型, encodeChangeNotetypeRequest(请求));
  }
}
