import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, 'hosting', file), 'utf8');
const pages = ['index.html', 'works/jidecards/index.html', 'guides/harmonyos-anki/index.html', 'developers/index.html', 'about/index.html', '404.html'];
const data = JSON.parse(await read('data/works.json'));
const work = data.works[0];

test('public pages expose readable content and valid structured data without client scripts', async () => {
  for (const file of pages) {
    const html = await read(file);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, file);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<main id="content"/);
    assert.ok(html.includes(data.author.name));
    assert.doesNotMatch(html, /<script(?![^>]*type="application\/ld\+json")/);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const structured = JSON.parse(json);
      assert.equal(structured['@context'], 'https://schema.org');
      assert.equal(structured['@graph'][0].name, data.author.name);
    }
  }
});

test('release facts stay consistent across human and machine entry points', async () => {
  for (const file of ['index.html', 'works/jidecards/index.html', 'llms.txt', 'llms-full.txt']) {
    const content = await read(file);
    assert.ok(content.includes(work.releaseVersion), file);
    assert.ok(content.includes(work.promotion.title), file);
    assert.ok(content.includes(data.author.name), file);
  }
  for (const file of [...pages, 'data/works.json', 'llms.txt', 'llms-full.txt']) {
    assert.doesNotMatch(await read(file), /无为又作局|无谓又左|2\.0\.0|3\.0\.0|jideyanggeqi\.cn|超/, file);
  }
});

test('home offers separate entry points while development policy stays on its own page', async () => {
  const home = await read('index.html');
  for (const destination of [work.marketplace.url, work.repository, '/works/jidecards/', '/developers/', '/about/']) {
    assert.ok(home.includes(`href="${destination.replaceAll('&', '&amp;')}"`), destination);
  }
  assert.doesNotMatch(home, /项目优先服务|Agent-first|Agent 开发/);
  assert.match(await read('developers/index.html'), /项目优先服务 Agent 开发/);
});

test('internal links, fragments, and images have published destinations', async () => {
  for (const file of pages) {
    const html = await read(file);
    for (const [, href] of html.matchAll(/(?:href|src)="([/#][^"]*)"/g)) {
      const url = new URL(href, `https://jidecards.com/${file}`);
      const destination = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
      await access(path.join(root, 'hosting', destination));
      if (url.hash) assert.ok((await read(destination)).includes(`id="${url.hash.slice(1)}"`), `${file}: ${href}`);
    }
    for (const [, tag] of html.matchAll(/(<img\b[^>]+>)/g)) {
      assert.match(tag, /alt="[^"]+"/);
      assert.match(tag, /width="\d+"/);
      assert.match(tag, /height="\d+"/);
    }
  }
});

test('crawler files include every canonical public page', async () => {
  const robots = await read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/jidecards\.com\/sitemap\.xml$/m);
  const sitemap = await read('sitemap.xml');
  for (const route of ['/', '/works/jidecards/', '/guides/harmonyos-anki/', '/developers/', '/about/']) {
    assert.ok(sitemap.includes(`<loc>https://jidecards.com${route}</loc>`));
  }
  assert.match(await read('404.html'), /content="noindex"/);
});

test('software facts and visible breadcrumbs agree with canonical page destinations', async () => {
  for (const file of pages.filter(file => file !== '404.html')) {
    const html = await read(file);
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
    assert.ok(canonical.startsWith('https://jidecards.com/'));
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    const application = graph.find(item => item['@type'] === 'SoftwareApplication');
    if (application) {
      assert.equal(application.offers.price, work.marketplace.price);
      assert.equal(application.offers.url, work.marketplace.url);
      assert.equal(application.downloadUrl, work.marketplace.url);
      assert.equal(application.operatingSystem, work.platform);
      assert.ok(html.includes('免费下载'));
      assert.equal(application.aggregateRating, undefined);
    }
    if (file !== 'index.html') {
      const trail = graph.find(item => item['@type'] === 'BreadcrumbList').itemListElement;
      assert.deepEqual(trail.map(item => item.position), [1, 2]);
      assert.equal(trail.at(-1).item, canonical);
      assert.match(html, /aria-label="面包屑"/);
    }
  }
});

test('guide and restored product details are discoverable with matching human and machine content', async () => {
  const guide = JSON.parse(await read('data/harmonyos-anki-guide.json'));
  const product = await read('works/jidecards/index.html');
  const article = await read('guides/harmonyos-anki/index.html');
  const fullText = await read('llms-full.txt');
  assert.ok((await read('index.html')).includes(`href="${guide.pathname}"`));
  assert.ok(!(await read('index.html')).includes(guide.intro), 'long guide must remain off the home body');
  assert.ok(product.includes(`href="${guide.pathname}"`));
  for (const section of [...work.detailSections, ...guide.sections]) {
    assert.ok(fullText.includes(section.title));
    const html = work.detailSections.includes(section) ? product : article;
    assert.ok(html.includes(`id="${section.id}"`));
    assert.ok(html.includes(section.title));
  }
  assert.ok(article.includes('全量下载：以云端集合替换本机集合'));
  assert.ok(article.includes('全量上传：以本机集合替换云端集合'));
  assert.ok(article.includes('https://docs.ankiweb.net/syncing.html'));
  assert.match(article, /"@type":"TechArticle"/);
});

test('existing app data endpoints retain their contracts', async () => {
  const announcement = JSON.parse(await read('announcement.json'));
  const cloudDecks = JSON.parse(await read('cloud-decks.json'));
  assert.equal(announcement.schemaVersion, 1);
  assert.equal(cloudDecks.schemaVersion, 1);
  assert.ok(Array.isArray(cloudDecks.decks));
});
