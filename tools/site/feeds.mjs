// SPDX-License-Identifier: AGPL-3.0-or-later
import { esc } from './layout.mjs';

export function renderFeeds(content) {
  const { data, work, guide, origin, repositories } = content;
  const releaseNotes = work.sourceUpdate.changes.map((change, index) => `${index + 1}. ${change}`).join('\n');
  const facts = `- 正式版：${work.releaseVersion}
- 源码版本：${work.sourceVersion}（构建编号 ${work.sourceVersionCode}）
- 平台：${work.platform}
- 许可证：${work.license}
- 作者：[${data.author.name}](${data.author.url})
- 下载：[华为应用市场](${work.marketplace.url})
- 源码：${repositories.map(item => `[${item.name}](${item.url})`).join(' · ')}
- 更新日期：${data.updatedAt}

独立开源项目，非 Anki 官方客户端。

## 独立开发声明

${work.developmentStatement}`;
  const detailed = work.detailSections.map(section => `## ${section.title}\n\n${section.paragraphs.join('\n\n')}${section.availability ? `\n\n${section.availability}` : ''}${section.items ? `\n\n${section.items.map(item => `- ${item.name}：${item.description}${item.example ? ` 示例：“${item.example}”` : ''}`).join('\n')}` : ''}`).join('\n\n');
  const media = work.screenshots.map(item => `### ${item.caption}\n\n${item.description}\n\n![${item.caption}](${origin}${item.path})\n\n版本：${item.releaseVersion}。${item.source}。`).join('\n\n');
  const table = item => `| ${item.headers.join(' | ')} |\n| ${item.headers.map(() => '---').join(' | ')} |\n${item.rows.map(row => `| ${row.join(' | ')} |`).join('\n')}`;
  const guideText = `# ${guide.title}

原文：${origin}${guide.pathname}
作者：${data.author.name}。内容更新：${guide.updatedAt}。

${guide.intro}

${guide.sections.map(section => `## ${section.title}\n\n${(section.paragraphs ?? []).join('\n\n')}\n\n${section.table ? table(section.table) : ''}\n${(section.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n')}\n${(section.items ?? []).map(item => `- ${item.name}：${item.description}`).join('\n')}\n${(section.after ?? []).join('\n\n')}`).join('\n\n')}

## 参考资料

${guide.references.map(item => `- [${item.title}](${item.url})`).join('\n')}
`;
  const releaseText = `# 记得闪卡 ${work.releaseVersion} 更新说明\n\n原文：${origin}/releases/\n更新日期：${work.sourceUpdate.updatedAt}。\n\n${releaseNotes}\n\n${facts}\n`;
  const developersText = `# 记得闪卡开发文档

原文：${origin}/developers/

项目优先服务 Agent 开发；这里的 Agent 指辅助作者开发仓库的编程 Agent。

${facts}

## 责任与构建入口

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

## 机器可读入口

正文在构建时输出完整 HTML，功能、版本、平台、更新说明和能力边界由同一套内容生成 Markdown 与 JSON。

- [资料索引](${origin}/llms.txt)
- [完整资料](${origin}/llms-full.txt)
- [页面与内容 JSON](${origin}/data/site-index.json)
- [产品 JSON](${origin}/data/works.json)
- [网站地图](${origin}/sitemap.xml)
- [版本更新订阅](${origin}/releases.xml)
`;
  const productText = `# 记得闪卡 JideCards\n\n原文：${work.url}\n\n${work.summary}\n\n${facts}\n\n## 学习用途\n\n${work.useCases.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n## 功能概览\n\n${work.featureGroups.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n${detailed}\n\n## ${work.promotion.title}\n\n${work.promotion.description} ${work.promotion.details}\n\n## 新版应用展示\n\n${media}\n\n## 常见问题\n\n${work.questions.map(item => `### ${item.name}\n\n${item.description}`).join('\n\n')}\n\n## ${work.releaseVersion} 更新说明\n\n${releaseNotes}\n`;
  const homeText = `# 记得闪卡 JideCards\n\n${work.brand.headline.join('')}\n\n${work.summary}\n\n${facts}\n\n## 学习与资料\n\n${work.useCases.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n${work.featureGroups.map(item => `- ${item.name}：${item.description}`).join('\n')}\n\n## ${work.promotion.title}\n\n${work.promotion.description} ${work.promotion.details}\n\n## ${work.releaseVersion} 更新说明\n\n${releaseNotes}\n\n[完整功能](${work.url}) · [使用指南](${origin}${guide.pathname}) · [开发文档](${origin}/developers/)\n`;
  const aboutText = `# 关于记得闪卡\n\n${data.author.name}，记得闪卡独立开发者。\n\n${facts}\n\n[GitHub 作者主页](${data.author.github}) · [问题反馈](${work.repository}/issues)\n`;
  const pages = [
    { path: '/', title: '记得闪卡 JideCards', description: work.summary, markdown: '/content/home.md' },
    { path: '/works/jidecards/', title: '记得闪卡功能与下载', description: work.summary, markdown: '/content/product.md' },
    { path: guide.pathname, title: guide.title, description: guide.description, markdown: '/content/harmonyos-anki-guide.md', updatedAt: guide.updatedAt },
    { path: '/releases/', title: `${work.releaseVersion} 更新说明`, description: '当前版本的完整编号更新说明。', markdown: '/content/releases.md' },
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
- [产品 JSON](${origin}/data/works.json): 平台、版本、功能、源码、作者和新版宣传图。
- [使用指南 JSON](${origin}/data/harmonyos-anki-guide.json): 指南原始正文、操作步骤、表格与参考资料。
- [网站地图](${origin}/sitemap.xml): 所有可索引页面。
- [版本更新订阅](${origin}/releases.xml): 版本说明 Atom 订阅。

## 外观

${work.promotion.title}：${work.promotion.description} ${work.promotion.details}
`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(item => `  <url><loc>${esc(item.url)}</loc><lastmod>${item.updatedAt}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  const updated = `${work.sourceUpdate.updatedAt}T00:00:00+08:00`;
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>记得闪卡版本更新</title><id>${origin}/releases.xml</id><link href="${origin}/releases.xml" rel="self"/><link href="${origin}/releases/"/><updated>${updated}</updated><author><name>${esc(data.author.name)}</name></author><entry><title>记得闪卡 ${esc(work.releaseVersion)}</title><id>${origin}/releases/#release-${work.releaseVersion.replaceAll('.', '-')}</id><link href="${origin}/releases/#release-${work.releaseVersion.replaceAll('.', '-')}"/><updated>${updated}</updated><content type="text">${esc(releaseNotes)}</content></entry></feed>
`;
  return {
    'llms.txt': llms, 'llms-full.txt': `${llms}\n${productText}\n${guideText}\n${developersText}\n${releaseText}\n`,
    'content/home.md': homeText, 'content/product.md': productText, 'content/harmonyos-anki-guide.md': guideText,
    'content/releases.md': releaseText, 'content/developers.md': developersText, 'content/about.md': aboutText,
    'data/site-index.json': `${JSON.stringify({ schemaVersion: 1, updatedAt: data.updatedAt, origin, releaseVersion: work.releaseVersion, contentLanguage: 'zh-CN', product: `${origin}/data/works.json`, llms: `${origin}/llms.txt`, fullText: `${origin}/llms-full.txt`, releaseFeed: `${origin}/releases.xml`, pages }, null, 2)}\n`,
    'sitemap.xml': sitemap, 'releases.xml': atom, 'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
  };
}
