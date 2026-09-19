import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('cloud deck hosting has one replaceable catalog URL and no management credential', () => {
  const source = read('../../entry/src/main/ets/model/云端牌组配置.ts');
  assert.match(source, /云端牌组目录地址/);
  assert.match(
    source,
    /export const 云端牌组目录地址: string =\s*\n?\s*'https:\/\/4001784660\.cdn\.123clouddisk\.com\/4001784660\/CET%E5%9B%9B%E5%85%AD%E7%BA%A7\/cloud-decks\.json'/,
  );
  assert.doesNotMatch(source, /(accessKey|secretKey|clientSecret|管理密钥)/i);
});

test('first-launch cloud deck onboarding is persisted independently and quota is one-shot per install', () => {
  const source = read('../../entry/src/main/ets/model/云端牌组引导存储.ets');
  assert.match(source, /cloud_deck_required_onboarding_completed_v1/);
  assert.doesNotMatch(source, /cloud_deck_onboarding_completed_v1/);
  assert.match(source, /是否已完成云端牌组引导/);
  assert.match(source, /标记已完成云端牌组引导/);
  assert.match(source, /标记已完成云端牌组引导\(\): Promise<boolean>/);
  // 下载配额：一台安装只要成功导入 ≥1 个直链牌组即视为用尽，引导与菜单入口一并收口。
  assert.match(source, /cloud_deck_download_quota_used_v1/);
  assert.match(source, /是否已用尽云端牌组下载配额/);
  assert.match(source, /标记已用尽云端牌组下载配额\(\): Promise<boolean>/);
  // 引导完成与配额用尽任一为真即不再展示引导。
  assert.match(source, /读取标记\(引导完成键\) \|\| await 读取标记\(下载配额已用尽键\)/);
  assert.match(source, /await store\.flush\(\);\s*return true;/);
  assert.match(source, /catch \(error\) \{\s*return false;/);
  assert.match(source, /preferences\.getPreferences/);
  assert.match(source, /\.flush\(\)/);
});

test('cloud deck service fetches a small HTTPS catalog through NetworkKit', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /from '@kit\.NetworkKit'/);
  assert.match(source, /http\.createHttp\(\)/);
  assert.match(source, /http\.RequestMethod\.GET/);
  assert.match(source, /http\.HttpDataType\.STRING/);
  assert.match(source, /responseCode/);
  assert.match(source, /解析云端牌组目录/);
  assert.match(source, /https:\\\/\\\//);
  assert.match(source, /destroy\(\)/);
});

