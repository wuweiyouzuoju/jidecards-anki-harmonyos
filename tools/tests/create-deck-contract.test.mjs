// SPDX-License-Identifier: AGPL-3.0-or-later

// 新建牌组链路契约测试（M5）：
// - 弹层为纯 UI 积木（不 import 后端），经回调上抛名称；
// - 忙碌/错误态由父级下发；提交需非空且防重入；
// - 首页.ets 走 确保已打开 → 创建牌组 → 刷新 的完整链路。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const PANEL = 'entry/src/main/ets/components/创建牌组面板.ets';
const PAGE = 'entry/src/main/ets/pages/首页.ets';
const SERVICE = 'entry/src/main/ets/backend/牌组服务.ts';

test('dynamic deck previews bind formatted text directly instead of passing value snapshots through a span builder', () => {
  const panel = read(PANEL);
  for (const key of ['child', 'child_pending', 'top']) {
    assert.ok(panel.includes(`Text(this.formatPreview($r('app.string.create_deck_preview_${key}'),`));
  }
  assert.doesNotMatch(panel, /ThemeTextSpans\(this\.formatPreview/);
  assert.match(panel, /resourceText\(this\.getUIContext\(\), resource, \.\.\.names\)/);
  assert.match(panel, /@State private deckName: string/);
  assert.match(panel, /this\.deckName = value/);
});

test('create deck panel exists as a pure UI building block', () => {
  assert.equal(existsSync(projectUrl(PANEL)), true, `${PANEL} must exist`);
  const panel = read(PANEL);

  assert.match(panel, /@Component/);
  assert.match(panel, /export struct 创建牌组面板/);
  assert.match(panel, /onConfirm: \(fullName: string\) => void/);
  assert.match(panel, /onCancel: \(\) => void/);
  assert.doesNotMatch(panel, /后端会话|牌组服务|libjidecards\.so/,
    'panel must not touch the backend directly');
});

test('create deck panel guards submission and reflects busy/error props', () => {
  const panel = read(PANEL);

  assert.match(panel, /@Prop busy: boolean/);
  assert.match(panel, /@Prop errorMessage: string/);
  assert.match(panel, /deckName\.trim\(\)\.length > 0/);
  assert.match(panel, /actionEnabled: this\.canSubmit\(\)/);
  const header = read('entry/src/main/ets/components/common/DialogHeader.ets');
  assert.match(header, /\.enabled\(this\.actionEnabled\)/);
  assert.match(panel, /app\.color\.error_text/);
  assert.match(panel, /TextInput\(/);
});

test('create deck panel composes a normalized path from its selected parent', () => {
  const panel = read(PANEL);

  assert.match(panel, /parentOptions: 牌组汇总\[\]/);
  assert.match(panel, /initialParentId/);
  assert.match(panel, /组合牌组路径/);
});

test('create deck panel uses shared dimension tokens and string resources', () => {
  const panel = read(PANEL);

  assert.match(panel, /应用尺寸/);
  assert.doesNotMatch(panel, /\.fontSize\(\d/, 'must not hardcode fontSize');
  assert.doesNotMatch(panel, /\.borderRadius\(\d/, 'must not hardcode borderRadius');
  for (const key of ['create_deck_title', 'deck_name_placeholder',
    'create_deck_cancel', 'create_deck_confirm', 'create_deck_creating']) {
    assert.match(panel, new RegExp(`app\\.string\\.${key}`), `panel must use ${key}`);
  }
});

test('deck service creates decks via NewDeck template then AddDeck', () => {
  const service = read(SERVICE);

  assert.match(service, /async 创建牌组\(名称: string\): Promise<number>/);
  assert.match(service, /牌组方法\.新建牌组/);
  assert.match(service, /牌组方法\.添加牌组/);
  assert.match(service, /模板\.id = 0/);
  assert.match(service, /模板\.name = 名称/);
  assert.match(service, /decodeOpChangesWithId/);
});

test('home page wires the create button through the full flow', () => {
  const page = read(PAGE);
  const createCoord = read('entry/src/main/ets/components/home/创建牌组协调器.ets');

  // 创建牌组面板 现在挂在 创建牌组协调器 积木组件里
  assert.match(createCoord, /创建牌组面板/);
  assert.match(page, /@State(?: @Watch\('[^']+'\))? private 显示创建牌组: boolean/);
  assert.match(page, /@State(?: @Watch\('[^']+'\))? private 创建牌组中: boolean/);
  assert.match(page, /@State private 创建牌组错误: string/);
  assert.match(page, /async 创建牌组\(name: string\)/);
  assert.match(page, /确保已打开\(context\.filesDir\)/);
  assert.match(page, /this\.deckCommands\.create\(context\.filesDir, name\)/);
  assert.match(read('entry/src/main/ets/backend/HomeDeckCommands.ets'), /this\.decks\.创建牌组\(name\)/);
  assert.match(page, /await this\.加载主页数据\(\)/, 'must refresh tree after creation');
  assert.match(page, /选中的牌组ID = newDeckId\.toString\(\)/, 'must select the new deck');
});

test('create deck flow surfaces backend errors inside the panel', () => {
  const page = read(PAGE);
  const method = page.match(/private async 创建牌组\(name: string\): Promise<void> \{[\s\S]*?\n  \}/);

  assert.notEqual(method, null);
  assert.match(method[0], /catch \(error\)/);
  assert.match(method[0], /this\.创建牌组错误 = /);
  assert.match(method[0], /finally \{\s*if \(!this\.homeDisposed\) this\.创建牌组中 = false;/);
});
