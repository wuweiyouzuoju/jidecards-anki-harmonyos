// SPDX-License-Identifier: AGPL-3.0-or-later
// Public facts live in hosting/data/works.json; generated pages need no browser JavaScript.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hosting = path.join(root, 'hosting');
const data = JSON.parse(await readFile(path.join(hosting, 'data/works.json'), 'utf8'));
const work = data.works[0];
const author = data.author;
const origin = 'https://jidecards.com';
const repo = work.repository;
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const sourceLink = (file, label) => `<a href="${esc(repo)}/blob/main/${esc(file)}">${esc(label)}</a>`;
const nav = [ ['/works/jidecards/#download', '下载'], ['/works/jidecards/', '功能'], ['/developers/', '开发'], ['/about/', '作者'] ];
const person = { '@type': 'Person', '@id': `${origin}/#author`, name: author.name, url: author.url, sameAs: [author.github] };
const application = {
  '@type': 'SoftwareApplication', '@id': `${origin}/#app`, name: work.name, alternateName: work.alternateName,
  url: work.url, operatingSystem: work.platform, applicationCategory: 'EducationalApplication',
  softwareVersion: work.releaseVersion, description: work.summary, author: { '@id': `${origin}/#author` },
  featureList: work.features, license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html'
};

function page({ title, description, pathname, body, graph = [], noindex = false }) {
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
  <link rel="stylesheet" href="/styles.css?v=20260926-2">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="记得闪卡 · jidecards">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${origin}${pathname}">
  <script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [person, ...graph] })}</script>
