// SPDX-License-Identifier: AGPL-3.0-or-later
// Public facts live in hosting/data/works.json; generated pages need no browser JavaScript.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hosting = path.join(root, 'hosting');
const data = JSON.parse(await readFile(path.join(hosting, 'data/works.json'), 'utf8'));
const guide = JSON.parse(await readFile(path.join(hosting, 'data/harmonyos-anki-guide.json'), 'utf8'));
const work = data.works[0];
const author = data.author;
const origin = 'https://jidecards.com';
const repo = work.repository;
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const repositories = [{ name: 'GitHub', url: repo }, ...work.repositoryMirrors];
const repositoryLinks = repositories.map(repository => `<a href="${esc(repository.url)}">${esc(repository.name)}</a>`).join(' · ');
const sourceLink = (file, label) => `<a href="${esc(repo)}/blob/main/${esc(file)}">${esc(label)}</a>`;
const nav = [ ['/works/jidecards/#download', '下载'], ['/works/jidecards/', '功能'], [guide.pathname, '指南'], ['/developers/', '开发'], ['/about/', '作者'] ];
const person = { '@type': 'Person', '@id': `${origin}/#author`, name: author.name, url: author.url, sameAs: [author.github] };
const application = {
  '@type': 'SoftwareApplication', '@id': `${origin}/#app`, name: work.name, alternateName: work.alternateName,
  url: work.url, operatingSystem: work.platform, applicationCategory: 'EducationalApplication',
  softwareVersion: work.releaseVersion, description: work.summary, author: { '@id': `${origin}/#author` },
  downloadUrl: work.marketplace.url, installUrl: work.marketplace.url,
  image: `${origin}/apple-touch-icon.png`, screenshot: work.screenshots.map(item => `${origin}${item.path}`),
  isAccessibleForFree: work.marketplace.price === 0,
  offers: { '@type': 'Offer', price: work.marketplace.price, priceCurrency: work.marketplace.priceCurrency, url: work.marketplace.url },
  featureList: work.features, license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html'
};

function page({ title, description, pathname, body, graph = [], noindex = false, breadcrumbTitle = title, ogType = 'website' }) {
  const trail = pathname === '/' || noindex ? [] : [{ name: '首页', url: `${origin}/` }, { name: breadcrumbTitle, url: `${origin}${pathname}` }];
  const breadcrumb = trail.length ? [{ '@type': 'BreadcrumbList', itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })) }] : [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(author.name)}">
  <meta name="robots" content="${noindex ? 'noindex' : 'index, follow, max-image-preview:large'}">
  <link rel="canonical" href="${origin}${pathname}">
  <link rel="icon" href="/favicon.ico?v=20261001" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=20261001">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=20261001">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=20261001">
  <link rel="stylesheet" href="/styles.css?v=20261003">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="记得闪卡 · jidecards">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${origin}${pathname}">
  <meta property="og:image" content="${origin}/apple-touch-icon.png">
  <script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [person, ...graph, ...breadcrumb] })}</script>
