// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-ERRORS-001
// @名称 后端错误类型与原生错误映射
//
// @作用
// 定义后端业务错误的类型化封装（后端错误），并把 NAPI 桥抛出的
// 原生错误（含 nativeStatus / details / message）映射为后端错误。
// 纯逻辑、无桥接依赖，可独立单元测试。
//
// @输入
// 后端错误构造参数：message / kind / context / nativeStatus
// 映射原生错误入参：caught: unknown（NAPI 桥抛出的任意值）
//
// @输出
// 后端错误实例（kind 保留协议值；knownKind 提供已知枚举的类型化视图）
//
// @业务规则
// kind 与 backend.proto BackendError.Kind 对应；不要把合法的高编号同步错误压成 0。
// 当 nativeStatus === 后端错误 且 details 是 BackendError protobuf 字节时，
// 用 decodeBackendError 解析出 message/kind/context；解码失败不掩盖原始错误，落到通用分支。
// 通用分支：message 取自原生错误 message，kind=0，context=''，status=原生致命错误 或 实际 status。
//
// @副作用
// 无
//
// @注意
// 修改错误映射逻辑会影响所有 service 的 catch 语义，需同步测试。
// ========================================================

import { decodeBackendError } from '../proto/messages/BackendMessages';
import { 原生状态 } from './服务索引';

export type 后端错误种类 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;
export type 原生状态码 = 0 | 1 | 2 | 3 | 4;

function 规范化后端错误种类(value: number): 后端错误种类 | null {
  switch (value) {
    case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9:
    case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: case 19:
    case 20: case 21: case 22: case 23: case 24:
      return value;
    default:
      return null;
  }
}

function 规范化原生状态(value: number): 原生状态码 | null {
  if (value >= 0 && value <= 4 && Number.isInteger(value)) {
    return value as 原生状态码;
  }
  return null;
}

/** 协议边界保留未知值，不能把未来错误误判为 INVALID_INPUT。 */
export class 后端错误 extends Error {
  readonly kind: number;
  readonly knownKind: 后端错误种类 | null;
  readonly context: string;
  readonly nativeStatus: number;
  readonly knownNativeStatus: 原生状态码 | null;

  constructor(message: string, kind: number, context: string, nativeStatus: number) {
    super(message);
    this.name = '后端错误';
    this.kind = kind;
    this.knownKind = 规范化后端错误种类(kind);
    this.context = context;
    this.nativeStatus = nativeStatus;
    this.knownNativeStatus = 规范化原生状态(nativeStatus);
  }
}

/** NAPI 桥抛出的错误形态（native_module.cpp CreateNativeError） */
export interface 原生错误形态 {
  nativeStatus?: number;
  details?: Uint8Array;
  message?: string;
}

/** 把 NAPI 桥错误映射为后端错误；后端错误 时 details 是 BackendError protobuf 字节 */
export function 映射原生错误(caught: unknown): 后端错误 {
  const shape = caught as 原生错误形态;
  const status: number = typeof shape?.nativeStatus === 'number' ?
    shape.nativeStatus : 原生状态.原生致命错误;
  if (status === 原生状态.后端错误 && shape.details instanceof Uint8Array && shape.details.length > 0) {
    try {
      const info = decodeBackendError(shape.details);
      return new 后端错误(info.message, info.kind, info.context, status);
    } catch {
      // details 解码失败不应掩盖原始错误，落到通用分支
    }
  }
  const message = typeof shape?.message === 'string' ? shape.message : 'unknown native error';
  return new 后端错误(message, 0, '', status);
}
