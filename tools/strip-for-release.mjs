#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// 导出当前工作树的源码副本；不改源码、不删除任何已有输出目录。
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSON5 from 'json5';

const signingFields = new Set(['certpath', 'keyAlias', 'keyPassword', 'profile', 'storeFile', 'storePassword']);

export function sanitizeSigning(source) {
  // 配置使用真正的 JSON5 解析器，只改字段值；不扫描或重写应用代码。
  const config = JSON5.parse(source);
  function redact(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (signingFields.has(key)) {
        if (typeof child !== 'string') throw new Error(`Cannot sanitize signing field ${key}`);
        value[key] = '';
      } else redact(child);
    }
  }
  redact(config);
  return JSON5.stringify(config, null, 2) + '\n';
}

function contains(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}

export function validateDestination(source, destination) {
  const src = realpathSync(source);
  const out = resolve(destination);
  if (contains(src, out) || contains(out, src)) throw new Error('Output must be outside source and its ancestors.');
  // 要求父目录已存在，解析 junction/symlink 后再次检查；不创建任意路径树。
  const parent = realpathSync(dirname(out));
  const canonical = join(parent, relative(dirname(out), out));
  if (contains(src, canonical) || contains(canonical, src)) throw new Error('Output resolves inside source or an ancestor.');
  if (existsSync(out)) throw new Error('Output already exists; choose a new directory. Nothing was deleted.');
  return canonical;
}

export function exportSource(source, destination) {
  const src = realpathSync(source);
  const out = validateDestination(src, destination);
  const files = execFileSync('git', ['-C', src, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const unique = [...new Set(files)].filter(file => !file.startsWith('tools/experimental/') && !file.startsWith('.local/'));
  // 复制前完成所有检查与脱敏；工作树删除文件不再进入导出。
  const planned = [];
  for (const file of unique) {
    const input = resolve(src, file);
    if (!contains(src, input)) throw new Error('Invalid source path.');
    if (!existsSync(input)) continue;
    const info = lstatSync(input);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Unsupported source entry: ${file}`);
    if (!contains(src, realpathSync(input))) throw new Error(`Source escapes through a link: ${file}`);
    planned.push({ file, input, content: file.endsWith('build-profile.json5') ? sanitizeSigning(readFileSync(input, 'utf8')) : null });
  }
  if (!planned.length) throw new Error('No source files found; run from a Git working tree.');
  mkdirSync(out); // 独占创建；竞争者创建同名目录时直接失败，绝不覆盖。
  for (const item of planned) {
    const target = join(out, item.file);
    mkdirSync(dirname(target), { recursive: true });
    if (item.content === null) copyFileSync(item.input, target);
    else writeFileSync(target, item.content, 'utf8');
  }
  return { output: out, files: planned.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run export:source -- <new-output-directory>');
    console.log(exportSource(fileURLToPath(new URL('../', import.meta.url)), process.argv[2]));
    console.log('Source preserved. In output: npm ci && npm run verify -- repo. Configure local signing before HAP build.');
  } catch (error) {
    console.error(`[source-export] ${error.message}`);
    process.exitCode = 1;
  }
}
