// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function lockValue(source, key) {
  const prefix = `${key}=`;
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length);
}

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(absolute);
    }
    return entry.name.endsWith('.md') ? [absolute] : [];
  });
}

test('JIDE document ownership and native validation have current navigation entries', () => {
  assert.match(read('docs/development/ownership.md'), /AgentDocumentStore[\s\S]*AgentDocuments/);
  assert.match(read('docs/development/agent.md'), /文件资料与按页制卡[\s\S]*test-agent-documents-device\.mjs/);
  assert.match(read('tools/README.md'), /test-agent-documents-device\.mjs/);
  assert.match(read('docs/decisions/README.md'), /2026-10-01-agent-document-reading\.md/);
});

test('current documentation follows application and SDK configuration', () => {
  const app = read('AppScope/app.json5');
  const buildProfile = read('build-profile.json5');
  const upstream = read('UPSTREAM.lock');
  const readme = read('README.md');
  const status = read('docs/DEVELOPMENT_PLAN.md');

  const versionName = app.match(/versionName:\s*'([^']+)'/)?.[1];
  const versionCode = app.match(/versionCode:\s*(\d+)/)?.[1];
  const compatibleSdk = buildProfile.match(/compatibleSdkVersion:\s*'([^']+)\((\d+)\)'/);
  const compatibleVersion = compatibleSdk?.[1];
  const compatibleApi = compatibleSdk?.[2];
  const targetApi = buildProfile.match(/targetSdkVersion:\s*'[^']+\((\d+)\)'/)?.[1];
  const lockedMinVersion = lockValue(upstream, 'HARMONY_MIN_VERSION');
  const lockedMinApi = lockValue(upstream, 'HARMONY_MIN_API');
  const lockedTargetApi = lockValue(upstream, 'HARMONY_TARGET_API');
  const lockedRust = lockValue(upstream, 'RUST_TOOLCHAIN');
  const rustToolchain = read('rust-toolchain.toml').match(/^channel\s*=\s*"([^"]+)"$/m)?.[1];

  assert.ok(versionName);
  assert.ok(versionCode);
  assert.ok(compatibleVersion);
  assert.ok(compatibleApi);
  assert.ok(targetApi);
  assert.equal(lockedMinVersion, compatibleVersion);
  assert.equal(lockedMinApi, compatibleApi);
  assert.equal(lockedTargetApi, targetApi);
  assert.equal(lockedRust, rustToolchain);
  assert.match(readme, new RegExp(`当前源码版本：${versionName.replaceAll('.', '\\.')}`));
  assert.match(readme, /checkout --detach e64c6b1/);
  assert.match(readme, /rev-parse --short=7 HEAD/);
  assert.match(readme, /JIDECARDS_SIGNING_CONFIG/);
  assert.match(readme, /docs\/development\/signing\.md/);
  assert.match(status, new RegExp(`应用版本 \\| ${versionName.replaceAll('.', '\\.')} / versionCode ${versionCode}`));
  assert.match(status, new RegExp(`最低兼容 SDK \\| HarmonyOS [^|]+（API ${compatibleApi}）`));
  assert.match(status, new RegExp(`目标 SDK \\| HarmonyOS [^|]+（API ${targetApi}）`));
  assert.doesNotMatch(status, /当前实施记录|最低系统版本 \| HarmonyOS 5\.0\.0（API 12）/);
});

