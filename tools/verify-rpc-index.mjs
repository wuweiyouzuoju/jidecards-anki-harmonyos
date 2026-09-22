// SPDX-License-Identifier: AGPL-3.0-or-later

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as serviceIndex from '../entry/src/main/ets/backend/服务索引.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'tools', 'rpc-index-methods.json');
const baselinePath = path.join(root, 'tools', 'rpc-index-baseline.json');

const serviceNames = new Map([
  ['后端同步', 'sync'], ['后端集合', 'collection'], ['后端卡片', 'cards'], ['后端牌组', 'decks'],
  ['后端配置', 'config'], ['后端牌组配置', 'deck_config'], ['后端调度器', 'scheduler'],
  ['后端Ankidroid', 'ankidroid'], ['后端AnkiHub', 'anki_hub'], ['后端AnkiWeb', 'ankiweb'],
  ['后端链接', 'links'], ['后端笔记类型', 'notetypes'], ['后端笔记', 'notes'],
  ['后端卡片渲染', 'card_rendering'], ['后端搜索', 'search'], ['后端Github', 'github'],
  ['后端国际化', 'i18n'], ['后端图片遮罩', 'image_occlusion'], ['后端导入导出', 'import_export'],
  ['后端媒体', 'media'], ['后端统计', 'stats'], ['后端标签', 'tags']
]);

const methodNames = new Map([
  ['集合方法', 'collection'], ['牌组方法', 'decks'], ['牌组配置方法', 'deck_config'],
  ['调度器方法', 'scheduler'], ['卡片渲染方法', 'card_rendering'], ['笔记类型方法', 'notetypes'],
  ['笔记方法', 'notes'], ['导入导出方法', 'import_export'], ['统计方法', 'stats'],
  ['同步方法', 'sync'], ['卡片方法', 'cards'], ['配置方法', 'config'],
  ['Ankidroid方法', 'ankidroid'], ['AnkiHub方法', 'anki_hub'], ['AnkiWeb方法', 'ankiweb'],
  ['链接方法', 'links'], ['搜索方法', 'search'], ['Github方法', 'github'],
  ['国际化方法', 'i18n'], ['图片遮罩方法', 'image_occlusion'], ['媒体方法', 'media'],
  ['标签方法', 'tags']
]);

function generatedServiceIds(source) {
  const values = new Map();
  for (const match of source.matchAll(/^\s*(\d+)\s*=>\s*self\.run_backend_([a-z0-9_]+)_service_method/mg)) values.set(match[2], Number(match[1]));
  return values;
}

