// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-CLIENT-001
// @名称 后端客户端（NAPI 桥接封装）
//
// @作用
// 直接包裹 libjidecards.so 的 NAPI 接口：
//   - 打开(BackendInit 字节) → 拿到 backend 句柄
//   - 调用原始(服务号, 方法号, 输入字节) → Promise<输出字节>
//   - 关闭() → 释放句柄
// 不做错误类型化、不做重试、不做并发控制——那些由 后端会话 负责。
//
// @输入
// 打开：init Uint8Array（BackendInit protobuf 字节）
// 调用原始：服务号 / 方法号 / 输入字节
// 关闭：无
//
// @输出
// 打开：void（句柄存到 this.句柄）
// 调用原始：Promise<Uint8Array>（后端返回的 protobuf 字节）
// 是否已打开：boolean
//
// @业务规则
// 句柄非 0 视为已打开；重复打开直接抛错（防止句柄泄漏）。
// 关闭是幂等的：句柄为 0 时直接返回。
// runMethodRaw 由 NAPI 桥实现，错误形态由 错误类型.映射原生错误 处理。
//
// @副作用
// 调用 NAPI 桥（libjidecards.so）的 openBackend / runMethodRaw / closeBackend，
// 持有原生 backend 句柄（数字）。
//
// @注意
// 不要直接在业务代码里 new 后端客户端——应通过 后端会话 单例访问。
// ========================================================

import { closeBackend, openBackend, runMethodRaw } from 'libjidecards.so';

export class 后端客户端 {
  private 句柄: number = 0;

  打开(初始化字节: Uint8Array): void {
    if (this.句柄 !== 0) {
      throw new Error('Backend is already open');
    }
    this.句柄 = openBackend(初始化字节);
  }

  调用原始(服务号: number, 方法号: number, 输入字节: Uint8Array): Promise<Uint8Array> {
    if (this.句柄 === 0) {
      return Promise.reject(new Error('Backend is not open'));
    }
    return runMethodRaw(this.句柄, 服务号, 方法号, 输入字节);
  }

  关闭(): void {
    if (this.句柄 === 0) {
      return;
    }
    const 待关闭句柄: number = this.句柄;
    this.句柄 = 0;
    closeBackend(待关闭句柄);
  }

  是否已打开(): boolean {
    return this.句柄 !== 0;
  }
}
