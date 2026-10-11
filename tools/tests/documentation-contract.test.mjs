// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Core protocol generation has current ownership, commands and handoff navigation', () => {
  for (const file of ['PROJECT_CONTEXT.md','docs/development/ownership.md','docs/development/verification.md','tools/README.md']) assert.match(read(file), /core-protocol\.md/);
  assert.match(read('docs/decisions/README.md'), /2026-10-08-core-protocol-generation\.md/);
  const protocol=read('docs/development/core-protocol.md');
  assert.match(protocol,/anki_proto_gen::get_services/);
  for(const file of ['tools/core-protocol.mjs','tools/protocol/private.proto','tools/protocol/private-rpc.json','tools/protocol/inventory.json','tools/tests/fixtures/protocol-legacy/manifest.json']) assert.ok(existsSync(path.join(root,file)),file);
  assert.doesNotMatch(read('docs/architecture.md'), /必须从新版本生成的 `backend.rs`/);
});

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

test('complex settings audit has discoverable evidence, tool prerequisites and current ownership', () => {
  const audit = 'settings-integration-audit-2026-10-11.md';
  for (const file of ['docs/README.md','tools/README.md','docs/development/verification.md',
    'entry/src/main/ets/components/settings/SETTINGS_PARITY.md']) assert.ok(read(file).includes(audit), file);
  const report = read('docs/development/' + audit);
  assert.ok(report.includes('SETTINGS_PARITY.md'));
  assert.ok(report.includes('修复前已复现问题'));
  assert.ok(report.includes('修复结果'));
  assert.ok(report.includes('findings 为空'));
  assert.ok(report.includes('退出 2'));
  assert.ok(existsSync(path.join(root, 'tools/audit-settings-core.mjs')));
});

test('AnkiDroid comparison routes capability status to the current domain owners', () => {
  const comparison = read('docs/ANKIDROID_PARITY_AUDIT.md');
  const targets = [...comparison.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1].split('#')[0]);
  for (const owner of ['FEATURE_STATUS.md', 'development/browser-stats.md', 'development/study-media.md',
    'development/import-data.md', 'development/core-interop.md', 'development/agent.md']) {
    assert.ok(targets.includes(owner), `comparison must route to ${owner}`);
  }
  assert.ok(read('docs/README.md').includes('(ANKIDROID_PARITY_AUDIT.md)'));
});

test('JIDE long-project ownership and recovery decisions are reachable from current documentation', () => {
  const decision = '2026-10-09-agent-long-project.md';
  for (const file of ['docs/development/agent.md', 'docs/decisions/README.md']) assert.ok(read(file).includes(decision), file);
  for (const owner of ['AgentMemoryManager', 'AgentScope.taskPlan', 'AgentExecutionBudget']) {
    assert.ok(read(`docs/decisions/${decision}`).includes(owner), owner);
  }
  assert.match(read('docs/development/ownership.md'), /AgentMemoryManagement\.ts[\s\S]*AgentTaskPlan\.ts[\s\S]*AgentSessionController/);
  assert.match(read(`docs/decisions/${decision}`), /未进行设备布局验收或付费模型评测/);
});

test('JIDE subagent proposal stays discoverable and distinct from runtime capabilities', () => {
  const decision = '2026-10-09-agent-subagents.md';
  for (const file of ['docs/development/agent.md', 'docs/decisions/README.md']) assert.ok(read(file).includes(decision), file);
  const proposal = read(`docs/decisions/${decision}`);
  assert.match(proposal, /状态：调研与下一阶段设计/);
  assert.match(proposal, /尚未实现/);
  assert.match(proposal, /不修改运行时代码/);
  assert.match(proposal, /https:\/\/code\.claude\.com\/docs\/en\/sub-agents/);
});

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
  const { app } = JSON5.parse(read('AppScope/app.json5'));
  const buildProfile = JSON5.parse(read('build-profile.json5')).app.products[0];
  const upstream = read('UPSTREAM.lock');
  const readme = read('README.md');
  const status = read('docs/DEVELOPMENT_PLAN.md');

  const versionName = app.versionName;
  const versionCode = String(app.versionCode);
  const compatibleSdk = buildProfile.compatibleSdkVersion.match(/^(.+)\((\d+)\)$/);
  const compatibleVersion = compatibleSdk?.[1];
  const compatibleApi = compatibleSdk?.[2];
  const targetApi = buildProfile.targetSdkVersion.match(/\((\d+)\)$/)?.[1];
  const lockedMinVersion = lockValue(upstream, 'HARMONY_MIN_VERSION');
  const lockedMinApi = lockValue(upstream, 'HARMONY_MIN_API');
  const lockedTargetApi = lockValue(upstream, 'HARMONY_TARGET_API');
  const lockedRust = lockValue(upstream, 'RUST_TOOLCHAIN');
  const lockedCommit = lockValue(upstream, 'ANKI_RELEASE_COMMIT');
  const rustToolchain = read('rust-toolchain.toml').match(/^channel\s*=\s*"([^"]+)"$/m)?.[1];

  assert.ok(versionName);
  assert.ok(Number.isSafeInteger(app.versionCode) && app.versionCode > 0);
  assert.ok(lockedCommit);
  assert.ok(compatibleVersion);
  assert.ok(compatibleApi);
  assert.ok(targetApi);
  assert.equal(lockedMinVersion, compatibleVersion);
  assert.equal(lockedMinApi, compatibleApi);
  assert.equal(lockedTargetApi, targetApi);
  assert.equal(lockedRust, rustToolchain);
  assert.ok(status.includes(`| Rust | ${lockedRust} |`));
  assert.ok(status.includes(`| Anki Core | ${lockValue(upstream, 'ANKI_TAG')}，提交 \`${lockedCommit}\` |`));
  assert.ok(readme.includes(`当前源码版本：${versionName}（versionCode ${versionCode}）`));
  assert.ok(readme.includes(`checkout --detach ${lockedCommit}`), 'checkout instructions must follow UPSTREAM.lock');
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

