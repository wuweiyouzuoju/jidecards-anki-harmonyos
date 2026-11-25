// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}
const failures = [];
let imports = 0;
const sourceFiles = files(path.join(root, 'src')).filter(file => /\.(ts|ets)$/.test(file));
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  if (!source.startsWith('// SPDX-License-Identifier: AGPL-3.0-or-later')) failures.push(`License: ${file}`);
  if (/AppStorage|\.onTouch\(|可移植积木/.test(source)) failures.push(`Legacy coupling: ${file}`);
  if (/backgroundBlurStyle|backdropBlur/.test(source) && path.relative(root, file).replaceAll('\\', '/') !== 'src/harmony/shared/Surface.ets') {
    failures.push(`Surface rendering outside shared owner: ${file}`);
  }
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    imports++;
    const name = match[1];
    if (file.includes(`${path.sep}core${path.sep}`) && !name.startsWith('.')) failures.push(`Platform import in core: ${file}`);
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(file), name);
      if (!target.startsWith(path.join(root, 'src') + path.sep)) failures.push(`External source dependency: ${file}`);
      if (!['.ts', '.ets'].some(extension => existsSync(target + extension))) failures.push(`Missing import: ${file} -> ${name}`);
    } else if (!name.startsWith('@kit.') && !(name === 'libjide_glass_gpu.so' && path.relative(root, file).replaceAll('\\','/') === 'src/harmony/shared/GlassFusionGpu.ets')) failures.push(`Unexpected dependency: ${file} -> ${name}`);
  }
}
const documents = [path.join(root, 'README.md'), ...files(path.join(root, 'docs')).filter(file => file.endsWith('.md'))];
let links = 0;
for (const file of documents) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const name = match[1].split('#')[0];
    if (!name || /^[a-z]+:/i.test(name)) continue;
    links++;
    if (!existsSync(path.resolve(path.dirname(file), name))) failures.push(`Missing link: ${file} -> ${name}`);
  }
}
const provenance = JSON.parse(readFileSync(path.join(root, 'provenance.json'), 'utf8'));
const covered = new Set();
for (const asset of provenance.assets) {
  for (const target of asset.targets) {
    if (!existsSync(path.join(root, target))) failures.push(`Missing asset: ${target}`);
    covered.add(target);
  }
}
for (const file of sourceFiles) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (!covered.has(relative)) failures.push(`Missing provenance: ${relative}`);
}
for (const source of provenance.sources) {
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) failures.push(`Invalid SHA256: ${source.path}`);
  if (process.argv.includes('--sources')) {
    // 保留最初提炼依据；本轮主动改接的消费者文档不再当作当前输入。
    if (source.historical === true) continue;
    const absolute = path.resolve(provenance.workspaceRoot, source.path);
    if (!existsSync(absolute) || createHash('sha256').update(readFileSync(absolute)).digest('hex') !== source.sha256) {
      failures.push(`Source changed since capture: ${source.path}`);
    }
  }
}
const audit = JSON.parse(readFileSync(path.join(root, 'reuse-audit.json'), 'utf8'));
const evidencePaths = new Set(audit.snapshots.map(source => source.path));
const capabilityIds = new Set();
for (const item of audit.capabilities) {
  if (capabilityIds.has(item.id)) failures.push(`Duplicate capability: ${item.id}`);
  capabilityIds.add(item.id);
}
for (const item of [...audit.capabilities, ...audit.governance, ...audit.referenceOnly]) {
  for (const file of [...item.sources, ...item.consumers, ...(item.evidence || [])]) {
    if (!evidencePaths.has(file)) failures.push(`Missing audit evidence: ${file}`);
  }
}
if (process.argv.includes('--sources')) {
  for (const source of audit.snapshots) {
    const file = path.resolve(audit.workspaceRoot, source.path);
    if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== source.sha256) {
      failures.push(`Audit evidence changed since capture: ${source.path}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`PASS: ${sourceFiles.length} modules, ${imports} imports, ${links} links, ${provenance.sources.length} module source records; ${audit.capabilities.length} cross-product groups, ${audit.snapshots.length} audit evidence files.`);
