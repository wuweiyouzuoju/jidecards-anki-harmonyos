// SPDX-License-Identifier: AGPL-3.0-or-later
export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const paragraphs = items => (items ?? []).map(item => `<p>${esc(item)}</p>`).join('\n');
export const questions = items => `<dl class="questions">${items.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}${item.example ? `<p class="example">可以这样说：“${esc(item.example)}”</p>` : ''}</dd></div>`).join('\n')}</dl>`;
export const arrow = '<span aria-hidden="true">↗</span>';
export const icon = kind => {
  const shapes = {
    review: '<path d="M4 8a8 8 0 1 1-1 8M4 3v5h5"/><path d="M12 7v5l3 2"/>',
    cards: '<rect x="7" y="3" width="14" height="16" rx="3"/><path d="M3 7v11a3 3 0 0 0 3 3h11M11 8h6M11 12h4"/>',
    sync: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    package: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7 6l9 5"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6Z"/><path d="M7 8h.01M12 6h.01M17 8h.01M6 13h.01"/>'
  };
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind] ?? shapes.cards}</svg>`;
};

export function createLayout(content) {
  const { data, work, guide, origin, assets, repositories } = content;
  const author = data.author;
  const repo = work.repository;
  const repoLinks = repositories.map(item => `<a href="${esc(item.url)}">${esc(item.name)} ${arrow}</a>`).join('');
  const sourceLink = (file, label) => `<a href="${esc(repo)}/blob/main/${esc(file)}">${esc(label)} ${arrow}</a>`;
  const logo = (className, size, alt = '记得闪卡 Logo') => `<img class="${className}" src="${size <= 38 ? content.logoSmallPreview : content.logoPreview}" data-full-src="${work.brand.logo}?v=${assets.logo}" alt="${esc(alt)}" width="${size}" height="${size}" loading="lazy" decoding="async" fetchpriority="low">`;
  const download = `<div class="actions"><a class="button" href="${esc(work.marketplace.url)}">免费下载 ${arrow}</a><a class="button secondary" href="${esc(repo)}">查看源码 ${arrow}</a></div><p class="download-meta">源码 ${esc(work.sourceVersion)} · 应用市场 ${esc(work.releaseVersion)} · ${esc(work.platform)} · 华为应用市场搜索「记得闪卡」，下载版本以市场页面为准</p>`;
  const application = {
    '@type': 'SoftwareApplication', '@id': `${origin}/#app`, name: work.name, alternateName: work.alternateName,
    url: work.url, operatingSystem: work.platform, applicationCategory: 'EducationalApplication',
    softwareVersion: work.releaseVersion, description: work.summary, author: { '@id': `${origin}/#author` },
    publisher: { '@id': `${origin}/#author` }, sameAs: [work.marketplace.url],
    subjectOf: { '@id': `${origin}/#source` },
    downloadUrl: work.marketplace.url, installUrl: work.marketplace.url,
    image: `${origin}${work.brand.logo}`, screenshot: work.screenshots.map(item => ({ '@type': 'ImageObject', url: `${origin}${item.path}`, caption: item.caption, description: item.description, width: item.width, height: item.height })),
    isAccessibleForFree: work.marketplace.price === 0,
    offers: { '@type': 'Offer', price: work.marketplace.price, priceCurrency: work.marketplace.priceCurrency, url: work.marketplace.url },
    featureList: work.features, license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html'
  };
  const sourceCode = {
    '@type': 'SoftwareSourceCode', '@id': `${origin}/#source`, name: 'jidecards', url: repo,
    version: work.sourceVersion, dateModified: work.sourceUpdate.updatedAt,
    author: { '@id': `${origin}/#author` }, publisher: { '@id': `${origin}/#author` },
    targetProduct: { '@id': application['@id'] },
    codeRepository: repositories.map(item => item.url), sameAs: work.repositoryMirrors.map(item => item.url),
    programmingLanguage: ['ArkTS', 'Rust', 'C++'], license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html'
  };
  const website = {
    '@type': 'WebSite', '@id': `${origin}/#website`, name: '记得闪卡 · jidecards', url: origin,
    publisher: { '@id': `${origin}/#author` }, about: { '@id': application['@id'] }, inLanguage: 'zh-CN'
  };
  const nav = [['/works/jidecards/', '功能与下载'], [guide.pathname, '使用指南'], ['/releases/', '更新说明'], ['/developers/', '开发'], ['/about/', '关于']];
  function page({ title, description, pathname, body, graph = [], noindex = false, breadcrumbTitle = title, ogType = 'website', markdown = null, className = '' }) {
    const navLinks = nav.map(([url, label]) => `<a href="${url}"${url === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    const trail = pathname === '/' || noindex ? [] : [{ name: '首页', url: `${origin}/` }, { name: breadcrumbTitle, url: `${origin}${pathname}` }];
    const breadcrumb = trail.length ? [{ '@type': 'BreadcrumbList', itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })) }] : [];
    const heroImage = work.screenshots[0];
    const structured = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Person', '@id': `${origin}/#author`, name: author.name, url: author.url, sameAs: [author.github], jobTitle: '独立开发者' },
      { '@type': 'CreativeWork', '@id': `${origin}/#project`, name: '记得闪卡项目', url: origin, creator: { '@id': `${origin}/#author` }, description: work.developmentStatement, sameAs: repositories.map(item => item.url), image: { '@type': 'ImageObject', url: `${origin}${work.brand.logo}`, width: work.brand.width, height: work.brand.height } },
      website, application, sourceCode,
      { '@type': 'WebPage', '@id': `${origin}${pathname}#webpage`, url: `${origin}${pathname}`, name: title, description, inLanguage: 'zh-CN', isPartOf: { '@id': website['@id'] }, about: { '@id': application['@id'] } },
      ...graph, ...breadcrumb
    ] };
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(author.name)}">
  <meta name="robots" content="${noindex ? 'noindex' : 'index, follow, max-image-preview:large'}">
  <meta name="theme-color" content="#f8f9ff">
  <link rel="canonical" href="${origin}${pathname}">
  <link rel="icon" href="/favicon.ico?v=${assets.logo}" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=${assets.logo}">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=${assets.logo}">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${assets.logo}">
  <link rel="stylesheet" href="/styles.css?v=${assets.css}">
  <link rel="alternate" type="text/plain" href="/llms-full.txt" title="完整项目资料">
  ${markdown ? `<link rel="alternate" type="text/markdown" href="${markdown}" title="本页 Markdown">` : ''}
  <link rel="alternate" type="application/atom+xml" href="/releases.xml" title="版本更新订阅">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="记得闪卡 · jidecards">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${origin}${pathname}">
  <meta property="og:image" content="${origin}${heroImage.path}">
  <meta property="og:image:width" content="${heroImage.width}">
  <meta property="og:image:height" content="${heroImage.height}">
  <script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>
  <noscript><style>.deferred-media { display: none; }</style></noscript>
