import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import JSON5 from 'json5';
import { createHash } from 'node:crypto';
import { deferMedia } from '../../hosting/assets/site-media.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, 'hosting', file), 'utf8');
const pages = ['index.html', 'works/jidecards/index.html', 'guides/harmonyos-anki/index.html', 'releases/index.html', 'developers/index.html', 'about/index.html', '404.html'];
const data = JSON.parse(await read('data/works.json'));
const work = data.works[0];
const mediaHash = createHash('sha256').update(await read('assets/site-media.mjs')).digest('hex').slice(0, 12);
const assertImageOnlyScript = html => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attributes]) => !attributes.includes('type="application/ld+json"'));
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][1], ` type="module" src="/assets/site-media.mjs?v=${mediaHash}"`);
  assert.equal(scripts[0][2], '');
};

test('public pages expose static content and structured data with only an optional image script', async () => {
  for (const file of pages) {
    const html = await read(file);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, file);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<main id="content"/);
    assert.ok(html.includes(data.author.name));
    assertImageOnlyScript(html);
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
    assert.doesNotMatch(await read(file), /无为又作局|无谓又左|2\.0\.0|3\.0\.0|2\.9\.6|jideyanggeqi\.cn|超/, file);
  }
});

test('source updates match application metadata and remain separate from marketplace facts', async () => {
  const { app } = JSON5.parse(await readFile(path.join(root, 'AppScope/app.json5'), 'utf8'));
  assert.equal(work.sourceVersion, app.versionName);
  assert.equal(work.sourceVersionCode, app.versionCode);
  for (const file of ['index.html', 'works/jidecards/index.html', 'llms.txt', 'llms-full.txt']) {
    assert.ok((await read(file)).includes(work.sourceVersion), file);
  }
  const product = await read('works/jidecards/index.html');
  const fullText = await read('llms-full.txt');
  for (const change of work.sourceUpdate.changes) {
    assert.ok(product.includes(change));
    assert.ok(fullText.includes(change));
  }
  const graph = JSON.parse(product.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  assert.equal(graph.find(item => item['@type'] === 'SoftwareApplication').softwareVersion, work.releaseVersion);
  assert.equal(graph.find(item => item['@type'] === 'SoftwareSourceCode').version, work.sourceVersion);
  assert.ok(product.includes(`正式版 ${work.releaseVersion}`));
  assert.ok(work.releaseVersionSource.includes('作者'));
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
  for (const route of ['/', '/works/jidecards/', '/guides/harmonyos-anki/', '/releases/', '/developers/', '/about/']) {
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

test('every page resolves the same application, source, author and project identities', async () => {
  const repositories = [work.repository, ...work.repositoryMirrors.map(item => item.url)];
  for (const file of pages) {
    const html = await read(file);
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    const identities = graph.filter(item => item['@id']).map(item => item['@id']);
    assert.equal(new Set(identities).size, identities.length, `${file}: duplicate identity`);
    const app = graph.find(item => item['@type'] === 'SoftwareApplication');
    const source = graph.find(item => item['@type'] === 'SoftwareSourceCode');
    const project = graph.find(item => item['@type'] === 'Organization');
    const website = graph.find(item => item['@type'] === 'WebSite');
    const page = graph.find(item => item['@type'] === 'WebPage');
    assert.equal(app.name, work.name);
    assert.equal(app.alternateName, work.alternateName);
    assert.equal(app.url, work.url);
    assert.equal(app.softwareVersion, work.releaseVersion);
    assert.deepEqual(app.sameAs, [work.marketplace.url]);
    assert.equal(app.subjectOf['@id'], source['@id']);
    assert.equal(source.targetProduct['@id'], app['@id']);
    assert.equal(source.url, work.repository);
    assert.deepEqual(source.codeRepository, repositories);
    assert.deepEqual(source.sameAs, work.repositoryMirrors.map(item => item.url));
    assert.deepEqual(project.sameAs, repositories);
    assert.equal(source.author['@id'], app.author['@id']);
    assert.equal(source.publisher['@id'], project['@id']);
    assert.equal(app.publisher['@id'], project['@id']);
    assert.equal(website.about['@id'], app['@id']);
    assert.equal(page.url, canonical);
    assert.equal(page.isPartOf['@id'], website['@id']);
    assert.equal(page.about['@id'], app['@id']);
    const checkReferences = value => {
      if (!value || typeof value !== 'object') return;
      if (Object.keys(value).length === 1 && value['@id']) {
        assert.ok(identities.includes(value['@id']), `${file}: unresolved ${value['@id']}`);
      }
      for (const child of Object.values(value)) checkReferences(child);
    };
    checkReferences(graph);
  }
});

test('existing app data endpoints retain their contracts', async () => {
  const announcement = JSON.parse(await read('announcement.json'));
  const cloudDecks = JSON.parse(await read('cloud-decks.json'));
  assert.equal(announcement.schemaVersion, 1);
  assert.equal(cloudDecks.schemaVersion, 1);
  assert.ok(Array.isArray(cloudDecks.decks));
});

test('shared navigation and home expose the real application logo with fresh asset keys', async () => {
  const actual = await readFile(path.join(root, 'hosting', work.brand.logo));
  const expected = await readFile(path.join(root, 'AppScope/resources/base/media/app_icon.png'));
  assert.deepEqual(actual, expected);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const cssHash = digest(await readFile(path.join(root, 'hosting/styles.css')));
  const logoHash = digest(actual);
  const preview = await readFile(path.join(root, 'hosting/favicon-32x32.png'));
  for (const file of pages) {
    const html = await read(file);
    assert.ok(html.includes(`data-full-src="${work.brand.logo}?v=${logoHash}"`), file);
    assert.ok(html.includes(`src="data:image/png;base64,${preview.toString('base64')}"`), file);
    assert.ok(html.includes(`/styles.css?v=${cssHash}`), file);
    assert.match(html, /<img class="brand-logo"[^>]+alt="记得闪卡 Logo"/);
  }
  assert.match(await read('index.html'), /<img class="hero-logo"[^>]+alt="记得闪卡应用 Logo"/);
  const largePreview = await readFile(path.join(root, 'hosting/apple-touch-icon.png'));
  assert.ok((await read('index.html')).includes(`class="hero-logo" src="data:image/png;base64,${largePreview.toString('base64')}"`));
});

test('author-supplied current media replace retired screenshots in HTML, metadata and AI text', async () => {
  const product = await read('works/jidecards/index.html');
  const markdown = await read('content/product.md');
  const full = await read('llms-full.txt');
  for (const item of work.screenshots) {
    const bytes = await readFile(path.join(root, 'hosting', item.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(item.releaseVersion, work.releaseVersion);
    assert.equal(bytes.readUInt32BE(16), item.width);
    assert.equal(bytes.readUInt32BE(20), item.height);
    for (const source of [product, markdown, full]) {
      assert.ok(source.includes(item.path));
      assert.ok(source.includes(item.description));
    }
  }
  for (const file of [...pages, 'data/works.json', 'llms.txt', 'llms-full.txt', 'content/product.md']) {
    assert.doesNotMatch(await read(file), /assets\/app-(?:preview|deck|study|statistics|settings|reminders|introduction)/, file);
  }
  assert.match(await read('.assetsignore'), /assets\/app-\*\.png/);
});

test('HTML, per-page Markdown, llms and JSON share complete crawlable content', async () => {
  const index = JSON.parse(await read('data/site-index.json'));
  assert.equal(index.releaseVersion, work.releaseVersion);
  assert.equal(index.contentLanguage, 'zh-CN');
  const llms = await read('llms.txt');
  const full = await read('llms-full.txt');
  const sitemap = await read('sitemap.xml');
  assert.deepEqual(index.pages.map(item => item.path).sort(), pages.filter(file => file !== '404.html').map(file => `/${file.replace(/index\.html$/, '')}`).sort());
  for (const item of index.pages) {
    const html = await read(`${item.path.slice(1)}index.html`);
    const markdown = await read(item.markdown.slice(1));
    assert.ok(llms.includes(item.markdownUrl));
    assert.ok(sitemap.includes(item.url));
    assert.match(markdown, /^# /);
    assert.ok(html.includes(`type="text/markdown" href="${item.markdown}"`));
    assertImageOnlyScript(html);
  }
  for (const item of work.detailSections) {
    for (const paragraph of [...item.paragraphs, ...(item.availability ? [item.availability] : [])]) {
      assert.ok(full.includes(paragraph));
      assert.ok((await read('content/product.md')).includes(paragraph));
    }
  }
  const guide = JSON.parse(await read('data/harmonyos-anki-guide.json'));
  for (const section of guide.sections) {
    for (const paragraph of [...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.after ?? [])]) {
      assert.ok(full.includes(paragraph));
      assert.ok((await read('content/harmonyos-anki-guide.md')).includes(paragraph));
    }
  }
});

test('release pages and Atom contain every numbered note and preserve the existing update anchor', async () => {
  const release = await read('releases/index.html');
  const markdown = await read('content/releases.md');
  const feed = await read('releases.xml');
  const product = await read('works/jidecards/index.html');
  assert.ok(product.includes('id="source-update"'));
  assert.match(release, /<ol class="release-list">/);
  assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  for (const [index, change] of work.sourceUpdate.changes.entries()) {
    assert.ok(release.includes(change));
    assert.ok(markdown.includes(`${index + 1}. ${change}`));
    assert.ok(feed.includes(change));
  }
});

test('posters use fixed-size inline placeholders and offer full images without JavaScript', async () => {
  const product = await read('works/jidecards/index.html');
  assert.match(product, /<noscript><style>\.deferred-media \{ display: none; \}<\/style><\/noscript>/);
  for (const item of work.screenshots) {
    const tag = [...product.matchAll(/<img\b[^>]+>/g)].map(([tag]) => tag).find(tag => tag.includes(`data-full-src="${item.path}"`));
    assert.match(tag, /src="data:image\/svg\+xml,/);
    assert.match(tag, /loading="lazy" decoding="async" fetchpriority="low"/);
    const svg = decodeURIComponent(tag.match(/src="data:image\/svg\+xml,([^"]+)"/)[1]);
    assert.ok(svg.includes(`width="${item.width}" height="${item.height}"`));
    assert.ok(product.includes(`<noscript><img src="${item.path}"`));
    assert.ok(product.includes(`href="${item.path}"`));
  }
});

function mediaHarness({ observer = true, count = 2 } = {}) {
  const frames = [];
  const requests = [];
  const images = Array.from({ length: count }, (_, index) => {
    const attributes = new Map([['src', `preview-${index}`], ['data-full-src', `full-${index}`]]);
    let errorHandler;
    return {
      getAttribute: name => attributes.get(name), hasAttribute: name => attributes.has(name),
      removeAttribute: name => attributes.delete(name),
      addEventListener(name, callback, options) { assert.equal(name, 'error'); assert.equal(options.once, true); errorHandler = callback; },
      fail() { const callback = errorHandler; errorHandler = undefined; callback?.(); },
      set src(value) { attributes.set('src', value); requests.push(value); }
    };
  });
  let instance;
  const view = { requestAnimationFrame: callback => frames.push(callback) };
  if (observer) view.IntersectionObserver = class {
    observed = new Set();
    disconnected = false;
    constructor(callback, options) { this.notify = callback; this.options = options; instance = this; }
    observe(image) { this.observed.add(image); }
    unobserve(image) { this.observed.delete(image); }
    disconnect() { this.disconnected = true; }
  };
  deferMedia(view, { querySelectorAll(selector) { assert.equal(selector, 'img[data-full-src]'); return images; } });
  return { images, requests, frames, frame: () => frames.shift()(), get observer() { return instance; } };
}

test('full images wait for a painted frame and only load near the viewport', () => {
  const harness = mediaHarness();
  assert.deepEqual(harness.requests, []);
  assert.equal(harness.observer, undefined);
  harness.frame();
  assert.equal(harness.observer, undefined);
  assert.deepEqual(harness.requests, []);
  harness.frame();
  assert.deepEqual(harness.requests, []);
  assert.equal(harness.observer.options.rootMargin, '200px 0px');
  harness.observer.notify([{ target: harness.images[0], isIntersecting: false }]);
  assert.deepEqual(harness.requests, []);
  harness.observer.notify([{ target: harness.images[0], isIntersecting: true }]);
  assert.deepEqual(harness.requests, ['full-0']);
  assert.equal(harness.observer.observed.has(harness.images[0]), false);
  assert.equal(harness.observer.observed.has(harness.images[1]), true);
  harness.observer.notify([{ target: harness.images[0], isIntersecting: true }, { target: harness.images[1], isIntersecting: true }]);
  assert.deepEqual(harness.requests, ['full-0', 'full-1']);
  assert.equal(harness.observer.disconnected, true);
});

test('failed image downloads restore the inline preview', () => {
  const harness = mediaHarness({ count: 1 });
  harness.frame(); harness.frame();
  harness.observer.notify([{ target: harness.images[0], isIntersecting: true }]);
  harness.images[0].fail(); harness.images[0].fail();
  assert.deepEqual(harness.requests, ['full-0', 'preview-0']);
});

test('older browsers defer source assignment until after the first painted frame', () => {
  const harness = mediaHarness({ observer: false });
  assert.deepEqual(harness.requests, []);
  harness.frame();
  assert.deepEqual(harness.requests, []);
  harness.frame();
  assert.deepEqual(harness.requests, ['full-0', 'full-1']);
});

test('pages without deferred media do not schedule image work', () => {
  assert.deepEqual(mediaHarness({ count: 0 }).frames, []);
});
