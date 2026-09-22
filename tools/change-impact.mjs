// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES } from './test-suites.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const rule = name => `.agents/rules/paths/${name}.md`;
const doc = name => `docs/development/${name}.md`;

// Cumulative matches define a conservative minimum, not a dependency graph.
export const PATH_RULES = [
  { id: 'docs', match: /^(docs\/|\.agents\/|[^/]+\.md$)/,
    reads: [rule('docs')], suites: ['repo'], mode: 'repo' },
  { id: 'tools', match: /^(tools\/|\.github\/|package(?:-lock)?\.json$|\.git(?:ignore|attributes)$)/,
    reads: [rule('tools')], suites: ['tooling'], mode: 'repo' },
  { id: 'entry', match: /^entry\//,
    reads: [rule('entry'), doc('extension-points')], suites: [], mode: 'all', device: true },
  { id: 'native', match: /^(native\/|third_party\/|Cargo\.(toml|lock)$|rust-toolchain\.toml$|UPSTREAM\.lock$)/,
    reads: [rule('native')], suites: [], mode: 'native', device: true },
  { id: 'bridge', match: /^entry\/src\/main\/(cpp\/|ets\/proto\/)/,
    reads: [rule('native'), doc('sync-data')], suites: ['sync'], mode: 'all', device: true },
  { id: 'build', match: /^(AppScope\/|hvigor\/|config\/|build-profile\.json5$|hvigorfile\.ts$|oh-package(?:-lock)?\.json5$|tools\/(build-|patches\/|ohos-|zig-|signing-config|check-signing|verify\.mjs|doctor\.mjs|node-runtime\.mjs))/,
    reads: [rule('tools'), doc('signing')], suites: ['tooling'], mode: 'all' },
  { id: 'hosting', match: /^hosting\//,
    reads: ['docs/cloud-deck-hosting.md', 'docs/official-announcement-hosting.md'], suites: ['home'], mode: 'repo' },
  { id: 'agent', match: /^entry\/src\/main\/ets\/.*(?:agent\/|AI制卡页|ReleaseFeatures)/i,
    reads: [doc('agent')], suites: ['agent'], mode: 'all' },
  { id: 'home', match: /^entry\/src\/main\/ets\/.*(?:Home|首页|欢迎|公告|CloudDeck|ExternalDeck)/i,
    reads: [doc('home')], suites: ['home'], mode: 'all' },
  { id: 'sync', match: /^entry\/src\/main\/ets\/.*(?:Sync|Backup|同步|备份|导入|导出|ExternalDeck)/i,
    reads: [doc('sync-data')], suites: ['sync'], mode: 'all' },
  { id: 'study', match: /^entry\/src\/main\/ets\/.*(?:Study|Audio|Media|Preview|Render|学习|音频|媒体|预览)/i,
    reads: [doc('study-media')], suites: ['study', 'media'], mode: 'all' },
  { id: 'browser', match: /^entry\/src\/main\/ets\/.*(?:Browser|Stats|Search|浏览|统计|搜索)/i,
    reads: [doc('browser-stats')], suites: ['browser', 'ui'], mode: 'all' },
  { id: 'ui', match: /^entry\/src\/main\/(?:resources\/|ets\/.*(?:Theme|Color|Layout|Settings|主题|颜色|设置))/i,
    reads: [doc('appearance')], suites: ['ui'], mode: 'all', device: true },
];

export function collectChangedPaths(directory, base) {
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  const diff = ['diff', '--name-only', '--no-renames', '-z'];
  const outputs = [git([...diff, '--']), git([...diff, '--cached', '--']), git(['ls-files', '--others', '--exclude-standard', '-z'])];
  if (base !== undefined) {
    if (!base || base.startsWith('-')) throw new Error('Invalid base ref.');
    const commit = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
    const ancestor = git(['merge-base', commit, 'HEAD']).trim();
    outputs.push(git([...diff, ancestor, 'HEAD', '--']));
  }
  // NUL separation preserves spaces, Unicode and newlines; renames include both paths.
  return [...new Set(outputs.flatMap(output => output.split('\0').filter(Boolean)))].sort();
}

