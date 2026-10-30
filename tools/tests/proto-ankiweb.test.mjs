// SPDX-License-Identifier: AGPL-3.0-or-later

// AnkiwebMessages 字节级 golden 测试：锁定 ankiweb.proto 编解码与 prost 输出一致（Anki 26.05）。
// 字段定义来源：third_party/anki/proto/anki/ankiweb.proto
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  decodeAddonInfo,
  decodeCheckForUpdateResponse,
  decodeGetAddonInfoResponse,
  encodeCheckForUpdateRequest,
  encodeGetAddonInfoRequest
} from '../../entry/src/main/ets/proto/messages/AnkiwebMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

// ---- encodeGetAddonInfoRequest ----

test('encodeGetAddonInfoRequest writes client_version + packed addon_ids', () => {
  const bytes = encodeGetAddonInfoRequest({ clientVersion: 26, addonIds: [123456, 7890] });
  // field 1 varint 26 -> 08 1a
  // field 2 packed payload: varint(123456)=c0 c4 07, varint(7890)=d2 3d, total 5 bytes
  // tag(2, wire2)=0x12, len=5
  assert.equal(hex(bytes), '08 1a 12 05 c0 c4 07 d2 3d');
});

test('encodeGetAddonInfoRequest matches 协议写入器.写入打包64位整数 for positive values', () => {
  // 验证手写 packed uint32 与 协议写入器.写入打包64位整数 编码一致
  const ref = new 协议写入器();
  ref.写入变长整数(1, 26);
  ref.写入打包64位整数(2, [123456, 7890]);
  const bytes = encodeGetAddonInfoRequest({ clientVersion: 26, addonIds: [123456, 7890] });
  assert.equal(hex(bytes), hex(ref.转为字节()));
});

test('encodeGetAddonInfoRequest omits empty addon_ids', () => {
  const bytes = encodeGetAddonInfoRequest({ clientVersion: 10, addonIds: [] });
  // 只写 field 1
  assert.equal(hex(bytes), '08 0a');
});

test('encodeGetAddonInfoRequest omits all default values -> empty bytes', () => {
  const bytes = encodeGetAddonInfoRequest({ clientVersion: 0, addonIds: [] });
  assert.equal(bytes.length, 0);
});

test('encodeGetAddonInfoRequest with single addon id', () => {
  const bytes = encodeGetAddonInfoRequest({ clientVersion: 26, addonIds: [1] });
  // field 1: 08 1a
  // field 2: tag 12, len 1, payload 01
  assert.equal(hex(bytes), '08 1a 12 01 01');
});

// ---- encodeCheckForUpdateRequest ----

test('encodeCheckForUpdateRequest writes all fields in order', () => {
  const bytes = encodeCheckForUpdateRequest({
    version: 26,
    buildhash: 'abc',
    os: 'linux',
    installId: 1234567890,
    lastMessageId: 42
  });
  // field 1 varint 26: 08 1a
  // field 2 string "abc": 12 03 61 62 63
  // field 3 string "linux": 1a 05 6c 69 6e 75 78
  // field 4 int64 1234567890: 20 d2 85 d8 cc 04
  // field 5 varint 42: 28 2a
  assert.equal(
    hex(bytes),
    '08 1a 12 03 61 62 63 1a 05 6c 69 6e 75 78 20 d2 85 d8 cc 04 28 2a'
  );
});

test('encodeCheckForUpdateRequest omits all default values -> empty bytes', () => {
  const bytes = encodeCheckForUpdateRequest({
    version: 0,
    buildhash: '',
    os: '',
    installId: 0,
    lastMessageId: 0
  });
  assert.equal(bytes.length, 0);
});

test('encodeCheckForUpdateRequest encodes negative install_id as 10-byte varint (int64 sign-extend)', () => {
  // int64 -1 在 prost 里 sign-extend 成 0xFFFFFFFFFFFFFFFF，编成 10 字节 0xFF...0x01
  const bytes = encodeCheckForUpdateRequest({
    version: 0,
    buildhash: '',
    os: '',
    installId: -1,
    lastMessageId: 0
  });
  // tag(4, wire0)=0x20 + 10 字节 FF FF FF FF FF FF FF FF FF 01
  assert.equal(
    hex(bytes),
    '20 ff ff ff ff ff ff ff ff ff 01'
  );
});

test('encodeCheckForUpdateRequest partial fields only writes set ones', () => {
  const bytes = encodeCheckForUpdateRequest({
    version: 0,
    buildhash: 'hash123',
    os: '',
    installId: 0,
    lastMessageId: 0
  });
  // 只 field 2: 12 07 68 61 73 68 31 32 33
  assert.equal(hex(bytes), '12 07 68 61 73 68 31 32 33');
});

