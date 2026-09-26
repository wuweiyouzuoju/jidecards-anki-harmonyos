import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readHosting = (relativePath) => readFile(path.join(repoRoot, 'hosting', relativePath), 'utf8');
const siteOrigin = 'https://jidecards.com';

test('homepage exposes the portfolio identity without JavaScript', async () => {
  const html = await readHosting('index.html');
  const homepageTitle = '记得闪卡（jidecards）｜HarmonyOS NEXT 开源闪卡应用';

  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const text of ['无为又作局', '记得闪卡', 'HarmonyOS NEXT', 'Anki']) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, new RegExp(`<title>${homepageTitle}<\\/title>`));
  assert.match(html, new RegExp(`<meta property="og:title" content="${homepageTitle}">`));
  assert.match(html, /<h1[^>]*>记得闪卡<\/h1>/);
  assert.match(html, /记得闪卡（jidecards）是面向 <strong>HarmonyOS NEXT<\/strong> 的原生闪卡应用/);
  for (let index = 1; index <= 4; index += 1) {
    const image = String(index).padStart(2, '0');
    assert.match(html, new RegExp(`<img[^>]+src="/assets/app-preview-${image}\\.png"[^>]+alt="[^"]+"`));
  }
  assert.match(html, /<link rel="canonical" href="https:\/\/jidecards\.com\/">/);
  assert.match(html, /href="\/works\/jidecards\/"/);
  assert.match(html, /"@type":\s*"Person"/);
  assert.match(html, /"@type":\s*"WebSite"/);
  assert.doesNotMatch(html, /<script(?![^>]+type="application\/ld\+json")/);
});

test('jidecards page publishes one complete and versioned work record', async () => {
  const html = await readHosting('works/jidecards/index.html');

  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/jidecards\.com\/works\/jidecards\/">/);
  for (const text of [
    '2.0.0',
    '3.0.0',
    'AI 制卡',
    'AI 改卡',
    'FSRS',
    'AnkiWeb',
    '导入与导出',
    '桌面服务卡片',
    'ArkUI',
    'AGPL-3.0-or-later',
    '与 Ankitects、AnkiWeb、AnkiDroid 无关'
  ]) {
    assert.match(html, new RegExp(text));
  }
  for (let index = 1; index <= 4; index += 1) {
    const image = String(index).padStart(2, '0');
    assert.match(html, new RegExp(`<img[^>]+src="/assets/app-preview-${image}\\.png"[^>]+alt="[^"]+"`));
  }
  assert.match(html, /https:\/\/github\.com\/wuweiyouzuoju\/jidecards-anki-harmonyos/);
  assert.match(html, /"@type":\s*"SoftwareApplication"/);
  assert.match(html, /"@type":\s*"SoftwareSourceCode"/);
  assert.match(html, /开发版已完成，正式发布前仍需完成实体手机重点回归/);
  assert.doesNotMatch(html, /<script(?![^>]+type="application\/ld\+json")/);
});

test('machine-readable work data matches the visible version facts', async () => {
  const data = JSON.parse(await readHosting('data/works.json'));

  assert.equal(data.schemaVersion, 1);
  assert.equal(data.author.name, '无为又作局');
  assert.equal(data.works.length, 1);
  assert.deepEqual(data.works[0], {
    slug: 'jidecards',
    name: '记得闪卡',
    alternateName: 'jidecards',
    summary: '记得闪卡（jidecards）是面向 HarmonyOS NEXT 的开源闪卡应用，复用 Anki 学习内核，支持 FSRS、AnkiWeb、数据导入导出和应用内 AI 功能。',
    platform: 'HarmonyOS NEXT',
    license: 'AGPL-3.0-or-later',
    releaseVersion: '2.0.0',
    developmentVersion: '3.0.0',
    developmentPriority: '项目优先服务 Agent 开发',
    url: 'https://jidecards.com/works/jidecards/',
    repository: 'https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos',
    features: ['ArkUI 原生界面', 'Anki Rust 后端', 'FSRS 间隔重复', 'AnkiWeb 同步', 'AI 制卡与 AI 改卡', '导入导出与媒体维护']
  });
});

