// SPDX-License-Identifier: AGPL-3.0-or-later

// 导入 .apkg 链路契约测试（M6）：
// - FileImportHelper 用系统 picker 选 .apkg，沙箱暂存与导入由 数据迁移服务 负责；
// - 首页.ets 走完 选文件 → 复制 → 导入 → 刷新主页 的全链路。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const HELPER = 'entry/src/main/ets/utils/文件导入助手.ets';
const PAGE = 'entry/src/main/ets/pages/首页.ets';
const SETTINGS = 'entry/src/main/ets/components/设置面板.ets';
const DATA_GROUP = 'entry/src/main/ets/components/settings/数据分组.ets';

test('file import helper returns the system-granted URI while the transfer service owns staging', () => {
  assert.equal(existsSync(projectUrl(HELPER)), true, `${HELPER} must exist`);
  const helper = read(HELPER);

  assert.match(helper, /export async function 选取Apkg文件/);
  assert.match(helper, /new picker\.DocumentViewPicker\(context\)/);
  assert.match(helper, /export async function 选取数据文件/);
  assert.match(helper, /fileSuffixFilters = 后缀过滤/);
  assert.doesNotMatch(helper, /fileIo|copyFileSync|readSync|writeSync/);
});

test('home routes picker and external imports through the transfer session and platform adapter', () => {
  const page=read(PAGE),adapter=read('entry/src/main/ets/backend/AnkiDataTransfer.ets');
  assert.match(page,/DataTransferFeature\(\{/);
  assert.match(page,/transferSession\.importUri/);
  assert.match(adapter,/选取数据文件\(this\.context\(\), \['\.apkg'\]\)/);
  assert.match(adapter,/暂存导入文件\(context\.filesDir, uri\)/);
  assert.match(adapter,/await 执行牌组导入\(path\)/);
  assert.doesNotMatch(page,/暂存导入文件|选取数据文件/);
  // Queueing, refresh ordering, confirmation and disposal execute against DataTransferSession.
});

test('settings opens the unified data-management entry instead of a direct import row', () => {
  const settings = read(SETTINGS);
  const dataGroup = read(DATA_GROUP);

  assert.match(settings, /导入数据回调: \(\) => void/);
  assert.match(settings, /导出数据回调: \(\) => void/);
  assert.match(dataGroup, /app\.string\.settings_export_import_data/);
  assert.match(settings, /点击导出导入回调:.*this\.导出数据回调\(\)/);
  assert.doesNotMatch(settings, /backup_sync_title/);
});

test('import strings and stage texts are resourced', () => {
  const strings = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const names = new Set(strings.map((item) => item.name));

  for (const key of ['import_close', 'transfer_import_deck', 'transfer_import_personal']) {
    assert.equal(names.has(key), true, `missing string resource: ${key}`);
  }
});
