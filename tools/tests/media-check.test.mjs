// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { decodeCheckMediaSummary } from '../../entry/src/main/ets/proto/messages/MediaMessages.ts';

function response(count = 5000) {
  const writer = new 协议写入器();
  for (let i = 0; i < count; i++) {
    writer.写入字符串(1, `unused-${i}.png`);
    writer.写入字符串(2, `missing-${i}.png`);
  }
  writer.写入打包64位整数(3, [1001, 1002]);
  writer.写入64位整数(3, 1003);
  writer.写入字符串(4, 'report '.repeat(100000));
  writer.写入布尔(5, true);
  return writer.转为字节();
}

test('media summary keeps unused for one-shot cleanup, report for one text block, and only counts missing', () => {
  const bytes = response();
  let copied = 0;
  bytes.slice = function(start, end) {
    copied += end - start;
    return Uint8Array.prototype.slice.call(this, start, end);
  };
  const summary = decodeCheckMediaSummary(bytes);
  assert.equal(summary.unused.length, 5000);
  assert.equal(summary.unusedCount, 5000);
  assert.equal(summary.missingCount, 5000);
  assert.equal(summary.report.length, 700000);
  assert.equal(summary.haveTrash, true);
  assert.equal(summary.unused.at(-1), 'unused-4999.png');
  assert.ok(copied < 850000, 'missing names and note IDs must not be copied');
  assert.deepEqual(decodeCheckMediaSummary(new Uint8Array()), {
    unused: [], unusedCount: 0, missingCount: 0, report: '', haveTrash: false
  });
});

test('skipping a length-delimited field still rejects a truncated payload', () => {
  const reader = new 协议读取器(new Uint8Array([0x22, 0x05, 0x61]));
  const tag = reader.读取标签();
  assert.throws(() => reader.跳过字段(tag.线类型), /end of input/);
  assert.throws(() => decodeCheckMediaSummary(new Uint8Array([0x22, 0x05, 0x61])), /input|end/);
});

test('media panel uses a report block and a single whole-list cleanup action', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/媒体管理面板.ets', import.meta.url), 'utf8');
  assert.match(source, /Text\(this\.检查报告\)/);
  assert.match(source, /media_trash_all_unused/);
  assert.doesNotMatch(source, /ForEach\(/);
  assert.doesNotMatch(source, /Toggle\(/);
  assert.doesNotMatch(source, /MEDIA_CHECK_DISPLAY_LIMIT|MediaCheckSelection/);
});