// ---- decodeAddonInfo ----

test('decodeAddonInfo reads all four fields', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 100);       // id
  w.写入64位整数(2, 1700000000); // modified
  w.写入变长整数(3, 23);        // min_version
  w.写入变长整数(4, 26);        // max_version
  const info = decodeAddonInfo(w.转为字节());
  assert.equal(info.id, 100);
  assert.equal(info.modified, 1700000000);
  assert.equal(info.minVersion, 23);
  assert.equal(info.maxVersion, 26);
});

test('decodeAddonInfo applies defaults for missing fields', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 5); // only id
  const info = decodeAddonInfo(w.转为字节());
  assert.equal(info.id, 5);
  assert.equal(info.modified, 0);
  assert.equal(info.minVersion, 0);
  assert.equal(info.maxVersion, 0);
});

test('decodeAddonInfo skips unknown field (forward compatibility)', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 5);
  // 构造未知字段：field 99 wire 0 varint 1
  // tag = (99 << 3) | 0 = 792, varint(792)=0x98 0x06
  // value = 0x01
  w.写入原始字节(new Uint8Array([0x98, 0x06, 0x01]));
  w.写入变长整数(4, 26); // max_version
  const info = decodeAddonInfo(w.转为字节());
  assert.equal(info.id, 5);
  assert.equal(info.maxVersion, 26);
  assert.equal(info.minVersion, 0);
});

// ---- decodeGetAddonInfoResponse ----

test('decodeGetAddonInfoResponse reads multiple addon entries', () => {
  const addon1 = new 协议写入器();
  addon1.写入变长整数(1, 100);  // id
  addon1.写入变长整数(3, 23);   // min_version

  const addon2 = new 协议写入器();
  addon2.写入变长整数(1, 200);  // id (varint = c8 01)
  addon2.写入变长整数(4, 26);  // max_version

  const w = new 协议写入器();
  w.写入子消息(1, addon1);
  w.写入子消息(1, addon2);

  const resp = decodeGetAddonInfoResponse(w.转为字节());
  assert.equal(resp.info.length, 2);
  assert.equal(resp.info[0].id, 100);
  assert.equal(resp.info[0].minVersion, 23);
  assert.equal(resp.info[1].id, 200);
  assert.equal(resp.info[1].maxVersion, 26);
});

test('decodeGetAddonInfoResponse with empty response returns empty array', () => {
  const resp = decodeGetAddonInfoResponse(new Uint8Array(0));
  assert.deepEqual(resp.info, []);
});

// ---- decodeCheckForUpdateResponse ----

test('decodeCheckForUpdateResponse reads all fields', () => {
  const w = new 协议写入器();
  w.写入字符串(1, '2.1.50');        // new_version
  w.写入64位整数(2, 1700000000);       // current_time
  w.写入字符串(3, 'new release');   // message
  w.写入变长整数(4, 99);              // last_message_id
  const resp = decodeCheckForUpdateResponse(w.转为字节());
  assert.equal(resp.newVersion, '2.1.50');
  assert.equal(resp.currentTime, 1700000000);
  assert.equal(resp.message, 'new release');
  assert.equal(resp.lastMessageId, 99);
});

test('decodeCheckForUpdateResponse empty optional fields default to empty string', () => {
  // 只写 current_time 和 last_message_id，不写 optional string 字段
  const w = new 协议写入器();
  w.写入64位整数(2, 1234567890);
  w.写入变长整数(4, 5);
  const resp = decodeCheckForUpdateResponse(w.转为字节());
  assert.equal(resp.newVersion, '');
  assert.equal(resp.message, '');
  assert.equal(resp.currentTime, 1234567890);
  assert.equal(resp.lastMessageId, 5);
});

test('decodeCheckForUpdateResponse empty bytes -> all defaults', () => {
  const resp = decodeCheckForUpdateResponse(new Uint8Array(0));
  assert.equal(resp.newVersion, '');
  assert.equal(resp.currentTime, 0);
  assert.equal(resp.message, '');
  assert.equal(resp.lastMessageId, 0);
});

test('decodeCheckForUpdateResponse skips unknown fields', () => {
  const w = new 协议写入器();
  w.写入64位整数(2, 100);
  // 未知字段：field 50 wire 2 字符串 "x"
  // tag = (50<<3)|2 = 402, varint(402)=0x92 0x03
  w.写入原始字节(new Uint8Array([0x92, 0x03, 0x01, 0x78]));
  w.写入变长整数(4, 7);
  const resp = decodeCheckForUpdateResponse(w.转为字节());
  assert.equal(resp.currentTime, 100);
  assert.equal(resp.lastMessageId, 7);
});
