// SPDX-License-Identifier: AGPL-3.0-or-later
import { esc, paragraphs, questions, icon, arrow } from './layout.mjs';

export function renderPages(content, layout) {
  const { data, work, guide, origin } = content;
  const { page, logo, download, repoLinks, sourceLink } = layout;
  const jide = work.detailSections.find(section => section.id === 'jide');
  const market = work.marketplace;
  const sourcePackage = work.sourcePackage;
  const changes = `<ol class="release-list">${market.changes.map(change => `<li>${esc(change)}</li>`).join('\n')}</ol>`;
  const featureList = items => `<dl class="feature-list">${items.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}</dd></div>`).join('\n')}</dl>`;
  const figure = item => {
    const placeholder = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.width}" height="${item.height}"><rect width="100%" height="100%" fill="#f1f2fa"/></svg>`)}`;
    const attributes = `alt="记得闪卡 ${esc(item.caption)}。${esc(item.description)}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async" fetchpriority="low"`;
    return `<figure class="product-media"><a href="${esc(item.path)}" aria-label="查看完整图片：${esc(item.caption)}"><img class="deferred-media" src="${placeholder}" data-full-src="${esc(item.path)}" ${attributes}><noscript><img src="${esc(item.path)}" ${attributes}></noscript></a><figcaption><strong>${esc(item.caption)}</strong><p>${esc(item.description)}</p><a href="${esc(item.path)}">查看完整图片 ${arrow}</a></figcaption></figure>`;
  };
  const pageHeader = (title, description, actions = '') => `<header class="page-heading"><h1>${esc(title)}</h1><p class="lede">${esc(description)}</p>${actions}</header>`;
  const contents = (label, links) => `<nav class="contents" aria-label="${esc(label)}"><details open><summary>${esc(label)}</summary><ul>${links.map(([url, name]) => `<li><a href="${esc(url)}">${esc(name)}</a></li>`).join('')}</ul></details></nav>`;
  const link = (url, label) => `<a class="text-link" href="${esc(url)}">${esc(label)} <span aria-hidden="true">→</span></a>`;
  const faq = items => `<div class="faq">${items.map(item => `<details><summary>${esc(item.name)}</summary><p>${esc(item.description)}</p></details>`).join('')}</div>`;
  const featureKinds = ['package', 'review', 'sync'];
  const technicalPath = '/works/jidecards/technical/';
  const highlights = work.learningHighlights.map((item, index) => `<article class="feature-card"><span class="feature-icon">${icon(featureKinds[index])}</span><h3>${link(technicalPath + '#' + item.section, item.name)}</h3><p>${esc(item.description)}</p></article>`).join('');
  const publicQuestions = work.questions.slice(0, 3);
  const home = page({
    title: work.seo.homeTitle, description: work.summary, pathname: '/', markdown: '/content/home.md',
    className: 'home',
    body: `<section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="release-dot"></span> HarmonyOS NEXT</p>
        <h1 id="hero-title">${esc(work.brand.headline[0])}<span>${esc(work.brand.headline[1])}</span></h1>
        <p class="hero-description">${esc(work.summary)}</p>
        ${download}
        <a class="text-link" href="${guide.pathname}">已有 Anki 牌组？查看迁移步骤 <span aria-hidden="true">→</span></a>
      </div>
      <div class="hero-identity">
        <div class="hero-orbit" aria-hidden="true"></div><span class="hero-stack" aria-hidden="true"></span>
        ${logo('hero-logo', 220, '记得闪卡应用 Logo')}
        <details class="sample-card">
          <summary><span class="sample-label">试翻一张词汇卡</span><strong lang="en">recall</strong><span class="sample-action"><span class="sample-open">翻看释义</span><span class="sample-close">收起释义</span></span></summary>
          <p>回想，回忆起</p>
        </details>
      </div>
    </section>
    <section class="home-section" id="features"><div class="section-heading"><h2>从制卡到复习</h2><a class="text-link" href="/works/jidecards/">查看完整功能 <span aria-hidden="true">→</span></a></div>
      <div class="feature-grid">${highlights}</div>
    </section>
    <section class="home-section gallery-panel" id="learning"><div class="section-heading"><div><h2>应用界面</h2><p class="meta">${work.screenshots.length ? esc(work.screenshots[0].releaseVersion) : '当前版本截图待补充'}</p></div><a class="text-link" href="/works/jidecards/#screenshots">查看全部截图 <span aria-hidden="true">→</span></a></div>
      <div class="preview-grid">${work.screenshots.slice(0, 3).map(figure).join('\n')}</div>
    </section>
    <section class="launch-band" id="source-update" aria-labelledby="launch-title">
      <div><h2 id="launch-title">${esc(market.version)} 更新</h2><p>${esc(market.summary)}</p></div>
      <a class="text-link" href="/releases/">查看更新说明 <span aria-hidden="true">→</span></a>
    </section>
    <section class="migration-section home-section"><div><h2>把 Anki 牌组带到鸿蒙</h2><p>只迁移牌组，导入 APKG。要接着原来的进度复习，先备份卡库，再用同一个 AnkiWeb 账号同步。</p><a class="text-link" href="${guide.pathname}">查看迁移步骤 <span aria-hidden="true">→</span></a></div>
      <dl class="migration-options"><div><dt>APKG 牌组</dt><dd>导入后打开几张卡，检查图片、音频和模板。</dd></div><div><dt>AnkiWeb 同步</dt><dd>确认学习记录和媒体都已下载，再继续复习。</dd></div></dl>
    </section>
    <section class="block-layout" id="questions"><h2>常见问题</h2>${faq(publicQuestions)}</section>
    <section class="appearance-strip" id="appearance"><span class="theme-swatch" aria-hidden="true"></span><div><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)}</p></div><a href="/works/jidecards/#appearance">查看外观选项 <span aria-hidden="true">→</span></a></section>
    `
  });

  const productSections = work.detailSections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2>${paragraphs(section.paragraphs)}${section.availability ? `<p class="note">${esc(section.availability)}</p>` : ''}${section.items ? questions(section.items) : ''}${section.id === 'jide' ? link(market.jide.evidence, '该版本入口配置') : ''}</section>`).join('\n');
  const product = page({
    title: work.seo.productTitle, description: work.summary, pathname: '/works/jidecards/', breadcrumbTitle: '功能与下载', className: 'product-page', markdown: '/content/product.md',
    graph: [{ '@type': 'FAQPage', mainEntity: publicQuestions.map(item => ({ '@type': 'Question', name: item.name, acceptedAnswer: { '@type': 'Answer', text: item.description } })) }],
    body: `<div class="product-intro"><div>${pageHeader('功能与下载', work.summary)}<div id="download">${download}</div></div>
      <div class="product-brand">${logo('product-logo', 120, '记得闪卡应用 Logo')}</div></div>
    <div class="document-layout"><aside>${contents('功能目录', [
      ['#learning', '学习场景'], ['#features', '功能概览'], ['#technical', '进阶功能'],
      ['#appearance', work.promotion.title], ['#screenshots', '应用截图'], ['#source-update', '版本更新'], ['#questions', '常见问题']
    ])}</aside><div class="page-sections">
      <section id="learning"><h2>用闪卡背单词、复习知识点</h2>${featureList(work.useCases)}</section>
      <section id="features"><h2>功能概览</h2><div class="feature-grid">${highlights}</div></section>
      <section id="appearance"><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)}</p>${link(technicalPath + '#appearance', '查看外观设置')}</section>
      <section id="screenshots"><h2>应用截图</h2><p class="meta">${work.screenshots.length ? esc(work.screenshots[0].releaseVersion) : '当前版本截图待补充'}。当前界面以安装的版本为准。</p><div class="media-grid">${work.screenshots.length ? work.screenshots.map(figure).join('') : ''}</div></section>
      <section id="source-update" class="launch-band"><div><h2>${esc(market.version)} 更新说明</h2><p>${esc(market.summary)}</p></div>${link('/releases/', '完整更新说明')}</section>
      <section id="technical"><h2>进阶功能与兼容性</h2><p>查看备份与同步条件、卡片模板、键盘快捷键和 JIDE 的使用条件。</p>
        <ul class="technical-links">${work.detailSections.map(section => `<li id="${esc(section.id)}">${link(technicalPath + '#' + section.id, section.title)}</li>`).join('')}</ul>
      </section>
      <section id="questions"><h2>常见问题</h2>${faq(publicQuestions)}</section>
      <section class="guide-entry"><h2>把已有牌组带过来</h2><p>指南列出了 APKG 导入、AnkiWeb 同步和备份步骤。</p>${link(guide.pathname, '阅读使用指南')}</section>
      <section class="source-section"><h2>源码与反馈</h2><div class="repository-links">${repoLinks}</div><p><a href="${esc(work.repository)}/issues">反馈问题 ${arrow}</a> · <a href="/developers/">开发文档</a></p><p class="meta">${esc(work.license)}。</p></section>
    </div></div>`
  });

  const technical = page({
    title: '进阶功能与兼容性｜记得闪卡', description: '查阅同步方式、备份格式、卡片模板、快捷键和 JIDE 的使用条件。',
    pathname: technicalPath, breadcrumbTitle: '进阶功能与兼容性', markdown: '/content/technical.md', className: 'product-page',
    body: `<div class="guide-header">${pageHeader('进阶功能与兼容性', '查阅同步方式、备份格式、卡片模板、快捷键和 JIDE 的使用条件。', link('/works/jidecards/', '返回功能与下载'))}</div>
    <div class="document-layout"><aside>${contents('进阶目录', [
      ...work.detailSections.map(section => ['#' + section.id, section.title]), ['#appearance', work.promotion.title],
      ['#questions', '常见问题'], ['/content/technical.md', '阅读 Markdown']
    ])}</aside><div class="page-sections">
    <div class="product-details">${productSections}</div>
    <section id="appearance"><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)} ${esc(work.promotion.details)}</p></section>
    <section id="questions"><h2>常见问题</h2>${faq(work.questions.slice(3))}</section>
    ${link('/developers/', '开发文档')}</div></div>`
  });

  const guideSections = guide.sections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2>${paragraphs(section.paragraphs)}${section.table ? `<div class="table-wrap"><table><thead><tr>${section.table.headers.map(header => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${section.steps ? `<ol class="steps">${section.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}${section.items ? questions(section.items) : ''}${paragraphs(section.after)}</section>`).join('\n');
  const guidePage = page({
    title: `${guide.title}｜记得闪卡`, description: guide.description, pathname: guide.pathname, breadcrumbTitle: guide.navTitle, ogType: 'article', markdown: '/content/harmonyos-anki-guide.md', className: 'guide-page',
    graph: [{ '@type': 'TechArticle', '@id': `${origin}${guide.pathname}#article`, headline: guide.title, description: guide.description, dateModified: guide.updatedAt, inLanguage: 'zh-CN', author: { '@id': `${origin}/#author` }, about: { '@id': `${origin}/#app` }, mainEntityOfPage: `${origin}${guide.pathname}` }],
    body: `<div class="guide-header">${pageHeader(guide.title, guide.intro, `<div class="guide-jumps">${link('#import', '导入 APKG')}${link('#review', '开始复习')}${link('#sync', '同步进度')}</div>`)}<p class="meta">${esc(data.author.name)} · <time datetime="${guide.updatedAt}">${guide.updatedAt}</time></p></div>
    <div class="document-layout"><aside>${contents('阅读目录', [...guide.sections.map(section => [`#${section.id}`, section.title]), ['/content/harmonyos-anki-guide.md', '阅读 Markdown']])}</aside><article class="guide">${guideSections}
    <section id="references"><h2>进一步阅读与反馈</h2><ul>${guide.references.map(reference => `<li><a href="${esc(reference.url)}">${esc(reference.title)} ${arrow}</a></li>`).join('')}<li>${sourceLink('README.md', '记得闪卡源码与功能说明')}</li><li>源码仓库：${repoLinks}</li><li><a href="${esc(work.repository)}/issues">记得闪卡问题反馈 ${arrow}</a></li></ul><p class="meta">本指南参考项目说明和 Anki 官方手册。菜单名称以应用内显示为准。</p></section>
    <section class="guide-entry"><h2>下载记得闪卡</h2><p>在 HarmonyOS NEXT 上导入牌组、复习和同步。</p>${download}<a href="/works/jidecards/">查看完整功能与界面示例 <span aria-hidden="true">→</span></a></section></article></div>`
  });

  const developers = page({
    title: '开发文档｜记得闪卡', description: '记得闪卡的源码、构建文档与 Agent 开发入口。', pathname: '/developers/', breadcrumbTitle: '开发文档', className: 'developer-page', markdown: '/content/developers.md',
    body: `${pageHeader('开发文档', '项目优先服务 Agent 开发。项目索引收录代码入口、模块边界和验证要求。', `<div class="repository-links">${repoLinks}${link('#machine-readable', '机器可读资料')}</div>`)}
    <div class="developer-grid"><section class="developer-card"><h2>了解项目</h2><ul><li>${sourceLink('AGENTS.md', '开发约定')}</li><li>${sourceLink('PROJECT_CONTEXT.md', '项目索引')}</li><li>${sourceLink('README.md', '环境与构建')}</li></ul></section><section class="developer-card"><h2>模块与扩展点</h2><ul><li>${sourceLink('docs/development/ownership.md', '模块责任与边界')}</li><li>${sourceLink('docs/development/extension-points.md', '扩展点')}</li><li>${sourceLink('docs/development/task-contract.md', '任务契约')}</li></ul></section><section class="developer-card"><h2>验证与兼容性</h2><ul><li>${sourceLink('docs/development/verification.md', '验证命令与范围')}</li><li>${sourceLink('docs/FEATURE_STATUS.md', '功能状态与兼容边界')}</li><li>${sourceLink('docs/development/agent.md', 'JIDE 能力与验证')}</li></ul></section></div>
    <div class="developer-body"><section><h2>构建与开发包</h2><p class="meta">ArkUI → Node-API → Rust / Anki Core。${esc(work.license)}。</p><p>源码 ${esc(work.sourceVersion)}。<a href="${esc(sourcePackage.downloadUrl)}">签名开发包 ${arrow}</a> · <a href="${esc(sourcePackage.checksumsUrl)}">SHA-256 校验</a> · <a href="${esc(sourcePackage.releaseUrl)}">构建记录</a></p><p class="meta">${esc(sourcePackage.installNote)}</p></section>
    <section><h2>JIDE 应用内助手</h2><p>${esc(jide.availability)}</p><p><a href="${technicalPath}#jide">${esc(jide.title)}</a> · ${sourceLink('docs/development/agent.md', '实现与验证')} · <a href="${esc(market.jide.evidence)}">该版本入口配置 ${arrow}</a></p></section>
    </div><section class="machine-section" id="machine-readable"><h2>AI 与爬虫读取入口</h2><p>网站正文在构建时输出为完整 HTML；功能、版本、适用平台、更新说明和能力边界同时提供 Markdown 与 JSON。</p><dl class="feature-list"><div><dt>资料索引</dt><dd><a href="/llms.txt">llms.txt</a> · <a href="/data/site-index.json">页面与 Markdown 清单</a></dd></div><div><dt>完整资料</dt><dd><a href="/llms-full.txt">llms-full.txt</a> · <a href="/content/product.md">产品 Markdown</a> · <a href="/content/harmonyos-anki-guide.md">指南 Markdown</a></dd></div><div><dt>结构化事实</dt><dd><a href="/data/works.json">产品 JSON</a> · <a href="/sitemap.xml">网站地图</a> · <a href="/releases.xml">版本更新订阅</a></dd></div></dl></section>`
  });

  const release = page({
    title: `${market.version} 更新说明｜记得闪卡`, description: market.summary, pathname: '/releases/', breadcrumbTitle: '更新说明', markdown: '/content/releases.md', ogType: 'article', className: 'release-page',
    graph: [{ '@type': 'TechArticle', headline: `记得闪卡 ${market.version} 更新说明`, dateModified: market.updatedAt, author: { '@id': `${origin}/#author` }, mainEntityOfPage: `${origin}/releases/` }],
    body: `<div class="release-header">${pageHeader(`${market.version} 更新说明`, market.summary)}
    <p class="release-meta"><span>华为应用市场已上架</span><time datetime="${market.updatedAt}">${market.updatedAt}</time></p></div>
    <div class="release-layout"><article class="release-article" id="release-${market.version.replaceAll('.', '-')}"><h2>本次更新</h2>${changes}</article>
      <aside class="guide-entry"><h2>安装或更新</h2>${download}<div class="resource-links">${link('/content/releases.md', '阅读 Markdown')}${link('/releases.xml', '订阅更新')}</div></aside></div>`
  });

  const about = page({
    title: `${data.author.name}｜作者`, description: `${data.author.name}，记得闪卡独立开发者。`, pathname: '/about/', breadcrumbTitle: '关于', markdown: '/content/about.md',
    className: 'about-page',
    body: `<div class="about-hero">${pageHeader('关于记得闪卡', '面向 HarmonyOS NEXT 的独立开源闪卡应用。卡片渲染、复习调度和 AnkiWeb 同步由 Anki Core 提供。')}
    ${logo('about-logo', 120, '记得闪卡应用 Logo')}</div>
    <div class="about-layout"><section class="author-panel"><h2>${esc(data.author.name)}</h2><p>记得闪卡独立开发者。</p><a href="${esc(data.author.github)}">wuweiyouzuoju ${arrow}</a></section>
      <div class="page-sections"><section id="independent-development"><h2>开发者</h2>${link('/about/independent-development/', '查看独立开发声明')}</section><section><h2>项目与反馈</h2><dl class="feature-list">
        <div><dt>应用版本</dt><dd>${esc(market.version)} · <a href="/releases/">更新说明</a></dd></div>
        <div><dt>许可证</dt><dd>${esc(work.license)}</dd></div>
        <div><dt>项目链接</dt><dd><div class="repository-links">${repoLinks}</div></dd></div>
        <div><dt>反馈问题</dt><dd><a href="${esc(work.repository)}/issues">GitHub Issues ${arrow}</a> · <a href="/developers/">开发文档</a></dd></div>
      </dl></section></div></div>`
  });
  const statement = page({
    title: '独立开发声明｜记得闪卡', description: '记得闪卡项目的开发和维护归属说明。',
    pathname: '/about/independent-development/', breadcrumbTitle: '独立开发声明', markdown: '/content/independent-development.md', className: 'statement-page',
    body: `<article class="guide-header">${pageHeader('独立开发声明', work.developmentStatement, link('/about/', '关于项目与作者'))}</article>`
  });
  return {
    'index.html': home, 'works/jidecards/index.html': product, [`${guide.pathname.slice(1)}index.html`]: guidePage,
    'works/jidecards/technical/index.html': technical, 'about/independent-development/index.html': statement,
    'developers/index.html': developers, 'releases/index.html': release, 'about/index.html': about,
    '404.html': page({ title: '页面不存在｜记得闪卡', description: '页面不存在。', pathname: '/404.html', noindex: true, className: 'not-found', body: `<div class="error-panel"><p class="eyebrow">404</p><h1>找不到这个页面</h1><p>可以从首页重新进入，或直接打开使用指南。</p><div class="actions"><a class="button" href="/">返回首页</a><a class="button secondary" href="${guide.pathname}">阅读使用指南</a></div></div>` })
  };
}
