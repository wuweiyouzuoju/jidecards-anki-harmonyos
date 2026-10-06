// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';
import { homeHeaderGeometry } from '../../entry/src/main/ets/model/HomeHeaderLayout.ts';
import { browserBackItem } from '../../entry/src/main/ets/model/AppInterface.ts';

const read = file => readFileSync(new URL('../../entry/src/main/ets/' + file, import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
const headerSource = source => {
  const start=source.indexOf('  private headerActions() {');
  assert.ok(start>=0);return source.slice(start,source.indexOf('\n  }',start)+4);
};

test('detail icon actions share public square buttons above the full-width deck title', () => {
  const detail = read('components/牌组详情面板.ets');
  const titleStart = detail.indexOf('Text(牌组显示名(deck, this.uiLanguage))');
  const header = headerSource(detail);
  const title = detail.slice(titleStart, detail.indexOf("if (deck.description !== '')"));
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const action = detail.slice(detail.indexOf('  private creationAction('), detail.indexOf('\n  }', detail.indexOf('  private creationAction(')));
  const height = action.match(/controlSize: (this\.headerActionHeight)/)[1];
  const evaluate = expression => new Function('应用尺寸', 'return ' + expression).call({headerActionHeight:dimensions.按钮高度},dimensions);
  assert.equal((header.match(/this\.creationAction\(/g) ?? []).length, 3);
  assert.equal(evaluate(height), 44);
  assert.match(title, /width\('100%'\)/); assert.match(title, /wordBreak\(WordBreak.BREAK_ALL\)/);
  assert.doesNotMatch(title, /\.height\(|maxLines\(/, 'long deck names retain natural wrapping');
  assert.doesNotMatch(header, /Column\(/); assert.match(header, /alignItems\(VerticalAlign.Center\)/);
  assert.match(action, /IconActionButton\(/);
  assert.ok(header.indexOf("'deck_details', 'add_note'") < header.indexOf("'deck_details', 'preview'"));
  assert.match(header, /if \(this.Agent入口已启用\) \{\s*this.creationAction/);
  assert.match(detail, /@StorageLink\(AI_AGENT_CHANNELS_APP_STORAGE_KEY\).*boolean = false/);
  assert.match(action, /isInteractive: this\.选中牌组Id !== '' && isInteractive/);
  assert.doesNotMatch(action, /\bButton\(\{|ThemeTextSpans|new PressFeedback/,
    'the public icon button owns the surface, SVG rendering and press feedback');
  assert.doesNotMatch(action, /\.padding\(/, 'the slot does not duplicate public button padding');
  assert.match(header, /'deck_details', 'preview', this\.uiLanguage\),[\s\S]*?!this\.previewBusy\)/);
  for (const icon of ['ic_study_edit', 'ic_study_agent', 'ic_common_preview']) {
    assert.ok(header.includes(`app.media.${icon}`));
    for (const theme of ['base', 'dark']) assert.match(readFileSync(new URL(
      `../../entry/src/main/resources/${theme}/media/${icon}.svg`, import.meta.url), 'utf8'), /viewBox="0 0 24 24"/);
  }
  const options = action.match(/IconActionButton\((\{[\s\S]*?\})\)/)[1];
  const propsFor = new Function('source', 'label', 'action', 'isInteractive', '$r', 'return ' + options);
  const IconButton = loadComponentLogic('components/common/IconActionButton.ets', 'IconActionButton', {
    Color: { Transparent: 'transparent' }, 应用尺寸: dimensions
  });
  for (const selected of ['', '42']) for (const available of [false, true]) for (const size of [24, 44]) {
    let calls = 0;
    const label = '完整的本地化动作名称'.repeat(10);
    const props = propsFor.call({ 选中牌组Id: selected, headerActionHeight: size, 动作主色: '#2F5FD0' },
      'icon', label, () => calls++, available, key => key);
    const button = Object.assign(new IconButton(), props);
    button.activate();
    assert.equal(calls, selected && available ? 1 : 0, 'disabled or unselected actions reject late clicks');
    assert.equal(button.label, label, 'the icon retains the full accessible action name');
    assert.equal(button.controlSize, size); assert.equal(button.controlWidth, size);
    assert.equal(button.toolbarStyle, true);
    assert.equal(button.usesSquareSurface(), true);
    const shared = homeHeaderGeometry(600, 12, true, size);
    assert.equal(button.controlGlyphSize, shared.controlGlyphSize, 'wide actions share the home icon scale');
  }
  assert.match(read('components/home/HomeDeckDetails.ets'), /onCreateWithAI:.*this.onCreateWithAI\(\)/);
  assert.match(detail, /if \(this.showHeaderActions && this.headerActionHeight > 0\) \{ this.headerActions\(\) \}\s*\/\/[^\n]*\n\s*Scroll/);
  assert.match(read('components/home/HomeDeckDetails.ets'), /showHeaderActions: !this.compact/,
    'compact actions are in the top toolbar, direct detail keeps the action row');
  assert.match(read('pages/首页.ets'), /onCreateWithAI:.*this.打开AI制卡\(\)/);
});

test('direct detail actions release the preview menu and preserve back, layout and lifecycle guards', () => {
  const Host = loadComponentLogic('components/home/HomeDeckDetails.ets', 'HomeDeckDetails', {
    ...appInterfaceDependencies(),
    interfaceItemText: (_context, _surface, id) => id,
    应用尺寸: dimensions,
    DECK_LIST_NARROW_KEY: 'narrow', PAGE_SURFACE_KEY: 'surface', AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'agent'
  });
  Host.prototype.getUIContext = () => ({});
  const page = new Host(), registrations = [], actions = [];
  page.onBackHandlerChange = handler => registrations.push(handler);
  page.compact = true; page.aboutToAppear();
  const back = registrations.at(-1);
  assert.equal(back(), false);
  for (const name of ['onAddNote', 'onCreateWithAI', 'onPreview']) {
    page[name] = () => { assert.equal(page.previewMenuOpen, false); actions.push(name); };
    page.openPreviewMenu(); assert.equal(page.previewMenuOpen, true);
    page.selectAction(page[name]); assert.equal(back(), false);
  }
  assert.deepEqual(actions, ['onAddNote', 'onCreateWithAI', 'onPreview']);
  page.openPreviewMenu(); assert.equal(back(), true); assert.equal(back(), false);
  page.openPreviewMenu(); page.closePreviewMenu(); assert.equal(back(), false);
  page.openPreviewMenu(); page.compact = false; page.compactChanged();
  assert.equal(page.previewMenuOpen, false); assert.equal(typeof registrations.at(-1), 'function');
  assert.equal(registrations.at(-1)(), false, 'wide detail also registers its preview popup back handler');
  page.compact = true; page.compactChanged(); page.openPreviewMenu(); page.aboutToDisappear();
  assert.equal(page.previewMenuOpen, false); assert.equal(registrations.at(-1), null);
});

test('compact and wide Preview reuse one arrowless public surface and public menu rows', () => {
  const shell = read('components/home/HomeDeckDetails.ets');
  assert.match(shell, /private previewScopes\(\)[\s\S]*DeckPreviewScopeMenu\(\{/);
  const homeMenu = read('components/home/主页更多面板.ets');
  assert.equal((shell.match(/AnchoredMenu\(\{/g) ?? []).length, 1);
  assert.match(shell, /menuWidth: Math.min\(应用尺寸.compactMenuWidth, this.actionAnchor.width\)/);
  assert.match(shell, /contentLeft: this.menuAnchor\(\).left, contentMaxWidth: this.actionAnchor.width/);
  assert.match(shell, /topOffset: this.menuAnchor\(\).top/);
  assert.match(shell, /if \(this.previewMenuOpen && this.actionAnchor.width > 0\)/);
  const scopes = read('components/home/DeckPreviewScopeMenu.ets');
  assert.match(scopes, /ActionMenuList\(\{ items: this.menuItems/);
  assert.doesNotMatch(scopes, /\bRow\(|\bText\(|PressFeedback|\.padding\(|\.width\(/,
    'public list owns centering, row height, padding, dividers and press feedback');
  assert.match(homeMenu, /ActionMenuList\(/);
  const header=read('components/home/HomeSummaryHeader.ets');
  assert.doesNotMatch(header, /bindPopup|enableArrow/);
  assert.match(read('pages/首页.ets'), /AnchoredMenu\(\{ menuWidth: Math.min\(应用尺寸.compactMenuWidth/);
  assert.match(shell, /alignEnd: true/);
  assert.match(shell, /onClose:.*this.closePreviewMenu\(\)/);
  assert.doesNotMatch(shell, /bindPopup|enableArrow|autoCancel:/);
  assert.doesNotMatch(shell, /AnchoredMenuItem|actionsMenuOpen|toggleActionsMenu|ic_home_more/);
  const toolbar = shell.slice(shell.indexOf('if (this.compact) {'), shell.indexOf('牌组详情面板({'));
  assert.match(toolbar, /Blank\(\)[\s\S]*Row\(\{ space: 应用尺寸.页面分组间距/);
  assert.match(toolbar, /'deck_details', 'add_note'[\s\S]*if \(this.agentEnabled\)[\s\S]*'deck_details', 'agent'[\s\S]*'deck_details', 'preview'/);
  assert.equal((toolbar.match(/IconActionButton\(\{ toolbarStyle: true/g) ?? []).length, 4,
    'back is on the left, the three public action icons are grouped on the right');
  assert.match(toolbar, /isInteractive: this.deckId !== '' && !this.previewBusy/);
  const wide = read('components/牌组详情面板.ets');
  assert.doesNotMatch(wide, /bindPopup|DeckPreviewScopeMenu/);
  assert.match(wide, /this.onActionAnchorChange\(\{ left: Number\(area.globalPosition.x\)/);
  assert.match(shell, /@Prop @Watch\('compactChanged'\) compact/);
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

test('wide JIDE shares the left creation group and preview remains on the right card corner', () => {
  const source = read('components/牌组详情面板.ets');
  const row = headerSource(source);
  const action = source.slice(source.indexOf('  private creationAction('), source.indexOf('\n  }', source.indexOf('  private creationAction(')));
  assert.doesNotMatch(row, /Stack\(|Alignment.Center/);
  assert.match(row, /Row\(\{ space: 应用尺寸.页面分组间距\(this.narrowDeckLayout\) \}\)/);
  assert.match(row, /'deck_details', 'add_note'[\s\S]*if \(this.Agent入口已启用\)[\s\S]*'deck_details', 'agent'[\s\S]*Blank\(\)[\s\S]*'deck_details', 'preview'/);
  assert.match(row, /'deck_details', 'preview'[\s\S]*this.预览\(\); \}, !this.previewBusy\)/,
    'the preview square keeps its busy guard while its public surface is owned by HomeDeckDetails');
  assert.match(row, /\.alignItems\(VerticalAlign.Center\)/);
  assert.doesNotMatch(row + action, /\.padding\(|\.layoutWeight\(|\.margin\(\{ (?:left|right):/);
});

test('browser left control uses one semantic declaration for returning and exiting selection', () => {
  const controls = loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceControlIcon', { $r: key => key });
  assert.deepEqual(browserBackItem(false), { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' });
  assert.deepEqual(browserBackItem(true), { id: 'back', titleKey: 'browser_exit_selection', iconKey: 'ic_common_close' });
  assert.equal(controls([browserBackItem(true)], 'back'), 'app.media.ic_common_close');
  assert.equal(controls([browserBackItem(false)], 'back'), 'app.media.ic_common_arrow_left');
});

test('wide detail toolbar and card edges follow the measured left header, including narrow widths and reorder mode', () => {
  const page=read('pages/首页.ets'),detail=read('components/牌组详情面板.ets');
  const start=page.indexOf('  private detailHeaderActionHeight(): number {');
  assert.ok(start>=0);
  const method=page.slice(start,page.indexOf('\n  }',start)+4);
  const Host=new Function('homeHeaderGeometry','应用尺寸',stripTypeScriptTypes(`class Host { ${method} }`,{mode:'transform'})+';return Host;')(homeHeaderGeometry,dimensions);
  const rootTop=detail.slice(detail.lastIndexOf('    .padding({')).match(/top: ([^\n]+)/)[1];
  const header=headerSource(detail),rowHeight=header.match(/\.height\((this\.headerActionHeight)\)/)[1];
  const rowGap=header.match(/\.margin\(\{ bottom: (应用尺寸\.[^}]+) \}\)/)[1];
  const evaluate=(expression,state)=>new Function('应用尺寸','return '+expression).call(state,dimensions);
  assert.match(read('components/home/HomeDeckDetails.ets'),/headerActionHeight: this.headerActionHeight/);
  assert.match(read('components/home/HomeDeckDetails.ets'),/@Prop @Watch\('closePreviewMenu'\) headerActionHeight/,
    'resizing or hiding the measured action row releases its popup anchors');
  assert.match(page,/headerActionHeight: this.detailHeaderActionHeight\(\)/);
  assert.ok(detail.indexOf('this.headerActions()')<detail.indexOf('Scroll(this.moreReveal.scroller)'));
  assert.doesNotMatch(detail.slice(detail.indexOf('Scroll(this.moreReveal.scroller)')),/this.creationAction\(/,
    'card scrolling owns no second toolbar or toolbar padding');
  for(const narrow of [false,true]) for(const width of [160,240,328,480,600]) for(const summary of [false,true]) for(const reorder of [false,true]) {
    const host=new Host();Object.assign(host,{排序模式中:reorder,homeActionAnchor:{width},narrowDeckLayout:narrow,显示今日进度卡:summary});
    const height=host.detailHeaderActionHeight(),state={showHeaderActions:true,headerActionHeight:height,narrowDeckLayout:narrow};
    const left=homeHeaderGeometry(width,dimensions.页面分组间距(narrow),summary,dimensions.按钮高度);
    const gap=dimensions.页面内容顶部间距(narrow);
    assert.equal(height,reorder?0:left.actionsHeight,'both columns reserve the same action height');
    const rightTop=evaluate(rootTop,state)+(height>0?evaluate(rowHeight,state)+evaluate(rowGap,state):0);
    const leftTop=reorder?gap:left.actionsHeight+gap;
    assert.equal(rightTop,leftTop,'summary/deck-list and detail cards start at the same edge');
    assert.equal(evaluate(rootTop,{...state,showHeaderActions:false}),gap,'phone details retain one content gap below their own toolbar');
  }
});

test('the real detail publisher reports the wide left group and compact right group', () => {
  const observations=[];
  const Detail=loadComponentLogic('components/牌组详情面板.ets','牌组详情面板',{
    应用尺寸:dimensions,ExpansionReveal:class{cancel(){}},GLASS_HIGHLIGHT_COLORS:[],
    牌组显示名:deck=>deck.name,appInterface:{observe:view=>observations.push(view),leave(){}}
  });
  const detail=new Detail();Object.assign(detail,{主页快照数据:{decks:[{id:'1',name:'Deck',fullName:'Deck'}]},选中牌组Id:'1'});
  detail.aboutToAppear();
  const position=()=>observations.at(-1).values.find(value=>value.id==='header_actions_position').value;
  const style=()=>observations.at(-1).values.find(value=>value.id==='header_actions_style').value;
  const layout=()=>observations.at(-1).values.find(value=>value.id==='header_actions_layout').value;
  assert.equal(position(),'above_card');
  assert.equal(style(),'icons');
  assert.equal(layout(),'add_note:left,preview:right');
  detail.Agent入口已启用=true;detail.publishInterface();
  assert.equal(layout(),'add_note:left,agent:after_add_note,preview:right');
  detail.Agent入口已启用=false;detail.publishInterface();
  assert.equal(layout(),'add_note:left,preview:right');
  detail.headerActionHeight=0;detail.publishInterface();assert.equal(position(),'hidden');
  assert.equal(layout(),'hidden');
  detail.showHeaderActions=false;detail.publishInterface();assert.equal(position(),'toolbar_right');
  assert.equal(style(),'icons');
  assert.equal(layout(),'add_note:right_group,preview:right_group');
  detail.Agent入口已启用=true;detail.publishInterface();
  assert.equal(layout(),'add_note:right_group,agent:right_group,preview:right_group');
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
