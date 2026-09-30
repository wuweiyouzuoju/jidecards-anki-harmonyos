// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('Licenses panel explains the Anki core relationship and app overview', () => {
  // 2026-07-28：原关于页的 summary / anki_notice / license_notice 已迁移到许可证面板。
  // 测试改为验证许可证面板包含 overview 段落与 third_anki（含内核说明）。
  const panel = read('entry/src/main/ets/components/许可证面板.ets');

  for (const key of ['licenses_overview_section', 'licenses_overview_body', 'licenses_third_anki', 'licenses_app_body']) {
    assert.match(panel, new RegExp(`app\\.string\\.${key}`));
  }
});

test('About keeps copyright and licenses entry, stays free of heavy legal wording', () => {
  // 2026-07-28：关于页只保留 title + copyright，描述性文字已移到许可证面板。
  const panel = read('entry/src/main/ets/components/settings/AboutSettings.ets');

  for (const key of ['app_about_title', 'app_about_copyright', 'licenses_title']) {
    assert.match(panel, new RegExp(`app\\.string\\.${key}`));
  }
  assert.doesNotMatch(panel, /Copyright ©/);
  assert.doesNotMatch(panel, /按“现状”提供/);
  assert.doesNotMatch(panel, /法律强制规定不得排除的责任除外/);
});

test('open-source entry opens a real legal surface instead of an unavailable stub', () => {
  // 2026-08-15：许可证面板从首页迁移到设置页（设置页改为全屏独立页面）。
  const panel = read('entry/src/main/ets/components/设置面板.ets');
  const page = read('entry/src/main/ets/pages/设置页.ets');

  assert.match(panel, /打开许可证回调/);
  assert.match(page, /许可证面板\(\{/);
  assert.doesNotMatch(page, /license_loading/);
  assert.doesNotMatch(panel, /非官方 AGPL-3\.0-or-later 派生项目/);
});

test('licenses panel carries AGPL wording, source placeholder and third-party notices', () => {
  const panelPath = 'entry/src/main/ets/components/许可证面板.ets';
  const panel = read(panelPath);

  for (const key of [
    'licenses_title', 'licenses_overview_section', 'licenses_overview_body',
    'licenses_app_section', 'licenses_app_body',
    'licenses_source_section', 'licenses_source_body',
    'licenses_rights_section', 'licenses_rights_body',
    'licenses_third_section', 'licenses_third_anki', 'licenses_third_rust',
    'licenses_trademark_section', 'licenses_trademark_body',
    'licenses_disclaimer_section', 'licenses_disclaimer_body'
  ]) {
    assert.match(panel, new RegExp(`app\\.string\\.${key}`), `LicensesPanel must reference ${key}`);
  }

  const strings = JSON.parse(read('entry/src/main/resources/base/element/string.json')).string;
  const values = strings.map((item) => `${item.name}=${item.value}`).join('\n');
  assert.match(values, /AGPL-3\.0-or-later/);
  assert.match(values, /wuweiyouzuoju/);
  assert.match(values, /本应用内核基于 Anki 26.05 开源 Rust Core 实现/);
  assert.match(values, /github\.com\/wuweiyouzuoju\/jidecards-anki-harmonyos/);
  assert.match(values, /Ankitects Pty Ltd/);
  assert.match(values, /github\.com\/ankitects\/anki/);
  assert.match(values, /按“现状”提供/);
});