export function planChanges(paths) {
  const files = [...new Set(paths)].sort();
  const reads = new Set(['AGENTS.md', 'PROJECT_CONTEXT.md', doc('ownership'), doc('task-contract'), doc('verification')]);
  const suites = new Set();
  const unknownPaths = [];
  const matches = [];
  const ranks = { repo: 0, native: 1, all: 2 };
  let mode = 'repo';
  let deviceReview = false;
  for (const file of files) {
    if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\') ||
      /^[A-Za-z]:/.test(file) || file.split('/').some(part => part === '..' || part === '.' || part === '')) {
      throw new Error('Paths must be repository-relative and use forward slashes.');
    }
    const matched = PATH_RULES.filter(item => item.match.test(file));
    matches.push({ path: file, rules: matched.map(item => item.id) });
    if (!matched.length) {
      unknownPaths.push(file);
      mode = 'all';
      deviceReview = true;
    }
    for (const item of matched) {
      item.reads.forEach(value => reads.add(value));
      item.suites.forEach(value => suites.add(value));
      if (ranks[item.mode] > ranks[mode]) mode = item.mode;
      deviceReview ||= item.device === true;
    }
    if (file.startsWith('tools/tests/')) {
      for (const [suite, pattern] of Object.entries(SUITES)) {
        if (pattern.test(path.posix.basename(file))) suites.add(suite);
      }
    }
    if (file.endsWith('.ets')) reads.add('.agents/adapters/arkts.md');
  }
  return {
    verificationStatus: 'not-run',
    paths: files,
    matches,
    reads: [...reads].sort(),
    focusedCommands: [...suites].sort().map(suite => `npm test -- ${suite}`),
    requiredCommands: files.length ? [mode === 'all' ? 'npm run verify' : `npm run verify -- ${mode}`] : [],
    unknownPaths,
    deviceReview,
    reviewRequired: files.length > 0,
    notes: [
      'Planning only; no tests, builds, installations or publishing were executed.',
      'Path rules are a minimum. Review callers, shared dependencies, ownership and device scenarios.',
      'Record actual commands, results and missing checks in the task handoff; this plan is not evidence.',
      ...(unknownPaths.length ? ['Unknown paths require explicit ownership and impact review; full verification is the fallback.'] : []),
    ],
  };
}

export function main(args, directory = root) {
  let json = false;
  let base;
  let paths;
  const usage = 'Usage: npm run impact -- [--json] [--base <ref> | --paths <repo/path> ...]';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' && !json) json = true;
    else if (args[i] === '--base' && base === undefined && args[i + 1] && !args[i + 1].startsWith('-')) base = args[++i];
    else if (args[i] === '--paths' && base === undefined && args[i + 1]) {
      paths = args.slice(i + 1);
      if (paths.some(value => value.startsWith('-'))) throw new Error(usage);
      break;
    } else throw new Error(usage);
  }
  const plan = planChanges(paths ?? collectChangedPaths(directory, base));
  if (json) return JSON.stringify(plan, null, 2);
  return [
    `Change impact: ${plan.paths.length} paths (validation NOT run)`,
    'Read:', ...plan.reads.map(value => `  ${value}`),
    'Focused feedback:', ...plan.focusedCommands.map(value => `  ${value}`),
    'Required minimum:', ...plan.requiredCommands.map(value => `  ${value}`),
    `Device acceptance scope review: ${plan.deviceReview ? 'required' : 'based on actual behavior impact'}`,
    ...(plan.unknownPaths.length ? ['UNMAPPED:', ...plan.unknownPaths.map(value => `  ${JSON.stringify(value)}`)] : []),
    ...plan.notes,
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`[impact] ${error.message}`);
    process.exitCode = 1;
  }
}
