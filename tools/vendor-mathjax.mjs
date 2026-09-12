// SPDX-License-Identifier: AGPL-3.0-or-later
// 固定来源和校验值，重新生成随 HAP 分发的离线公式资源。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '3.2.2';
const integrity = 'Bt+SSVU8eBG27zChVewOicYs7Xsdt40qm4+UpHyX7k0/O9NliPc+x77k1/FEsPsjKPZGJvtRZM1vO+geW0OhGw==';
const source = `https://registry.npmjs.org/mathjax/-/mathjax-${version}.tgz`;
const cache = path.join(root, 'tmp', 'mathjax-vendor');
const dest = path.join(root, 'entry/src/main/resources/rawfile/mathjax');
await mkdir(cache, { recursive: true });
await mkdir(dest, { recursive: true });
const archivePath = path.join(cache, `mathjax-${version}.tgz`);
let archive;
if (existsSync(archivePath)) {
  archive = await readFile(archivePath);
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`MathJax download: ${response.status}`);
  archive = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha512').update(archive).digest('base64') !== integrity) {
  throw new Error('MathJax archive integrity mismatch');
}
await writeFile(archivePath, archive);
const distributed = [['es5/tex-svg-full.js', 'tex-svg-full.js'], ['es5/input/mml.js', 'input/mml.js'], ['es5/input/mml/entities.js', 'input/mml/entities.js'], ['LICENSE', 'LICENSE']];
execFileSync('tar', ['-xzf', archivePath, '-C', cache, ...distributed.map(([from]) => 'package/' + from)]);
const files = {};
for (const [from, to] of distributed) {
  await mkdir(path.dirname(path.join(dest, to)), { recursive: true });
  await copyFile(path.join(cache, 'package', from), path.join(dest, to));
  files[to] = createHash('sha256').update(await readFile(path.join(dest, to))).digest('hex');
}
await writeFile(path.join(dest, 'manifest.json'), JSON.stringify({ version, source, integrity: `sha512-${integrity}`, files }, null, 2) + '\n');
console.log(`Vendored MathJax ${version}: SVG fonts, TeX packages and mhchem are embedded in tex-svg-full.js.`);
