// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-CORE-WRITER-001
// @名称 协议写入器
//
// @作用
// 按 protobuf wire format（proto3，与 prost 编码对齐）写入字段。
// 规范来源：https://protobuf.dev/programming-guides/encoding/
//
// @输入
// 各 写入xx 方法接收字段号与值
//
// @输出
// 转为字节 返回编码后的 Uint8Array
//
// @业务规则
// 只覆盖本项目用到的类型；proto3 默认值由调用方跳过（与 prost 一致）。
// int64 负数按二进制补码编成 10 字节 varint。
//
// @副作用
// 无。内部累积字节，通过 转为字节 输出。
// ========================================================

import { UTF8编码 } from './utf8';

export const 线类型_变长整数 = 0;
export const 线类型_定长64 = 1;
export const 线类型_长度分隔 = 2;
export const 线类型_定长32 = 5;

export class 协议写入器 {
  private 字节流: number[] = [];

  private 压入变长整数(值: bigint): void {
    let v = 值;
    while (v > 0x7fn) {
      this.字节流.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    this.字节流.push(Number(v));
  }

  写入标签(字段号: number, 线类型: number): void {
    this.压入变长整数(BigInt(字段号 * 8 + 线类型));
  }

  /** varint 无符号写入（uint32/uint64/bool/enum） */
  写入变长整数(字段号: number, 值: number): void {
    this.写入标签(字段号, 线类型_变长整数);
    this.压入变长整数(BigInt(值 >= 0 ? 值 : 0));
  }

  /** int64：负数按二进制补码编成 10 字节 varint（与 prost 一致） */
  写入64位整数(字段号: number, 值: number): void {
    this.写入标签(字段号, 线类型_变长整数);
    this.压入变长整数(BigInt.asUintN(64, BigInt(值)));
  }

  /** packed repeated int64：proto3 数值型 repeated 的默认编码（与 prost 一致） */
  写入打包64位整数(字段号: number, 值列表: number[]): void {
    if (值列表.length === 0) {
      return;
    }
    const 打包器 = new 协议写入器();
    for (const 值 of 值列表) {
      打包器.压入变长整数(BigInt.asUintN(64, BigInt(值)));
    }
    this.写入字节(字段号, 打包器.转为字节());
  }

  写入布尔(字段号: number, 值: boolean): void {
    this.写入变长整数(字段号, 值 ? 1 : 0);
  }

  写入数值(field: number, kind: string, value: number): void {
    this.写入标签(field, kind === 'float' || kind === 'fixed32' || kind === 'sfixed32' ? 5 :
      kind === 'double' || kind === 'fixed64' || kind === 'sfixed64' ? 1 : 0);
    this.写入数值载荷(kind, value);
  }

  写入数值载荷(kind: string, value: number): void {
    if (kind === 'float' || kind === 'double' || kind.startsWith('fixed') || kind.startsWith('sfixed')) {
      const size = kind === 'float' || kind.endsWith('32') ? 4 : 8;
      const bytes = new Uint8Array(size);
      const v = new DataView(bytes.buffer);
      if (kind === 'float') v.setFloat32(0, value, true);
      else if (kind === 'double') v.setFloat64(0, value, true);
      else if (kind === 'fixed32') v.setUint32(0, value, true);
      else if (kind === 'sfixed32') v.setInt32(0, value, true);
      else {
        if (!Number.isSafeInteger(value)) throw new Error('proto: integer exceeds safe integer range');
        if (kind === 'fixed64') v.setBigUint64(0, BigInt(value), true);
        else v.setBigInt64(0, BigInt(value), true);
      }
      this.写入原始字节(bytes);
      return;
    }
    if (!Number.isSafeInteger(value)) throw new Error('proto: integer exceeds safe integer range');
    const n = BigInt(value);
    if (kind === 'sint32' || kind === 'sint64') this.压入变长整数((n << 1n) ^ (n >> (kind === 'sint32' ? 31n : 63n)));
    else if (kind === 'int32' || kind === 'int64' || kind === 'enum') this.压入变长整数(BigInt.asUintN(64, n));
    else this.压入变长整数(n >= 0n ? n : 0n);
  }

  写入宽整数载荷(kind: string, value: bigint): void {
    const unsigned = kind === 'uint64' || kind === 'fixed64';
    if (value < (unsigned ? 0n : -(1n << 63n)) || value > (unsigned ? (1n << 64n) - 1n : (1n << 63n) - 1n)) {
      throw new Error('proto: integer out of 64-bit range');
    }
    if (kind === 'fixed64' || kind === 'sfixed64') {
      const bytes = new Uint8Array(8); const view = new DataView(bytes.buffer);
      if (unsigned) view.setBigUint64(0, value, true); else view.setBigInt64(0, value, true);
      this.写入原始字节(bytes);
    } else this.压入变长整数(kind === 'sint64' ? (value << 1n) ^ (value >> 63n) : BigInt.asUintN(64, value));
  }

  /** float（wire type 5，小端 32 位） */
  写入浮点(字段号: number, 值: number): void {
    this.写入标签(字段号, 线类型_定长32);
    const 缓冲 = new Float32Array([值]);
    const 字节 = new Uint8Array(缓冲.buffer);
    for (const b of 字节) {
      this.字节流.push(b);
    }
  }

  /** packed repeated float：proto3 数值型 repeated 的默认编码（与 prost 一致） */
  写入打包浮点(字段号: number, 值列表: number[]): void {
    if (值列表.length === 0) {
      return;
    }
    const 载荷 = new Uint8Array(值列表.length * 4);
    for (let i = 0; i < 值列表.length; i++) {
      const 缓冲 = new Float32Array([值列表[i]]);
      载荷.set(new Uint8Array(缓冲.buffer), i * 4);
    }
    this.写入字节(字段号, 载荷);
  }

  写入字符串(字段号: number, 值: string): void {
    const 编码 = UTF8编码(值);
    this.写入标签(字段号, 线类型_长度分隔);
    this.压入变长整数(BigInt(编码.length));
    for (const b of 编码) {
      this.字节流.push(b);
    }
  }

  写入字节(字段号: number, 值: Uint8Array): void {
    this.写入标签(字段号, 线类型_长度分隔);
    this.压入变长整数(BigInt(值.length));
    for (const b of 值) {
      this.字节流.push(b);
    }
  }

  /** 嵌入子消息：tag + 长度 + 子消息字节 */
  写入子消息(字段号: number, 消息: 协议写入器): void {
    this.写入字节(字段号, 消息.转为字节());
  }

  /** 原样追加已编码字节（未建模字段保真回写用，配合 协议读取器.截取片段） */
  写入原始字节(字节: Uint8Array): void {
    for (const b of 字节) {
      this.字节流.push(b);
    }
  }

  转为字节(): Uint8Array {
    return new Uint8Array(this.字节流);
  }
}
