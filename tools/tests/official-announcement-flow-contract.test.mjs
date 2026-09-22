import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('announcement acknowledgements use one bounded Preferences record', () => {
  const source = read('../../entry/src/main/ets/model/官方公告存储.ets');
  assert.match(source, /official_announcement_acknowledged_ids_v1/);
  assert.match(source, /读取已确认官方公告ID列表\(\): Promise<string\[\]>/);
  assert.match(source, /是否已确认官方公告\(id: string\): Promise<boolean>/);
  assert.match(source, /标记已确认官方公告\(id: string\): Promise<boolean>/);
  assert.match(source, /追加已确认官方公告ID/);
  assert.match(source, /await store\.flush\(\);\s*return true;/);
  assert.match(source, /catch \(error\) \{\s*return false;/);
});

test('announcement hosting has one public URL and no management credential', () => {
  const source = read('../../entry/src/main/ets/model/官方公告配置.ts');
  assert.match(source, /https:\/\/4001784660\.cdn\.123clouddisk\.com\/4001784660\/CET%E5%9B%9B%E5%85%AD%E7%BA%A7\/announcement\.json/);
  assert.doesNotMatch(source, /(clientSecret|clientID|accessToken|refreshToken|password|管理密钥)/i);
});

test('announcement service performs one uncached GET under a hard two-second deadline', () => {
  const source = read('../../entry/src/main/ets/backend/官方公告服务.ets');
  assert.match(source, /from '@kit\.NetworkKit'/);
  assert.match(source, /构建官方公告请求地址/);
  assert.match(source, /http\.RequestMethod\.GET/);
  assert.match(source, /http\.HttpDataType\.STRING/);
  assert.match(source, /usingCache: false/);
  assert.match(source, /connectTimeout: 2000/);
  assert.match(source, /readTimeout: 2000/);
  assert.match(source, /官方公告截止剩余毫秒/);
  assert.match(source, /Promise\.race/);
  assert.match(source, /setTimeout\(/);
  assert.match(source, /clearTimeout\(timerId\);[\s\S]*?client\.destroy\(\);/);
  assert.match(source, /解析可展示官方公告/);
  assert.doesNotMatch(source, /retry|ClientSecret|accessToken/i);
});

test('announcement modal is native, themed, scrollable and non-dismissible', () => {
  const source = read('../../entry/src/main/ets/components/官方公告弹窗.ets');
  assert.match(source, /官方公告展示项/);
  assert.match(source, /announcement\.title/);
  assert.match(source, /announcement\.content/);
  assert.match(source, /official_announcement_published_at/);
  assert.match(source, /official_announcement_acknowledge/);
  assert.match(source, /official_announcement_details/);
  assert.match(source, /onAcknowledge/);
  assert.match(source, /onOpenDetails/);
  assert.match(source, /backgroundBlurStyle\(BlurStyle\.Thin/);
  assert.match(source, /取全屏转场/);
  assert.match(source, /edgeEffect\(EdgeEffect\.Spring\)/);
  assert.doesNotMatch(source, /Web\(|RichText\(|onClose|\.onClick\(\(\) => this\.onAcknowledge/);
});

test('announcement fixed strings are aligned and translated', () => {
  const zh = JSON.parse(read('../../entry/src/main/resources/base/element/string.json')).string;
  const en = JSON.parse(read('../../entry/src/main/resources/en_US/element/string.json')).string;
  const zhMap = new Map(zh.map((item) => [item.name, item.value]));
  const enMap = new Map(en.map((item) => [item.name, item.value]));
  const keys = [
    'official_announcement_published_at',
    'official_announcement_acknowledge',
    'official_announcement_details',
    'official_announcement_open_failed',
    'official_announcement_save_failed',
  ];
  for (const key of keys) {
    assert.ok(zhMap.has(key));
    assert.ok(enMap.has(key));
    assert.doesNotMatch(enMap.get(key), /[\u3400-\u9fff]/);
  }
});

test('home wires announcement service, acknowledgment and presentation', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /官方公告服务实例/);
  assert.match(source, /bundleManager\.getBundleInfoForSelf/);
  assert.match(source, /当前语言模式\(\)/);
  assert.match(source, /是否已确认官方公告/);
  assert.match(source, /标记已确认官方公告/);
  assert.match(source, /if \(this\.显示官方公告\) \{\s*return true;/);
  assert.match(source, /onAcknowledge:[\s\S]*确认官方公告\(\)/);
  assert.match(source, /onOpenDetails:[\s\S]*打开官方公告详情\(\)/);
});

test('home coordinates one delayed ten-minute announcement check without polling', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /官方公告检查延迟毫秒/);
  assert.match(source, /private 上次官方公告检查开始时间: number = 0/);
  assert.match(source, /private 官方公告检查中: boolean = false/);
  assert.match(source, /private 官方公告延迟检查任务: number = -1/);
  assert.match(source, /private 主页允许公告检查: boolean = true/);
  assert.match(source, /private 主页公告检查已激活: boolean = false/);
  assert.match(source, /announcementController: HomeAnnouncementController/);
  assert.match(source, /private 请求主页官方公告检查\(\): void/);
  assert.match(source, /官方公告检查延迟毫秒\(this\.上次官方公告检查开始时间, Date\.now\(\)\)/);
  assert.match(source, /this\.官方公告延迟检查任务 = setTimeout/);
  assert.match(source, /clearTimeout\(this\.官方公告延迟检查任务\)/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test('every real home return enters the shared refresh and announcement path', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /onPageShow\(\): void \{\s*this\.返回主页后刷新\(\);/);
  assert.match(source, /onPageHide\(\): void \{\s*this\.暂停主页官方公告检查\(\);/);
  assert.match(source, /name: 'StudyPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'StatsPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'SettingsPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.match(source, /name: 'ReminderPage'[\s\S]*?onPop:[\s\S]*?返回主页后刷新/);
  assert.ok((source.match(/this\.返回主页后刷新\(\)/g) ?? []).length >= 8);
});

test('acknowledgement suppresses the same id immediately in the current process', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  assert.match(source, /announcementController: HomeAnnouncementController/);
  const load = source.match(/private async 尝试显示官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(load, /announcementController\.check/);
  const acknowledge = source.match(/private async 确认官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(acknowledge, /announcementController\.confirm\(id\)/);
  assert.ok(acknowledge.indexOf('announcementController.confirm(id)') <
    acknowledge.indexOf('await 标记已确认官方公告(id)'));
});

test('home closes and continues even when acknowledgement persistence fails', () => {
  const source = read('../../entry/src/main/ets/pages/首页.ets');
  const method = source.match(/private async 确认官方公告\(\)[\s\S]*?\n  private /)?.[0] ?? '';
  assert.match(method, /await 标记已确认官方公告/);
  assert.match(method, /official_announcement_save_failed/);
  assert.match(method, /this\.显示官方公告 = false/);
  assert.match(method, /await this\.继续首次弹窗序列\(\)/);
});

test('hosted announcement manifest publishes the v2.7.9 release notice under 5 KiB', () => {
  const text = read('../../hosting/announcement.json');
  const manifest = JSON.parse(text);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.announcement.enabled, true);
  assert.equal(manifest.announcement.id, '20260922-v2.7.9-release');
  assert.equal(manifest.announcement.titleZh, '记得闪卡 v2.7.9 更新');
  assert.equal(manifest.announcement.titleEn, "What's new in jidecards v2.7.9");
  assert.match(manifest.announcement.contentZh, /自动同步/);
  assert.match(manifest.announcement.contentZh, /外部 APKG/);
  assert.match(manifest.announcement.contentZh, /联网搜索当前未开放/);
  assert.match(manifest.announcement.contentEn, /automatic sync/);
  assert.match(manifest.announcement.contentEn, /external APKG/);
  assert.match(manifest.announcement.contentEn, /web search is currently disabled/);
  assert.equal(manifest.announcement.minimumAppVersion, '2.7.9');
  assert.equal(manifest.announcement.maximumAppVersion, '2.7.9');
  assert.equal(manifest.announcement.actionUrl, '');
  assert.ok(Buffer.byteLength(text, 'utf8') <= 5 * 1024);
});

test('hosting guide requires one stable file path and ten-minute CDN cache rotation', () => {
  const guide = read('../../docs/official-announcement-hosting.md');
  assert.match(guide, /实际生成的 HTTPS 长链/);
  assert.match(guide, /删除旧文件，再上传同名的新文件/);
  assert.match(guide, /百分号路径编码/);
  assert.match(guide, /查询参数仅保留用于诊断/);
  assert.match(guide, /10 分钟/);
  assert.match(guide, /5 KiB/);
  assert.match(guide, /不得.*自行拼接/);
});