test('cloud deck service streams APKG files to a sandbox directory with progress and cleanup', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /from '@kit\.BasicServicesKit'/);
  assert.match(source, /request\.agent\.create/);
  assert.match(source, /request\.agent\.Action\.DOWNLOAD/);
  assert.match(source, /request\.agent\.Mode\.FOREGROUND/);
  assert.match(source, /cloud-decks/);
  assert.match(source, /saveas:/);
  assert.match(source, /task\.on\('progress'/);
  assert.match(source, /task\.on\('completed'/);
  assert.match(source, /task\.on\('failed'/);
  assert.match(source, /statSync/);
  assert.match(source, /readSync/);
  assert.match(source, /unlinkSync/);
  assert.doesNotMatch(source, /!\/\\\.apkg\(\?:\[\?\#\]\|\$\)\/i\.test\(deck\.downloadUrl\)/);
});

test('cloud deck service stages downloads and removes interrupted private files', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /const partPath: string = `\$\{downloadDir\}\/\$\{safeId\}\.part`/);
  assert.match(source, /saveas: partPath/);
  assert.match(source, /校验下载文件\(partPath, deck\.size\)/);
  assert.match(source, /fs\.renameSync\(partPath, outputPath\)/);
  assert.match(source, /清理残留下载\(filesDir: string\): void/);
  assert.match(source, /name\.endsWith\('\.part'\)/);
  assert.match(source, /name\.endsWith\('\.apkg'\)/);
});

test('cloud deck service cannot strand a download promise when listener cleanup throws', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /try\s*\{\s*task\.off\('progress'/);
  assert.match(source, /try\s*\{\s*task\.off\('completed'/);
  assert.match(source, /try\s*\{\s*task\.off\('failed'/);
});

test('cloud deck service settles and cleans up a foreground task when the system pauses it', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /task\.on\('pause', pauseCallback\)/);
  assert.match(source, /task\.off\('pause', pauseCallback\)/);
  const pauseBody = source.match(/const pauseCallback\s*=\s*\([^)]*\): void =>\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(pauseBody, 'pause callback body should exist');
  assert.ok(pauseBody[1].indexOf('fail(') < pauseBody[1].indexOf('removeTask('),
    'the promise must settle before task cleanup can throw');
  assert.doesNotMatch(pauseBody[1], /progressCallback\(/);
  assert.match(source, /const removeTask[\s\S]*try\s*\{[\s\S]*request\.agent\.remove/);
  assert.match(source, /request\.agent\.remove\(task\.tid\)/);
});

test('cloud deck service times out waiting or retrying tasks that make no byte progress', () => {
  const source = read('../../entry/src/main/ets/backend/云端牌组服务.ets');
  assert.match(source, /云端牌组无进度超时毫秒/);
  assert.match(source, /setTimeout\(/);
  assert.match(source, /clearTimeout\(/);
  assert.match(source, /progress\.processed > lastProcessed/);
  assert.match(source, /长时间无下载进度/);
  assert.match(source, /request\.agent\.remove\(task\.tid\)/);
});

test('cloud deck modal presents selectable public decks, locked future decks and download progress', () => {
  const source = read('../../entry/src/main/ets/components/云端牌组弹窗.ets');
  assert.match(source, /云端牌组目录项/);
  assert.match(source, /selectedIds/);
  assert.match(source, /accessType === 'public'/);
  assert.match(source, /ToggleType\.Checkbox/);
  assert.match(source, /cloud_deck_locked_badge/);
  assert.match(source, /cloud_deck_loading/);
  assert.match(source, /cloud_deck_empty/);
  assert.match(source, /cloud_deck_retry/);
  assert.match(source, /ProgressType\.Linear/);
  assert.match(source, /onDownload/);
  assert.match(source, /onEnter/);
  assert.match(source, /onCopyQQGroup/);
  assert.match(source, /deck\.cardCount/);
  assert.match(source, /cloud_deck_enter/);
  assert.match(source, /cloud_deck_qq_group_entry/);
  assert.match(source, /maxHeight: '72%'/);
  assert.doesNotMatch(source, /maxHeight: '88%'/);
  assert.match(source, /backgroundBlurStyle\(BlurStyle\.Thin/);
  // 双态契约：引导态提供「稍后再说」，菜单态主按钮退化为「关闭」，首次说明只在引导态出现。
  assert.match(source, /cloud_deck_skip/);
  assert.match(source, /从菜单打开: boolean = false/);
  assert.match(source, /onSkip/);
  assert.match(source, /if \(!this\.从菜单打开\) \{/);
  // 文案去重（用户反馈）：引导态 message 已含单机/直链说明，reopen_hint 不再渲染；
  // 菜单重开态只显示 offline_notice，两个说明互斥不叠加。
  assert.doesNotMatch(source, /cloud_deck_reopen_hint/);
  assert.match(source, /cloud_deck_offline_notice/);
  assert.doesNotMatch(source, /cloud_deck_manual_message/);
  assert.doesNotMatch(source, /^  onClose:/m);
  assert.match(source, /onClose: \(\): void => \{ this\.触发主按钮\(\); \}/);
});

test('each cloud deck tap uses exactly one toggle path', () => {
  const source = read('../../entry/src/main/ets/components/云端牌组弹窗.ets');
  const rowBuilder = source.match(/private 牌组行[\s\S]*?\n  build\(\)/)?.[0] ?? '';
  assert.match(rowBuilder, /hitTestBehavior\(HitTestMode\.None\)/);
  assert.doesNotMatch(rowBuilder, /\.onChange\(/);
  assert.equal((rowBuilder.match(/this\.onToggle\(deck\.id\)/g) ?? []).length, 1);
});

test('home limits the initial cloud deck selection to three before downloading', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /const 云端牌组最多选择数量: number = 3;/);

  const toggleMethod = source.match(
    /private 切换云端牌组选择\(deckId: string\): void \{[\s\S]*?private 展开新导入牌组/,
  )?.[0] ?? '';
  assert.match(toggleMethod, /if \(index >= 0\)[\s\S]*return;/);
  assert.match(toggleMethod,
    /云端牌组选中ID列表\.length >= 云端牌组最多选择数量[\s\S]*cloud_deck_selection_limit[\s\S]*return;[\s\S]*concat\(\[deckId\]\)/);

  const downloadMethod = source.match(
    /private async 下载选中云端牌组\(\): Promise<void> \{[\s\S]*?private async 从选择器导入牌组/,
  )?.[0] ?? '';
  assert.match(downloadMethod,
    /云端牌组选中ID列表\.length > 云端牌组最多选择数量[\s\S]*cloud_deck_selection_limit[\s\S]*return;/);
});

test('cloud deck and import source strings are aligned and translated', () => {
  const zh = JSON.parse(read('../../entry/src/main/resources/base/element/string.json')).string;
  const en = JSON.parse(read('../../entry/src/main/resources/en_US/element/string.json')).string;
  const zhMap = new Map(zh.map((item) => [item.name, item.value]));
  const enMap = new Map(en.map((item) => [item.name, item.value]));
  const required = [
    'cloud_deck_title', 'cloud_deck_loading', 'cloud_deck_not_configured',
    'cloud_deck_empty', 'cloud_deck_retry', 'cloud_deck_download',
    'cloud_deck_locked_badge', 'cloud_deck_status_success', 'cloud_deck_status_failed',
    'cloud_deck_enter', 'cloud_deck_meta_cards', 'cloud_deck_meta_cards_unknown_size',
    'cloud_deck_qq_group_entry', 'cloud_deck_qq_copy_failed', 'cloud_deck_selection_limit',
    'cloud_deck_skip', 'cloud_deck_menu_entry', 'cloud_deck_offline_notice',
    'cloud_deck_reopen_hint', 'cloud_deck_skip_confirm_title', 'cloud_deck_skip_confirm_message',
    'cloud_deck_install_partial', 'cloud_deck_install_complete', 'cloud_deck_save_failed',
  ];
  for (const key of required) {
    assert.ok(zhMap.has(key), `missing base key ${key}`);
    assert.ok(enMap.has(key), `missing en_US key ${key}`);
    assert.doesNotMatch(enMap.get(key), /[\u3400-\u9fff]/, `${key} is not translated`);
  }
  assert.equal(
    zhMap.get('cloud_deck_title'),
    '获取你的牌组',
  );
  assert.equal(zhMap.get('cloud_deck_onboarding_message'),
    '首次进入牌组至少选择 1 个、最多选择 3 个。下载后将自动导入，本次选择机会仅有一次，请按需选择。'
    + '可以选择稍后再说，之后从右上角「新建牌组」菜单里的「获取直链牌组」再次打开该界面。\n'
    + '本项目属单机应用，牌组内容来自第三方直链获取。');
  assert.equal(zhMap.get('cloud_deck_qq_group_entry'),
    '更多牌组文件可前往官方 QQ 群 %s 免费下载（点击复制）');
  assert.equal(zhMap.get('cloud_deck_selection_limit'), '最多只能选择 %d 个牌组');
  assert.doesNotMatch(enMap.get('cloud_deck_onboarding_message'), /安装|导入|牌组|QQ群/);
  assert.deepEqual([...zhMap.keys()].sort(), [...enMap.keys()].sort());
});

test('later Import Deck directly opens the local picker and exposes no cloud route', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.doesNotMatch(source, /导入来源弹窗/);
  assert.doesNotMatch(source, /显示导入来源弹窗/);
  assert.doesNotMatch(source, /onCloud/);
  assert.match(source, /导入牌组回调:[\s\S]*this\.从选择器导入牌组\(\)/);
  assert.match(source, /选取数据文件\(context, \['\.apkg'\]\)/);
});

test('home sequences the dismissible-with-confirmation cloud onboarding before welcome', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /是否已完成云端牌组引导/);
  assert.match(source, /显示首次弹窗序列/);
  assert.match(source, /打开云端牌组弹窗\(false\)/);
  assert.match(source, /标记已完成云端牌组引导/);
  assert.match(source, /显示欢迎弹窗一次\(\)/);
  // 返回键与主按钮同一出口：不再无条件吞掉返回。
  assert.match(source, /if \(this\.显示云端牌组弹窗\) \{/);
  assert.match(source, /云端牌组弹窗按主按钮出口\(\);/);
  assert.doesNotMatch(source, /if \(this\.显示云端牌组弹窗\) \{\s*return true;/);
  // 引导态跳过必须二次确认；确认后持久化完成标记，但不消耗下载配额。
  assert.match(source, /private async 跳过云端牌组引导/);
  assert.match(source, /cloud_deck_skip_confirm_title/);
  const skipMethod = source.match(/private async 跳过云端牌组引导\(\): Promise<void> \{[\s\S]*?\n  private 取本地化文本/)?.[0] ?? '';
  assert.match(
    skipMethod,
    /if \(result\.index !== 1\)[\s\S]*const 已保存: boolean = await 标记已完成云端牌组引导\(\)/,
  );
  assert.match(skipMethod, /if \(!已保存\)[\s\S]*cloud_deck_save_failed/);
  assert.doesNotMatch(skipMethod, /标记已用尽云端牌组下载配额/);
  assert.doesNotMatch(source, /关闭云端牌组弹窗/);
});

test('home reopens the cloud deck modal from the deck menu until the download quota is spent', () => {
  const homeSource = read('../../entry/src/main/ets/pages/首页.ets');
  const menuSource = read('../../entry/src/main/ets/components/主页操作面板.ets');
  // 菜单第 5 项按配额显隐，入口回调以菜单态打开弹窗。
  assert.match(menuSource, /显示获取直链牌组: boolean = true/);
  assert.match(menuSource, /cloud_deck_menu_entry/);
  assert.match(homeSource, /显示获取直链牌组: !this\.云端牌组配额已用尽/);
  assert.match(homeSource, /this\.打开云端牌组弹窗\(true\);/);
  // 冷启动同步配额状态；批次结束只要 ≥1 个成功即锁死配额。
  assert.match(homeSource, /this\.刷新云端牌组配额状态\(\)/);
  assert.match(homeSource, /标记已用尽云端牌组下载配额\(\)/);
  // 下载成功关闭弹窗后两态都刷新首页，欢迎弹窗只在引导态衔接。
  const finishMethod = homeSource.match(
    /private async 完成云端牌组首次引导\(\): Promise<void> \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(finishMethod, /this\.返回主页后刷新\(\);/);
  assert.match(finishMethod, /if \(!this\.云端牌组从菜单打开\) \{/);
});

test('home downloads and imports selected cloud decks sequentially through the existing backend', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /cloudImportController\.run/);
  assert.match(source, /this\.云端牌组服务实例\.下载牌组/);
  assert.match(source, /await 执行牌组导入\(path\)/);
  assert.match(source, /await this\.加载主页数据\(\)/);
  assert.match(source, /展开新导入牌组/);
  assert.match(source, /successIds/);
  assert.match(source, /failedIds/);
});

test('home cleans interrupted files before catalog loading and only completes after a successful import', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  const downloadMethod = source.match(/private async 下载选中云端牌组\(\)[\s\S]*?\n  private async 从选择器导入牌组/)?.[0] ?? '';
  assert.doesNotMatch(downloadMethod, /标记已完成云端牌组引导/);
  assert.match(source, /云端牌组服务实例\.清理残留下载\(context\.filesDir\)/);
  assert.match(source, /private async 完成云端牌组首次引导\(\): Promise<void>/);
  assert.match(source, /if \(this\.云端牌组成功ID列表\.length === 0/);
  assert.match(source, /const 已保存: boolean = await 标记已完成云端牌组引导\(\)/);
  assert.match(source, /if \(!已保存\)/);
  assert.match(source, /this\.显示云端牌组弹窗 = false/);
  assert.match(source, /onEnter:[\s\S]*完成云端牌组首次引导\(\)/);
});

test('home owns QQ group clipboard copy and wires it to the cloud deck modal', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /from '@kit\.BasicServicesKit'/);
  assert.match(source, /private async 复制云端牌组QQ群号\(\): Promise<void>/);
  assert.match(source, /pasteboard\.createData\(pasteboard\.MIMETYPE_TEXT_PLAIN, groupNumber\)/);
  assert.match(source, /onCopyQQGroup:[\s\S]*复制云端牌组QQ群号\(\)/);
});

test('cloud deck retries preserve earlier successful imports and select only failures', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  const downloadMethod = source.match(/private async 下载选中云端牌组\(\)[\s\S]*?\n  private async 从选择器导入牌组/)?.[0] ?? '';
  assert.match(downloadMethod, /const successIds: string\[\] = result\.successIds/);
  assert.match(downloadMethod, /selectedDecks, this\.云端牌组成功ID列表, backend/);
  assert.match(downloadMethod, /this\.云端牌组选中ID列表 = failedIds\.concat\(\[\]\)/);
});

test('home enters automatically after every selected cloud deck imports successfully', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  const downloadMethod = source.match(/private async 下载选中云端牌组\(\)[\s\S]*?\n  private async 从选择器导入牌组/)?.[0] ?? '';
  assert.match(downloadMethod,
    /this\.云端牌组忙碌 = false;[\s\S]*if \(failedIds\.length === 0 && successIds\.length > 0\) \{\s*await this\.完成云端牌组首次引导\(\);/);
});