</head>
<body>
  <a class="skip-link" href="#content">跳到正文</a>
  <header class="site-header"><nav class="nav" aria-label="主导航">
    <a class="brand" href="/">记得闪卡 <span>jidecards</span></a>
    <div class="nav-links">${nav.map(([url, label]) => `<a href="${url}"${url === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="${esc(repo)}">GitHub ↗</a></div>
  </nav></header>
  <main id="content" class="wrap">${trail.length ? `<nav class="breadcrumb" aria-label="面包屑"><a href="/">首页</a><span aria-hidden="true">/</span><span aria-current="page">${esc(breadcrumbTitle)}</span></nav>` : ''}${body}</main>
  <footer class="footer"><div class="wrap footer-inner"><a href="/about/">${esc(author.name)}</a><div><span>${repositoryLinks}</span><a href="/data/works.json">JSON</a><a href="/llms.txt">llms.txt</a><span>${esc(work.license)}</span></div></div></footer>
</body>
</html>
`;
}

const download = `<div class="actions"><a class="button" href="${esc(work.marketplace.url)}">打开华为应用市场 <span aria-hidden="true">↗</span></a><span class="meta">搜索「记得闪卡」 · 正式版 ${esc(work.releaseVersion)}${work.marketplace.price === 0 ? ' · 免费下载' : ''}</span></div>`;
const theme = `<div class="theme-note"><span class="theme-swatch" aria-hidden="true"></span><p><strong>${esc(work.promotion.title)}</strong><span>${esc(work.promotion.description)}</span></p><a href="/works/jidecards/#appearance">详情 →</a></div>`;
const jide = work.detailSections.find(section => section.id === 'jide');
const home = page({
  title: work.seo.homeTitle, description: work.summary, pathname: '/',
  graph: [{ '@type': 'WebSite', name: '记得闪卡 · jidecards', url: origin, author: { '@id': `${origin}/#author` } }, application],
  body: `<section class="intro"><p class="eyebrow">鸿蒙 HarmonyOS NEXT · 原生开源闪卡</p><h1>记得闪卡</h1>
    <p class="lede">${esc(work.summary)}</p>${download}</section>
    ${theme}
    <nav class="entry-grid" aria-label="站点入口">
      <a class="entry" href="/works/jidecards/"><strong>功能与截图 <span aria-hidden="true">→</span></strong><span>学习、同步、卡片管理与外观</span></a>
      <div class="entry"><strong>开源代码 <span aria-hidden="true">↗</span></strong><span>源码、版本记录与问题反馈</span><span>${repositoryLinks}</span></div>
      <a class="entry" href="/developers/"><strong>开发文档 <span aria-hidden="true">→</span></strong><span>项目结构、构建与制卡规范</span></a>
    </nav>
    <section class="quick-facts" aria-label="应用概览"><p><strong>用途</strong> <a href="/works/jidecards/#learning">背单词 · 记忆知识点 · 间隔复习</a></p><p><strong>学习</strong> 用问答、填空和图片遮挡练习回忆，由 FSRS 安排间隔复习。</p><p><strong>资料</strong> 导入 Anki APKG 牌组，通过 AnkiWeb 同步卡片与学习进度，备份与恢复学习资料。</p><p><strong>助手</strong> <a href="/works/jidecards/#jide">${esc(jide.title)}</a> · 当前为默认隐藏的开发者调试功能。</p><p><strong>作者</strong> <a href="/about/">${esc(author.name)}</a></p></section>`
});

const features = work.featureGroups.map(group => `<div><dt>${esc(group.name)}</dt><dd>${esc(group.description)}</dd></div>`).join('\n');
const useCases = work.useCases.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}</dd></div>`).join('\n');
const product = page({
  title: work.seo.productTitle, description: work.summary, pathname: '/works/jidecards/', breadcrumbTitle: '下载与功能',
  graph: [application, { '@type': 'SoftwareSourceCode', name: 'jidecards', codeRepository: repositories.map(repository => repository.url), programmingLanguage: ['ArkTS', 'Rust', 'C++'], license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html' }],
  body: `<p class="eyebrow">功能与下载</p><h1>记得闪卡 <small>${esc(work.releaseVersion)}</small></h1><p class="lede">${esc(work.summary)}</p>
    <section id="download" class="download-block"><h2>下载</h2>${download}<p class="meta">适用于 ${esc(work.platform)}。应用已上架华为应用市场。</p></section>
    <section id="learning"><h2>在鸿蒙端用闪卡学习</h2><dl class="feature-list">${useCases}</dl></section>
    <section id="features"><h2>功能</h2><dl class="feature-list">${features}</dl></section>
    <section class="product-details"><h2>进一步了解记得闪卡</h2><nav class="toc" aria-label="功能目录"><ul>${work.detailSections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ul></nav>${work.detailSections.map(section => `<section id="${esc(section.id)}"><h3>${esc(section.title)}</h3>${section.paragraphs.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}${section.availability ? `<p class="note">${esc(section.availability)}</p>` : ''}${section.items ? `<dl class="questions">${section.items.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}${item.example ? `<p class="meta">可以这样说：“${esc(item.example)}”</p>` : ''}</dd></div>`).join('')}</dl>` : ''}</section>`).join('')}</section>
    <section class="guide-entry"><h2>第一次在鸿蒙端使用 Anki 牌组？</h2><p>按实际步骤完成 APKG 导入或 AnkiWeb 同步，再开始 FSRS 间隔复习。</p><a href="${guide.pathname}">${esc(guide.navTitle)} →</a></section>
    <section id="appearance"><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)}</p><p class="meta">${esc(work.promotion.details)}</p></section>
    <section id="screenshots"><h2>应用截图</h2><div class="media-grid">${work.screenshots.map(item => `<figure><a href="${esc(item.path)}"><img src="${esc(item.path)}" alt="记得闪卡${esc(item.caption)}" width="${item.width}" height="${item.height}" loading="lazy"></a><figcaption>${esc(item.caption)} · <a href="${esc(item.sourceUrl)}">仓库原图 ↗</a></figcaption></figure>`).join('')}</div></section>
    <section><h2>源码与反馈</h2><p>${repositoryLinks} · <a href="${esc(repo)}/issues">反馈问题</a> · <a href="/developers/">开发文档</a></p><p class="meta">${esc(work.license)}。独立开源项目，非 Anki 官方客户端。</p></section>`
});