</head>
<body>
  <a class="skip-link" href="#content">跳到正文</a>
  <header class="site-header"><nav class="nav" aria-label="主导航">
    <a class="brand" href="/">记得闪卡 <span>jidecards</span></a>
    <div class="nav-links">${nav.map(([url, label]) => `<a href="${url}"${url === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="${esc(repo)}">GitHub ↗</a></div>
  </nav></header>
  <main id="content" class="wrap">${body}</main>
  <footer class="footer"><div class="wrap footer-inner"><a href="/about/">${esc(author.name)}</a><div><a href="/data/works.json">JSON</a><a href="/llms.txt">llms.txt</a><span>${esc(work.license)}</span></div></div></footer>
</body>
</html>
`;
}

const download = `<div class="actions"><a class="button" href="${esc(work.marketplace.url)}">打开华为应用市场 <span aria-hidden="true">↗</span></a><span class="meta">搜索「记得闪卡」 · 正式版 ${esc(work.releaseVersion)}</span></div>`;
const theme = `<div class="theme-note"><span class="theme-swatch" aria-hidden="true"></span><p><strong>${esc(work.promotion.title)}</strong><span>${esc(work.promotion.description)}</span></p><a href="/works/jidecards/#appearance">详情 →</a></div>`;
const home = page({
  title: '记得闪卡｜HarmonyOS 开源 Anki 客户端', description: work.summary, pathname: '/',
  graph: [{ '@type': 'WebSite', name: '记得闪卡 · jidecards', url: origin, author: { '@id': `${origin}/#author` } }, application],
  body: `<section class="intro"><p class="eyebrow">HarmonyOS · 开源</p><h1>记得闪卡</h1>
    <p class="lede">${esc(work.summary)}</p>${download}</section>
    ${theme}
    <nav class="entry-grid" aria-label="站点入口">
      <a class="entry" href="/works/jidecards/"><strong>功能与截图 <span aria-hidden="true">→</span></strong><span>学习、同步、卡片管理与外观</span></a>
      <a class="entry" href="${esc(repo)}"><strong>开源代码 <span aria-hidden="true">↗</span></strong><span>源码、版本记录与问题反馈</span></a>
      <a class="entry" href="/developers/"><strong>开发文档 <span aria-hidden="true">→</span></strong><span>项目结构、构建与制卡规范</span></a>
    </nav>
    <section class="quick-facts" aria-label="应用概览"><p><strong>复习</strong> FSRS · 普通卡 · 挖空 · 图像遮挡</p><p><strong>数据</strong> AnkiWeb · APKG · 集合备份</p><p><strong>作者</strong> <a href="/about/">${esc(author.name)}</a></p></section>`
});

const features = work.featureGroups.map(group => `<div><dt>${esc(group.name)}</dt><dd>${esc(group.description)}</dd></div>`).join('\n');
const product = page({
  title: `记得闪卡 ${work.releaseVersion}｜功能与下载`, description: work.summary, pathname: '/works/jidecards/',
  graph: [application, { '@type': 'SoftwareSourceCode', name: 'jidecards', codeRepository: repo, programmingLanguage: ['ArkTS', 'Rust', 'C++'], license: 'https://spdx.org/licenses/AGPL-3.0-or-later.html' }],
  body: `<p class="eyebrow">功能与下载</p><h1>记得闪卡 <small>${esc(work.releaseVersion)}</small></h1><p class="lede">${esc(work.summary)}</p>
    <section id="download" class="download-block"><h2>下载</h2>${download}<p class="meta">适用于 ${esc(work.platform)}。应用已上架华为应用市场。</p></section>
    <section id="features"><h2>功能</h2><dl class="feature-list">${features}</dl></section>
    <section id="appearance"><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)}</p><p class="meta">${esc(work.promotion.details)}</p></section>
    <section id="screenshots"><h2>应用截图</h2><div class="media-grid">${[1,2,3,4].map(index => `<figure><a href="/assets/app-preview-0${index}.png"><img src="/assets/app-preview-0${index}.png" alt="记得闪卡应用界面截图 ${index}" width="540" height="1168" loading="lazy"></a></figure>`).join('')}</div></section>
    <section><h2>源码与反馈</h2><p><a href="${esc(repo)}">GitHub 仓库</a> · <a href="${esc(repo)}/issues">反馈问题</a> · <a href="/developers/">开发文档</a></p><p class="meta">${esc(work.license)}。独立开源项目，非 Anki 官方客户端。</p></section>`
});

const developers = page({
  title: '开发文档｜记得闪卡', description: '记得闪卡的源码、构建文档与 Agent 开发入口。', pathname: '/developers/',
  body: `<p class="eyebrow">开发</p><h1>开发文档</h1><p class="lede">项目优先服务 Agent 开发。</p><p>这里的 Agent 指参与仓库开发的编程 Agent。</p>
    <dl class="feature-list link-list">
      <div><dt>从这里开始</dt><dd>${sourceLink('AGENTS.md', '开发约定')} · ${sourceLink('PROJECT_CONTEXT.md', '项目索引')}</dd></div>
      <div><dt>构建与验证</dt><dd>${sourceLink('README.md', '环境与构建')} · ${sourceLink('docs/development/verification.md', '验证命令')}</dd></div>
      <div><dt>修改代码</dt><dd>${sourceLink('docs/development/ownership.md', '模块边界')} · ${sourceLink('docs/development/extension-points.md', '扩展点')}</dd></div>
      <div><dt>制作选择题卡</dt><dd>${sourceLink('docs/choice-authoring.md', '制卡指南')} · ${sourceLink('docs/choice-apkg-v1.md', 'APKG 扩展规范')}</dd></div>
      <div><dt>应用内 AI</dt><dd>发布包默认隐藏入口；开发开关见 ${sourceLink('entry/src/main/ets/model/ReleaseFeatures.ets', 'ReleaseFeatures')}。</dd></div>
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
- 开发文档：${origin}/developers/
- 作者：${author.url}
- 源码：${repo}
- JSON：${origin}/data/works.json
- 完整资料：${origin}/llms-full.txt

项目优先服务 Agent 开发；指参与仓库开发的编程 Agent。
独立开源项目，非 Anki 官方客户端。
`;
const fullText = `${shortText}
## 功能

${work.featureGroups.map(group => `- ${group.name}：${group.description}`).join('\n')}

## 开发

- 开发约定：${repo}/blob/main/AGENTS.md
- 项目索引：${repo}/blob/main/PROJECT_CONTEXT.md
- 应用内 AI：发布包默认隐藏入口，开关以 ReleaseFeatures.ets 为准。
- 幻彩主题说明：${work.promotion.details}
- 信息更新：${data.updatedAt}
`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/works/jidecards/', '/developers/', '/about/'].map(route => `  <url><loc>${origin}${route}</loc><lastmod>${data.updatedAt}</lastmod></url>`).join('\n')}
</urlset>
`;
const outputs = {
  'index.html': home, 'works/jidecards/index.html': product, 'developers/index.html': developers, 'about/index.html': about,
  '404.html': page({ title: '页面不存在｜记得闪卡', description: '页面不存在。', pathname: '/404.html', noindex: true, body: '<p class="eyebrow">404</p><h1>页面不存在</h1><p><a href="/">返回首页 →</a></p>' }),
  'llms.txt': shortText, 'llms-full.txt': fullText, 'sitemap.xml': sitemap
};
for (const [file, content] of Object.entries(outputs)) {
  const destination = path.join(hosting, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}
console.log(`Generated ${Object.keys(outputs).length} public files for release ${work.releaseVersion}.`);
