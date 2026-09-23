// SPDX-License-Identifier: AGPL-3.0-or-later

// 检查数据库链路契约测试（T5）：
// - 集合服务 只经 后端会话 走 后端集合(3) 的 检查数据库(6)；
// - CheckDatabaseResponse 解码器字段符合 collection.proto（repeated string problems = 1）；
// - 设置页数据分组把检查动作与状态行正确连接；异步生命周期在行为测试中覆盖。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { 集合方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { decodeCheckDatabaseResponse } from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const COLLECTION_SERVICE = 'entry/src/main/ets/backend/集合服务.ts';
const SETTINGS_PANEL = 'entry/src/main/ets/components/设置面板.ets';
const DATA_GROUP = 'entry/src/main/ets/components/settings/数据分组.ets';
const STRINGS = 'entry/src/main/resources/base/element/string.json';

test('check database uses collection service id 3 and method index 6', () => {
  assert.equal(服务号.后端集合, 3, 'collection service id');
  assert.equal(集合方法.检查数据库, 6, 'CheckDatabase method index');
});

test('collection service wraps checkDatabase through 后端会话 only', () => {
  const service = read(COLLECTION_SERVICE);

  assert.match(service, /后端会话\.获取实例\(\)/);
  assert.doesNotMatch(service, /new 后端客户端/, 'must go through 后端会话');

  assert.match(service, /async 检查数据库\(\): Promise<string\[\]>/);
  assert.match(service, /服务号\.后端集合, 集合方法\.检查数据库, new Uint8Array\(0\)/,
    'empty request body, generic.Empty');
  assert.match(service, /decodeCheckDatabaseResponse\(响应字节\)/);
});

test('check database decoder reads repeated problems, empty wire means pass', () => {
  const w = new 协议写入器();
  w.写入字符串(1, '卡片表存在孤儿行');
  w.写入字符串(1, '复习日志时间戳异常');
  assert.deepEqual(decodeCheckDatabaseResponse(w.转为字节()), ['卡片表存在孤儿行', '复习日志时间戳异常']);

  assert.deepEqual(decodeCheckDatabaseResponse(new Uint8Array(0)), [],
    'no problems on the wire means the check passed');
});

test('settings panel wires check database entry to the service with busy guard', () => {
  const panel = read(SETTINGS_PANEL);

  assert.match(panel, /onCheckDatabase:.*this\.执行数据库检查\(\);/, 'row taps into the handler');
  for (const [prop, state] of [['databaseBusy', 'maintenance.checking'], ['databaseChecked', 'maintenance.checked'], ['databaseError', 'maintenance.error'], ['databaseProblems', 'maintenance.problems']]) {
    assert.ok(panel.includes(`${prop}: this.${state}`), `${prop} receives the parent state`);
  }
  assert.match(read(DATA_GROUP), /this\.onCheckDatabase\(\)/);

  const group = read(DATA_GROUP);
  assert.match(group, /\.enabled\(!this\.databaseBusy\)/, 'row disabled while busy');
  assert.match(group, /this\.databaseBusy \? \$r\('app\.string\.check_db_running'\)/,
    'busy state visible on the row');
});

test('settings panel renders pass, problems and error outcomes', () => {
  const panel = read(SETTINGS_PANEL);

  const group = read(DATA_GROUP);
  assert.match(group, /if \(this\.databaseError !== ''\)/, 'error branch first');
  assert.match(group, /Text\(this\.databaseError\)/, 'error message passed through');
  assert.match(group, /this\.databaseProblems\.length === 0/);
  assert.match(group, /\$r\('app\.string\.check_db_passed'\)/, 'empty problems means pass');
  assert.match(group, /\$r\('app\.string\.check_db_problems', this\.databaseProblems\.length\)/,
    'problem count listed');
  assert.match(group, /ForEach\(this\.databaseProblems\.slice\(0, 3\)/,
    'problem content summary capped at first entries');
});

test('check database strings are resourced', () => {
  const strings = read(STRINGS);
  for (const name of ['check_db_title', 'check_db_hint', 'check_db_running',
    'check_db_passed', 'check_db_problems', 'check_db_failed']) {
    assert.match(strings, new RegExp(`"name": "${name}"`), `missing string ${name}`);
  }
});