// The repository uses ATX/Setext headings and optional HTML anchors. Keep code
// examples out of navigation checks; their headings and links are not rendered.
function markdownContentLines(source) {
  let fence = null;
  return source.split(/\r?\n/).map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence !== null) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return '';
    }
    if (marker) { fence = marker[1]; return ''; }
    return line;
  });
}

function markdownAnchors(source) {
  const anchors = new Set();
  const headingIds = new Set();
  const lines = markdownContentLines(source);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/)?.[1] ??
      (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) ? lines[index - 1]?.trim() : undefined);
    if (heading) {
      const base = heading.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(^|\s)_{1,3}([^_]+)_{1,3}(?=$|\s)/g, '$1$2')
        .trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '').replaceAll(' ', '-');
      let id = base;
      for (let suffix = 1; headingIds.has(id); suffix++) id = `${base}-${suffix}`;
      headingIds.add(id);
      anchors.add(id);
    }
    for (const match of line.matchAll(/<[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/g)) anchors.add(match[1]);
  }
  return anchors;
}

test('Markdown section navigation handles formatting, duplicate headings and code examples', () => {
  const source = [
    '# Example headings', "## This’ll be a _Helpful_ Section About the Greek Letter Θ!",
    '## 同步端点（API 21）', '## Same section', '## Same section', '## Same section-1',
    'Underlined title', '---', '<a name="custom-anchor"></a>',
    '````md', '## Example only', '```', '## Still code', '````',
    '~~~md', '<a id="code-anchor"></a>', '~~~', '## `deck_config`',
  ].join('\n');
  assert.deepEqual([...markdownAnchors(source)], [
    'example-headings', 'thisll-be-a-helpful-section-about-the-greek-letter-θ',
    '同步端点api-21', 'same-section', 'same-section-1', 'same-section-1-1',
    'underlined-title', 'custom-anchor', 'deck_config',
  ]);
  assert.ok(!markdownAnchors(source).has('old-section'), 'removed headings must not resolve');
});

test('active Markdown uses valid relative links and section anchors', () => {
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
    const source = markdownContentLines(read(relativeFile)).join('\n');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) {
        continue;
      }
      const pathPart = decodeURIComponent(link.split('#')[0]);
      const target = pathPart ? pathPart.startsWith('/') ? path.resolve(root, pathPart.slice(1)) :
        path.resolve(root, path.dirname(relativeFile), pathPart) : path.join(root, relativeFile);
      if (!existsSync(target)) {
        broken.push(`${relativeFile} -> ${link}`);
        continue;
      }
      const fragment = link.includes('#') ? decodeURIComponent(link.slice(link.indexOf('#') + 1)) : '';
      if (fragment && target.endsWith('.md') && !markdownAnchors(readFileSync(target, 'utf8')).has(fragment)) {
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

test('stale knowledge repair has one reachable owner across coding Agent entry and acceptance', () => {
  const owner = '.agents/rules/context.md', anchor = '过期知识核查与修复';
  for (const file of ['AGENTS.md', '.agents/rules/workflow.md',
    'docs/development/coding-agent.md', 'docs/development/task-contract.md']) {
    const links = [...read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
    assert.ok(links.some(([, link]) => {
      const [target, fragment] = link.split('#');
      return fragment === anchor && path.resolve(root, path.dirname(file), target) === path.resolve(root, owner);
    }), `${file}: missing route to the canonical knowledge repair workflow`);
  }
  assert.ok(read(owner).split(/\r?\n/).includes(`## ${anchor}`), 'linked knowledge owner section must exist');
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
