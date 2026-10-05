// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';

const read = file => readFileSync(new URL('../../entry/src/main/ets/' + file, import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');

test('detail actions share a single equal-width row above the full-width deck title', () => {
  const detail = read('components/牌组详情面板.ets');
  const titleStart = detail.indexOf('Text(牌组显示名(deck, this.uiLanguage))');
  const headerStart = detail.lastIndexOf('Row({ space:', titleStart);
  const header = detail.slice(headerStart, titleStart);
  const title = detail.slice(titleStart, detail.indexOf("if (deck.description !== '')"));
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const action = detail.slice(detail.indexOf('  private creationAction('), detail.indexOf('\n  }', detail.indexOf('  private creationAction(')));
  const height = action.match(/\.height\((应用尺寸\.[^)]+)\)/)[1];
  const evaluate = expression => new Function('应用尺寸', 'return ' + expression)(dimensions);
  assert.equal((header.match(/this\.creationAction\(/g) ?? []).length, 3);
  assert.equal(evaluate(height), 44);
  assert.match(title, /width\('100%'\)/); assert.match(title, /wordBreak\(WordBreak.BREAK_ALL\)/);
  assert.doesNotMatch(title, /\.height\(|maxLines\(/, 'long deck names retain natural wrapping');
  assert.doesNotMatch(header, /Column\(/); assert.match(header, /alignItems\(VerticalAlign.Center\)/);
  assert.match(action, /layoutWeight\(1\)/);
  assert.match(action, /maxLines\(1\)/);
  assert.ok(header.indexOf("'deck_details', 'add_note'") < header.indexOf("'deck_details', 'agent'"));
  assert.ok(header.indexOf("'deck_details', 'agent'") < header.indexOf("'deck_details', 'preview'"));
  assert.match(header, /if \(this.Agent入口已启用\) \{\s*this.creationAction/);
  assert.match(detail, /@StorageLink\(AI_AGENT_CHANNELS_APP_STORAGE_KEY\).*boolean = false/);
  assert.match(action, /enabled\(this.选中牌组Id !== ''\)/);
  assert.match(action, /new PressFeedback\(\)/); assert.match(action, /ThemeTextSpans\(label, this.themeAccentColors/);
  assert.match(action, /width\('100%'\)[\s\S]*textAlign\(TextAlign.Center\)/);
  assert.match(action, /minWidth: 0/);
  assert.match(action, /left: 应用尺寸.间距_4, right: 应用尺寸.间距_4/);
  assert.match(header, /'deck_details', 'preview', this\.uiLanguage\),.*true\)/);
  assert.match(read('components/home/HomeDeckDetails.ets'), /onCreateWithAI:.*this.onCreateWithAI\(\)/);
  assert.match(detail, /if \(this.showHeaderActions\) \{\s*Row/);
  assert.match(read('components/home/HomeDeckDetails.ets'), /showHeaderActions: !this.compact/,
    'compact layout moves actions into the toolbar menu, direct detail keeps the action row');
  assert.match(read('pages/首页.ets'), /onCreateWithAI:.*this.打开AI制卡\(\)/);
});

test('compact detail menu closes before each action, consumes back and resets across layouts and lifecycle', () => {
  const Host = loadComponentLogic('components/home/HomeDeckDetails.ets', 'HomeDeckDetails', {
    ...appInterfaceDependencies(),
    DECK_LIST_NARROW_KEY: 'narrow', PAGE_SURFACE_KEY: 'surface', AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'agent'
  });
  const page = new Host(), registrations = [], actions = [];
  page.onBackHandlerChange = handler => registrations.push(handler);
  page.compact = true; page.aboutToAppear();
  const back = registrations.at(-1);
  assert.equal(back(), false);
  for (const name of ['onAddNote', 'onCreateWithAI', 'onPreview']) {
    page[name] = () => { assert.equal(page.actionsMenuOpen, false); actions.push(name); };
    page.toggleActionsMenu(); assert.equal(page.actionsMenuOpen, true);
    page.selectAction(page[name]); assert.equal(back(), false);
  }
  assert.deepEqual(actions, ['onAddNote', 'onCreateWithAI', 'onPreview']);
  page.toggleActionsMenu(); assert.equal(back(), true); assert.equal(back(), false);
  page.toggleActionsMenu(); page.toggleActionsMenu(); assert.equal(page.actionsMenuOpen, false);
  page.toggleActionsMenu(); page.closeActionsMenu(); assert.equal(back(), false);
  page.toggleActionsMenu(); page.compact = false; page.compactChanged();
  assert.equal(page.actionsMenuOpen, false); assert.equal(typeof registrations.at(-1), 'function');
  assert.equal(registrations.at(-1)(), false, 'wide detail also registers its preview popup back handler');
  page.toggleActionsMenu(); assert.equal(page.actionsMenuOpen, false);
  page.compact = true; page.compactChanged(); page.toggleActionsMenu(); page.aboutToDisappear();
  assert.equal(page.actionsMenuOpen, false); assert.equal(registrations.at(-1), null);
});

test('compact detail keeps its shared arrowless menu while home and Preview use their own arrow anchors', () => {
  const shell = read('components/home/HomeDeckDetails.ets');
  const menu = shell.slice(shell.indexOf('  private actionsMenu()'), shell.indexOf('  build()'));
  assert.match(shell, /private previewScopes\(\)[\s\S]*DeckPreviewScopeMenu\(\{/);
  const homeMenu = read('components/home/主页更多面板.ets');
  assert.match(shell, /if \(this.compact && this.actionsMenuOpen\) \{\s*AnchoredMenu\(/);
  for (const surface of [shell]) {
    assert.match(surface, /menuWidth: 应用尺寸.compactMenuWidth/);
    assert.match(surface, /contentMaxWidth: 应用尺寸.内容最大宽度/);
    assert.match(surface, /topOffset: 应用尺寸.pageContentTop\(this.状态栏高度, this.narrowDeckLayout\)/);
  }
  assert.match(homeMenu, /width\(应用尺寸.compactMenuWidth\)/);
  const header=read('components/home/HomeSummaryHeader.ets');
  assert.match(header, /bindPopup\(this.moreOpen/); assert.match(header, /enableArrow: true/);
  assert.match(shell, /alignEnd: true/);
  assert.match(shell, /onClose:.*this.closeActionsMenu\(\)/);
  assert.doesNotMatch(shell, /bindPopup\(this.actionsMenuOpen|autoCancel:/);
  assert.match(shell, /onStateChange:[\s\S]*this.closeActionsMenu\(\)/);
  assert.equal((menu.match(/AnchoredMenuItem\(/g) ?? []).length, 3);
  assert.match(menu, /'deck_details', 'add_note'[\s\S]*if \(this.agentEnabled\)[\s\S]*'deck_details', 'agent'[\s\S]*'deck_details', 'preview'/);
  const previewRow = menu.slice(menu.indexOf("label: interfaceItemText(this.getUIContext(), 'deck_details', 'preview', this.uiLanguage)"));
  assert.match(previewRow, /bindPopup\(this.previewMenuOpen,[\s\S]*builder: this.previewScopes/);
  assert.match(previewRow, /placement: Placement.Left/);
  assert.match(previewRow, /enableArrow: true/);
  assert.doesNotMatch(menu, /if \(this.previewMenuOpen\)/, 'Preview stays mounted as the submenu anchor');
  assert.equal((menu.match(/divider: true/g) ?? []).length, 2, 'subsequent actions share the home menu dividers');
  assert.doesNotMatch(menu, /\.width\(|\.backgroundColor\(|\.borderRadius\(/,
    'the shared surface owns menu geometry and colors');
  assert.match(shell, /@Prop @Watch\('compactChanged'\) compact/);
  assert.match(shell, /按下态按钮\(\{ 文案: \$r\('app.string.deck_more'\)/);
  assert.doesNotMatch(shell, /bindMenu|app.string.ai_card_title/);
  for (const locale of ['base', 'en_US']) {
    const strings = JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string;
    assert.equal(strings.find(item => item.name === 'ai_agent_title').value, 'JIDE');
    assert.match(strings.find(item => item.name === 'ai_card_title').value, /^JIDE .+/);
  }
});

test('home system back closes the detail menu before leaving the detail page', () => {
  const home = read('pages/首页.ets'), start = home.indexOf('  onBackPress(): boolean {');
  const code = home.slice(start, home.indexOf('\n  }', start) + 4);
  const Host = new Function(stripTypeScriptTypes(`class Host { ${code} }`, { mode: 'transform' }) + ';return Host;')();
  const page = new Host(); let open = true;
  Object.assign(page, { transfer: { phase: 'idle', visible: false }, syncController: { cancel() {} },
    deckReorderBusy: false, deckLevelMenuId: '', 排序模式中: false,
    显示牌组详情: true, deckDetailsBackHandler: () => { const consumed = open; open = false; return consumed; } });
  assert.equal(page.onBackPress(), true); assert.equal(page.显示牌组详情, true);
  assert.equal(page.onBackPress(), true); assert.equal(page.显示牌组详情, false);
});

test('two or three detail actions keep equal centers and responsive gaps without extra outer margins', () => {
  const source = read('components/牌组详情面板.ets');
  const titleStart = source.indexOf('Text(牌组显示名(deck, this.uiLanguage))');
  const row = source.slice(source.lastIndexOf('Row({ space:', titleStart), titleStart);
  const expression = row.match(/space: (应用尺寸\.页面分组间距\([^)]+\))/)[1];
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const gapFor = narrow => new Function('应用尺寸', 'return ' + expression)
    .call({ narrowDeckLayout: narrow }, dimensions);
  assert.doesNotMatch(row, /\.margin\(|\.padding\(|Blank\(/);
  for (const width of [320, 400, 600]) for (const count of [2, 3]) for (const narrow of [false, true]) {
    const gap = gapFor(narrow), inset = dimensions.卡片内边距;
    const slot = (width - inset * 2 - gap * (count - 1)) / count;
    assert.equal(gap, narrow ? 8 : 12);
    assert.ok(slot >= 80, 'smallest row keeps room for the default labels and symmetric internal padding');
    const centers = Array.from({ length: count }, (_, i) => inset + slot / 2 + i * (slot + gap));
    assert.ok(Math.abs(centers[0] - (width - centers.at(-1))) < 1e-9, 'left and right clearances match');
    if (count === 3) assert.ok(Math.abs(centers[1] - width / 2) < 1e-9, 'AI action stays centered');
  }
});

test('detail AI route carries the current deck and retains configuration and sync preflight', async () => {
  const home = read('pages/首页.ets');
  const start = home.indexOf('  private async 打开AI制卡()');
  const code = home.slice(start, home.indexOf('\n  }', start) + 4);
  const Host = new Function('牌组显示名', stripTypeScriptTypes(`class Host { ${code} }`, { mode: 'transform' }) + '; return Host;')(deck => deck.displayName);
  const page = new Host(), pushes = [], settings = [];
  let deferred = false, configured = true;
  Object.assign(page, { deferForSync: () => deferred, isAIConfigured: async () => configured,
    openAISettings: () => settings.push(true), 已选中牌组: () => true,
    选中的牌组ID: '42', 选中牌组: () => ({ displayName: '再说啊' }),
    添加笔记的牌组选项: () => [{ id: 42, name: '再说啊' }], 暂停主页官方公告检查: () => {},
    页面栈: { pushPath: path => pushes.push(path) }, 返回主页后刷新: () => {} });
  await page.打开AI制卡();
  assert.equal(pushes[0].name, 'AiCardPage');
  assert.deepEqual(pushes[0].param, { mode: 'create', deckId: '42', deckName: '再说啊', deckOptions: [{ id: 42, name: '再说啊' }] });
  page.选中的牌组ID = '99'; page.选中牌组 = () => ({ displayName: '另一牌组' });
  await page.打开AI制卡(); assert.equal(pushes[1].param.deckId, '99'); assert.equal(pushes[1].param.deckName, '另一牌组');
  configured = false; await page.打开AI制卡(); assert.equal(settings.length, 1); assert.equal(pushes.length, 2);
  deferred = true; await page.打开AI制卡(); assert.equal(settings.length, 1); assert.equal(pushes.length, 2);
});