const guidePage = page({
  title: `${guide.title}｜记得闪卡`, description: guide.description, pathname: guide.pathname, breadcrumbTitle: guide.navTitle, ogType: 'article',
  graph: [application, { '@type': 'TechArticle', '@id': `${origin}${guide.pathname}#article`, headline: guide.title, description: guide.description,
    dateModified: guide.updatedAt, inLanguage: 'zh-CN', author: { '@id': `${origin}/#author` }, about: { '@id': `${origin}/#app` },
    mainEntityOfPage: `${origin}${guide.pathname}` }],
  body: `<article class="guide"><header><p class="eyebrow">使用指南 · HarmonyOS NEXT</p><h1>${esc(guide.title)}</h1><p class="lede">${esc(guide.intro)}</p><p class="meta">作者：${esc(author.name)} · 更新于 <time datetime="${guide.updatedAt}">${guide.updatedAt}</time></p></header>
    <nav class="toc" aria-label="文章目录"><strong>这篇指南包含</strong><ol>${guide.sections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ol></nav>
    ${guide.sections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2>${(section.paragraphs ?? []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}${section.table ? `<div class="table-wrap"><table><thead><tr>${section.table.headers.map(header => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${section.steps ? `<ol class="steps">${section.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}${section.items ? `<dl class="questions">${section.items.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}</dd></div>`).join('')}</dl>` : ''}${(section.after ?? []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('')}
    <section><h2>进一步阅读与反馈</h2><ul>${guide.references.map(reference => `<li><a href="${esc(reference.url)}">${esc(reference.title)}</a></li>`).join('')}<li>${sourceLink('README.md', '记得闪卡源码与功能说明')}</li><li>源码仓库：${repositoryLinks}</li><li><a href="${esc(repo)}/issues">记得闪卡问题反馈</a></li></ul><p class="meta">本文结合记得闪卡公开功能说明、项目源码与 Anki 官方手册，由 AI 辅助整理。界面与具体选项以当前正式版为准。记得闪卡是独立开源项目，非 Anki 官方客户端。</p></section>
    <section class="guide-entry"><h2>下载记得闪卡</h2><p>在 HarmonyOS NEXT 上导入牌组、复习和同步。</p>${download}<a href="/works/jidecards/">查看完整功能与截图 →</a></section></article>`
});

const developers = page({
  title: '开发文档｜记得闪卡', description: '记得闪卡的源码、构建文档与 Agent 开发入口。', pathname: '/developers/',
  body: `<p class="eyebrow">开发</p><h1>开发文档</h1><p class="lede">项目优先服务 Agent 开发。</p><p>这里的 Agent 指参与仓库开发的编程 Agent。</p>
    <dl class="feature-list link-list">
      <div><dt>源码仓库</dt><dd>${repositoryLinks}</dd></div>
      <div><dt>从这里开始</dt><dd>${sourceLink('AGENTS.md', '开发约定')} · ${sourceLink('PROJECT_CONTEXT.md', '项目索引')}</dd></div>
      <div><dt>构建与验证</dt><dd>${sourceLink('README.md', '环境与构建')} · ${sourceLink('docs/development/verification.md', '验证命令')}</dd></div>
      <div><dt>修改代码</dt><dd>${sourceLink('docs/development/ownership.md', '模块边界')} · ${sourceLink('docs/development/extension-points.md', '扩展点')}</dd></div>
      <div><dt>制作选择题卡</dt><dd>${sourceLink('docs/choice-authoring.md', '制卡指南')} · ${sourceLink('docs/choice-apkg-v1.md', 'APKG 扩展规范')}</dd></div>
      <div><dt>JIDE 应用内助手</dt><dd><a href="/works/jidecards/#jide">${esc(jide.title)}</a> · ${sourceLink('docs/development/agent.md', '实现与验证')}。${esc(jide.availability)} 开发开关见 ${sourceLink('entry/src/main/ets/model/ReleaseFeatures.ets', 'ReleaseFeatures')}。</dd></div>
      <div><dt>机器读取</dt><dd><a href="/data/works.json">项目 JSON</a> · <a href="/llms-full.txt">纯文本资料</a> · <a href="/sitemap.xml">网站地图</a></dd></div>
    </dl><p class="meta">ArkUI → Node-API → Rust / Anki Core。许可证：${esc(work.license)}。</p>`
});

const about = page({ title: `${author.name}｜作者`, description: `${author.name}，记得闪卡开发者。`, pathname: '/about/',
  body: `<p class="eyebrow">作者</p><h1>${esc(author.name)}</h1><p class="lede">记得闪卡开发者。</p><dl class="feature-list link-list"><div><dt>作品</dt><dd><a href="/works/jidecards/">记得闪卡 · ${esc(work.platform)}</a></dd></div><div><dt>GitHub</dt><dd><a href="${esc(author.github)}">wuweiyouzuoju ↗</a></dd></div><div><dt>反馈</dt><dd><a href="${esc(repo)}/issues">GitHub Issues ↗</a></dd></div><div><dt>协作</dt><dd><a href="/developers/">开发文档 →</a></dd></div></dl>`
});

const shortText = `# 记得闪卡（jidecards）

${work.summary}

- 作者：${author.name}
- 华为应用市场上线版本：${work.releaseVersion}
- ${work.promotion.title}：${work.promotion.description}
- 许可证：${work.license}
- 首页：${origin}/
- 下载与功能：${work.url}
- 使用指南：${origin}${guide.pathname}
- ${jide.title}：${work.url}#jide
- JIDE 状态：${jide.availability}
- 开发文档：${origin}/developers/
- 作者：${author.url}
- 源码：${repo}
${work.repositoryMirrors.map(repository => `- ${repository.name} 源码：${repository.url}`).join('\n')}
- JSON：${origin}/data/works.json
- 完整资料：${origin}/llms-full.txt

项目优先服务 Agent 开发；指参与仓库开发的编程 Agent。
独立开源项目，非 Anki 官方客户端。
`;
const fullText = `${shortText}
## 学习用途

${work.useCases.map(item => `- ${item.name}：${item.description}`).join('\n')}

## 功能

${work.featureGroups.map(group => `- ${group.name}：${group.description}`).join('\n')}

## 详细功能

${work.detailSections.map(section => `### ${section.title}\n\n${section.paragraphs.join('\n\n')}${section.availability ? `\n\n${section.availability}` : ''}${section.items ? `\n\n${section.items.map(item => `- ${item.name}：${item.description}${item.example ? ` 示例：“${item.example}”` : ''}`).join('\n')}` : ''}`).join('\n\n')}

## 应用截图

${work.screenshots.map(item => `- ${item.caption}：${origin}${item.path}\n  开源仓库原图：${item.sourceUrl}`).join('\n')}

## ${guide.title}

${guide.intro}

${guide.sections.map(section => `### ${section.title}\n\n${(section.paragraphs ?? []).join('\n\n')}\n${section.table ? [section.table.headers, ...section.table.rows].map(row => row.join(' | ')).join('\n') : ''}\n${(section.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n')}\n${(section.items ?? []).map(item => `- ${item.name}：${item.description}`).join('\n')}\n${(section.after ?? []).join('\n\n')}`).join('\n\n')}

${guide.references.map(reference => `- ${reference.title}：${reference.url}`).join('\n')}

## 开发

- 开发约定：${repo}/blob/main/AGENTS.md
- 项目索引：${repo}/blob/main/PROJECT_CONTEXT.md
- JIDE 应用内助手：${repo}/blob/main/docs/development/agent.md
- JIDE 状态：${jide.availability}
- 幻彩主题说明：${work.promotion.details}
- 信息更新：${data.updatedAt}
`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/works/jidecards/', guide.pathname, '/developers/', '/about/'].map(route => `  <url><loc>${origin}${route}</loc><lastmod>${route === guide.pathname ? guide.updatedAt : data.updatedAt}</lastmod></url>`).join('\n')}
</urlset>
`;
const outputs = {
  'index.html': home, 'works/jidecards/index.html': product, 'developers/index.html': developers, 'about/index.html': about,
  [`${guide.pathname.slice(1)}index.html`]: guidePage,
  '404.html': page({ title: '页面不存在｜记得闪卡', description: '页面不存在。', pathname: '/404.html', noindex: true, body: '<p class="eyebrow">404</p><h1>页面不存在</h1><p><a href="/">返回首页 →</a></p>' }),
  'llms.txt': shortText, 'llms-full.txt': fullText, 'sitemap.xml': sitemap
};
for (const [file, content] of Object.entries(outputs)) {
  const destination = path.join(hosting, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}
console.log(`Generated ${Object.keys(outputs).length} public files for release ${work.releaseVersion}.`);