test('current capability documentation follows release gates and runtime constants', () => {
  const releaseFeatures = read('entry/src/main/ets/model/ReleaseFeatures.ets');
  const agentPage = read('entry/src/main/ets/pages/AI制卡页.ets');
  const cardHtml = read('entry/src/main/ets/model/学习卡片HTML构建器.ts');
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const agentDesign = read('docs/agent-2-design.md');
  const gitignore = read('.gitignore');
  const ci = read('.github/workflows/ci.yml');

  assert.match(releaseFeatures,
    /AI_AGENT_CHANNELS_APP_STORAGE_KEY:\s*string\s*=\s*'aiAgentChannelsEnabled'/);
  assert.match(releaseFeatures, /enableAiAgentChannels/);
  assert.match(agentPage, /searchMode:\s*'off'/);
  assert.match(readme, /默认隐藏的功能/);
  assert.match(readme, /开发者调试[\s\S]*AppStorage 运行时开关/);
  assert.match(agentDesign, /默认关闭[\s\S]*全部 Agent 入口/);
  assert.match(agentDesign, /持久化[\s\S]*AppStorage/);
  assert.match(cardHtml, /https:\/\/jidecards-media\.local\//);
  assert.match(architecture, /https:\/\/jidecards-media\.local\//);
  assert.match(architecture, /签名与链接器可用性以实际构建为准/);
  assert.match(gitignore, /^\/third_party\/$/m);
  assert.equal(existsSync(path.join(root, '.gitmodules')), false);
  assert.match(ci, /\. \.\/UPSTREAM\.lock/);
  assert.match(ci, /--branch "\$ANKI_TAG" "\$ANKI_REPOSITORY"/);
  assert.match(ci, /rev-parse --short=7 HEAD\)" = "\$ANKI_RELEASE_COMMIT"/);
  assert.doesNotMatch(cardHtml + read('entry/src/main/ets/model/颜色主题.ets'), /\.trae\//);
});

test('active Markdown uses valid relative links', () => {
  const activeFiles = [
    'README.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    '.github/pull_request_template.md',
    'AGENTS.md',
    'PROJECT_CONTEXT.md',
    'tools/README.md',
    ...markdownFiles(path.join(root, 'docs'))
      .filter(file => !path.relative(root, file).replaceAll('\\', '/').startsWith('docs/superpowers/'))
      .map(file => path.relative(root, file)),
    ...markdownFiles(path.join(root, '.agents')).map(file => path.relative(root, file)),
    ...markdownFiles(path.join(root, 'entry/src/main/ets')).map(file => path.relative(root, file)),
    'NOTICE.md',
    'docs/superpowers/README.md',
  ];
  const broken = [];

  for (const relativeFile of activeFiles) {
    const source = read(relativeFile);
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (/^(?:https?:|mailto:|#)/.test(link)) {
        continue;
      }
      const pathPart = decodeURIComponent(link.split('#')[0]);
      if (!pathPart) {
        continue;
      }
      const target = path.resolve(root, path.dirname(relativeFile), pathPart);
      if (!existsSync(target)) {
        broken.push(`${relativeFile} -> ${link}`);
      }
    }
  }

  assert.deepEqual(broken, []);
});

test('historical plans and specs are visibly archived', () => {
  const archiveRoot = path.join(root, 'docs', 'superpowers');
  const records = markdownFiles(archiveRoot)
    .filter((file) => path.basename(file) !== 'README.md');

  assert.ok(records.length > 0);
  for (const record of records) {
    assert.match(readFileSync(record, 'utf8'), /> 归档状态：这是一次性历史设计\/执行记录/,
      path.relative(root, record));
  }
  assert.match(read('docs/releases/3.0.0.md'), /草案（未发布）/);
});

test('coding Agent-first rules are explicit and historical plans cannot issue commands', () => {
  const agents = read('AGENTS.md');
  const context = read('PROJECT_CONTEXT.md');
  const codingAgent = read('docs/development/coding-agent.md');
  const appAgent = read('docs/development/agent.md');
  const decisions = read('docs/decisions/README.md');
  const developmentPlan = read('docs/DEVELOPMENT_PLAN.md');
  const decision = read('docs/decisions/2026-09-agent-first.md');
  assert.match(agents, /最高优先级：编程 Agent-first/);
  assert.match(agents, /当前约束只来自根 `AGENTS\.md`、`\.agents\/` 和当前领域文档/);
  assert.match(context, /Agent-first 原则与开发约束见 \[AGENTS\.md\]\(AGENTS\.md\)/);
  assert.match(context, /编程 Agent 协作与跨域决策/);
  assert.match(context, /pages\/AI制卡页\.ets/);
  const sandboxDecision = '2026-09-30-agent-local-sandbox.md';
  assert.ok(context.includes(`docs/decisions/${sandboxDecision}`));
  assert.ok(appAgent.includes(`../decisions/${sandboxDecision}`));
  assert.ok(decisions.includes(`](${sandboxDecision})`));
  const sandboxReadme = 'native/agent-sandbox/README.md';
  assert.ok(context.includes(sandboxReadme));
  assert.ok(appAgent.includes(sandboxReadme));
  assert.ok(read(`docs/decisions/${sandboxDecision}`).includes(sandboxReadme));
  assert.match(codingAgent, /本页只约束负责修改 jidecards 仓库的编程 Agent/);
  assert.match(codingAgent, /Agent-first 优先级与开发流程统一见根 \[AGENTS\.md\]\(\.\.\/\.\.\/AGENTS\.md\)/);
  assert.match(codingAgent, /开发任务契约/);
  assert.match(agents, /\.agents\/rules\/paths/);
  assert.match(appAgent, /本页只描述产品运行时的应用内 Agent，不描述负责修改仓库的编程 Agent/);
  assert.match(decisions, /随源码一起版本控制/);
  assert.match(developmentPlan, /最高开发优先级是编程 Agent-first/);
  assert.match(decision, /应用内 Agent 是产品运行时能力/);
  assert.match(read('docs/superpowers/README.md'), /不能约束当前编程 Agent/);
  assert.doesNotMatch(agents, /\.trae\/decisions\.md/);
  for (const file of markdownFiles(path.join(root, '.agents'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\.trae\/decisions\.md|SearchCodebase/,
      path.relative(root, file));
  }
  for (const source of [context, codingAgent, developmentPlan, decision]) {
    assert.doesNotMatch(source, /并优先推进应用内 Agent/);
  }

  const historicalInstructions = markdownFiles(path.join(root, 'docs', 'superpowers'))
    .filter((file) => path.basename(file) !== 'README.md')
    .filter((file) => /For agentic workers|REQUIRED SUB-SKILL|subagent-driven-development|executing-plans/.test(
      readFileSync(file, 'utf8')))
    .map((file) => path.relative(root, file));
  assert.deepEqual(historicalInstructions, [],
    'archived plans must not contain executable instructions for coding Agents');
});

test('coding Agent navigation has scoped rules, ownership, and a task contract', () => {
  const agents = read('AGENTS.md');
  const context = read('PROJECT_CONTEXT.md');
  const ownership = read('docs/development/ownership.md');
  const taskContract = read('docs/development/task-contract.md');
  const verification = read('docs/development/verification.md');
  const pathRules = ['README.md', 'entry.md', 'native.md', 'tools.md', 'docs.md'];

  assert.match(agents, /\.agents\/rules\/paths/);
  assert.match(agents, /开发优先方便后续编程 Agent 理解、定位、修改、验证和接手项目/);
  assert.match(context, /模块责任与变更入口/);
  assert.match(context, /开发任务契约/);
  assert.match(ownership, /## `entry`/);
  assert.match(ownership, /## `native`/);
  assert.match(ownership, /## `tools`/);
  assert.match(taskContract, /目标/);
  assert.match(taskContract, /不变量/);
  assert.match(taskContract, /实际执行的命令/);
  assert.match(verification, /按变更路径选择验证/);

  for (const file of pathRules) {
    const source = read(`.agents/rules/paths/${file}`);
    assert.ok(source.length > 0, `.agents/rules/paths/${file} must not be empty`);
  }
  assert.doesNotMatch(agents, /并优先推进应用内 Agent/);
  assert.match(taskContract, /不能只存在聊天上下文/);
});

test('ordinary settings and interface tasks require JIDE cognition synchronization through current development rules', () => {
  const guide='docs/development/coding-agent.md';const anchor='软件升级时的认知同步';
  for(const file of ['AGENTS.md','.agents/rules/paths/entry.md','docs/development/task-contract.md','docs/development/extension-points.md']) {
    const links=[...read(file).matchAll(/\[[^\]]+\]\(([^)]+)#软件升级时的认知同步\)/g)];
    assert.ok(links.some(link=>path.resolve(root,path.dirname(file),link[1])===path.resolve(root,guide)),file);
  }
  assert.match(read('AGENTS.md'),/必须同时维护 JIDE 的软件认知[\s\S]*不依赖用户另行提醒/);
  const source=read(guide);assert.ok(source.includes('## '+anchor));
  assert.match(source,/SettingsStructure[\s\S]*当前状态[\s\S]*操作能力[\s\S]*验证与交付/);
  assert.match(source,/不能证明任意手写/);
  assert.match(source,/ai-agent-app-structure\.test\.mjs/);
});

test('same-kind change guidance is reachable from entry, workflow, acceptance and decision index', () => {
  const guide = 'docs/development/coding-agent.md';
  const decision = 'docs/decisions/2026-09-26-consistent-change-coverage.md';
  for (const file of ['AGENTS.md', '.agents/rules/workflow.md', 'docs/development/task-contract.md', decision]) {
    const links = [...read(file).matchAll(/\[[^\]]+\]\(([^)]+)#同类变更闭环\)/g)];
    assert.ok(links.some(link => path.resolve(root, path.dirname(file), link[1]) === path.resolve(root, guide)),
      `${file}: missing route to the canonical guidance`);
  }
  assert.match(read(guide), /^## 同类变更闭环$/m, 'linked section must exist');
  assert.ok(read('docs/decisions/README.md').includes(path.basename(decision)));
});

test('current docs route confirmation owners and do not freeze current test totals', () => {
  for (const file of ['docs/development/agent.md', 'docs/agent-2-design.md', 'docs/architecture.md']) {
    assert.match(read(file), /AgentActionExecutor/);
    assert.match(read(file), /AgentDraftExecutor/);
    assert.doesNotMatch(read(file), /唯一卡库写入边界/);
  }
  for (const file of ['AGENTS.md', 'PROJECT_CONTEXT.md', 'docs/FEATURE_STATUS.md',
    ...markdownFiles(path.join(root, 'docs/development')).map(file => path.relative(root, file))]) {
    assert.doesNotMatch(read(file), /当前(?:工作树)?[^\n。]*测试(?:为|数[量为是：:]*)\s*\d+/,
      file);
  }
});
