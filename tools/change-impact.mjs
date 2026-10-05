// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES } from './test-suites.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const rule = name => `.agents/rules/paths/${name}.md`;
const doc = name => `docs/development/${name}.md`;

// Paths select related checks; change kind supplies the semantic scope they cannot infer.
export const CHANGE_KINDS = ['auto', 'cosmetic', 'behavior', 'compile', 'integration', 'release'];
const nativeCheck = 'powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-native.ps1 -Target host-test';
const sandboxCheck = 'powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-agent-sandbox.ps1 -Target host';
const documentationCheck = 'node --test tools/tests/documentation-contract.test.mjs';
const resourceCheck = 'node --test tools/tests/i18n-contract.test.mjs';
const cosmeticPath = /^(docs\/|\.agents\/|[^/]+\.md$|entry\/src\/main\/resources\/[^/]+\/(?:element\/(?:string|color)\.json$|media\/[^/]+\.(?:svg|png|jpe?g|webp)$))/i;
export const PATH_RULES = [
  { id: 'docs', match: /^(docs\/|\.agents\/)|\.md$/i,
    reads: [rule('docs')], suites: [], mode: 'focused' },
  { id: 'tools', match: /^(tools\/|\.github\/|package(?:-lock)?\.json$|\.git(?:ignore|attributes)$)/,
    reads: [rule('tools')], suites: ['tooling'], mode: 'focused' },
  { id: 'entry', match: /^entry\//,
    reads: [rule('entry'), doc('extension-points')], suites: [], mode: 'focused', device: true },
  { id: 'native', match: /^(native\/|third_party\/|Cargo\.(toml|lock)$|rust-toolchain\.toml$|UPSTREAM\.lock$)/,
    reads: [rule('native')], suites: [], mode: 'native', device: true },
  { id: 'bridge', match: /^(entry\/src\/main\/(cpp\/|ets\/proto\/)|native\/napi_bridge\/)/,
    reads: [rule('native'), doc('sync-data')], suites: ['sync'], mode: 'all', device: true },
  { id: 'protocol', match: /^(tools\/(?:rpc-index[^/]*|generate-rpc-index|verify-rpc-index)|native\/rsharmony\/src\/rpc_ids\.rs$)/,
    reads: [rule('native'), doc('verification')], suites: ['tooling'], mode: 'all' },
  { id: 'sandbox', match: /^native\/agent-sandbox\//,
    reads: ['native/agent-sandbox/README.md'], suites: ['agent'], mode: 'native', device: true },
  { id: 'build', match: /^(AppScope\/|hvigor\/|config\/|build-profile\.json5$|hvigorfile\.ts$|(?:entry\/)?oh-package(?:-lock)?\.json5$|package(?:-lock)?\.json$|Cargo\.(toml|lock)$|rust-toolchain\.toml$|UPSTREAM\.lock$|tools\/(build-|patches\/|ohos-|zig-|signing-config|check-signing|verify\.mjs|doctor\.mjs|node-runtime\.mjs))/,
    reads: [rule('tools'), doc('signing')], suites: ['tooling'], mode: 'all' },
  { id: 'hosting', match: /^hosting\//,
    reads: ['docs/cloud-deck-hosting.md', 'docs/official-announcement-hosting.md'], suites: ['home'], mode: 'focused' },
  { id: 'agent', match: /^entry\/src\/main\/ets\/.*(?:agent\/|AI制卡页|ReleaseFeatures)/i,
    reads: [doc('agent')], suites: ['agent'], mode: 'focused' },
  { id: 'app-cognition', match: /^entry\/src\/main\/ets\/(?:components\/settings\/|components\/设置面板\.ets$|model\/(?:AppInterface|SettingsStructure|SettingsNavigation)\.ts$|model\/navigation\/AppNavigation\.ts$|utils\/(?:AppInterfaceText|SettingsStructureText)\.ets$)/i,
    reads: [doc('coding-agent'), doc('agent')], suites: ['agent'], mode: 'focused' },
  { id: 'home', match: /^entry\/src\/main\/ets\/.*(?:Home|首页|欢迎|公告|CloudDeck|ExternalDeck)/i,
    reads: [doc('home')], suites: ['home'], mode: 'focused' },
  { id: 'sync', match: /^entry\/src\/main\/ets\/.*(?:Sync|Backup|同步|备份|导入|导出|ExternalDeck)/i,
    reads: [doc('sync-data')], suites: ['sync'], mode: 'focused' },
  { id: 'study', match: /^entry\/src\/main\/ets\/.*(?:Study|Audio|Media|Preview|Render|学习|音频|媒体|预览)/i,
    reads: [doc('study-media')], suites: ['study', 'media'], mode: 'focused' },
  { id: 'browser', match: /^entry\/src\/main\/ets\/.*(?:Browser|Stats|Search|浏览|统计|搜索)/i,
    reads: [doc('browser-stats')], suites: ['browser', 'ui'], mode: 'focused' },
  { id: 'ui', match: /^entry\/src\/main\/(?:resources\/|ets\/(?:components\/common\/|.*(?:Theme|Color|Layout|Settings|主题|颜色|设置)))/i,
    reads: [doc('appearance')], suites: ['ui'], mode: 'focused', device: true },
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

export function planChanges(paths, { kind = 'auto' } = {}) {
  if (!CHANGE_KINDS.includes(kind)) throw new Error(`Unknown change kind '${kind}'.`);
  const files = [...new Set(paths)].sort();
  const reads = new Set(['AGENTS.md', 'PROJECT_CONTEXT.md', doc('ownership'), doc('task-contract'), doc('verification')]);
  const suites = new Set();
  const unknownPaths = [];
  const matches = [];
  const ranks = { focused: 0, native: 1, all: 2 };
  let mode = ['integration', 'release'].includes(kind) ? 'all' : 'focused';
  let deviceReview = false;
  for (const file of files) {
    if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\') ||
      /^[A-Za-z]:/.test(file) || file.split('/').some(part => part === '..' || part === '.' || part === '')) {
      throw new Error('Paths must be repository-relative and use forward slashes.');
    }
    const markdown = /\.md$/i.test(file);
    const matched = PATH_RULES.filter(item => item.match.test(file) && (!markdown || item.id === 'docs'));
    matches.push({ path: file, rules: matched.map(item => item.id) });
    if (!matched.length) {
      unknownPaths.push(file);
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
  const changeKind = kind === 'auto' ? (files.every(file => /\.md$/i.test(file) || cosmeticPath.test(file)) ? 'cosmetic' : 'behavior') : kind;
  // Cosmetic classification never overrides native, bridge or build input checks.
  const focusedCommands = changeKind === 'cosmetic' && mode === 'focused' ? [] :
    [...suites].sort().map(suite => `npm test -- ${suite}`);
  const commands = [...focusedCommands];
  if (matches.some(item => item.rules.includes('docs')) && !focusedCommands.includes('npm test -- tooling')) commands.push(documentationCheck);
  if (files.some(file => /^entry\/src\/main\/resources\/[^/]+\/element\/string\.json$/.test(file)) &&
      !focusedCommands.includes('npm test -- ui')) commands.push(resourceCheck);
  if (mode === 'native') {
    if (matches.some(item => item.rules.includes('native') && !item.rules.includes('sandbox'))) commands.push(nativeCheck);
    if (matches.some(item => item.rules.includes('sandbox'))) commands.push(sandboxCheck);
  }
  if (changeKind === 'compile' && mode !== 'all') commands.push('npm run build:app');
  const requiredCommands = !files.length ? [] : mode === 'all' ? ['npm run verify'] : [...new Set(commands)];
  return {
    verificationStatus: 'not-run',
    changeKind,
    validationMode: mode,
    paths: files,
    matches,
    reads: [...reads].sort(),
    focusedCommands,
    requiredCommands,
    unknownPaths,
    deviceReview,
    reviewRequired: files.length > 0,
    notes: [
      'Planning only; no tests, builds, installations or publishing were executed.',
      'Review the actual diff, callers and shared dependencies; path names do not infer behavior or compiler compatibility.',
      'Cosmetic edits need resource/reference review; add affected behavior tests when callbacks or state also change.',
      'New types, components or platform APIs need an incremental HAP build (use --kind compile).',
      'Reuse successful checks only while their relevant inputs are unchanged; do not repeat focused checks after full verify.',
      'Record actual commands, results and missing checks in the task handoff; this plan is not evidence.',
      ...(unknownPaths.length ? ['Unknown paths require explicit ownership and impact review; choose checks before delivery.'] : []),
    ],
  };
}

export function main(args, directory = root) {
  let json = false;
  let base;
  let paths;
  let kind;
  const usage = `Usage: npm run impact -- [--json] [--kind ${CHANGE_KINDS.join('|')}] [--base <ref> | --paths <repo/path> ...]`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' && !json) json = true;
    else if (args[i] === '--kind' && kind === undefined && CHANGE_KINDS.includes(args[i + 1])) kind = args[++i];
    else if (args[i] === '--base' && base === undefined && args[i + 1] && !args[i + 1].startsWith('-')) base = args[++i];
    else if (args[i] === '--paths' && base === undefined && args[i + 1]) {
      paths = args.slice(i + 1);
      if (paths.some(value => value.startsWith('-'))) throw new Error(usage);
      break;
    } else throw new Error(usage);
  }
  const plan = planChanges(paths ?? collectChangedPaths(directory, base), { kind });
  if (json) return JSON.stringify(plan, null, 2);
  return [
    `Change impact: ${plan.paths.length} paths (validation NOT run)`,
    'Read:', ...plan.reads.map(value => `  ${value}`),
    `Change kind: ${plan.changeKind}; validation scope: ${plan.validationMode}`,
    'Selected checks:', ...plan.requiredCommands.map(value => `  ${value}`),
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
