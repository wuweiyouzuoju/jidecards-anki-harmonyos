// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-time HTML, Markdown and JSON share one content model; no client-side rendering.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './site/content.mjs';
import { createLayout } from './site/layout.mjs';
import { renderPages } from './site/pages.mjs';
import { renderFeeds } from './site/feeds.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = await loadContent(root);
const outputs = { ...renderPages(content, createLayout(content)), ...renderFeeds(content) };
await mkdir(path.join(content.hosting, 'assets'), { recursive: true });
await writeFile(path.join(content.hosting, content.work.brand.logo), content.logo);
await writeFile(path.join(content.hosting, 'data/works.json'), `${JSON.stringify(content.data, null, 2)}\n`);
for (const [file, body] of Object.entries(outputs)) {
  const destination = path.join(content.hosting, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${body.replace(/[\t ]+$/gm, '').trimEnd()}\n`, 'utf8');
}
console.log(`Generated ${Object.keys(outputs).length} public documents for release ${content.work.releaseVersion}.`);
