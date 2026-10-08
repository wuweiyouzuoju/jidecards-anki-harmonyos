// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议读取器 } from './ProtoReader';
import { 协议写入器 } from './ProtoWriter';

/** 描述驱动的静态生成代码共用 wire 引擎；领域适配器不维护 wire 类型或编号。 */
export class WireField {
  id: number = 0;
  wire: number = 0;
  payload: Uint8Array = new Uint8Array(0);
  raw: Uint8Array = new Uint8Array(0);
}

export function safeInteger(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error(`proto: integer ${value} exceeds safe integer range`);
  }
  return Number(value);
}

export class WireMessage {
  private fields: WireField[] = [];

  constructor(bytes: Uint8Array = new Uint8Array(0)) {
    const r = new 协议读取器(bytes);
    while (!r.已读完) {
      const start = r.当前位置;
      const tag = r.读取标签()!;
      const payloadStart = r.当前位置;
      const f = new WireField();
      f.id = tag.字段号;
      f.wire = tag.线类型;
      if (f.wire === 2) f.payload = r.读取字节视图();
      else { r.跳过字段(f.wire); f.payload = bytes.subarray(payloadStart, r.当前位置); }
      f.raw = bytes.subarray(start, r.当前位置);
      this.fields.push(f);
    }
  }

  has(id: number): boolean { return this.fields.some((f: WireField): boolean => f.id === id); }
  hasWire(id: number, wire: number): boolean { return this.fields.some((f: WireField): boolean => f.id === id && f.wire === wire); }
  count(id: number): number { return this.fields.filter((f: WireField): boolean => f.id === id).length; }
  protected rawFor(id: number): Uint8Array[] { return this.fields.filter((f: WireField): boolean => f.id === id).map((f: WireField): Uint8Array => f.raw.slice()); }
  lastOneof(ids: number[]): number {
    let last = 0;
    for (const f of this.fields) if (ids.includes(f.id)) last = f.id;
    return last;
  }
  protected matching(id: number, wire: number): WireField[] {
    const values = this.fields.filter((f: WireField): boolean => f.id === id);
    if (values.some((f: WireField): boolean => f.wire !== wire)) throw new Error(`proto: invalid wire type for field ${id}`);
    return values;
  }
  protected bytes(id: number): Uint8Array | null {
    const values = this.matching(id, 2);
    return values.length === 0 ? null : values[values.length - 1].payload.slice();
  }
  protected byteList(id: number): Uint8Array[] { return this.matching(id, 2).map((f: WireField): Uint8Array => f.payload.slice()); }
  protected messageBytes(id: number, oneof: number[]): Uint8Array | null {
    const values: Uint8Array[] = [];
    for (const f of this.fields) {
      if (oneof.includes(f.id) && f.id !== id) values.splice(0, values.length);
      if (f.id === id) {
        if (f.wire !== 2) throw new Error(`proto: invalid wire type for field ${id}`);
        values.push(f.payload);
      }
    }
    if (values.length === 0) return null;
    const w = new 协议写入器(); for (const bytes of values) w.写入原始字节(bytes);
    return w.转为字节();
  }
  protected text(id: number): string {
    const values = this.matching(id, 2);
    if (values.length === 0) return '';
    const r = new 协议读取器(values[values.length - 1].raw);
    r.读取标签();
    return r.读取字符串();
  }
  protected textList(id: number): string[] {
    return this.matching(id, 2).map((f: WireField): string => {
      const r = new 协议读取器(f.raw); r.读取标签(); return r.读取字符串();
    });
  }
  protected numberValue(id: number, kind: string): number {
    const values = this.numberList(id, kind, false);
    return values.length === 0 ? 0 : values[values.length - 1];
  }
  protected numberList(id: number, kind: string, repeated: boolean = true): number[] {
    const result: number[] = [];
    const wire = kind === 'float' || kind === 'fixed32' || kind === 'sfixed32' ? 5 :
      kind === 'double' || kind === 'fixed64' || kind === 'sfixed64' ? 1 : 0;
    for (const f of this.fields) {
      if (f.id !== id) continue;
      if (f.wire !== wire && !(repeated && f.wire === 2)) throw new Error(`proto: invalid wire type for field ${id}`);
      const r = new 协议读取器(f.payload);
      if (r.已读完) continue;
      do { result.push(r.读取数值(kind)); } while (f.wire === 2 && !r.已读完);
    }
    return result;
  }
  protected booleanValue(id: number): boolean { return this.bigValue(id, 'uint64') !== 0n; }
  protected bigValue(id: number, kind: string): bigint {
    const list = this.bigList(id, kind, false);
    return list.length === 0 ? 0n : list[list.length - 1];
  }
  protected bigList(id: number, kind: string, repeated: boolean = true): bigint[] {
    const values: bigint[] = [];
    const wire = kind === 'fixed64' || kind === 'sfixed64' ? 1 : 0;
    for (const f of this.fields) {
      if (f.id !== id) continue;
      if (f.wire !== wire && !(repeated && f.wire === 2)) throw new Error(`proto: invalid wire type for field ${id}`);
      const r = new 协议读取器(f.payload);
      while (!r.已读完) { values.push(r.读取宽整数(kind)); if (f.wire !== 2) break; }
    }
    return values;
  }
  protected appendBig(id: number, kind: string, values: bigint[], packed: boolean): void {
    const w = new 协议写入器();
    for (const value of values) {
      if (!packed) w.写入标签(id, kind === 'fixed64' || kind === 'sfixed64' ? 1 : 0);
      w.写入宽整数载荷(kind, value);
    }
    if (packed) { if (values.length > 0) this.append(id, w.转为字节()); }
    else this.appendRaw(w.转为字节());
  }
  protected append(id: number, payload: Uint8Array): void {
    const w = new 协议写入器(); w.写入字节(id, payload); this.appendRaw(w.转为字节());
  }
  protected appendText(id: number, value: string): void {
    const w = new 协议写入器(); w.写入字符串(id, value); this.appendRaw(w.转为字节());
  }
  protected appendNumber(id: number, kind: string, value: number): void {
    const w = new 协议写入器(); w.写入数值(id, kind, value); this.appendRaw(w.转为字节());
  }
  protected appendNumbers(id: number, kind: string, values: number[], packed: boolean): void {
    if (packed) {
      if (values.length === 0) return;
      const w = new 协议写入器();
      for (const value of values) w.写入数值载荷(kind, value);
      this.append(id, w.转为字节());
    } else for (const value of values) this.appendNumber(id, kind, value);
  }
  protected clearOneof(ids: number[]): void { this.fields = this.fields.filter((f: WireField): boolean => !ids.includes(f.id)); }
  replace(id: number, encoded: Uint8Array): void {
    this.fields = this.fields.filter((f: WireField): boolean => f.id !== id);
    this.appendRaw(encoded);
  }
  appendRaw(bytes: Uint8Array): void { this.fields.push(...new WireMessage(bytes).fields); }
  unknown(known: number[]): Uint8Array[] {
    return this.fields.filter((f: WireField): boolean => !known.includes(f.id)).map((f: WireField): Uint8Array => f.raw.slice());
  }
  toBytes(): Uint8Array {
    const w = new 协议写入器(); for (const f of this.fields) w.写入原始字节(f.raw); return w.转为字节();
  }
  转为字节(): Uint8Array { return this.toBytes(); }
}
