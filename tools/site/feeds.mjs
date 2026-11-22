// SPDX-License-Identifier: AGPL-3.0-or-later
import { esc } from './layout.mjs';

export function renderFeeds(content) {
  const { data, work, guide, origin, repositories } = content;
  const market = work.marketplace;
  const releaseNotes = market.changes.map((change, index) => `${index + 1}. ${change}`).join('\n');
  const facts = `- 华为应用市场正式版：${market.version}（已上架）
- 平台：${work.platform}
- 许可证：${work.license}
- 作者：[${data.author.name}](${data.author.url})
- 下载：[华为应用市场](${work.marketplace.url})
- 源码：${repositories.map(item => `[${item.name}](${item.url})`).join(' · ')}
- 更新日期：${data.updatedAt}

记得闪卡是使用 Anki Core 的独立开源项目。

[独立开发声明](${origin}/about/independent-development/)`;
  const detailed = work.detailSections.map(section => `## ${section.title}\n\n${section.paragraphs.join('\n\n')}${section.availability ? `\n\n${section.availability}` : ''}${section.items ? `\n\n${section.items.map(item => `- ${item.name}：${item.description}${item.example ? ` 示例：“${item.example}”` : ''}`).join('\n')}` : ''}`).join('\n\n');
  const media = work.screenshots.map(item => `### ${item.caption}\n\n${item.description}\n\n![${item.caption}](${origin}${item.path})\n\n截图版本：${item.releaseVersion}。${item.source}。`).join('\n\n');
  const table = item => `| ${item.headers.join(' | ')} |\n| ${item.headers.map(() => '---').join(' | ')} |\n${item.rows.map(row => `| ${row.join(' | ')} |`).join('\n')}`;
  const guideText = `# ${guide.title}

原文：${origin}${guide.pathname}
作者：${data.author.name}。内容更新：${guide.updatedAt}。

${guide.intro}

${guide.sections.map(section => `## ${section.title}\n\n${(section.paragraphs ?? []).join('\n\n')}\n\n${section.table ? table(section.table) : ''}\n${(section.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n')}\n${(section.items ?? []).map(item => `- ${item.name}：${item.description}`).join('\n')}\n${(section.after ?? []).join('\n\n')}`).join('\n\n')}

## 参考资料

${guide.references.map(item => `- [${item.title}](${item.url})`).join('\n')}
`;
  const releaseText = `# 记得闪卡 ${market.version} 更新说明\n\n原文：${origin}/releases/\n更新日期：${market.updatedAt}。\n\n${market.summary}\n\n${releaseNotes}\n\n${facts}\n`;
  const developersText = `# 记得闪卡开发文档

原文：${origin}/developers/

项目优先服务 Agent 开发。编程 Agent 和开发者可以从项目索引找到代码入口，再按模块查看构建和验证要求。

${facts}

当前仓库版本：${work.sourceVersion}（构建编号 ${work.sourceVersionCode}）。\n\n[签名 HAP 开发包](${work.sourcePackage.downloadUrl}) · [SHA-256 校验](${work.sourcePackage.checksumsUrl}) · [构建记录](${work.sourcePackage.releaseUrl})。\n\n${work.sourcePackage.installNote}\n\n## 责任与构建入口

- [开发约定](${work.repository}/blob/main/AGENTS.md)
- [项目索引](${work.repository}/blob/main/PROJECT_CONTEXT.md)
- [环境与构建](${work.repository}/blob/main/README.md)
- [模块责任与边界](${work.repository}/blob/main/docs/development/ownership.md)
- [扩展点](${work.repository}/blob/main/docs/development/extension-points.md)
- [开发任务契约](${work.repository}/blob/main/docs/development/task-contract.md)
- [验证命令与范围](${work.repository}/blob/main/docs/development/verification.md)
- [功能状态与兼容边界](${work.repository}/blob/main/docs/FEATURE_STATUS.md)
- [JIDE 实现与验证](${work.repository}/blob/main/docs/development/agent.md)

${work.detailSections.find(item => item.id === 'jide').availability}

[该版本入口配置](${market.jide.evidence})

## 机器可读入口

正文在构建时输出完整 HTML，功能、版本、平台、更新说明和能力边界由同一套内容生成 Markdown 与 JSON。

- [资料索引](${origin}/llms.txt)
- [完整资料](${origin}/llms-full.txt)
- [页面与内容 JSON](${origin}/data/site-index.json)
- [产品 JSON](${origin}/data/works.json)
- [网站地图](${origin}/sitemap.xml)
- [版本更新订阅](${origin}/releases.xml)
`;
  const highlights = work.learningHighlights.map(item => `- [${item.name}](${work.url}technical/#${item.section}) — ${item.description}`).join('\n');
  const groups = work.featureGroups.map(item => `- ${item.name}：${item.description}`).join('\n');
  const jide = work.detailSections.find(item => item.id === 'jide');
  const questionText = items => items.map(item => `### ${item.name}\n\n${item.description}`).join('\n\n');
  const publicQuestions = questionText(work.questions.slice(0, 3));
  const technicalText = `# 进阶功能与兼容性\n\n原文：${work.url}technical/\n\n${detailed}\n\n[JIDE 入口配置](${market.jide.evidence})\n\n## ${work.promotion.title}\n\n${work.promotion.description} ${work.promotion.details}\n\n## 进阶问答\n\n${questionText(work.questions.slice(3))}\n`;
  const statementText = `# 独立开发声明\n\n原文：${origin}/about/independent-development/\n\n${work.developmentStatement}\n`;
  const productText = `# 记得闪卡 JideCards\n\n原文：${work.url}\n\n${work.summary}\n\n${facts}\n\n## 学习场景\n\n${work.useCases.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n## 功能概览\n\n${highlights}\n\n## 全部功能\n\n${groups}\n\n## 应用截图\n\n${media}\n\n## 常见问题\n\n${publicQuestions}\n\n[进阶功能与兼容性](${work.url}technical/) · [${market.version} 更新说明](${origin}/releases/)\n`;
  const homeText = `# 记得闪卡 JideCards\n\n${work.brand.headline[1]}\n\n${work.summary}\n\n[华为应用市场免费下载](${market.url}) · ${market.version} 已上架\n\n## 三步开始\n\n${highlights}\n\n## 可以用来学什么\n\n${work.useCases.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n## 功能一览\n\n${groups}\n\n## ${jide.title}\n\n${jide.paragraphs[0]}\n\n${jide.availability}\n\n## 鸿蒙原生界面，Anki 内核\n\n${work.detailSections.find(item => item.id === 'native').paragraphs[0]}\n\n## ${work.promotion.title}\n\n${work.promotion.description}\n\n## 应用界面\n\n${work.screenshots.map(item => `- [${item.caption}](${origin}${item.path})：${item.description}`).join('\n')}\n\n## ${market.version} 更新\n\n${market.summary}\n\n## 常见问题\n\n${publicQuestions}\n\n[功能与截图](${work.url}) · [使用指南](${origin}${guide.pathname}) · [更新说明](${origin}/releases/)\n`;
  const aboutText = `# 关于记得闪卡\n\n${data.author.name}，记得闪卡独立开发者。\n\n${facts}\n\n[GitHub 作者主页](${data.author.github}) · [问题反馈](${work.repository}/issues)\n`;
  const pages = [
    { path: '/', title: '记得闪卡 JideCards', description: work.summary, markdown: '/content/home.md' },
    { path: '/works/jidecards/', title: '记得闪卡功能与下载', description: work.summary, markdown: '/content/product.md' },
    { path: '/works/jidecards/technical/', title: '进阶功能与兼容性', description: '同步方式、备份格式、卡片模板、快捷键和 JIDE 的使用条件。', markdown: '/content/technical.md' },
    { path: '/about/independent-development/', title: '独立开发声明', description: '记得闪卡项目的开发和维护归属说明。', markdown: '/content/independent-development.md' },
    { path: guide.pathname, title: guide.title, description: guide.description, markdown: '/content/harmonyos-anki-guide.md', updatedAt: guide.updatedAt },
    { path: '/releases/', title: `${market.version} 更新说明`, description: market.summary, markdown: '/content/releases.md' },
    { path: '/developers/', title: '开发文档', description: '源码、模块责任、构建与验证入口。', markdown: '/content/developers.md' },
    { path: '/about/', title: '关于项目与作者', description: `${data.author.name}，记得闪卡独立开发者。`, markdown: '/content/about.md' }
  ].map(item => ({ ...item, url: `${origin}${item.path}`, markdownUrl: `${origin}${item.markdown}`, updatedAt: item.updatedAt ?? data.updatedAt }));
  const llms = `# 记得闪卡（JideCards）

> ${work.summary}

${facts}

## 文档

${pages.map(item => `- [${item.title}](${item.markdownUrl}): ${item.description}`).join('\n')}

## 完整资料与结构化数据

- [llms-full.txt](${origin}/llms-full.txt): 产品能力、状态边界、版本说明、宣传图文字说明和完整使用指南。
- [页面与内容 JSON](${origin}/data/site-index.json): 每页 HTML、Markdown 链接和更新日期。
- [产品 JSON](${origin}/data/works.json): 平台、版本、功能、源码、作者和应用截图。
- [使用指南 JSON](${origin}/data/harmonyos-anki-guide.json): 指南原始正文、操作步骤、表格与参考资料。
- [网站地图](${origin}/sitemap.xml): 所有可索引页面。
- [版本更新订阅](${origin}/releases.xml): 版本说明 Atom 订阅。

## 外观

${work.promotion.title}：${work.promotion.description} ${work.promotion.details}
`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(item => `  <url><loc>${esc(item.url)}</loc><lastmod>${item.updatedAt}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  const updated = `${market.updatedAt}T00:00:00+08:00`;
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>记得闪卡版本更新</title><id>${origin}/releases.xml</id><link href="${origin}/releases.xml" rel="self"/><link href="${origin}/releases/"/><updated>${updated}</updated><author><name>${esc(data.author.name)}</name></author><entry><title>记得闪卡 ${esc(market.version)} 更新</title><id>${origin}/releases/#release-${market.version.replaceAll('.', '-')}</id><link href="${origin}/releases/#release-${market.version.replaceAll('.', '-')}"/><updated>${updated}</updated><content type="text">${esc(releaseNotes)}</content></entry></feed>
`;
  return {
    'llms.txt': llms, 'llms-full.txt': `${llms}\n${productText}\n${technicalText}\n${guideText}\n${developersText}\n${releaseText}\n${aboutText}\n${statementText}\n`,
    'content/technical.md': technicalText, 'content/independent-development.md': statementText,
    'content/home.md': homeText, 'content/product.md': productText, 'content/harmonyos-anki-guide.md': guideText,
    'content/releases.md': releaseText, 'content/developers.md': developersText, 'content/about.md': aboutText,
    'data/site-index.json': `${JSON.stringify({ schemaVersion: 1, updatedAt: data.updatedAt, origin, sourceVersion: work.sourceVersion, sourceVersionCode: work.sourceVersionCode, marketplace: { version: market.version, status: market.status, url: market.url }, contentLanguage: 'zh-CN', product: `${origin}/data/works.json`, llms: `${origin}/llms.txt`, fullText: `${origin}/llms-full.txt`, releaseFeed: `${origin}/releases.xml`, pages }, null, 2)}\n`,
    'sitemap.xml': sitemap, 'releases.xml': atom, 'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
  };
}
