// SPDX-License-Identifier: AGPL-3.0-or-later

// 自定义同步服务器（对齐 AnkiDroid Custom Sync Server）契约测试：
// 1) 端点解析/地址校验纯函数单测（Node 直载）；
// 2) 存储层与设置 UI 的源码契约（@kit 模块不可直载，锁定关键结构）；
// 3) 中英双语文案契约。
// 语义参照 AnkiDroid：Sync.kt getEndpoint()（currentEndpoint ?: customEndpoint）、
// CustomSyncServerSettingsFragment（syncBaseUrl + 开关 + customSyncCertificate，
// 变更时 remove(CURRENT_SYNC_URI)）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  解析生效同步端点,
  校验同步服务器地址
} from '../../entry/src/main/ets/model/同步流程.ts';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

// ---- 端点解析：服务器下发端点 > 自定义地址 > 官方（空串） ----

test('解析生效同步端点：服务器下发端点优先（对齐 AnkiDroid getEndpoint）', () => {
  const 自定义 = { 启用: true, 地址: 'http://192.168.1.10:27701' };
  assert.equal(解析生效同步端点('https://sync2.ankiweb.net', 自定义), 'https://sync2.ankiweb.net');
});

test('解析生效同步端点：无下发端点且已启用 → 自定义地址', () => {
  assert.equal(解析生效同步端点('', { 启用: true, 地址: 'http://nas.local:27701' }), 'http://nas.local:27701');
});

test('解析生效同步端点：未启用/未填写 → 空串（官方 AnkiWeb）', () => {
  assert.equal(解析生效同步端点('', { 启用: false, 地址: 'http://nas.local:27701' }), '');
  assert.equal(解析生效同步端点('', { 启用: true, 地址: '' }), '');
  assert.equal(解析生效同步端点('', { 启用: false, 地址: '' }), '');
});

// ---- 地址校验 ----

test('校验同步服务器地址：空串与合法 http(s) 地址', () => {
  assert.equal(校验同步服务器地址(''), true);
  assert.equal(校验同步服务器地址('http://192.168.1.10:27701'), true);
  assert.equal(校验同步服务器地址('https://sync.example.com'), true);
  assert.equal(校验同步服务器地址('https://sync.example.com/anki/'), true);
  assert.equal(校验同步服务器地址('http://[2001:db8::1]:27701'), true);
  assert.equal(校验同步服务器地址('http://localhost:27701'), true);
});

test('校验同步服务器地址：拒绝非法输入', () => {
  assert.equal(校验同步服务器地址('192.168.1.10'), false);
  assert.equal(校验同步服务器地址('ftp://example.com'), false);
  assert.equal(校验同步服务器地址('http://'), false);
  assert.equal(校验同步服务器地址('https://exa mple.com'), false);
  assert.equal(校验同步服务器地址('javascript:alert(1)'), false);
});

// ---- 存储层契约：持久化键 + 保存时清除服务器下发端点 ----

test('存储层：自定义同步三键 + 保存时清除服务器下发端点（对齐 AnkiDroid）', () => {
  const 源码 = read('entry/src/main/ets/model/同步凭证存储.ets');
  assert.match(源码, /'custom_sync_enabled'/);
  assert.match(源码, /'custom_sync_base_url'/);
  assert.match(源码, /'custom_sync_certificate'/);
  assert.match(源码, /export function 保存自定义同步配置/);
  assert.match(源码, /export function 加载自定义同步配置/);
  assert.match(源码, /export function 生效同步端点/);
  // 语义核心：自定义配置变化 → 旧的服务器迁移端点必须失效（AnkiDroid remove(CURRENT_SYNC_URI)）
  const 保存函数体 = 源码.slice(
    源码.indexOf('export function 保存自定义同步配置'),
    源码.indexOf('export function', 源码.indexOf('export function 保存自定义同步配置') + 10)
  );
  assert.match(保存函数体, /deleteSync\(端点键\)/, '保存自定义配置必须 deleteSync(端点键)');
});

// ---- 设置 UI 契约：登录/同步走 生效同步端点 + 证书先行 ----

test('同步分组：登录与立即同步均先应用证书并解析生效端点', () => {
  const 源码 = read('entry/src/main/ets/components/settings/同步分组.ets');
  // 登录：对齐 AnkiDroid LoginFragment（getEndpoint() 结果传 syncLogin）
  const 登录函数体 = 源码.slice(
    源码.indexOf('private async 点击登录'),
    源码.indexOf('private ', 源码.indexOf('private async 点击登录') + 10)
  );
  assert.match(登录函数体, /await this\.应用自定义证书\(\)/);
  assert.match(登录函数体, /生效同步端点\(\)/);
  assert.match(登录函数体, /同步登录\(this\.用户名输入, this\.密码输入, 端点\)/);
  // 立即同步：对齐 AnkiDroid syncAuth()（先 updateCustomCertificate，再组带端点的 auth）
  const 同步函数体 = 源码.slice(
    源码.indexOf('private async 点击立即同步'),
    源码.indexOf('private ', 源码.indexOf('private async 点击立即同步') + 10)
  );
  assert.match(同步函数体, /await this\.应用自定义证书\(\)/);
  assert.match(同步函数体, /endpoint: 生效同步端点\(\)/);
});

test('同步分组：渲染开关/地址输入/证书输入，地址非法不落盘', () => {
  const 源码 = read('entry/src/main/ets/components/settings/同步分组.ets');
  assert.match(源码, /settings_sync_custom_server_toggle/);
  assert.match(源码, /settings_sync_custom_server_url_hint/);
  assert.match(源码, /settings_sync_custom_certificate_label/);
  assert.match(源码, /校验并保存地址/);
  // 非法地址只提示不保存：校验失败分支不得调用 保存当前自定义配置
  const 校验函数体 = 源码.slice(
    源码.indexOf('private 校验并保存地址'),
    源码.indexOf('private ', 源码.indexOf('private 校验并保存地址') + 10)
  );
  const 失败分支 = 校验函数体.slice(
    校验函数体.indexOf('if (!校验同步服务器地址'),
    校验函数体.indexOf('return;')
  );
  assert.ok(!失败分支.includes('保存当前自定义配置'), '非法地址不得落盘');
});

// ---- 双语文案契约 ----

const 自定义文案键 = [
  'settings_sync_custom_server_title',
  'settings_sync_custom_server_toggle',
  'settings_sync_custom_server_toggle_hint',
  'settings_sync_custom_server_url_hint',
  'settings_sync_custom_server_url_invalid',
  'settings_sync_custom_certificate_label',
  'settings_sync_custom_certificate_hint',
  'settings_sync_custom_certificate_apply',
  'settings_sync_custom_certificate_updated',
  'settings_sync_custom_certificate_invalid',
  'settings_sync_custom_server_section_hint'
];

test('自定义同步服务器文案：中英双语齐全且英文无中文', () => {
  for (const locale of ['base', 'en_US']) {
    const 字符串表 = JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`));
    const 值表 = new Map(字符串表.string.map((item) => [item.name, item.value]));
    for (const 键 of 自定义文案键) {
      assert.ok(值表.has(键), `${locale} 缺少 ${键}`);
      assert.ok(值表.get(键).length > 0, `${locale}.${键} 文案不能为空`);
      if (locale === 'en_US') {
        assert.doesNotMatch(值表.get(键), /[\u4e00-\u9fff]/, `${键} must be English`);
      }
    }
  }
});
