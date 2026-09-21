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
    'AGENTS.md',
    'PROJECT_CONTEXT.md',
    'tools/README.md',
    ...markdownFiles(path.join(root, 'docs/development')).map(file => path.relative(root, file)),
    ...markdownFiles(path.join(root, '.agents')).map(file => path.relative(root, file)),
    'NOTICE.md',
    'docs/README.md',
    'docs/DEVELOPMENT_PLAN.md',
    'docs/architecture.md',
    'docs/agent-2-design.md',
    'docs/cloud-deck-hosting.md',
    'docs/official-announcement-hosting.md',
    'docs/CSDN-记得闪卡项目全解.md',
    'docs/releases/3.0.0.md',
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
