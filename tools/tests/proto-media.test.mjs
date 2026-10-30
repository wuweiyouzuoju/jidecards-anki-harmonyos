// SPDX-License-Identifier: AGPL-3.0-or-later

// proto/messages/MediaMessages 字节级测试：锁定媒体消息编解码与 proto 定义
// (anki.media proto, Anki 26.05) 一致。覆盖：
// - encodeEmpty（CheckMedia/EmptyTrash/RestoreTrash 入参）
// - encodeTrashMediaFilesRequest（repeated string fnames）
// - decodeCheckMediaResponse（unused/missing/missing_media_notes/report/have_trash）
// - decodeStringList（ExtractStaticMediaFiles 返回值）
// 并配合 NotetypeMessages.encodeNotetypeId 验证提取静态媒体文件入参编码。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import {
  decodeCheckMediaResponse,
  decodeStringList,
  encodeEmpty,
  encodeTrashMediaFilesRequest
} from '../../entry/src/main/ets/proto/messages/MediaMessages.ts';
import { encodeNotetypeId } from '../../entry/src/main/ets/proto/messages/NotetypeMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

// ---- encodeEmpty ----

test('encodeEmpty returns zero-length byte array for CheckMedia/EmptyTrash/RestoreTrash', () => {
  const bytes = encodeEmpty();
  assert.equal(bytes.length, 0);
  assert.equal(hex(bytes), '');
});

// ---- encodeTrashMediaFilesRequest ----

test('TrashMediaFilesRequest encodes each fname as repeated field 1 length-delimited', () => {
  const bytes = encodeTrashMediaFilesRequest(['a.mp3', 'b.png']);
  // field1 wiretype2 (length-delimited): tag 0x0a
  // 'a.mp3' = 5 bytes: 0a 05 61 2e 6d 70 33
  // 'b.png' = 5 bytes: 0a 05 62 2e 70 6e 67
  assert.equal(
    hex(bytes),
    '0a 05 61 2e 6d 70 33 0a 05 62 2e 70 6e 67'
  );
});

test('TrashMediaFilesRequest with empty list produces no bytes (proto3 default)', () => {
  const bytes = encodeTrashMediaFilesRequest([]);
  assert.equal(bytes.length, 0);
});

test('TrashMediaFilesRequest with unicode fname encodes utf-8 bytes', () => {
  const bytes = encodeTrashMediaFilesRequest(['卡片.png']);
  // '卡片' utf-8 = e5 8d a1 e7 89 87 (6 bytes) + '.png' (4 bytes) = 10 bytes
  assert.equal(
    hex(bytes),
    '0a 0a e5 8d a1 e7 89 87 2e 70 6e 67'
  );
});

// ---- decodeCheckMediaResponse ----

test('CheckMediaResponse decodes all five fields', () => {
  const w = new 协议写入器();
  // field 1: repeated string unused
  w.写入字符串(1, 'unused.jpg');
  w.写入字符串(1, 'orphan.png');
  // field 2: repeated string missing
  w.写入字符串(2, 'gone.mp3');
  // field 3: repeated int64 missing_media_notes
  w.写入64位整数(3, 123456789);
  w.写入64位整数(3, 987654321);
  // field 4: string report
  w.写入字符串(4, '2 unused, 1 missing');
  // field 5: bool have_trash
  w.写入布尔(5, true);

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.unused, ['unused.jpg', 'orphan.png']);
  assert.deepEqual(resp.missing, ['gone.mp3']);
  assert.deepEqual(resp.missingMediaNotes, [123456789, 987654321]);
  assert.equal(resp.report, '2 unused, 1 missing');
  assert.equal(resp.haveTrash, true);
});

test('CheckMediaResponse defaults: empty bytes yields empty lists, empty report, false have_trash', () => {
  const resp = decodeCheckMediaResponse(new Uint8Array(0));
  assert.deepEqual(resp.unused, []);
  assert.deepEqual(resp.missing, []);
  assert.deepEqual(resp.missingMediaNotes, []);
  assert.equal(resp.report, '');
  assert.equal(resp.haveTrash, false);
});

test('CheckMediaResponse have_trash=false is not transmitted (proto3 default)', () => {
  const w = new 协议写入器();
  w.写入布尔(5, false);
  // proto3 false default → writer still emits it via 写入变长整数(5, 0)
  // decoder reads 0 as false correctly
  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.equal(resp.haveTrash, false);
});

test('CheckMediaResponse skips unknown fields', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'known.jpg');
  // unknown field 99, length-delimited
  w.写入字符串(99, 'unknown data');
  w.写入字符串(2, 'missing.mp3');

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.unused, ['known.jpg']);
  assert.deepEqual(resp.missing, ['missing.mp3']);
});

