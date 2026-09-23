// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home wires the Anki deck tree, action menu, and selected-deck flows', () => {
  const index = read('entry/src/main/ets/pages/首页.ets');
  const detail = read('entry/src/main/ets/components/牌组详情面板.ets');
  const transferCoord = read('entry/src/main/ets/components/home/DataTransferFeature.ets');
  assert.match(index, /主页操作面板/);
  assert.match(index, /可见牌组行/);
  assert.match(index, /添加笔记页/);
  // 数据迁移面板 现在挂在 数据迁移协调器 积木组件里
  assert.match(transferCoord, /数据迁移面板/);
  assert.match(index, /展开的牌组ID集合/);
  assert.match(index, /创建父牌组ID/);
  assert.match(index, /this\.openCreateDeck\(''\)/);
  assert.match(index, /this\.openCreateDeck\(this\.选中的牌组ID\)/);
  // 创建牌组协调器 接收 父牌组ID Prop（内部转发给 创建牌组面板 的 initialParentId）
  assert.match(index, /父牌组ID: this\.创建父牌组ID/);
  assert.match(detail, /添加卡片/);
  assert.match(detail, /创建子牌组/);
  assert.match(detail, /导出牌组/);
  // B12 重构：牌组选项校验错误流上移到 首页.ets（牌组详情面板 仅上抛回调）
  assert.match(index, /DeckOptionsFeature\(\{/);
  assert.doesNotMatch(index, /牌组配置表单|牌组配置服务实例/);
});

test('settings owns only language, data, database check, and about entry points', () => {
  const settings = read('entry/src/main/ets/components/设置面板.ets');
  assert.match(read('entry/src/main/ets/components/settings/GeneralSettings.ets'), /设置语言模式/);
  assert.match(settings, /导入数据回调/);
  assert.match(settings, /导出数据回调/);
  const dataGroup = read('entry/src/main/ets/components/settings/数据分组.ets');
  assert.match(dataGroup, /check_db_title/);
  assert.match(settings, /onCheckDatabase:.*this\.执行数据库检查\(\)/);
  assert.doesNotMatch(settings, /backup_sync_title/);
  assert.doesNotMatch(settings, /onUnavailable/);
  assert.doesNotMatch(settings, /onImport:\s*\(/);
});

test('home and settings share the transfer session and platform export workflow', () => {
  for (const page of ['首页', '设置页']) {
    const index = read(`entry/src/main/ets/pages/${page}.ets`);
    assert.match(index, /new DataTransferSession\(new AnkiDataTransfer\(\)/);
    assert.match(index, /DataTransferFeature\(\{/);
  }
  assert.match(read('entry/src/main/ets/backend/AnkiDataTransfer.ets'), /exportPersonalData\(this\.context\(\), intent, progress\)/);
  assert.match(read('entry/src/main/ets/backend/DataExportWorkflow.ets'), /完成导出\(context,/);
  // 选择器占用、整库二次确认、失败重试在 home-transfer-session 中执行真实会话验证。

  const transfer = read('entry/src/main/ets/components/数据迁移面板.ets');
  assert.match(transfer, /@Prop initialMode/);
  assert.match(transfer, /@Prop deckOptions/);
  assert.match(transfer, /@Prop allowDeckSelection/);
  assert.match(transfer, /aboutToAppear/);
  assert.match(transfer, /this\.已选导出牌组Id = this\.deckOptions\[0\]\.id/);
  assert.match(transfer, /this\.已选导出牌组Id <= 0/);
  assert.match(transfer, /this\.模式 !== 'exportDeck' \|\| this\.已选导出牌组Id > 0/);
});

test('add-note exposes image occlusion and other notetypes and type-answer submits on Enter', () => {
  // 图片遮盖和 Basic 变种均在创建入口展示。
  const addNote = read('entry/src/main/ets/pages/添加笔记页.ets');
  assert.match(addNote, /笔记类型选项 = 名称列表\.map/);
  assert.doesNotMatch(addNote, /名称列表\.filter/);
  assert.doesNotMatch(addNote, /是隐藏的笔记类型变种/);
  assert.doesNotMatch(addNote, /暂不做 UI 适配/);
  // 三种变体的专属帮助文案分发必须保留（下拉选中后展示用途说明）
  assert.match(addNote, /Basic反转笔记类型名集合\.indexOf/);
  assert.match(addNote, /Basic可选反转笔记类型名集合\.indexOf/);
  assert.match(addNote, /Basic输入答案笔记类型名集合\.indexOf/);
  // 已删除的默认类型必须回退到可见类型。
  assert.match(addNote, /默认ID可见/);
  assert.match(addNote, /默认笔记类型ID = this\.笔记类型选项\[0\]\.id/);

  // Type-in-the-Answer 对齐桌面端：输入框回车 = 显示答案（比对结果在背面注入）
  const study = read('entry/src/main/ets/pages/学习页.ets');
  assert.match(study, /enterKeyType\(EnterKeyType\.Done\)/);
  assert.match(study, /onSubmit\(\(\): void => \{\s*this\.显示答案\(\);\s*\}\)/);
});

test('stock notetype restore covers basic variants, cloze and image occlusion', () => {
  // 2026-08-29：兜底恢复清单必须覆盖 stock kind 0/1/2/3/4；
  // 图片遮盖通过专属服务补建。
  const addNote = read('entry/src/main/ets/pages/添加笔记页.ets');
  assert.match(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.BASIC\)/);
  assert.match(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.BASIC_AND_REVERSED\)/);
  assert.match(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.BASIC_OPTIONAL_REVERSED\)/);
  assert.match(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.BASIC_TYPING\)/);
  assert.match(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.CLOZE\)/);
  assert.doesNotMatch(addNote, /获取标准笔记类型JSON\(标准笔记类型种类\.IMAGE_OCCLUSION\)/);
  assert.match(addNote, /图片遮罩服务实例\.添加图片遮罩笔记类型\(\)/);
  const study = read('entry/src/main/ets/pages/学习页.ets');
  const preview = read('entry/src/main/ets/components/browser/卡片预览页.ets');
  assert.match(study, /anki\.imageOcclusion\.setup\(\)/);
  assert.match(preview, /anki\.imageOcclusion\.setup\(\)/);
});