test('crawler discovery files expose the canonical public pages', async () => {
  const [robots, sitemap, llms, llmsFull] = await Promise.all([
    readHosting('robots.txt'),
    readHosting('sitemap.xml'),
    readHosting('llms.txt'),
    readHosting('llms-full.txt')
  ]);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/jidecards\.com\/sitemap\.xml$/m);

  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, [
    `${siteOrigin}/`,
    `${siteOrigin}/works/jidecards/`,
    `${siteOrigin}/about/`
  ]);

  for (const content of [llms, llmsFull]) {
    for (const text of ['无为又作局', '记得闪卡', 'HarmonyOS NEXT', '原生', '开源', 'Anki', '2.0.0', '3.0.0', 'Agent 开发', `${siteOrigin}/works/jidecards/`]) {
      assert.match(content, new RegExp(text));
    }
    assert.doesNotMatch(content, /jideyanggeqi\.cn|超/);
  }
});

test('about and not-found pages stay readable without required scripts', async () => {
  const [about, notFound] = await Promise.all([
    readHosting('about/index.html'),
    readHosting('404.html')
  ]);

  assert.match(about, /无为又作局/);
  assert.match(about, /https:\/\/github\.com\/wuweiyouzuoju/);
  assert.match(notFound, /content="noindex"/);
  assert.match(notFound, /href="\/"/);
  assert.doesNotMatch(about, /<script(?![^>]+type="application\/ld\+json")/);
  assert.doesNotMatch(notFound, /<script/);
});

test('public site never publishes the superseded author name', async () => {
  const hostingRoot = path.join(repoRoot, 'hosting');
  const entries = await readdir(hostingRoot, { recursive: true, withFileTypes: true });
  const textFiles = entries.filter((entry) => entry.isFile() && /\.(?:html|json|txt|xml)$/.test(entry.name));

  for (const entry of textFiles) {
    const content = await readFile(path.join(entry.parentPath, entry.name), 'utf8');
    assert.doesNotMatch(content, /无谓又左/, path.relative(hostingRoot, path.join(entry.parentPath, entry.name)));
  }
});

test('every root-relative page asset and link resolves inside hosting', async () => {
  const hostingRoot = path.join(repoRoot, 'hosting');
  const entries = await readdir(hostingRoot, { recursive: true, withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.join(entry.parentPath, entry.name));

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const references = [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map((match) => match[1]);
    for (const reference of references) {
      const relativePath = reference === '/'
        ? 'index.html'
        : reference.endsWith('/')
          ? `${reference.slice(1)}index.html`
          : reference.slice(1);
      await assert.doesNotReject(
        access(path.join(hostingRoot, relativePath)),
        `${path.relative(repoRoot, htmlFile)} references missing ${reference}`
      );
    }
  }
});

test('application hosting JSON contracts remain intact', async () => {
  const [announcement, cloudDecks] = await Promise.all([
    readHosting('announcement.json').then(JSON.parse),
    readHosting('cloud-decks.json').then(JSON.parse)
  ]);

  assert.equal(announcement.schemaVersion, 1);
  assert.equal(cloudDecks.schemaVersion, 1);
  assert.ok(Array.isArray(cloudDecks.decks));
});

test('deployment guide covers Cloudflare deployment and endpoint verification', async () => {
  const guide = await readFile(path.join(repoRoot, 'docs', 'site-deployment.md'), 'utf8');

  for (const text of ['jidecards.com', 'Cloudflare', 'wrangler deploy', 'robots.txt', 'curl', 'sitemap.xml', 'CLOUDFLARE_API_TOKEN']) {
    assert.match(guide, new RegExp(text));
  }
});

test('public site keeps the canonical domain and avoids exaggerated copy', async () => {
  const hostingRoot = path.join(repoRoot, 'hosting');
  const entries = await readdir(hostingRoot, { recursive: true, withFileTypes: true });
  const textFiles = entries.filter((entry) => entry.isFile() && /\.(?:html|json|txt|xml|jsonc)$/.test(entry.name));

  for (const entry of textFiles) {
    const content = await readFile(path.join(entry.parentPath, entry.name), 'utf8');
    assert.doesNotMatch(content, /jideyanggeqi\.cn/);
    assert.doesNotMatch(content, /超/);
  }
});