test('CheckMediaResponse fields can appear in any order (interleaved)', () => {
  const w = new 协议写入器();
  w.写入字符串(4, 'report');
  w.写入字符串(1, 'unused.png');
  w.写入布尔(5, true);
  w.写入64位整数(3, 42);
  w.写入字符串(2, 'missing.jpg');

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.unused, ['unused.png']);
  assert.deepEqual(resp.missing, ['missing.jpg']);
  assert.deepEqual(resp.missingMediaNotes, [42]);
  assert.equal(resp.report, 'report');
  assert.equal(resp.haveTrash, true);
});

// ---- decodeStringList ----

test('StringList decodes repeated string vals from field 1', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'audio.mp3');
  w.写入字符串(1, 'image.png');
  w.写入字符串(1, 'video.mp4');

  const vals = decodeStringList(w.转为字节());
  assert.deepEqual(vals, ['audio.mp3', 'image.png', 'video.mp4']);
});

test('StringList empty bytes yields empty array', () => {
  const vals = decodeStringList(new Uint8Array(0));
  assert.deepEqual(vals, []);
});

test('StringList skips unknown fields', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'keep.mp3');
  w.写入字符串(2, 'skip.this');
  w.写入字符串(1, 'keep2.png');

  const vals = decodeStringList(w.转为字节());
  assert.deepEqual(vals, ['keep.mp3', 'keep2.png']);
});

// ---- encodeNotetypeId (ExtractStaticMediaFiles 入参) ----

test('NotetypeId encodes positive id as field 1 varint', () => {
  const bytes = encodeNotetypeId(1752902400123);
  const r = new 协议读取器(bytes);
  const tag = r.读取标签();
  assert.equal(tag.字段号, 1);
  assert.equal(r.读取64位整数(), 1752902400123);
});

test('NotetypeId with id=0 produces empty bytes (proto3 default)', () => {
  const bytes = encodeNotetypeId(0);
  assert.equal(bytes.length, 0);
});

// ---- 往返测试 (round-trip) ----

test('TrashMediaFilesRequest round-trip: encode → manual decode matches input', () => {
  const input = ['photo.jpg', 'audio.mp3', '视频.mp4'];
  const bytes = encodeTrashMediaFilesRequest(input);

  // 手动解码 repeated string field 1
  const r = new 协议读取器(bytes);
  const decoded = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      decoded.push(r.读取字符串());
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  assert.deepEqual(decoded, input);
});

test('CheckMediaResponse round-trip: encode all fields → decode matches', () => {
  const w = new 协议写入器();
  const expectedUnused = ['a.jpg', 'b.png', 'c.gif'];
  const expectedMissing = ['x.mp3'];
  const expectedNotes = [100, 200, 300];
  const expectedReport = 'Unused 3, Missing 1';
  const expectedHaveTrash = true;

  for (const f of expectedUnused) w.写入字符串(1, f);
  for (const f of expectedMissing) w.写入字符串(2, f);
  for (const n of expectedNotes) w.写入64位整数(3, n);
  w.写入字符串(4, expectedReport);
  w.写入布尔(5, expectedHaveTrash);

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.unused, expectedUnused);
  assert.deepEqual(resp.missing, expectedMissing);
  assert.deepEqual(resp.missingMediaNotes, expectedNotes);
  assert.equal(resp.report, expectedReport);
  assert.equal(resp.haveTrash, expectedHaveTrash);
});

test('StringList round-trip: encode repeated string → decode matches', () => {
  const input = ['file1.jpg', 'file2.png', 'file3.mp3'];
  const w = new 协议写入器();
  for (const s of input) {
    w.写入字符串(1, s);
  }

  const decoded = decodeStringList(w.转为字节());
  assert.deepEqual(decoded, input);
});

test('CheckMediaResponse with only unused list (other fields default)', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'only.png');

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.unused, ['only.png']);
  assert.deepEqual(resp.missing, []);
  assert.deepEqual(resp.missingMediaNotes, []);
  assert.equal(resp.report, '');
  assert.equal(resp.haveTrash, false);
});

test('CheckMediaResponse with large int64 note ids (deck-id scale)', () => {
  const largeIds = [1752902400123, 9007199254740991]; // 2^53 - 1
  const w = new 协议写入器();
  for (const id of largeIds) {
    w.写入64位整数(3, id);
  }

  const resp = decodeCheckMediaResponse(w.转为字节());
  assert.deepEqual(resp.missingMediaNotes, largeIds);
});
