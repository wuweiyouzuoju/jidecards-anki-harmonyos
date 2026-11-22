// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSON5 from 'json5';

export async function loadContent(root) {
  const hosting = path.join(root, 'hosting');
  const data = JSON.parse(await readFile(path.join(hosting, 'data/works.json'), 'utf8'));
  const guide = JSON.parse(await readFile(path.join(hosting, 'data/harmonyos-anki-guide.json'), 'utf8'));
  const { app } = JSON5.parse(await readFile(path.join(root, 'AppScope/app.json5'), 'utf8'));
  const work = data.works[0];
  work.sourceVersion = app.versionName;
  work.sourceVersionCode = app.versionCode;
  const market = work.marketplace;
  const jide = work.detailSections.find(section => section.id === 'jide');
  const jideDefaults = { visible: '默认显示', hidden: '默认隐藏' };
  const entryDefault = jideDefaults[market.jide?.entryDefault];
  if (!entryDefault || !market.jide.evidence.includes(`/blob/v${market.version}/`)) {
    throw new Error('JIDE availability must cite a source for the listed marketplace release.');
  }
  jide.availability = `公开发布的 ${market.version} 版本配置中，JIDE 入口${entryDefault}。使用 JIDE 需要配置模型服务。使用联网检索时，还需在应用中开启联网并配置搜索凭据。`;
  const packageVersion = work.sourcePackage?.tag?.match(/^v(\d+\.\d+\.\d+(?:\.\d+)?)$/)?.[1];
  // 已发布下载包有独立事实来源；源码升版不能编造尚未发布的下载链接。
  if (!packageVersion || work.sourcePackage.fileName !== `jidecards-v${packageVersion}-signed.hap`) {
    throw new Error('Published HAP filename must match its own release tag.');
  }
  // 没有当前截图时允许空目录，不回退到历史宣传图。
  for (const item of work.screenshots) {
    if (!item.releaseVersion || !item.path.includes(`-${item.releaseVersion}-`)) throw new Error(`Product media version does not match its provenance: ${item.path}`);
    const bytes = await readFile(path.join(hosting, item.path));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== item.sha256) throw new Error(`Product media does not match author-supplied bytes: ${item.path}`);
  }
  const css = await readFile(path.join(hosting, 'styles.css'));
  const logo = await readFile(path.join(root, 'AppScope/resources/base/media/app_icon.png'));
  const logoPreview = await readFile(path.join(hosting, 'apple-touch-icon.png'));
  const logoSmallPreview = await readFile(path.join(hosting, 'favicon-32x32.png'));
  const mediaLoader = await readFile(path.join(hosting, 'assets/site-media.mjs'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return {
    root, hosting, data, guide, work, logo,
    logoPreview: `data:image/png;base64,${logoPreview.toString('base64')}`,
    logoSmallPreview: `data:image/png;base64,${logoSmallPreview.toString('base64')}`,
    origin: 'https://jidecards.com',
    assets: { css: hash(css), logo: hash(logo), media: hash(mediaLoader) },
    repositories: [{ name: 'GitHub', url: work.repository }, ...work.repositoryMirrors]
  };
}