function generatedMethodIds(source, service) {
  const marker = `pub(crate) fn run_backend_${service}_service_method`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing generated service ${service}`);
  const next = source.indexOf('pub(crate) fn run_backend_', start + marker.length);
  const body = source.slice(start, next < 0 ? source.length : next);
  const dispatch = body.match(/match method\s*\{([\s\S]*?)\n\s*_\s*=>/);
  if (dispatch === null) throw new Error(`missing method dispatch for ${service}`);
  const methods = new Map();
  const dispatchSource = dispatch[1];
  const starts = [...dispatchSource.matchAll(/^\s*(\d+)\s*=>\s*\{/gm)];
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index].index ?? 0;
    const end = index + 1 < starts.length ? (starts[index + 1].index ?? dispatchSource.length) : dispatchSource.length;
    const call = dispatchSource.slice(start, end).match(/(?:Backend\w+Service|backend::Backend|crate::backend::Backend)::([a-z0-9_]+)\s*\(/);
    if (call === null) throw new Error(`cannot determine ${service} method ${starts[index][1]}`);
    methods.set(Number(starts[index][1]), call[1]);
  }
  return methods;
}

export function parseGeneratedBackend(generated) {
  return Object.fromEntries([...generatedServiceIds(generated)].map(([service, id]) => [service, {
    id, methods: Object.fromEntries(generatedMethodIds(generated, service))
  }]));
}

export function verifyIndex(index, manifest, services) {
  if (Object.keys(index.服务号).length !== serviceNames.size) throw new Error('unmapped service declaration');
  const tables = Object.keys(index).filter(name => name !== '服务号' && name !== '原生状态');
  if (tables.length !== methodNames.size || tables.some(name => !methodNames.has(name))) throw new Error('unmapped method table');
  for (const [declaration, service] of serviceNames) {
    const expected = index.服务号[declaration];
    const actual = services[service]?.id;
    if (actual === undefined) throw new Error(`generated service ${service} is missing`);
    if (expected !== actual) throw new Error(`${declaration} service id is ${expected}, generated backend uses ${actual}`);
  }
  for (const [declaration, service] of methodNames) {
    const expectedEntries = Object.entries(index[declaration]);
    const expectedNames = manifest.methods[declaration];
    if (!expectedNames || Object.keys(expectedNames).length !== expectedEntries.length) throw new Error(`manifest method list for ${declaration} does not match the source table`);
    for (const [name, id] of expectedEntries) {
      const expectedMethod = expectedNames[name];
      const actualMethod = services[service].methods[id];
      if (typeof expectedMethod !== 'string' || actualMethod !== expectedMethod) throw new Error(`${declaration}.${name}=${id} maps to ${actualMethod ?? 'missing'}, expected ${expectedMethod}`);
    }
  }
}

export function protocolFingerprint(ankiRoot) {
  const files = ['Cargo.lock', 'rslib/rust_interface.rs'];
  function walk(directory) {
    for (const entry of readdirSync(path.join(ankiRoot, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(name);
      else if (/\.(rs|proto|toml)$/.test(entry.name)) files.push(name);
    }
  }
  for (const directory of ['proto', 'rslib/proto', 'rslib/proto_gen']) walk(directory);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file + '\0');
    hash.update(readFileSync(path.join(ankiRoot, file), 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function verifyBaseline(baseline, revision, fingerprint) {
  if (baseline.revision !== revision) throw new Error('RPC baseline revision differs from UPSTREAM.lock');
  if (baseline.fingerprint !== fingerprint) throw new Error('Anki protocol/generator inputs changed; rebuild and regenerate the RPC baseline');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length === 2 && args[0] !== '--generate')) throw new Error('Usage: node tools/verify-rpc-index.mjs [backend.rs | --generate backend.rs]');
  const ankiRoot = path.join(root, 'third_party', 'anki');
  const lock = Object.fromEntries(readFileSync(path.join(root, 'UPSTREAM.lock'), 'utf8').trim().split(/\r?\n/).map(line => line.split('=')));
  const revision = lock.ANKI_RELEASE_COMMIT;
  if (existsSync(path.join(ankiRoot, '.git'))) {
    const checkout = execFileSync('git', ['-C', ankiRoot, 'rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
    if (checkout !== revision) throw new Error(`Anki checkout ${checkout} differs from locked ${revision}`);
  }
  const fingerprint = protocolFingerprint(ankiRoot);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.ankiRevision !== `${lock.ANKI_TAG}-${revision}`) throw new Error('RPC aliases differ from UPSTREAM.lock');
  if (args[0] === '--generate') {
    if (!args[1]) throw new Error('--generate requires the exact freshly built backend.rs path');
    const services = parseGeneratedBackend(readFileSync(path.resolve(args[1]), 'utf8'));
    verifyIndex(serviceIndex, manifest, services);
    writeFileSync(baselinePath, JSON.stringify({ revision, fingerprint, services }, null, 2) + '\n');
    console.log('[rpc-index] generated baseline; review it together with protocol/alias changes');
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    verifyBaseline(baseline, revision, fingerprint);
    const services = args.length ? parseGeneratedBackend(readFileSync(path.resolve(args[0]), 'utf8')) : baseline.services;
    verifyIndex(serviceIndex, manifest, services);
    console.log(`[rpc-index] verified ${serviceNames.size} services and ${methodNames.size} method tables (${args.length ? 'explicit generated artifact' : 'locked protocol baseline'})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    console.error(`[rpc-index] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
