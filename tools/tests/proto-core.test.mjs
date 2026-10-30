// SPDX-License-Identifier: AGPL-3.0-or-later

// ProtoReader/ProtoWriter 单元测试：字节级锁定 wire format 行为，
// 样例与 protobuf 官方文档及 prost 编码对齐。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 协议写入器, 线类型_变长整数, 线类型_长度分隔 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { UTF8解码, UTF8编码 } from '../../entry/src/main/ets/proto/core/utf8.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

test('varint encoding matches the protobuf spec examples', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 150);
  // field1 varint: tag 0x08, 150 = 0x96 0x01（官方文档样例）
  assert.equal(hex(w.转为字节()), '08 96 01');
});

test('varint roundtrips across boundary values', () => {
  for (const value of [0, 1, 127, 128, 300, 2 ** 31, 2 ** 53 - 1]) {
    const w = new 协议写入器();
    w.写入变长整数(3, value);
    const r = new 协议读取器(w.转为字节());
    const tag = r.读取标签();
    assert.equal(tag.字段号, 3);
    assert.equal(tag.线类型, 线类型_变长整数);
    assert.equal(r.读取变长整数(), value);
    assert.equal(r.已读完, true);
  }
});

test('int64 negative values encode as 10-byte two-complement varints', () => {
  const w = new 协议写入器();
  w.写入64位整数(1, -1);
  const bytes = w.转为字节();
  assert.equal(bytes.length, 1 + 10);

  const r = new 协议读取器(bytes);
  r.读取标签();
  assert.equal(r.读取64位整数(), -1);
});

test('int64 positive roundtrip for deck-id scale values', () => {
  const w = new 协议写入器();
  w.写入64位整数(1, 1752902400123);
  const r = new 协议读取器(w.转为字节());
  r.读取标签();
  assert.equal(r.读取64位整数(), 1752902400123);
});

test('string fields use length-delimited encoding', () => {
  const w = new 协议写入器();
  w.写入字符串(2, 'hi');
  // field2 wire2: tag 0x12, len 2, "hi"（官方文档样例）
  assert.equal(hex(w.转为字节()), '12 02 68 69');

  const r = new 协议读取器(w.转为字节());
  const tag = r.读取标签();
  assert.equal(tag.字段号, 2);
  assert.equal(tag.线类型, 线类型_长度分隔);
  assert.equal(r.读取字符串(), 'hi');
});

test('utf8 roundtrips CJK and emoji', () => {
  for (const text of ['记得闪卡', '英语四级核心', '日本語テスト', 'emoji 🃏✨']) {
    assert.equal(UTF8解码(UTF8编码(text)), text);
  }
});

test('utf8 decoder replaces malformed sequences with U+FFFD', () => {
  assert.equal(UTF8解码(new Uint8Array([0xff, 0x41])), '�A');
});

test('nested messages embed with length prefix', () => {
  const inner = new 协议写入器();
  inner.写入字符串(1, 'deck');
  const outer = new 协议写入器();
  outer.写入子消息(5, inner);

  const r = new 协议读取器(outer.转为字节());
  const tag = r.读取标签();
  assert.equal(tag.字段号, 5);
  const embedded = new 协议读取器(r.读取字节());
  embedded.读取标签();
  assert.equal(embedded.读取字符串(), 'deck');
});

test('reader skips unknown fields of every wire type', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 7); // 已知
  w.写入变长整数(99, 1); // 未知 varint
  w.写入字节(98, new Uint8Array([1, 2, 3])); // 未知 LEN
  w.写入变长整数(2, 42); // 已知

  // 手工拼一个 fixed64（field20）+ fixed32（field22）尾部
  // key = field*8 + wireType，varint 编码：161 → [0xA1,0x01]，181 → [0xB5,0x01]
  const tail = new Uint8Array([0xa1, 0x01, 1, 2, 3, 4, 5, 6, 7, 8, 0xb5, 0x01, 9, 10, 11, 12]);
  const all = new Uint8Array(w.转为字节().length + tail.length);
  all.set(w.转为字节(), 0);
  all.set(tail, w.转为字节().length);

  const r = new 协议读取器(all);
  const seen = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1 || tag.字段号 === 2) {
      seen.push(tag.字段号);
      r.读取变长整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  assert.deepEqual(seen, [1, 2]);
});

test('packed int64/float encode as length-delimited payloads like prost', () => {
  const i64 = new 协议写入器();
  i64.写入打包64位整数(1, [1, 300]);
  // field1 wire2: tag 0x0a, len 3, 1=0x01, 300=0xac 0x02
  assert.equal(hex(i64.转为字节()), '0a 03 01 ac 02');

  const f32 = new 协议写入器();
  f32.写入打包浮点(1, [1.0]);
  assert.equal(hex(f32.转为字节()), '0a 04 00 00 80 3f');

  // 空数组不产出任何字节（proto3 空 repeated 等同未设置）
  const empty = new 协议写入器();
  empty.写入打包64位整数(1, []);
  empty.写入打包浮点(2, []);
  assert.equal(empty.转为字节().length, 0);
});

test('packed readers roundtrip and handle negative int64', () => {
  const w = new 协议写入器();
  w.写入打包64位整数(1, [1752902400123, -1]);
  w.写入打包浮点(2, [0.5, 2.5]);

  const r = new 协议读取器(w.转为字节());
  r.读取标签();
  assert.deepEqual(r.读取打包64位整数(), [1752902400123, -1]);
  r.读取标签();
  assert.deepEqual(r.读取打包浮点(), [0.5, 2.5]);
  assert.equal(r.已读完, true);
});

test('offset/sliceFrom capture raw field bytes for verbatim passthrough', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 7);
  w.写入变长整数(9, 20); // 未建模字段
  const r = new 协议读取器(w.转为字节());

  r.读取标签();
  r.读取变长整数();
  const start = r.当前位置;
  r.读取标签();
  r.跳过字段(线类型_变长整数);
  const raw = r.截取片段(start);
  assert.equal(hex(raw), '48 14');

  const out = new 协议写入器();
  out.写入变长整数(1, 7);
  out.写入原始字节(raw);
  assert.equal(hex(out.转为字节()), hex(w.转为字节()));
});

test('reader rejects truncated input instead of reading out of bounds', () => {
  // tag 的 varint 截断
  assert.throws(() => new 协议读取器(new Uint8Array([0x80])).读取标签());
  // tag 完整但 value 缺失
  assert.throws(() => {
    const r = new 协议读取器(new Uint8Array([0x08]));
    r.读取标签();
    r.读取变长整数();
  });
  // length-delimited 声明长度超过剩余字节
  assert.throws(() => {
    const r = new 协议读取器(new Uint8Array([0x0a, 0x05, 0x68]));
    r.读取标签();
    r.读取字节();
  });
});

test('reader rejects varints beyond the safe integer range', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 0);
  const bytes = w.转为字节();
  // 构造 2^60 的 varint
  bytes[1] = 0x80;
  const huge = new Uint8Array([0x08, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10]);
  const r = new 协议读取器(huge);
  r.读取标签();
  assert.throws(() => r.读取变长整数());
});
