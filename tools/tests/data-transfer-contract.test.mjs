// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Anki 26.05 import/export service methods use the generated indexes', () => {
  const ids = read('entry/src/main/ets/backend/服务索引.ts');
  assert.match(ids, /导入集合包:\s*0/);
  assert.match(ids, /导出集合包:\s*1/);
  assert.match(ids, /导入Anki包:\s*2/);
  assert.match(ids, /导出Anki包:\s*4/);
});

test('import/export codecs include official deck and collection package fields', () => {
  const codec = read('entry/src/main/ets/proto/messages/ImportExportMessages.ts');
  for (const symbol of [
    'ImportAnkiPackageOptions',
    'encodeImportAnkiPackageRequest',
    'encodeExportAnkiPackageRequest',
    'encodeImportCollectionPackageRequest',
    'encodeExportCollectionPackageRequest'
  ]) {
    assert.match(codec, new RegExp(symbol));
  }
  assert.match(codec, /写入64位整数\(2,.*deckId/);
  for (const field of ['withScheduling', 'withDeckConfigs', 'withMedia', 'legacy']) {
    assert.match(codec, new RegExp(field));
  }
  assert.match(codec, /includeMedia/);
});

test('data transfer service exposes package workflows and safe collection replacement', () => {
  const service = read('entry/src/main/ets/backend/数据迁移服务.ts');
  for (const method of ['导出牌组', '导出集合', '执行牌组导入', '替换集合']) {
    assert.match(service, new RegExp(`export async function ${method}`));
  }
  // B12 2026-07-22：importDeck 拆为 暂存导入文件（同步复制到沙箱）+ 执行牌组导入（后端 RPC）
  assert.match(service, /export function 暂存导入文件/);
  assert.match(service, /if \(!是否已确认\) \{\s*throw new 数据迁移校验错误/);
  assert.match(service, /export class 数据迁移校验错误 extends Error/);
  assert.doesNotMatch(service, /会话\.关闭\(\)/);
  const closeAt = service.indexOf('会话.关闭集合()');
  const backupAt = service.indexOf('创建安全副本');
  const importAt = service.indexOf('会话.在集合关闭下调用(', backupAt);
  const reopenAt = service.indexOf('会话.确保已打开(文件目录)', importAt);
  assert.ok(closeAt < backupAt && backupAt < importAt && importAt < reopenAt);
  assert.match(service, /finally[\s\S]*静默删除/);
  assert.match(service, /export async function 完成导出/);
  assert.match(service, /保存沙箱导出/);
  assert.match(service, /下一迁移输出ID/);
  assert.match(service, /复制目录\(/);
  assert.match(service, /静默删除目录\(安全副本\.根目录\)/);
  const successfulReopenAt = service.indexOf('await 会话.确保已打开(文件目录);');
  const cleanupAt = service.indexOf('删除安全副本(安全副本);');
  const catchAt = service.indexOf('} catch (error)', reopenAt);
  assert.ok(successfulReopenAt < cleanupAt && catchAt < cleanupAt, 'safety cleanup must run after rollback scope');
});

test('data transfer panel only emits typed intents and separates merge from replacement', () => {
  const panel = read('entry/src/main/ets/components/数据迁移面板.ets') + read('entry/src/main/ets/model/DataTransferIntent.ts');
  assert.match(panel, /export type 数据迁移意图/);
  assert.match(panel, /replacePersonalData/);
  assert.match(panel, /onIntent/);
  assert.doesNotMatch(panel, /数据迁移服务|后端会话|\.run\(/);
  // 模式切换：Task 3 2026-07-23 改用 Select 下拉（4 选项折叠）替代 @Builder modeTab（横屏越界）
  assert.match(panel, /迁移模式列表: 数据迁移模式\[\]/);
  assert.match(panel, /Select\(this\.模式下拉选项\(\)\)/);
  assert.match(panel, /模式下拉索引/);
  // 导出选项默认展开（不再用 showExportOptions 切换）
  assert.match(panel, /已确认替换个人数据/);
  for (const option of ['withScheduling', 'withDeckConfigs', 'includeMedia', 'legacy']) {
    assert.match(panel, new RegExp(option));
  }
});

test('backend session retains the native handle while collection-only RPCs run', () => {
  const session = read('entry/src/main/ets/backend/后端会话.ts');
  const collectionMessages = read('entry/src/main/ets/proto/messages/CollectionMessages.ts');
  assert.match(session, /type 会话状态 = 'closed' \| 'collectionClosed' \| 'ready'/);
  assert.match(session, /async 关闭集合\(\): Promise<void>/);
  assert.match(session, /async 在集合关闭下调用\(/);
  assert.match(session, /集合方法\.关闭/);
  assert.match(collectionMessages, /encodeCloseCollectionRequest/);
  assert.match(collectionMessages, /写入布尔\(1, downgradeToSchema11\)/);
});

test('sandbox exports are delivered through the official document saver and always cleaned', () => {
  const service = read('entry/src/main/ets/backend/数据迁移服务.ts');
  assert.match(service, /new picker\.DocumentSaveOptions\(\)/);
  assert.match(service, /documentPicker\.save\(选项\)/);
  assert.match(service, /finally[\s\S]*静默删除\(沙箱路径\)/);
});

test('provider URI imports stage data through file descriptors instead of copyFileSync', () => {
  const service = read('entry/src/main/ets/backend/数据迁移服务.ts');
  assert.match(service, /function 按描述符复制文件\(\s*源URI或路径: string,\s*目标URI或路径: string\s*\): void/);
  assert.match(service, /fs\.openSync\(源URI或路径, fs\.OpenMode\.READ_ONLY\)/);
  assert.match(service, /fs\.openSync\(\s*目标URI或路径,\s*fs\.OpenMode\.READ_WRITE \| fs\.OpenMode\.CREATE \| fs\.OpenMode\.TRUNC\s*\)/);
  assert.match(service, /fs\.readSync\(源文件\.fd, 缓冲区, \{ length: 缓冲区\.byteLength \}\)/);
  assert.match(service, /let 已写入总数: number = 0;/);
  assert.match(service, /while \(已写入总数 < 读取大小\) \{/);
  assert.match(service, /const 剩余缓冲: ArrayBuffer = 缓冲区\.slice\(已写入总数, 读取大小\);/);
  assert.match(service, /const 写入大小: number =\s*fs\.writeSync\(\s*目标文件\.fd, 剩余缓冲, \{ length: 剩余缓冲\.byteLength \}\);/);
  assert.match(service, /if \(写入大小 <= 0\) \{\s*throw new Error\('Unable to write transferred data\.'\);\s*\}/);
  assert.match(service, /已写入总数 \+= 写入大小;/);
  assert.match(service, /finally\s*\{\s*fs\.closeSync\(目标文件\);\s*\}/);
  assert.match(service, /finally\s*\{\s*fs\.closeSync\(源文件\);\s*\}/);
  assert.match(service, /按描述符复制文件\(URI, 路径\)/);
  assert.doesNotMatch(service, /fs\.copyFileSync\(URI, 路径\)/);
});

test('document saver writes the selected provider URI through file descriptors and cleans up', () => {
  const service = read('entry/src/main/ets/backend/数据迁移服务.ts');
  assert.match(service, /按描述符复制文件\(沙箱路径, URI列表\[0\]\)/);
  assert.doesNotMatch(service, /fs\.copyFileSync\(沙箱路径, URI列表\[0\]\)/);
  assert.match(service, /if \(URI列表\.length === 0\) return null;/);
  assert.match(service, /finally[\s\S]*静默删除\(沙箱路径\)/);
});

test('file-picker helper never bypasses granted URI permissions with copyFileSync', () => {
  const helper = read('entry/src/main/ets/utils/文件导入助手.ets');
  assert.doesNotMatch(helper, /fs\.copyFileSync/);
});
