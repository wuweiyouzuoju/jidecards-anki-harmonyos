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
  assert.match(source, /this\.transferSession\.execute/);
  assert.match(read('../../entry/src/main/ets/backend/AnkiDataTransfer.ets'), /选取数据文件\(this\.context\(\), \['\.apkg'\]\)/);
});
