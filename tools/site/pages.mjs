// SPDX-License-Identifier: AGPL-3.0-or-later
import { esc, paragraphs, questions, icon, arrow } from './layout.mjs';

export function renderPages(content, layout) {
  const { data, work, guide, origin } = content;
  const { page, logo, download, repoLinks, sourceLink, application, sourceCode } = layout;
  const jide = work.detailSections.find(section => section.id === 'jide');
  const changes = `<ol class="release-list">${work.sourceUpdate.changes.map(change => `<li>${esc(change)}</li>`).join('\n')}</ol>`;
  const featureList = items => `<dl class="feature-list">${items.map(item => `<div><dt>${esc(item.name)}</dt><dd>${esc(item.description)}</dd></div>`).join('\n')}</dl>`;
  const figure = item => {
    const placeholder = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.width}" height="${item.height}"><rect width="100%" height="100%" fill="#f1f2fa"/></svg>`)}`;
    const attributes = `alt="记得闪卡 ${esc(item.caption)}。${esc(item.description)}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async" fetchpriority="low"`;
    return `<figure class="product-media"><a href="${esc(item.path)}" aria-label="查看完整图片：${esc(item.caption)}"><img class="deferred-media" src="${placeholder}" data-full-src="${esc(item.path)}" ${attributes}><noscript><img src="${esc(item.path)}" ${attributes}></noscript></a><figcaption><strong>${esc(item.caption)}</strong><p>${esc(item.description)}</p><a href="${esc(item.path)}">查看完整图片 ${arrow}</a></figcaption></figure>`;
  };
  const pageHeader = (eyebrow, title, description) => `<header class="page-heading"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="lede">${esc(description)}</p></header>`;
  const featureKinds = ['review', 'cards', 'sync', 'package', 'search', 'theme'];
  const featureTargets = ['fsrs', 'card-types', 'ankiweb', 'apkg', 'organization', 'appearance'];
  const home = page({
    title: work.seo.homeTitle, description: work.summary, pathname: '/', markdown: '/content/home.md',
    graph: [{ '@type': 'WebSite', name: '记得闪卡 · jidecards', url: origin, publisher: { '@id': `${origin}/#project` } }, application, sourceCode],
    className: 'home',
    body: `<section class="hero" aria-labelledby="hero-title"><div class="hero-identity">${logo('hero-logo', 220, '记得闪卡应用 Logo')}<p>JideCards</p></div><div class="hero-copy">
      <p class="eyebrow">${esc(work.platform)} · 原生开源闪卡</p><h1 id="hero-title">${esc(work.brand.headline[0])}<br><span>${esc(work.brand.headline[1])}</span></h1>
      <p class="hero-description">${esc(work.summary)}</p>${download}
      <ul class="hero-tags" aria-label="核心能力"><li>FSRS 间隔复习</li><li>AnkiWeb 同步</li><li>APKG 导入导出</li></ul>
    </div></section>
    <dl class="project-facts"><div><dt>平台</dt><dd>HarmonyOS NEXT</dd></div><div><dt>学习内核</dt><dd>Anki Core · FSRS</dd></div><div><dt>开源许可</dt><dd>AGPL-3.0-or-later</dd></div><div><dt>当前版本</dt><dd>${esc(work.releaseVersion)}</dd></div></dl>
    <section class="home-section" id="features"><div class="section-heading"><div><p class="eyebrow">从回忆开始</p><h2>让每一次复习，都有下一步。</h2></div><a class="text-link" href="/works/jidecards/">了解全部功能 <span aria-hidden="true">→</span></a></div>
      <div class="feature-grid">${work.featureGroups.slice(0, 6).map((item, index) => `<article class="feature-card"><span class="feature-icon">${icon(featureKinds[index])}</span><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><a href="/works/jidecards/#${featureTargets[index]}">进一步了解 <span aria-hidden="true">→</span></a></article>`).join('\n')}</div>
    </section>
    <section class="home-section" id="learning"><div class="section-heading"><div><p class="eyebrow">学习与整理</p><h2>你的资料，你的学习方式。</h2></div></div>${featureList(work.useCases)}
      <div class="preview-grid">${[work.screenshots[0], work.screenshots[1], work.screenshots[2]].map(item => figure(item)).join('\n')}</div>
    </section>
    <section class="migration-section home-section"><div><p class="eyebrow">继续已有的学习</p><h2>你熟悉的 Anki，<br>现在在鸿蒙。</h2><p>导入已有牌组，或通过 AnkiWeb 延续复习记录。卡片、图片、音频和学习进度，沿用你熟悉的数据格式。</p><a class="text-link" href="${guide.pathname}">阅读 ${esc(guide.navTitle)} <span aria-hidden="true">→</span></a></div>
      <ol class="start-steps"><li><span>01</span><div><h3>安装记得闪卡</h3><p>在华为应用市场搜索「记得闪卡」，确认设备使用 HarmonyOS NEXT。</p></div></li><li><span>02</span><div><h3>带上你的学习资料</h3><p>导入 APKG 牌组，或使用 AnkiWeb 同步已有集合；迁移前保留备份。</p></div></li><li><span>03</span><div><h3>回忆、核对、继续复习</h3><p>先尝试回忆，再显示答案并按记忆情况评分，由 FSRS 安排下一次复习。</p></div></li></ol>
    </section>
    <section class="home-section release-section" id="source-update"><div class="section-heading"><div><p class="eyebrow">持续更新</p><h2>${esc(work.releaseVersion)} · 本次更新</h2></div><a class="text-link" href="/releases/">完整更新说明 <span aria-hidden="true">→</span></a></div><p class="meta"><time datetime="${work.sourceUpdate.updatedAt}">${work.sourceUpdate.updatedAt}</time></p>${changes}</section>
    <section class="appearance-strip" id="appearance"><span class="theme-swatch" aria-hidden="true"></span><div><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)} ${esc(work.promotion.details)}</p></div><a href="/works/jidecards/#appearance">了解外观 <span aria-hidden="true">→</span></a></section>
    <section class="open-source home-section"><div><p class="eyebrow">OPEN SOURCE</p><h2>开源，让改进持续发生。</h2><p>从应用界面到 Anki 内核，源码、构建说明和问题反馈入口公开。由 ${esc(data.author.name)} 开发，按 ${esc(work.license)} 许可发布。</p><div class="repository-links">${repoLinks}</div></div><nav aria-label="参与开源项目"><a href="/developers/">开发文档 <span aria-hidden="true">→</span></a><a href="${esc(work.repository)}/issues">报告问题 ${arrow}</a><a href="/works/jidecards/#jide">${esc(jide.title)} <span aria-hidden="true">→</span></a></nav></section>
    <section class="home-section"><div class="section-heading"><h2>开始前，你可能想了解。</h2></div>${questions(work.questions)}</section>`
  });

  const productSections = work.detailSections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2>${paragraphs(section.paragraphs)}${section.availability ? `<p class="note">${esc(section.availability)}</p>` : ''}${section.items ? questions(section.items) : ''}</section>`).join('\n');
  const product = page({
    title: work.seo.productTitle, description: work.summary, pathname: '/works/jidecards/', breadcrumbTitle: '功能与下载', markdown: '/content/product.md',
    graph: [application, sourceCode, { '@type': 'FAQPage', mainEntity: work.questions.map(item => ({ '@type': 'Question', name: item.name, acceptedAnswer: { '@type': 'Answer', text: item.description } })) }],
    body: `${pageHeader('JideCards · HarmonyOS NEXT', '记得闪卡', work.summary)}<div class="product-intro"><div>${logo('product-logo', 96, '记得闪卡应用 Logo')}<p class="version-pill">正式版 ${esc(work.releaseVersion)}</p></div><div id="download"><h2>开始使用记得闪卡</h2>${download}</div></div>
    <nav class="page-toc" aria-label="功能目录"><a href="#features">功能概览</a><a href="#screenshots">新版应用展示</a><a href="#source-update">版本更新</a>${work.detailSections.map(section => `<a href="#${esc(section.id)}">${esc(section.title.split('：')[0])}</a>`).join('')}<a href="#questions">常见问题</a></nav>
    <section id="learning"><h2>在鸿蒙端用闪卡学习</h2>${featureList(work.useCases)}</section>
    <section id="features"><h2>功能概览</h2>${featureList(work.featureGroups)}</section>
    <section id="screenshots"><h2>新版应用展示</h2><p class="meta">${esc(work.releaseVersion)} · 作者提供的新版宣传图</p><div class="media-grid">${work.screenshots.map(item => figure(item)).join('\n')}</div></section>
    <section id="source-update" class="release-section"><h2>${esc(work.releaseVersion)} 更新说明</h2><p class="meta"><time datetime="${work.sourceUpdate.updatedAt}">${work.sourceUpdate.updatedAt}</time> · <a href="/releases/">独立更新页面</a></p>${changes}</section>
    <div class="product-details">${productSections}</div>
    <section id="appearance"><h2>${esc(work.promotion.title)}</h2><p>${esc(work.promotion.description)}</p><p class="meta">${esc(work.promotion.details)}</p></section>
    <section id="questions"><h2>常见问题</h2>${questions(work.questions)}</section>
    <section class="guide-entry"><h2>第一次在鸿蒙端使用 Anki 牌组？</h2><p>从导入与同步开始，理解 FSRS 复习、卡片管理和备份恢复。</p><a class="text-link" href="${guide.pathname}">${esc(guide.navTitle)} <span aria-hidden="true">→</span></a></section>
    <section class="source-section"><h2>源码与反馈</h2><div class="repository-links">${repoLinks}</div><p><a href="${esc(work.repository)}/issues">反馈问题 ${arrow}</a> · <a href="/developers/">开发文档</a></p><p class="meta">${esc(work.license)}。独立开源项目，非 Anki 官方客户端。</p></section>`
  });

  const guideSections = guide.sections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.title)}</h2>${paragraphs(section.paragraphs)}${section.table ? `<div class="table-wrap"><table><thead><tr>${section.table.headers.map(header => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${section.steps ? `<ol class="steps">${section.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}${section.items ? questions(section.items) : ''}${paragraphs(section.after)}</section>`).join('\n');
  const guidePage = page({
    title: `${guide.title}｜记得闪卡`, description: guide.description, pathname: guide.pathname, breadcrumbTitle: guide.navTitle, ogType: 'article', markdown: '/content/harmonyos-anki-guide.md', className: 'guide-page',
    graph: [application, { '@type': 'TechArticle', '@id': `${origin}${guide.pathname}#article`, headline: guide.title, description: guide.description, dateModified: guide.updatedAt, inLanguage: 'zh-CN', author: { '@id': `${origin}/#author` }, about: { '@id': `${origin}/#app` }, mainEntityOfPage: `${origin}${guide.pathname}` }],
    body: `${pageHeader('使用指南 · HarmonyOS NEXT', guide.title, guide.intro)}<p class="meta">作者：${esc(data.author.name)} · 更新于 <time datetime="${guide.updatedAt}">${guide.updatedAt}</time></p>
    <div class="document-layout"><aside><nav class="toc" aria-label="文章目录"><h2>阅读目录</h2><ol>${guide.sections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('\n')}</ol><a class="markdown-link" href="/content/harmonyos-anki-guide.md">阅读 Markdown ${arrow}</a></nav></aside><article class="guide">${guideSections}
    <section id="references"><h2>进一步阅读与反馈</h2><ul>${guide.references.map(reference => `<li><a href="${esc(reference.url)}">${esc(reference.title)} ${arrow}</a></li>`).join('')}<li>${sourceLink('README.md', '记得闪卡源码与功能说明')}</li><li>源码仓库：${repoLinks}</li><li><a href="${esc(work.repository)}/issues">记得闪卡问题反馈 ${arrow}</a></li></ul><p class="meta">本文结合项目公开说明与 Anki 官方手册整理。界面与具体选项以当前正式版为准。记得闪卡是独立开源项目，非 Anki 官方客户端。</p></section>
    <section class="guide-entry"><h2>下载记得闪卡</h2><p>在 HarmonyOS NEXT 上导入牌组、复习和同步。</p>${download}<a href="/works/jidecards/">查看完整功能与新版展示 <span aria-hidden="true">→</span></a></section></article></div>`
  });

  const developers = page({
    title: '开发文档｜记得闪卡', description: '记得闪卡的源码、构建文档与 Agent 开发入口。', pathname: '/developers/', breadcrumbTitle: '开发文档', markdown: '/content/developers.md',
    body: `${pageHeader('源码与协作', '一起把记得闪卡做好。', '项目优先服务 Agent 开发。')}<p>这里的 Agent 指参与仓库开发的编程 Agent。源码与当前开发文档是理解应用能力、模块边界和验证要求的入口。</p>
    <div class="developer-grid"><section class="developer-card"><p class="eyebrow">01 · 开始</p><h2>了解项目</h2><ul><li>${sourceLink('AGENTS.md', '开发约定')}</li><li>${sourceLink('PROJECT_CONTEXT.md', '项目索引')}</li><li>${sourceLink('README.md', '环境与构建')}</li></ul></section><section class="developer-card"><p class="eyebrow">02 · 修改</p><h2>找准责任入口</h2><ul><li>${sourceLink('docs/development/ownership.md', '模块责任与边界')}</li><li>${sourceLink('docs/development/extension-points.md', '扩展点')}</li><li>${sourceLink('docs/development/task-contract.md', '任务契约')}</li></ul></section><section class="developer-card"><p class="eyebrow">03 · 验证</p><h2>提交可验证的改进</h2><ul><li>${sourceLink('docs/development/verification.md', '验证命令与范围')}</li><li>${sourceLink('docs/choice-authoring.md', '选择题制卡指南')}</li><li>${sourceLink('docs/choice-apkg-v1.md', 'APKG 扩展规范')}</li></ul></section></div>
    <section><h2>源码仓库</h2><div class="repository-links">${repoLinks}</div><p class="meta">ArkUI → Node-API → Rust / Anki Core。许可证：${esc(work.license)}。</p></section>
    <section><h2>JIDE 应用内助手</h2><p>${esc(jide.availability)}</p><p><a href="/works/jidecards/#jide">${esc(jide.title)}</a> · ${sourceLink('docs/development/agent.md', '实现与验证')} · ${sourceLink('entry/src/main/ets/model/ReleaseFeatures.ets', 'ReleaseFeatures')}</p></section>
    <section class="machine-section" id="machine-readable"><h2>AI 与爬虫读取入口</h2><p>网站正文在构建时输出为完整 HTML；功能、版本、适用平台、更新说明和能力边界同时提供 Markdown 与 JSON。所有访问者读取同一套内容。</p><dl class="feature-list"><div><dt>资料索引</dt><dd><a href="/llms.txt">llms.txt</a> · <a href="/data/site-index.json">页面与 Markdown 清单</a></dd></div><div><dt>完整资料</dt><dd><a href="/llms-full.txt">llms-full.txt</a> · <a href="/content/product.md">产品 Markdown</a> · <a href="/content/harmonyos-anki-guide.md">指南 Markdown</a></dd></div><div><dt>结构化事实</dt><dd><a href="/data/works.json">产品 JSON</a> · <a href="/sitemap.xml">网站地图</a> · <a href="/releases.xml">版本更新订阅</a></dd></div></dl></section>`
  });

  const release = page({
    title: `${work.releaseVersion} 更新说明｜记得闪卡`, description: `记得闪卡 ${work.releaseVersion} 的编辑器、牌组、学习、白板、统计和 JIDE 更新说明。`, pathname: '/releases/', breadcrumbTitle: '更新说明', markdown: '/content/releases.md', ogType: 'article',
    graph: [application, sourceCode, { '@type': 'TechArticle', headline: `记得闪卡 ${work.releaseVersion} 更新说明`, dateModified: work.sourceUpdate.updatedAt, author: { '@id': `${origin}/#author` }, mainEntityOfPage: `${origin}/releases/` }],
    body: `${pageHeader('版本更新', `${work.releaseVersion} 更新说明`, '完善制卡工具、学习体验与日常管理。')}<p class="release-meta"><span class="version-pill">正式版 ${esc(work.releaseVersion)}</span><time datetime="${work.sourceUpdate.updatedAt}">${work.sourceUpdate.updatedAt}</time><a href="/content/releases.md">Markdown</a><a href="/releases.xml">订阅更新</a></p><article class="release-article" id="release-${work.releaseVersion.replaceAll('.', '-')}">${changes}</article><section class="guide-entry"><h2>继续你的学习</h2>${download}<a href="/works/jidecards/">了解完整功能 <span aria-hidden="true">→</span></a></section>`
  });

  const about = page({
    title: `${data.author.name}｜作者`, description: `${data.author.name}，记得闪卡开发者。`, pathname: '/about/', breadcrumbTitle: '关于', markdown: '/content/about.md',
    body: `${pageHeader('关于项目', '记得闪卡，持续改进。', '一个面向 HarmonyOS NEXT 的独立开源闪卡项目。')}<div class="about-project">${logo('about-logo', 120, '记得闪卡应用 Logo')}<div><h2>${esc(data.author.name)}</h2><p>记得闪卡开发者。</p><p>把学习资料整理成卡片，让回忆与复习成为日常。项目复用 Anki Core，使用 HarmonyOS 原生界面，源码公开。</p></div></div><dl class="feature-list"><div><dt>作品</dt><dd><a href="/works/jidecards/">记得闪卡 · ${esc(work.platform)}</a></dd></div><div><dt>当前版本</dt><dd>${esc(work.releaseVersion)} · <a href="/releases/">更新说明</a></dd></div><div><dt>作者</dt><dd><a href="${esc(data.author.github)}">wuweiyouzuoju ${arrow}</a></dd></div><div><dt>反馈与协作</dt><dd><a href="${esc(work.repository)}/issues">GitHub Issues ${arrow}</a> · <a href="/developers/">开发文档</a></dd></div><div><dt>源码许可</dt><dd>${esc(work.license)} · ${repoLinks}</dd></div></dl><p class="meta">独立开源项目，非 Anki 官方客户端。</p>`
  });
  return {
    'index.html': home, 'works/jidecards/index.html': product, [`${guide.pathname.slice(1)}index.html`]: guidePage,
    'developers/index.html': developers, 'releases/index.html': release, 'about/index.html': about,
    '404.html': page({ title: '页面不存在｜记得闪卡', description: '页面不存在。', pathname: '/404.html', noindex: true, className: 'not-found', body: `<p class="eyebrow">404</p><h1>这一页还没有卡片。</h1><p>可以回到首页，或从使用指南继续。</p><div class="actions"><a class="button" href="/">返回首页</a><a class="button secondary" href="${guide.pathname}">阅读使用指南</a></div>` })
  };
}