</head>
<body>
  <a class="skip-link" href="#content">跳到正文</a>
  <header class="site-header"><nav class="nav shell" aria-label="主导航">
    <a class="brand" href="/">${logo('brand-logo', 38)}<span><strong>记得闪卡</strong><small>jidecards</small></span></a>
    <div class="nav-links">${navLinks}</div>
    <a class="nav-source" href="${esc(repo)}">GitHub ${arrow}</a>
    <details class="mobile-nav"><summary aria-label="展开导航"><span aria-hidden="true">☰</span><span>菜单</span></summary><div>${navLinks}<a href="${esc(repo)}">GitHub ${arrow}</a></div></details>
  </nav></header>
  <main id="content" class="shell ${className}">${trail.length ? `<nav class="breadcrumb" aria-label="面包屑"><a href="/">首页</a><span aria-hidden="true">/</span><span>${esc(breadcrumbTitle)}</span></nav>` : ''}${body}</main>
  <footer class="footer"><div class="shell"><div class="footer-grid">
    <div class="footer-brand"><a class="brand" href="/">${logo('brand-logo', 38)}<span><strong>记得闪卡</strong><small>${esc(work.brand.headline.join(''))}</small></span></a><p>${esc(work.platform)} 原生开源闪卡应用。</p><p>源码 ${esc(work.sourceVersion)} · ${esc(work.license)}</p></div>
    <nav aria-label="产品与文档"><h2>产品与文档</h2><a href="/works/jidecards/#download">免费下载</a><a href="/works/jidecards/">功能介绍</a><a href="${guide.pathname}">使用指南</a><a href="/releases/">更新说明</a></nav>
    <nav aria-label="开源项目"><h2>开源项目</h2>${repoLinks}<a href="/developers/">开发文档</a><a href="${esc(repo)}/issues">问题反馈 ${arrow}</a></nav>
    <nav aria-label="机器可读资料"><h2>机器可读资料</h2><a href="/llms.txt">llms.txt · 索引</a><a href="/llms-full.txt">llms-full.txt · 完整资料</a><a href="/data/site-index.json">页面与内容 JSON</a><a href="/data/works.json">产品数据 JSON</a><a href="/sitemap.xml">网站地图</a></nav>
  </div><div class="footer-bottom"><p>由 <a href="/about/">${esc(author.name)}</a> 独立开发与维护 · <a href="/about/#independent-development">独立开发声明</a> · 非 Anki 官方客户端。</p><a href="/releases.xml">订阅版本更新 ${arrow}</a></div></div></footer>
  <script type="module" src="/assets/site-media.mjs?v=${assets.media}"></script>
</body>
</html>
`;
  }
  return { page, logo, download, repoLinks, sourceLink };
}
