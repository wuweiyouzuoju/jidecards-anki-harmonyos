// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageInputs } from './package-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const config = JSON.parse(readFileSync(path.join(root, 'consumers.json')));
const names = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const selected = names.length ? config.consumers.filter(item => names.includes(item.project)) : config.consumers;
if (names.some(name => !config.consumers.some(item => item.project === name))) throw Error('Unknown consumer');
const reportFile = path.join(root, '.local/packages/report.json');
if (!existsSync(reportFile)) throw Error('Build the shared HAR first: npm --prefix "' + root + '" run build:harmony');
const report = JSON.parse(readFileSync(reportFile));
if (!existsSync(report.artifact) || hash(report.artifact) !== report.sha256) throw Error('Shared HAR hash mismatch; rebuild it');
const currentInputs = packageInputs(root);
if (JSON.stringify(currentInputs) !== JSON.stringify(Object.keys(report.sourceHashes).sort()) ||
  currentInputs.some(file => hash(path.join(root, file)) !== report.sourceHashes[file])) {
  throw Error('Shared source changed; rebuild the HAR before consuming it');
}
for (const consumer of selected) {
  const projectRoot = path.resolve(root, '..', consumer.project);
  if (process.argv.includes('--install')) {
    const studio = process.env.DEVECO_STUDIO_HOME || (process.platform === 'darwin' ? '/Applications/DevEco-Studio.app/Contents' : 'C:/Program Files/Huawei/DevEco Studio');
    const result = spawnSync(process.execPath, [path.join(studio, 'tools/ohpm/bin/pm-cli.js'), 'install'],
      { cwd: projectRoot, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error || Error('ohpm failed: ' + consumer.project);
  }
  for (const file of currentInputs.filter(file => /\.(ts|ets|svg)$/.test(file))) {
    const installed = path.join(projectRoot, consumer.packagePath, file);
    if (!existsSync(installed) || hash(installed) !== report.sourceHashes[file]) {
      throw Error('Installed HAR is stale for ' + consumer.project + '; run npm --prefix "' + root + '" run sync:consumers');
    }
  }
  for (const file of consumer.adapters) {
    if (!readFileSync(path.join(projectRoot, file), 'utf8').includes("from 'jide_foundation'")) {
      throw Error('Consumer bypasses shared implementation: ' + file);
    }
  }
  for (const name of consumer.resourceNames || []) {
    for (const mode of ['base', 'dark']) {
      const duplicate = path.join(projectRoot, 'entry/src/main/resources', mode, 'media', name + '.svg');
      if (existsSync(duplicate)) throw Error('Shared resource duplicated in consumer: ' + duplicate);
    }
  }
  console.log(`PASS: ${consumer.project} consumes current HAR ${report.sha256.slice(0, 12)}`);
}
