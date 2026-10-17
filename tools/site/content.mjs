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
  if (work.sourcePackage?.tag !== `v${app.versionName}` ||
    work.sourcePackage.fileName !== `jidecards-v${app.versionName}-signed.hap`) {
    throw new Error('Source HAP metadata must match the current application version.');
  }
  // 市场版本由作者确认，当前源码版本读取应用配置；截图保留各自的历史版本。
  if (!work.releaseVersion || !work.releaseVersionSource) throw new Error('Author-confirmed website release is required.');
  if (!work.screenshots.length) throw new Error('Current author-supplied product media is required.');
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
