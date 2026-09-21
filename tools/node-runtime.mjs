// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';

// 与 CI 和 package.json 共用 Node 24 基线；同时验证实际需要的运行能力。
export function nodeVersionProblem(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  return match && Number(match[1]) === 24 ? null : `Node 24.x is required; found ${version ?? 'unknown'}.`;
}

export function checkNodeRuntime() {
  const problem = nodeVersionProblem(process.version);
  if (problem) return problem;
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e',
    "import { stripTypeScriptTypes } from 'node:module'; stripTypeScriptTypes('enum Value { Ready }', { mode: 'transform' });"],
  { encoding: 'utf8' });
  return result.status === 0 ? null : `Node type transformation unavailable: ${result.error?.message ?? result.stderr}`;
}
