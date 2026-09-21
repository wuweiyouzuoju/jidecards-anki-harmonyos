// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('home and settings keep the same gap below their toolbar buttons', () => {
  const sizes = read('entry/src/main/ets/utils/应用尺寸.ets');
  const inset = Number(sizes.match(/pageContentTopInset: number = (\d+)/)[1]);
  const toolbar = Number(sizes.match(/工具栏高度: number = (\d+)/)[1]);
  const button = Number(sizes.match(/按钮高度: number = (\d+)/)[1]);
  assert.equal((toolbar - button) / 2 + inset, 16);
  for (const path of ['entry/src/main/ets/pages/首页.ets', 'entry/src/main/ets/components/设置面板.ets']) {
    assert.match(read(path), /left: 应用尺寸\.页面内边距_水平,\s*right: 应用尺寸\.页面内边距_水平,\s*top: 应用尺寸\.pageContentTopInset/, path);
  }
});

test('every primary page consumes the shared first-content and toolbar spacing', () => {
  for (const name of ['首页', '统计页', '学习提醒页', '浏览页', '学习页', '添加笔记页', 'AI制卡页']) {
    const page = read(`entry/src/main/ets/pages/${name}.ets`);
    assert.match(page, /top: 应用尺寸\.pageContentTopInset/, name);
    assert.match(page, /top: this\.状态栏高度 \+ 应用尺寸\.toolbarVerticalInset/, name);
    assert.match(page, /bottom: 应用尺寸\.toolbarVerticalInset/, name);
  }
  const settings = read('entry/src/main/ets/components/设置面板.ets');
  assert.match(settings, /top: 应用尺寸\.pageContentTopInset/);
  assert.match(settings, /top: this\.状态栏高度 \+ 应用尺寸\.toolbarVerticalInset/);
  const agent = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.doesNotMatch(agent.slice(agent.lastIndexOf('  build() {')), /Divider\(/,
    'a second divider must not add an extra offset below the Agent toolbar');
});

test('peer cards share one gap and reminder scrolling does not fix the content height', () => {
  for (const path of ['components/home/主页牌组列表.ets', 'components/设置面板.ets', 'components/牌组详情面板.ets', 'pages/首页.ets', 'pages/统计页.ets', 'pages/学习提醒页.ets']) {
    assert.match(read('entry/src/main/ets/' + path), /space: 应用尺寸\.pageSectionGap/, path);
  }
  const reminder = read('entry/src/main/ets/pages/学习提醒页.ets');
  const scroll = reminder.slice(reminder.indexOf('Scroll() {'), reminder.indexOf('.layoutWeight(1)', reminder.indexOf('Scroll() {')));
  assert.doesNotMatch(scroll, /\.height\('100%'\)/);
  assert.match(scroll, /bottom: 应用尺寸\.pageBottomInset \+ this\.导航条高度/);
  assert.doesNotMatch(reminder.slice(reminder.indexOf('private 提醒项卡片'), reminder.indexOf('private 空状态')), /\.margin\(\{ bottom:/);
});

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

test('home popup menus start below the status-aware toolbar', () => {
  const moreMenu = read('entry/src/main/ets/components/home/主页更多面板.ets');
  const actionMenu = read('entry/src/main/ets/components/主页操作面板.ets');
  for (const menu of [moreMenu, actionMenu]) {
    assert.match(menu, /@StorageProp\('状态栏高度'\)\s+private\s+状态栏高度:\s*number\s*=\s*0/);
    assert.match(menu,
      /top:\s*应用尺寸\.工具栏高度\s*\+\s*this\.状态栏高度\s*\+\s*应用尺寸\.pageContentTopInset/);
    assert.doesNotMatch(menu, /margin\(\{\s*top:\s*64/);
  }
});

test('regular settings entry always supplies a non-AI navigation parameter', () => {
  const home = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  assert.match(home,
    /private openSettings\(\):[\s\S]*?const params:\s*设置页参数\s*=\s*\{\s*openAiSettings:\s*false\s*\}[\s\S]*?name:\s*'SettingsPage',[\s\S]*?param:\s*params/);
});

test('home shell keeps adaptive breakpoints and a virtualized deck list', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const deckList = read('entry/src/main/ets/components/home/主页牌组列表.ets');

  assert.match(page, /value:\s*\['600vp',\s*'840vp'\]/);
  assert.match(page, /reference:\s*BreakpointsReference\.WindowSize/);
  assert.match(page, /@State\s+private\s+当前断点:\s*string\s*=\s*'xs'/);
  // List 现在挂在 主页牌组列表 积木组件里
  assert.match(deckList, /^\s*List\(/m);
  assert.doesNotMatch(page, /\bHOME_SNAPSHOT\b/);
  assert.doesNotMatch(page, /阶段 1 · OHOS 可行性验证/);
  assert.doesNotMatch(page, /interface GateStatus|private readonly gates/);
});

test('home model exposes formal empty data without demo decks', () => {
  const modelPath = 'entry/src/main/ets/model/主页模型.ets';
  assert.equal(existsSync(projectUrl(modelPath)), true, `${modelPath} must exist`);

  const model = read(modelPath);
  assert.match(model, /export interface 牌组汇总/);
  assert.match(model, /export interface 今日学习汇总/);
  assert.match(model, /export interface 主页快照/);
  assert.match(model, /export const 空主页快照:\s*主页快照/);
  assert.doesNotMatch(model, /每日英语|计算机基础|古诗文|通识随记/);
  assert.doesNotMatch(model, /streakDays/);
  assert.doesNotMatch(model, /\bany\b|\bvar\b/);
});

test('home resources provide matching light and dark semantic colors', () => {
  const strings = readJson('entry/src/main/resources/base/element/string.json').string;
  const lightColors = readJson('entry/src/main/resources/base/element/color.json').color;
  const darkColors = readJson('entry/src/main/resources/dark/element/color.json').color;
  const stringNames = new Set(strings.map((item) => item.name));
  const lightNames = new Set(lightColors.map((item) => item.name));
  const darkNames = new Set(darkColors.map((item) => item.name));

  for (const name of ['home_title', 'start_study', 'nav_decks', 'nav_browse', 'nav_stats', 'nav_settings']) {
    assert.equal(stringNames.has(name), true, `missing string resource: ${name}`);
  }

  for (const name of ['surface_page', 'surface_card', 'text_primary', 'text_secondary', 'action_primary', 'border_subtle']) {
    assert.equal(lightNames.has(name), true, `missing light color resource: ${name}`);
    assert.equal(darkNames.has(name), true, `missing dark color resource: ${name}`);
  }
});

test('tablet shell shares one selection state and avoids high-cost visual effects', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const selectionDeclarations = page.match(/@(?:State|Provide|StorageLink)\s*(?:\([^)]*\)\s*)?(?:private\s+)?选中的牌组ID/g) ?? [];

  assert.equal(selectionDeclarations.length, 1);
  assert.match(page, /columns:\s*\{\s*xs:\s*4,\s*sm:\s*8,\s*md:\s*12\s*\}/);
  assert.match(page, /span:\s*\{\s*xs:\s*4,\s*sm:\s*5,\s*md:\s*8\s*\}/);
  assert.match(page, /当前断点\s*===\s*'xs'/);
  // 官方公告协调器允许首页持有唯一一个 setTimeout 延迟任务（单发、可取消，official-announcement-flow-contract 另行锁定）；
  // 仍禁止持续轮询与高开销视觉动效。
  assert.doesNotMatch(page, /setInterval|blur\(|backdropBlur|linearGradient/);
});

test('large deck lists create rows lazily', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const deckList = read('entry/src/main/ets/components/home/主页牌组列表.ets');
  const model = read('entry/src/main/ets/model/主页模型.ets');

  assert.match(model, /export class 牌组列表数据源 implements IDataSource/);
  // LazyForEach 现在挂在 主页牌组列表 积木组件里
  assert.match(deckList, /LazyForEach\(this\.牌组数据源/);
  assert.doesNotMatch(page, /\bHOME_SNAPSHOT\b|ForEach\([^)]*\.decks/);
});

test('unavailable actions cannot fail the home shell when toast is unavailable', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const noticeMethod = page.match(/private 显示提示\([\s\S]*?\): void \{[\s\S]*?\n  \}/);

  assert.notEqual(noticeMethod, null);
  assert.match(noticeMethod[0], /try\s*\{/);
  assert.match(noticeMethod[0], /catch\s*\(/);
  // 显示提示 必须有至少一个调用点（除声明行外）
  // 2026-07-28 清理死代码：删除了未被任何地方调用的 private 显示不可用提示() 方法，
  // 改为验证 显示提示 有多个真实业务调用点（home_load_error / create_deck_done / transfer_done 等）。
  const callMatches = page.match(/this\.显示提示\(/g) || [];
  assert.ok(callMatches.length >= 2, '显示提示 should be called from at least one caller besides its declaration');
});

test('home error state offers an in-place retry path', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const deckList = read('entry/src/main/ets/components/home/主页牌组列表.ets');
  const strings = readJson('entry/src/main/resources/base/element/string.json').string;
  const stringNames = new Set(strings.map((item) => item.name));

  assert.equal(stringNames.has('home_retry'), true, 'missing string resource: home_retry');
  // error 块挂在 主页牌组列表 积木组件里，文案用 app.string.home_retry
  assert.match(deckList, /if \(this\.加载状态 === 'error'\)/);
  assert.match(deckList, /app\.string\.home_retry/);
  // 首页.ets 把 onRetry 回调绑到 加载主页数据，确保重试触发数据重拉
  assert.match(page, /onRetry: \(\): void => \{\s*this\.加载主页数据\(\);?\s*\}/);
});

test('revised home uses a full-window toolbar without greeting or bottom navigation', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const toolbar = read('entry/src/main/ets/components/home/主页顶部工具栏.ets');

  assert.doesNotMatch(page, /app\.string\.home_title|app\.string\.home_subtitle/);
  assert.doesNotMatch(page, /bottomNavigation|bottomNavItem|sidePane|sideNavItem/);
  // 顶部工具栏按钮文案移至 主页顶部工具栏 积木组件
  // 2026-07-20 后：原设置/浏览/统计 3 按钮合并为「更多」按钮（study_more），右侧保留「创建牌组」
  assert.match(toolbar, /app\.string\.study_more/);
  assert.match(toolbar, /app\.string\.create_deck/);
  assert.match(page, /span:\s*\{\s*xs:\s*4,\s*sm:\s*5,\s*md:\s*8\s*\}/);
  assert.match(page, /span:\s*\{\s*xs:\s*0,\s*sm:\s*3,\s*md:\s*4\s*\}/);
  assert.match(page, /if\s*\(this\.当前断点 !== 'xs'\)\s*\{\s*GridCol/);
  assert.match(page,
    /\.expandSafeArea\(\[SafeAreaType\.SYSTEM\],\s*\[SafeAreaEdge\.TOP, SafeAreaEdge\.BOTTOM\]\)/);
});

test('summary pager hosts Swiper 8 pages with today progress and stats', () => {
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const summary = read('entry/src/main/ets/components/home/主页摘要分页.ets');

  // 主页摘要分页 改成 Swiper 8 页（用户决策 2026-08-15）：今日进度 + 7 统计页
  assert.match(summary, /今日摘要卡\(\{/);
  assert.match(summary, /Swiper\(\)/);
  assert.match(summary, /今日进度页/);
  assert.match(summary, /记忆率页/);
  assert.match(summary, /今日计数页/);
  assert.match(summary, /卡片状态页/);
  assert.match(summary, /小时分布页/);
  assert.match(summary, /难度分布页/);
  assert.match(summary, /间隔分布页/);
  assert.match(summary, /未来到期页/);
  assert.doesNotMatch(summary, /月历卡/);
  // 折叠功能已取消：今日摘要卡 不再接收 已折叠 / 切换展开回调
  assert.doesNotMatch(summary, /已折叠/);
  assert.doesNotMatch(summary, /切换展开回调/);
  assert.doesNotMatch(summary, /摘要折叠/);
  assert.doesNotMatch(summary, /onToggleExpand/);
  // 首页 不再保留 摘要折叠 @State、恢复摘要展开状态 方法、保存摘要展开状态 调用
  assert.doesNotMatch(page, /摘要折叠/);
  assert.doesNotMatch(page, /恢复摘要展开状态/);
  assert.doesNotMatch(page, /保存摘要展开状态/);
  assert.doesNotMatch(page, /加载摘要展开状态/);
  assert.doesNotMatch(page, /streakDays/);
});

test('hour histogram range is shared by stats page, home card and widget', () => {
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  const summary = read('entry/src/main/ets/components/home/主页摘要分页.ets');
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  const card = read('entry/src/main/ets/components/stats/小时分布卡.ets');

  // 偏好持久化：统计页切换档位保存，三处提取/渲染前加载同一偏好
  assert.match(store, /export async function 加载小时分布窗口/);
  assert.match(store, /export async function 保存小时分布窗口/);
  assert.match(store, /stats_hours_range/);
  assert.match(stats, /保存小时分布窗口\(索引\)/);
  assert.match(stats, /加载小时分布窗口\(\)/);
  // 提取按窗口取对应时间段（0=1月 1=3月 2=1年 3=全部）
  assert.match(store, /小时窗口 === 1 \? 小时源\.threeMonths/);
  assert.match(store, /小时分布窗口: 小时窗口/);
  // 统计页切换后立即推送卡片快照
  assert.match(stats, /刷新卡片快照\(\)/);
  // 首页/FSRS 控制器提取时加载窗口偏好 + 分离偏好（卡片数量口径与统计页一致）
  const home = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const fsrs = read('entry/src/main/ets/model/FSRS控制器.ets');
  assert.match(home, /提取卡片数据\(graphs, 总待学, 牌组总数, await 加载小时分布窗口\(\), await 加载分离暂停偏好\(\)\)/);
  assert.match(fsrs, /提取卡片数据\(graphs, 总待学, 牌组总数, await 加载小时分布窗口\(\), await 加载分离暂停偏好\(\)\)/);
  // 两处卡片标题跟随窗口（不再固定"全部"）
  assert.doesNotMatch(summary, /小时分布（全部）'\)/);
  assert.doesNotMatch(widget, /小时分布（全部）'\)/);
  assert.match(summary, /小时分布窗口标签\(\)/);
  assert.match(widget, /小时分布窗口标签\(\)/);
  // 小时分布卡消费统计页持有的范围，切换入口位于分区标题。
  assert.match(card, /@Prop 时间段索引: number/);
  assert.match(stats, /rangeIndex: this\.小时分布窗口/);
  // 桌面卡片：刻度数字独立成行（0/6/12/18/23），禁止与柱子同列混排（会遮挡柱子且顶高柱区）
  assert.doesNotMatch(widget, /索引 % 3 === 0/);
  // 三处小时刻度统一五等分居中：数字中心间距严格相等（贴边 Start/End 会让首尾段偏窄）
  for (const 标签 of ['0', '6', '12', '18', '23']) {
    assert.match(widget, new RegExp(`Text\\('${标签}'\\)[\\s\\S]{0,120}layoutWeight\\(1\\)[\\s\\S]{0,40}TextAlign\\.Center`));
    assert.match(card, new RegExp(`Text\\('${标签}'\\)[\\s\\S]{0,120}layoutWeight\\(1\\)[\\s\\S]{0,40}TextAlign\\.Center`));
    assert.match(summary, new RegExp(`Text\\('${标签}'\\)[\\s\\S]{0,120}layoutWeight\\(1\\)[\\s\\S]{0,40}TextAlign\\.Center`));
  }
  assert.doesNotMatch(widget, /layoutWeight\(3\)/);
  assert.doesNotMatch(card, /layoutWeight\(3\)/);
  assert.doesNotMatch(summary, /layoutWeight\(3\)/);
});

test('stats toolbar shows FSRS and the scope row holds deck and history selectors', () => {
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  const topBar = stats.split('private 顶部条()')[1].split('private 统计内容()')[0];
  const scopeRow = stats.split('// 统计口径行')[1].split('// 1. 今日计数')[0];
  assert.ok(topBar.includes('stats_page_title'));
  assert.ok(topBar.includes('stats_fsrs_enabled'));
  assert.ok(topBar.includes('stats_fsrs_disabled'));
  assert.ok(!topBar.includes('范围切换条({'));
  assert.ok(!scopeRow.includes('stats_fsrs_enabled'));
  assert.ok(scopeRow.indexOf('Select(this.牌组选项)') < scopeRow.indexOf('范围切换条({'));
  assert.ok(scopeRow.includes("new SelectStyle($r('app.color.surface_card'))"));
  assert.ok(scopeRow.includes('on天数切换(index === 1 ? 0 : 365)'));
});

test('primary pages share one shell gutter and common visual primitives', () => {
  const settingsPage = read('entry/src/main/ets/pages/设置页.ets');
  const settingsPanel = read('entry/src/main/ets/components/设置面板.ets');
  const settingsCard = read('entry/src/main/ets/components/settings/设置分组卡片.ets');
  const appearance = read('entry/src/main/ets/components/settings/外观分组.ets');
  const agentSettings = read('entry/src/main/ets/components/settings/AIAgent设置分组.ets');
  const syncSettings = read('entry/src/main/ets/components/settings/同步分组.ets');
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  const browser = read('entry/src/main/ets/pages/浏览页.ets');
  const reminders = read('entry/src/main/ets/pages/学习提醒页.ets');
  const addNote = read('entry/src/main/ets/pages/添加笔记页.ets');
  const agentPage = read('entry/src/main/ets/pages/AI制卡页.ets');

  const settingsList = settingsPanel.match(/List\(\{ space: 应用尺寸\.pageSectionGap[\s\S]*?\.scrollBar\(BarState\.Off\)/)?.[0] ?? '';
  assert.match(settingsList, /left:\s*应用尺寸\.页面内边距_水平/,
    'settings cards must align with the toolbar left gutter');
  assert.match(settingsList, /right:\s*应用尺寸\.页面内边距_水平/,
    'settings cards must align with the toolbar right gutter');
  assert.match(stats,
    /private 统计内容\(\)[\s\S]*?left: 应用尺寸\.页面内边距_水平,[\s\S]*?right: 应用尺寸\.页面内边距_水平/);
  assert.match(browser,
    /搜索框\(\{[\s\S]*?\.padding\(\{\s*left:\s*应用尺寸\.页面内边距_水平,\s*right:\s*应用尺寸\.页面内边距_水平/);
  assert.match(reminders,
    /Scroll\(\)[\s\S]*?\.padding\(\{\s*left:\s*应用尺寸\.页面内边距_水平,\s*right:\s*应用尺寸\.页面内边距_水平/);
  assert.match(addNote,
    /\.scrollBar\(BarState\.Auto\)[\s\S]*?\.padding\(\{\s*left:\s*应用尺寸\.页面内边距_水平,\s*right:\s*应用尺寸\.页面内边距_水平/);
  assert.match(agentPage,
    /private 消息流\(\)[\s\S]*?left: 应用尺寸\.页面内边距_水平,[\s\S]*?right: 应用尺寸\.页面内边距_水平/);

  assert.match(settingsPanel, /文案: \$r\('app\.string\.study_back'\)/,
    'instant-save settings must use the same back navigation wording as other pages');
  assert.match(settingsPanel,
    /文案: \$r\('app\.string\.study_back'\),\s*字色: \$r\('app\.color\.text_primary'\)/,
    'settings back action must remain neutral instead of following the selected color theme');
  assert.doesNotMatch(settingsPage, /private 顶部条\(\)/,
    'settings must not keep an unused second toolbar implementation');
  assert.match(settingsCard, /borderRadius\(16\)/,
    'settings group cards must use the same page-card radius');
  assert.match(reminders, /统一空态\(\{[\s\S]*?reminder_list_empty[\s\S]*?reminder_list_empty_hint/,
    'reminders must use the common empty-state component');

  assert.equal((appearance.match(/new SelectStyle\(\)/g) ?? []).length, 2);
  assert.match(read('entry/src/main/ets/components/settings/GeneralSettings.ets'), /new SelectStyle\(\)/);
  assert.equal((agentSettings.match(/new SelectStyle\(\)/g) ?? []).length, 3,
    'all Agent settings selects must match the other settings selects');
  assert.equal((syncSettings.match(/borderRadius\(应用尺寸\.圆角_面板\)/g) ?? []).length >= 2, true,
    'sync inputs must use the same form-field radius as Agent settings');
  assert.match(addNote, /按下态按钮\(\{[\s\S]*?app\.string\.study_back/,
    'add-note toolbar back action must use the common pressed button');
  assert.match(reminders, /统一空态/);
});

test('difficulty percent values are used as-is, never divided by 10', () => {
  // 后端 eases.rs：SM-2 键 = ease_factor/10、平均 = median/10；FSRS 键 = percent_to_bin(D×100)、平均 = median×100
  // —— 两种模式的键与平均都已是百分比，前端直接显示，不得再 /10
  const stats = read('entry/src/main/ets/components/stats/难度分布卡.ets');
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  const home = read('entry/src/main/ets/components/home/主页摘要分页.ets');
  for (const [名称, 源] of [['统计页', stats], ['桌面卡片', widget], ['首页摘要', home]]) {
    assert.doesNotMatch(源, /平均[\s\S]{0,80}\/\s*10/, `${名称}难度平均值不得再除以 10`);
  }
  assert.doesNotMatch(stats, /键\s*\/\s*10/, '难度桶标签直接用后端百分比键');
  // % 由参数携带，资源模式尾部不得再挂 %（曾致双 %% 显示）
  const strings = read('entry/src/main/resources/base/element/string.json');
  const enStrings = read('entry/src/main/resources/en_US/element/string.json');
  assert.doesNotMatch(strings, /stats_ease_average[^}]*%s%/);
  assert.doesNotMatch(enStrings, /stats_ease_average[^}]*%s%/);
});

test('graphs request days follow the persisted stats range preference, never derived from current date', () => {
  // 后端 hours 四档（近1月/3月/1年/全部）都从 days 限定的 revlog 里统计，
  // 首页/FSRS控制器曾误传 new Date().getDate()（今天是几号），导致
  // 首页摘要与桌面卡片的小时分布和统计页完全不一致。
  // 2026-08-26 起统计页顶栏「近 1 年(365)/全部(0)」本地持久化（stats_days_range），
  // 首页/FSRS控制器加载同一偏好，不再写死 365。
  const home = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const fsrs = read('entry/src/main/ets/model/FSRS控制器.ets');
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  assert.match(store, /export async function 加载统计天数/, '模型层须有统计天数加载');
  assert.match(store, /export async function 保存统计天数/, '模型层须有统计天数保存');
  assert.match(store, /stats_days_range/, '统计天数 preferences 键');
  assert.match(stats, /const days: number = await 加载统计天数\(\);[\s\S]*this\.统计天数 = days/, '统计页 aboutToAppear 恢复天数');
  assert.match(stats, /保存统计天数\(天数\)/, '统计页切换天数须持久化');
  assert.match(home, /const days: number = await 加载统计天数\(\);[\s\S]*获取图表统计\(days\)/, '首页静默加载图表须跟随统计天数偏好');
  assert.match(fsrs, /获取图表统计\(await 加载统计天数\(\)\)/, 'FSRS控制器刷新桌面卡片须跟随统计天数偏好');
  for (const [名称, 源] of [['首页', home], ['FSRS控制器', fsrs], ['统计页', stats]]) {
    assert.doesNotMatch(源, /获取图表统计\(new Date\(\)/, `${名称}禁止用日期函数派生统计天数`);
    assert.doesNotMatch(源, /获取图表统计\(365\)/, `${名称}禁止写死 365 天`);
  }
});

test('stats page load is race-guarded: stale graph responses must not overwrite newer data', () => {
  // 2026-08-28 修复：统计页快速切换牌组/天数时多个 获取图表统计 并发，
  // 慢的旧请求后完成会把 图表数据 覆盖成旧口径（与 2026-08-24 首页 加载链串行 同族）。
  // 症状：下拉框显示 A 而图表是 B 的数据；切回来显示又不同；偶发"卡在同一个界面"。
  // 修复模式：请求序号（每次加载递增，旧请求返回发现序号不匹配即丢弃）+ 请求前固化搜索串
  //（await 后重读 取搜索串() 会把单牌组数据当全库推给桌面卡片，污染首页/桌面卡片快照）。
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  assert.match(stats, /private 请求序号: number = 0/, '统计页须有请求序号字段');
  assert.match(stats, /const 本次序号: number = \+\+this\.请求序号/, '加载统计数据 开头须取本次序号');
  assert.match(stats, /const 搜索串: string = this\.取搜索串\(\)/, '搜索串须在 await 前固化');
  // 图表返回后与 catch 里都必须有序号校验（旧数据 / 旧错误都不得落地；中间可夹诊断日志行）
  assert.match(stats, /if \(本次序号 !== this\.请求序号\) \{\s*\n\s*\/\/ 等待期间已有更新的请求[\s\S]{0,200}?\n\s*return;/,
    '图表返回后须校验序号丢弃旧结果');
  assert.match(stats, /if \(本次序号 !== this\.请求序号\) \{\s*\n\s*\/\/ 旧请求的失败不作数[\s\S]{0,200}?\n\s*return;/,
    'catch 须校验序号丢弃旧错误');
  // 桌面卡片快照只按固化搜索串判定全库（禁止 await 后重读状态再 await 快照的旧 bug 形态）
  assert.match(stats, /if \(搜索串 === ''\) \{\s*\n\s*await this\.刷新卡片快照\(本次序号\)/, '快照推送须用固化搜索串并传序号');
  assert.doesNotMatch(stats, /if \(this\.取搜索串\(\) === ''\) \{\s*\n\s*await this\.刷新卡片快照/, '禁止 await 后重读 取搜索串() 判定全库');
  // 快照内部等牌组树期间也须校验序号（防旧快照覆盖新快照）
  assert.match(stats, /刷新卡片快照\(序号: number \| null = null\)/, '刷新卡片快照 须收可选序号');
  assert.match(stats, /if \(序号 !== null && 序号 !== this\.请求序号\) \{\s*\n\s*return;/, '快照落盘前须校验序号');
  // 分离复选框切换推送快照须限定全库口径（单牌组图表数据不得污染首页/桌面卡片）
  assert.match(stats, /if \(this\.取搜索串\(\) === ''\) \{\s*\n\s*this\.刷新卡片快照\(\)\.catch/, '分离切换推送快照须限定全库');
});

test('stats bar heights use fixed vp arithmetic, never template percent strings', () => {
  // 2026-08-28 修复：柱高模板字符串百分比（`${x}%`）在两级百分比链（柱格 Stack height('100%')
  // → 柱子 height(`${x}%`)）下依赖父容器实测高度。牌组快速切换重建组件树时存在父容器零尺寸帧
  //（UI 树实锤：竖条的 5 层祖先 bounds 全为 [0,0][0,0]，柱子却 44×2510px 撑满滚动视口），
  // 百分比失去基准被解析成撑满视口 → "大竖条霸屏"。
  // 修复：柱高改固定 vp 算式（柱区高度是常量：统计页 108/110、widget 50/55），纯算术零测量依赖；
  // 视觉与百分比完全等价（原百分比基准本就是这个常量）。柱宽仍 layoutWeight 自适应屏宽。
  const files = [
    'entry/src/main/ets/components/stats/预测卡.ets',
    'entry/src/main/ets/components/stats/间隔分布卡.ets',
    'entry/src/main/ets/components/stats/难度分布卡.ets',
    'entry/src/main/ets/components/stats/稳定度分布卡.ets',
    'entry/src/main/ets/components/stats/记忆率卡.ets',
    'entry/src/main/ets/components/stats/新增卡.ets',
    'entry/src/main/ets/components/stats/回答按钮卡.ets',
    'entry/src/main/ets/components/stats/复习卡.ets',
    'entry/src/main/ets/widget/pages/统计卡片.ets'
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /height\(`\$\{/, `${f} 禁止模板字符串百分比柱高（父容器零尺寸帧会霸屏）`);
  }
  // 抽查两处正确写法：vp 算式 + 柱格 Stack 固定高度
  // 2026-08-29 注：柱区已内联（原 @Builder 值传参的 域.上限 参数被固化，牌组切换后柱高不更新），
  // 柱高直接读 this.取轴()（每次渲染重新求值），断言同步改为新写法，意图不变（防百分比霸屏）。
  const review = read('entry/src/main/ets/components/stats/复习卡.ets');
  assert.match(review, /height\(柱\.成熟 \/ this\.取轴\(\)\.上限 \* this\.柱区高度\)/, '复习卡柱高须为 vp 算式');
  assert.match(review, /\.height\(this\.柱区高度\)\s*\n\s*\.layoutWeight\(1\)/, '复习卡柱格 Stack 须固定高度');
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  assert.match(widget, /Math\.max\(项\[0\] \/ Math\.max\(1, this\.小时最大值\(\)\) \* 50/, 'widget 小时柱高须为 vp 算式且防最大值除零');
});

test('stats graph cards stay reactive across deck switches: data-carrying ForEach keys and no value-passing @Builder for data UI', () => {
  // 2026-08-29 修复：统计页切换牌组后所有图表冻结在旧值。三个根因（真机实锤）：
  // 1) ForEach key 只用索引/列号：数据变 → key 集合不变 → ArkUI 判定无增删 → 柱子/格子永不重建
  // 2) @Builder 值传参（含无参 @Builder 内读 @State）的子树在组件 re-render 时不重新求值
  //    → 统计表文本/纵轴刻度/格子颜色固化在首次渲染（点击"时间"复选框后统计表仍旧值实锤）
  // 3) @Prop 直连 UI（无 @Watch+@State 链）在统计图表分区尾闭包内不触发子组件刷新
  //    → 需 @Watch 递增渲染哨兵 @State 驱动重渲染（卡片状态分布 2190 冻结实锤）
  // 契约：柱状图 ForEach key 必须含数据字段；数据 UI 内联在 build 中不进值传参 @Builder。
  const cards = [
    'entry/src/main/ets/components/stats/复习卡.ets',
    'entry/src/main/ets/components/stats/预测卡.ets',
    'entry/src/main/ets/components/stats/新增卡.ets',
    'entry/src/main/ets/components/stats/间隔分布卡.ets',
    'entry/src/main/ets/components/stats/稳定度分布卡.ets',
    'entry/src/main/ets/components/stats/记忆率卡.ets',
    'entry/src/main/ets/components/stats/难度分布卡.ets',
    'entry/src/main/ets/components/stats/小时分布卡.ets',
    'entry/src/main/ets/components/stats/日历卡.ets',
    'entry/src/main/ets/components/stats/回答按钮卡.ets'
  ];
  for (const f of cards) {
    const src = read(f);
    // 仅约束数据绑定 ForEach（数据源为 柱缓存/取数据/取行列表 等状态数据）；
    // 静态标签集（范围切换条、小时标签）key 用索引不涉数据，豁免。
    assert.doesNotMatch(src, /ForEach\(this\.柱缓存[\s\S]{0,800}?=> `\$\{索引\}`\)/,
      `${f} 柱缓存 ForEach key 禁止只用索引（数据变化柱子冻结）`);
    assert.doesNotMatch(src, /ForEach\(this\.取数据\(\)[\s\S]{0,800}?=> `\$\{索引\}`\)/,
      `${f} 取数据 ForEach key 禁止只用索引`);
    assert.doesNotMatch(src, /ForEach\(this\.取行列表\(\)[\s\S]{0,800}?=> `\$\{周期\}`\)/,
      `${f} 行列表 ForEach key 禁止只用周期（数据变化行冻结）`);
  }
  // 日历卡格子：列 ForEach key 必须含格子数量（keyGenerator 读 取格数据）
  const calendar = read('entry/src/main/ets/components/stats/日历卡.ets');
  assert.match(calendar, /=> `\$\{列\}_\$\{this\.取格数据\(列, 行\)\?\.日期 \?\? \'\'\}_\$\{this\.取格数据\(列, 行\)\?\.数量 \?\? -1\}`/,
    '日历卡格子 ForEach key 须含格子数量');
  // 抽查：复习卡 key 含全部 5 系列数据字段
  const review = read('entry/src/main/ets/components/stats/复习卡.ets');
  assert.match(review, /`\$\{索引\}_\$\{柱\.成熟\}_\$\{柱\.年轻\}_\$\{柱\.重学\}_\$\{柱\.学习\}_\$\{柱\.过滤\}`/,
    '复习卡 ForEach key 须含全部数据字段');
  // @Prop 直连卡须有 @Watch + 渲染哨兵驱动重渲染
  const counts = read('entry/src/main/ets/components/stats/卡片状态分布.ets');
  assert.match(counts, /@Prop @Watch\('数据已变'\) 卡片计数/, '卡片状态分布 @Prop 须挂 @Watch');
  assert.match(counts, /渲染指纹/, '卡片状态分布须有渲染哨兵 @State 驱动重渲染');
  const today = read('entry/src/main/ets/components/stats/今日计数卡.ets');
  assert.match(today, /@Prop @Watch\('数据已变'\) 今日数据/, '今日计数卡 @Prop 须挂 @Watch');
  assert.match(today, /渲染指纹/, '今日计数卡须有渲染哨兵 @State 驱动重渲染');
  // 复习卡统计表已内联：不得再出现值传参 统计行 @Builder
  assert.doesNotMatch(review, /private 统计行\(标签: Resource, 值: ResourceStr\)/,
    '复习卡统计表不得用值传参 @Builder（文本固化）');
});

test('widget payload stays under the 2KB form transfer limit', () => {
  // FormBindingData 跨进程传输上限约 2KB：难度桶（SM-2 键域 130~390 可上百桶）与
  // 间隔桶不截断时 JSON 超限，updateForm 静默失败，桌面卡片冻结在旧数据。
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  assert.match(store, /聚合分布桶\(难度桶数组, 20\)/, '难度桶必须聚合分箱到 ≤20 桶');
  assert.match(store, /聚合分布桶\(间隔桶数组, 20\)/, '间隔分布必须聚合分箱到 ≤20 桶（截断会丢长间隔）');
  assert.doesNotMatch(store, /间隔桶数组\.slice\(0, 20\)/, '间隔分布不得用截断');
  assert.match(store, /聚合分布桶[\s\S]*?桶宽/, '聚合分布桶函数必须存在且等宽分箱');
});

test('card counts caliber follows the separation preference across stats page, home card and widget', () => {
  // 2026-08-26 用户裁定：桌面卡片与主页摘要卡的「卡片数量」页必须与统计页同口径——
  // 跟随 GraphPreferences.cardCountsSeparateInactive（统计页图内复选框即时落库）。
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  const stats = read('entry/src/main/ets/pages/统计页.ets');
  const home = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  const fsrs = read('entry/src/main/ets/model/FSRS控制器.ets');

  // 模型层：提取卡片数据 按偏好选口径（分离=excludingInactive，不分离=includingInactive）
  assert.match(store, /分离暂停: boolean = false/, '提取卡片数据须有分离暂停参数');
  assert.match(store, /分离暂停 \? 图表数据\.cardCounts\.excludingInactive : 图表数据\.cardCounts\.includingInactive/,
    '分离偏好决定 CardCounts 口径');
  assert.match(store, /export async function 加载分离暂停偏好/, '模型层须有分离偏好加载（读后端 GraphPreferences）');
  // 统计页：切换分离复选框后立即重提卡片快照并传分离参数
  assert.match(stats, /刷新卡片快照\(\)\.catch/, '切换分离偏好须立即刷新卡片快照');
  assert.match(stats, /this\.图表偏好\.cardCountsSeparateInactive/, '刷新卡片快照须读取当前分离偏好');
  // 首页/FSRS控制器：提取时加载分离偏好
  assert.match(home, /加载分离暂停偏好\(\)/, '首页提取卡片数据须加载分离偏好');
  assert.match(fsrs, /加载分离暂停偏好\(\)/, 'FSRS控制器提取卡片数据须加载分离偏好');
});

test('home summary card and widget use Anki official chart colors from 统计色板', () => {
  // 2026-08-26 用户裁定：摘要卡/桌面卡片四张柱图与卡片状态格全部对齐 Anki 官方色板，
  // 不再用主题色（主色按钮背景）画柱；月历热力键 热力1-4 已随月历页删除，widget 不得残留。
  const summary = read('entry/src/main/ets/components/home/主页摘要分页.ets');
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  const palette = read('entry/src/main/ets/model/统计色板.ets');

  // 色板锚点存在（Anki 26.05 colorbrewer）
  assert.match(palette, /export function 取小时柱色/);
  assert.match(palette, /export function 取难度柱色/);
  assert.match(palette, /export function 取间隔柱色/);
  assert.match(palette, /export function 取预测柱色/);
  assert.match(palette, /export const 色卡片_新卡/);

  // 首页摘要卡：四张柱图按色带取 Anki 色，柱状图组件不再引用主题色
  assert.match(summary, /取小时柱色/, '摘要卡小时分布须用 Anki 蓝色带');
  assert.match(summary, /取难度柱色/, '摘要卡难度分布须用 RdYlGn');
  assert.match(summary, /取间隔柱色/, '摘要卡间隔分布须用 Anki 蓝色带');
  assert.match(summary, /取预测柱色/, '摘要卡未来到期须用 Anki 绿色带');
  const barComponent = summary.match(/struct 柱状图组件[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(barComponent, /动作主色/, '柱状图组件不得再用主题色画柱');
  // 卡片状态 7 项全显 + Anki 系列色（统计页卡片数量图恒显 7 项）
  for (const 常量 of ['色卡片_新卡', '色卡片_学习中', '色卡片_重学中', '色卡片_年轻', '色卡片_成熟', '色卡片_已暂停', '色卡片_已埋藏']) {
    assert.ok(summary.includes(常量), `摘要卡卡片状态须用 ${常量}`);
    assert.ok(widget.includes(常量), `桌面卡片卡片状态须用 ${常量}`);
  }
  assert.match(summary, /已搁置/, '摘要卡卡片状态须含已搁置（7 项与统计页一致）');

  // 桌面卡片：四张柱图用 Anki 色带，不再用主题色画柱，无热力死键
  assert.match(widget, /取小时柱色/, '桌面卡片小时分布须用 Anki 蓝色带');
  assert.match(widget, /取难度柱色/, '桌面卡片难度分布须用 RdYlGn');
  assert.match(widget, /取间隔柱色/, '桌面卡片间隔分布须用 Anki 蓝色带');
  assert.match(widget, /取预测柱色/, '桌面卡片未来到期须用 Anki 绿色带');
  assert.doesNotMatch(widget, /backgroundColor\(this\.数据\.主题色\.主色按钮背景\)/, '柱图不得再用主题色');
  assert.doesNotMatch(widget, /热力[1-4]/, 'widget 不得残留月历热力死键');
});

test('widget push falls back to running form infos when formId file is empty', () => {
  // 旧版本添加的卡片从未注册过 formId，主进程主动推送会静默跳过；
  // formId 列表为空时必须用 getPublishedRunningFormInfos 兜底（FormInfo 无 formId
  // 字段，只有 RunningFormInfo 有）并写回文件自愈。
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  assert.match(store, /ids\.length === 0[\s\S]{0,200}从系统拉取formId/, '推送前 formId 为空必须走系统兜底');
  assert.match(store, /getPublishedRunningFormInfos\(\)/, '兜底必须调用 getPublishedRunningFormInfos');
  assert.match(store, /覆盖写formId文件/, '兜底结果必须写回 formId 文件自愈');
});

test('interval graph always shows intervals; stability is a separate FSRS-only graph', () => {
  // 对齐 Anki 官方（桌面/AnkiDroid 同源 rslib）：Review Intervals 与 FSRS 无关，
  // 始终显示卡片实际间隔；Card Stability 是独立图，仅 FSRS 启用时显示。
  // 曾错误地把 stability 混入间隔分布卡（FSRS 时替换 intervals），导致统计页与卡片口径混乱。
  const interval = read('entry/src/main/ets/components/stats/间隔分布卡.ets');
  const statsPage = read('entry/src/main/ets/pages/统计页.ets');
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  assert.doesNotMatch(interval, /FSRS稳定度|是否FSRS/, '间隔分布卡不得含 FSRS 分支');
  assert.match(statsPage, /间隔分布卡\(\{[^}]*间隔数据/, '统计页间隔分布卡只接 intervals');
  assert.match(statsPage, /图表数据\.fsrs[^)]*稳定度分布卡|稳定度分布卡/, '统计页须有独立稳定度分布卡');
  assert.match(statsPage, /图表数据 !== null && this\.图表数据\.fsrs\)/, '稳定度卡仅在 FSRS 启用时渲染');
  assert.match(store, /间隔源: Intervals \| null = 图表数据\.intervals/, '卡片快照间隔分布只用 intervals');
});

test('graph preferences are in-chart controls without a modal (Anki autoSavingPrefs)', () => {
  // 对齐 Anki：官方无图表偏好弹窗——偏好控件内嵌各图、改动即时落库。
  // 统计天数保留 1 年/全部两档，通过右上角原生选择框切换。
  // 曾用集中弹窗（图表偏好面板）+ 30/90/365/全部四档，2026-08-25 用户裁定完全复刻 Anki。
  const statsPage = read('entry/src/main/ets/pages/统计页.ets');
  const counts = read('entry/src/main/ets/components/stats/卡片状态分布.ets');
  const calendar = read('entry/src/main/ets/components/stats/日历卡.ets');
  assert.equal(
    existsSync(projectUrl('entry/src/main/ets/components/stats/图表偏好面板.ets')),
    false,
    '图表偏好面板.ets 已删除（Anki 无偏好弹窗）'
  );
  assert.doesNotMatch(statsPage, /显示偏好面板|保存偏好|onBackPress/, '统计页不得残留偏好弹窗状态/方法');
  // 历史范围两档：365/0；统计口径行的选择框切换后重新请求后端。
  assert.match(statsPage, /on天数切换\(天数: number\)/, '须有顶栏天数切换');
  assert.doesNotMatch(statsPage, /显示统计范围菜单|统计范围切换菜单/);
  assert.match(statsPage, /on天数切换\(index === 1 \? 0 : 365\)/);
  const rangeMenu = read('entry/src/main/ets/components/stats/范围切换条.ets');
  assert.match(rangeMenu, /Select\(this\.options\(\)\)/);
  assert.match(rangeMenu, /MenuAlignType\.END/);
  assert.match(statsPage, /stats_history_range_year/);
  assert.match(statsPage, /stats_history_range_all/);
  // 图内偏好控件：即时写偏好（更新偏好 + 设置图表偏好）
  assert.match(statsPage, /更新偏好\(字段: \(旧: GraphPreferences\) => GraphPreferences\)/, '须有图内偏好即时落库辅助');
  assert.match(statsPage, /on分离变更/, '卡片数量分离复选框回调');
  assert.match(statsPage, /on首日变更/, '日历星期标签切周首日回调');
  // 卡片数量图内复选框（Anki CardCounts InputBox checkbox）
  assert.match(counts, /stats_counts_separate_inactive/);
  assert.match(counts, /on分离变更/);
  // 日历星期标签点击切换周首日（仅日/一/五/六，Anki calendar.ts filter 逻辑）
  assert.match(calendar, /on首日变更/);
  assert.match(calendar, /数字 !== 2 && 数字 !== 3 && 数字 !== 4/, '周二/三/四标签不可点');
});

test('forecast shows a full month of thin bars in stats page, home card and widget', () => {
  const store = read('entry/src/main/ets/model/桌面卡片数据存储.ets');
  const summary = read('entry/src/main/ets/components/home/主页摘要分页.ets');
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  const card = read('entry/src/main/ets/components/stats/预测卡.ets');

  // 数据层提取整月 30 天（0~29），缺失天补 0
  assert.match(store, /天偏移 >= 0 && 天偏移 <= 29/);
  assert.match(store, /for \(let i: number = 0; i <= 29; i\+\+\)/);
  // 桌面卡片与首页摘要：整月细条 + 今/+15/+29 刻度行（独立成行，不与柱子混排）
  // 标题与统计页统一为 Anki 官方名称（Future Due → 未来到期预测）
  assert.match(widget, /未来到期预测/);
  assert.match(summary, /未来到期预测/);
  assert.match(widget, /Text\(.*'今'.*\)[\s\S]{0,200}TextAlign\.Start/);
  assert.match(widget, /Text\('\+29'\)[\s\S]{0,200}TextAlign\.End/);
  // 首页摘要卡已本地化：今 → this.t('今', 'Today')，+29 仍为字面量
  assert.match(summary, /Text\(this\.t\('今',\s*'Today'\)\)/);
  assert.match(summary, /Text\('\+29'\)/);
  // 统计页预测卡：范围切换 + 绿色渐变（对齐 Anki FutureDue），图内积压复选框
  assert.doesNotMatch(card, /PanGesture|偏移X|柱子宽度/);
  assert.match(card, /范围索引: number = 0/);
  assert.match(card, /取预测柱色/);
  assert.match(card, /on积压变更/);
});

test('retention card single-view rows rebuild when the young/mature view switches', () => {
  // 真实保留率卡单列视图（欠熟练/已熟练）的行内容依赖 视图索引，但 ForEach key
  // 只含周期时，同分支内切换视图 key 不变 → ArkUI 复用旧行不重算 → 两视图显示
  // 同一批数字（先点的冻结）。key 必须包含视图索引；此前仅靠「周期」还曾因
  // 数值 key 冲突吞行（见 decisions 2026-08-25），两者都要在 key 里。
  const card = read('entry/src/main/ets/components/stats/真实保留率卡.ets');
  const singleView = card.match(/private 渲染单列表[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(singleView, /周期\}_\$\{this\.视图索引\}/, '单列视图 ForEach key 必须含视图索引');
  assert.doesNotMatch(singleView, /\)\s*=>\s*`\$\{行\.周期\}`/, 'key 不得只有周期（同分支切换视图会冻结旧行）');
});

test('home UI uses shared dimension tokens instead of magic numbers', () => {
  const dimensPath = 'entry/src/main/ets/utils/应用尺寸.ets';
  assert.equal(existsSync(projectUrl(dimensPath)), true, `${dimensPath} must exist`);

  const dimens = read(dimensPath);
  assert.match(dimens, /export class 应用尺寸/);

  const files = [
    'entry/src/main/ets/pages/首页.ets',
    'entry/src/main/ets/components/今日摘要卡.ets',
    'entry/src/main/ets/components/月历卡.ets',
    'entry/src/main/ets/components/牌组列表项.ets',
    'entry/src/main/ets/components/牌组详情面板.ets',
    'entry/src/main/ets/components/开始学习按钮.ets',
    'entry/src/main/ets/components/许可证面板.ets'
  ];
  for (const file of files) {
    assert.equal(existsSync(projectUrl(file)), true, `${file} must exist`);
    const source = read(file);
    assert.match(source, /应用尺寸/, `${file} must use 应用尺寸`);
    assert.doesNotMatch(source, /\.fontSize\(\d/, `${file} must not hardcode fontSize`);
    assert.doesNotMatch(source, /\.borderRadius\(\d/, `${file} must not hardcode borderRadius`);
  }
});

test('theme settings persist three modes and synchronize system bars', () => {
  const settingsPath = 'entry/src/main/ets/model/主题设置.ets';
  const storePath = 'entry/src/main/ets/model/主题存储.ets';
  const controllerPath = 'entry/src/main/ets/utils/主题控制器.ets';
  const panelPath = 'entry/src/main/ets/components/设置面板.ets';

  for (const path of [settingsPath, storePath, controllerPath, panelPath]) {
    assert.equal(existsSync(projectUrl(path)), true, `${path} must exist`);
  }

  const settings = read(settingsPath);
  const store = read(storePath);
  const controller = read(controllerPath);
  const ability = read('entry/src/main/ets/entryability/EntryAbility.ets');
  const page = (read('entry/src/main/ets/pages/首页.ets') + read('entry/src/main/ets/backend/HomeDataRepository.ets'));
  assert.match(settings, /'system'\s*\|\s*'light'\s*\|\s*'dark'/);
  assert.match(store, /preferences\.getPreferences/);
  assert.match(controller, /setColorMode/);
  assert.match(controller, /setWindowSystemBarProperties/);
  assert.match(controller, /statusBarColor/);
  assert.match(controller, /navigationBarColor/);
  assert.match(controller, /isStatusBarLightIcon/);
  assert.match(controller, /isNavigationBarLightIcon/);
  assert.match(ability, /systemDarkMode/);
  assert.match(ability, /abilityContext/);
  assert.match(page, /AppStorage\.setOrCreate<主题模式>\('themeMode'/);
  assert.match(ability, /AppStorage\.get<string>\('themeMode'\)/);
  assert.match(ability, /const isDark: boolean = this\.effectiveDarkMode\(\);\s*应用颜色主题\(theme, isDark\)/);
  // 色板和系统栏的一致性由 theme-configuration 运行真实回调验证。
});

test('settings directory keeps full-screen navigation and existing about content', () => {
  // 2026-08-15：设置页从模态弹窗改为全屏独立页面，移除遮罩色背景、88% 宽度与 maxWidth:480 模态约束。
  // 顶部条改用页面底色背景 + 状态栏高度 padding，模态遮罩色() 辅助方法保留供其他场景调用。
  const panelPath = 'entry/src/main/ets/components/设置面板.ets';
  assert.equal(existsSync(projectUrl(panelPath)), true, `${panelPath} must exist`);

  const panel = read(panelPath);
  assert.match(panel, /Stack\(\)/);
  // 内容 List 挂滚动器：openAiSettings 跳转进来时 scrollToIndex 直接定位到 AI 智能体分组
  assert.match(panel, /List\(\{ space: 应用尺寸\.pageSectionGap, scroller: this\.内容滚动器 \}\)/);




  assert.match(panel, /app\.string\.feedback_email/);
  assert.match(panel, /app\.media\.sponsor_qrcode/);
  assert.match(panel, /主题模式/);
});

test('jidecards synchronizes system bars after content loads', () => {
  const ability = read('entry/src/main/ets/entryability/EntryAbility.ets');
  const loadCallback = ability.match(/loadContent\('pages\/首页',[\s\S]*?\n    \}\);/)?.[0] ?? '';

  assert.match(loadCallback, /应用系统栏样式/);
});

test('calendar model builds a 5-or-6-week heat map based on actual month layout', () => {
  const calendarPath = 'entry/src/main/ets/model/日历模型.ets';
  assert.equal(existsSync(projectUrl(calendarPath)), true, `${calendarPath} must exist`);

  const calendar = read(calendarPath);
  assert.match(calendar, /export interface 日历单日/);
  assert.match(calendar, /export interface 月历数据/);
  // 旧实现固定 42 格（6 行），某些月份多空行 + 卡片高度溢出；改为动态 5/6 行：
  // 月历最大周数=6 上限、日历列数=7 每行 7 格；周数 由 leading+days 决定。
  assert.match(calendar, /const 月历最大周数:\s*number\s*=\s*6/);
  assert.match(calendar, /const 日历列数:\s*number\s*=\s*7/);
  assert.match(calendar, /周数:\s*number/);
  assert.match(calendar, /Math\.ceil\(总格数 \/ 日历列数\)/);
  assert.match(calendar,
    /export function 构建月历\(当前时间: Date, 按日期复习次数: Map<string, number>\): 月历数据/);
  assert.match(calendar, /热力强度:/);
  assert.doesNotMatch(calendar, /demoIntensity|Math\.random/);
});
