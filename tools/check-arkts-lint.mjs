// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scope = 'entry/src/main/ets';
const reports = '.hvigor/arkts-lint';
const cwd = { cwd: root };
const cli = (args, options) => spawnSync('devecocli', args, {
  ...cwd,
  // npm installs a .cmd shim on Windows. All arguments here are fixed or generated numerically.
  shell: process.platform === 'win32',
  ...options
});

const runId = `${Date.now()}-${process.pid}`;
const report = `${reports}/${runId}.json`;
const metadata = `${reports}/${runId}.metadata.json`;
mkdirSync(path.join(root, reports), { recursive: true });
const version = cli(['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0 || !version.stdout?.trim()) {
  throw new Error('DevEco CLI is unavailable on PATH', { cause: version.error });
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { ...cwd, encoding: 'utf8' }).trim();
writeFileSync(path.join(root, metadata), JSON.stringify({
  commit,
  cliVersion: version.stdout.trim(),
  scope,
  report,
  timestamp: new Date().toISOString()
}, null, 2) + '\n', { flag: 'wx' });

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `report=${report}\nmetadata=${metadata}\n`);
}

const result = cli(['check', 'lint', scope, '--format', 'json', '--output-path', report], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
  throw new Error(`DevEco lint failed (status ${result.status ?? result.signal})`, { cause: result.error });
}

const { issues, summary } = JSON.parse(readFileSync(path.join(root, report), 'utf8'));
if (!Array.isArray(issues) || !Number.isInteger(summary?.errors) || summary.errors < 0 ||
    summary.issues !== issues.length ||
    summary.errors !== issues.filter(issue => issue?.severity === 'Error').length) {
  throw new Error(`Invalid DevEco lint report: ${report}`);
}
if (summary.errors > 0) {
  throw new Error(`ArkTS lint reported ${summary.errors} error(s). See ${report}`);
}
