// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
export const manualDirectory = join(root, 'entry/src/main/resources/rawfile/anki-manual');
const repository = 'https://github.com/ankitects/anki';
const website = 'https://anki.mintlify.app';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/.test(value);

export function manualSections(text) {
  const front = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!front) throw Error('Manual frontmatter missing');
  const sections = [{ id: 'overview', title: 'Overview', level: 0, start: front[0].length, end: text.length, keywords: [] }];
  let position = 0, fence = '', counts = new Map();
  for (const line of text.split(/(?<=\n)/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
    } else if (!fence && position >= front[0].length) {
      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const title = heading[2].replace(/<[^>]+>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`_]/g, '').trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'section';
        const count = (counts.get(slug) ?? 0) + 1; counts.set(slug, count);
        sections.push({ id: count === 1 ? slug : `${slug}-${count}`, title, level: heading[1].length, start: position, end: text.length, keywords: [] });
      }
    }
    position += line.length;
  }
  sections[0].end = sections[1]?.start ?? text.length;
  for (let i = 1; i < sections.length; i++) {
    sections[i].end = sections.slice(i + 1).find(section => section.level <= sections[i].level)?.start ?? text.length;
  }
  return sections;
}

export function readOfficialSnapshot(sourceDirectory) {
  const git = (...args) => execFileSync('git', ['-C', resolve(sourceDirectory), ...args], { maxBuffer: 4 * 1024 * 1024 });
  const origin = git('remote', 'get-url', 'origin').toString('utf8').trim();
  if (!['https://github.com/ankitects/anki.git', repository, 'git@github.com:ankitects/anki.git'].includes(origin)) throw Error('Expected official ankitects/anki checkout');
  const revision = git('rev-parse', 'HEAD').toString('utf8').trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Invalid manual revision');
  const commitDate = git('show', '-s', '--format=%cI', revision).toString('utf8').trim();
  const license = git('show', `${revision}:docs-site/LICENSE`);
  if (!license.toString('utf8').includes('Attribution-ShareAlike 4.0 International')) throw Error('Unexpected manual license');
  const config = JSON.parse(readFileSync(join(root, 'tools/anki-manual-topics.json'), 'utf8'));
  const files = new Map();
  const topics = config.map(item => {
    if (!safePath(item.path)) throw Error('Invalid configured manual path');
    const id = item.path.replaceAll('/', '-');
    if (files.has(id)) throw Error('Duplicate manual ID');
    const bytes = git('show', `${revision}:docs-site/manual/${item.path}.mdx`);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) throw Error('Manual must be UTF-8');
    const title = text.match(/^title:\s*"([^"]+)"\s*$/m)?.[1];
    if (!title) throw Error(`Manual title missing: ${id}`);
    const sections = manualSections(text);
    for (const [sectionId, keywords] of Object.entries(item.sectionKeywords ?? {})) {
      const section = sections.find(s => s.id === sectionId);
      if (!section) throw Error(`Configured section missing: ${id}/${sectionId}`);
      section.keywords = keywords;
    }
    files.set(id, bytes);
    return { id, title, path: item.path, url: `${website}/manual/${item.path}`,
      sourceUrl: `${repository}/blob/${revision}/docs-site/manual/${item.path}.mdx`,
      keywords: item.keywords, characters: text.length, sha256: hash(bytes), sections };
  });
  const index = { formatVersion: 1, title: 'Anki Manual', language: 'en', repository, revision, commitDate,
    website, licenseId: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', licenseSha256: hash(license),
    attribution: 'Anki Manual by Anki contributors. Original chapter text retained; Chinese search aliases and section index added by jidecards.',
    topics };
  return { index, files, license };
}

function notice(index) {
  return `${index.title} — Anki contributors\nSource: ${index.repository}/tree/${index.revision}/docs-site/manual\nRevision: ${index.revision}\nCommit date: ${index.commitDate}\nLicense: ${index.licenseId} (${index.licenseUrl})\n${index.attribution}\n\nThis offline snapshot describes upstream Anki. jidecards UI and available actions are provided by the current app interface catalog.\nOnly selected original English chapters are bundled. Images and remote resources are not bundled. Relative links use ${index.website}/manual/ as their base.\nUpdate: node tools/vendor-anki-manual.mjs --write --source-dir <official-Anki-checkout>\nVerify offline: node tools/vendor-anki-manual.mjs --check\n`;
}

export function writeSnapshot(snapshot) {
  const previous = existsSync(join(manualDirectory, 'index.json')) ? JSON.parse(readFileSync(join(manualDirectory, 'index.json'), 'utf8')).topics : [];
  const obsolete = previous.filter(topic => !snapshot.files.has(topic.id)).map(topic => {
    if (!/^[a-z][a-z0-9-]{0,99}$/.test(topic.id)) throw Error('Invalid previous manual ID');
    const target = resolve(manualDirectory, 'topics', `${topic.id}.mdx`);
    if (!target.startsWith(resolve(manualDirectory, 'topics') + '\\') && !target.startsWith(resolve(manualDirectory, 'topics') + '/')) throw Error('Manual path outside managed directory');
    return target;
  });
  mkdirSync(join(manualDirectory, 'topics'), { recursive: true });
  for (const [id, bytes] of snapshot.files) writeFileSync(join(manualDirectory, 'topics', `${id}.mdx`), bytes);
  writeFileSync(join(manualDirectory, 'LICENSE.txt'), snapshot.license);
  writeFileSync(join(manualDirectory, 'NOTICE.txt'), notice(snapshot.index));
  writeFileSync(join(manualDirectory, 'index.json'), JSON.stringify(snapshot.index, null, 2) + '\n');
  for (const target of obsolete) if (existsSync(target)) unlinkSync(target);
}

export function checkSnapshot(directory = manualDirectory) {
  const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'));
  if (index.formatVersion !== 1 || index.repository !== repository || !/^[a-f0-9]{40}$/.test(index.revision) ||
    index.licenseId !== 'CC-BY-SA-4.0' || index.language !== 'en' || index.topics.length === 0) throw Error('Invalid manual manifest');
  const config = JSON.parse(readFileSync(join(root, 'tools/anki-manual-topics.json'), 'utf8'));
  if (JSON.stringify(index.topics.map(t => t.path)) !== JSON.stringify(config.map(t => t.path))) throw Error('Manual selection out of date');
  for (const topic of index.topics) {
    if (!safePath(topic.path) || topic.id !== topic.path.replaceAll('/', '-')) throw Error('Unsafe manual path');
    const bytes = readFileSync(join(directory, 'topics', `${topic.id}.mdx`));
    const text = bytes.toString('utf8');
    if (hash(bytes) !== topic.sha256 || text.length !== topic.characters) throw Error(`Manual text mismatch: ${topic.id}`);
    if (text.match(/^title:\s*"([^"]+)"\s*$/m)?.[1] !== topic.title) throw Error(`Manual title mismatch: ${topic.id}`);
    if (topic.sourceUrl !== `${repository}/blob/${index.revision}/docs-site/manual/${topic.path}.mdx` ||
      topic.url !== `${website}/manual/${topic.path}`) throw Error(`Invalid manual source: ${topic.id}`);
    const selection = config.find(item => item.path === topic.path);
    const sections = manualSections(text);
    for (const section of sections) section.keywords = selection.sectionKeywords?.[section.id] ?? [];
    if (JSON.stringify(sections) !== JSON.stringify(topic.sections) || JSON.stringify(selection.keywords) !== JSON.stringify(topic.keywords)) throw Error(`Manual index mismatch: ${topic.id}`);
  }
  const expected = index.topics.map(t => `${t.id}.mdx`).sort();
  if (JSON.stringify(readdirSync(join(directory, 'topics')).sort()) !== JSON.stringify(expected)) throw Error('Unexpected manual files');
  if (hash(readFileSync(join(directory, 'LICENSE.txt'))) !== index.licenseSha256 ||
    !readFileSync(join(directory, 'LICENSE.txt'), 'utf8').includes('Attribution-ShareAlike 4.0 International') ||
    readFileSync(join(directory, 'NOTICE.txt'), 'utf8') !== notice(index)) throw Error('Manual attribution mismatch');
  return index;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 3 && args[0] === '--write' && args[1] === '--source-dir') writeSnapshot(readOfficialSnapshot(args[2]));
    else if (args.length !== 1 || args[0] !== '--check') throw Error('Usage: node tools/vendor-anki-manual.mjs --check | --write --source-dir <official-Anki-checkout>');
    const index = checkSnapshot();
    console.log(`Anki Manual: ${index.topics.length} original chapters, revision ${index.revision}, offline integrity OK`);
  } catch (error) { console.error(`[anki-manual] ${error.message}`); process.exitCode = 1; }
}
