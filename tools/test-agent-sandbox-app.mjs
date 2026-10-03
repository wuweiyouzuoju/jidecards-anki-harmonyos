// SPDX-License-Identifier: AGPL-3.0-or-later
// Run the test-only ArkTS -> NAPI -> Wasm path, without provider calls or card-library access.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSON5 from 'json5';

const root = fileURLToPath(new URL('../', import.meta.url));
export function checkAppTestOutput(output) {
  if (!output.includes('AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20') ||
      /AGENT_SANDBOX_NAPI_FAIL|\[Fail\]|Error Code:|error:/.test(output)) {
    throw Error('The complete native app test did not pass; hdc exit status alone is insufficient.');
  }
}
export function parseAppMeasurements(output) {
  checkAppTestOutput(output);
  const parts = [...output.matchAll(/AGENT_SANDBOX_METRICS_PART (\d+) ([^\r\n]+)/g)];
  if (!parts.length || parts.some((part, index) => Number(part[1]) !== index)) {
    throw Error('Missing or out-of-order app measurements.');
  }
  const report = JSON.parse(parts.map(part => part[2]).join(''));
  const validSamples = (values, length) => Array.isArray(values) && values.length === length &&
    values.every(value => Number.isFinite(value) && value >= 0);
  const validMemory = sample => sample && Number.isFinite(sample.rssKiB) && sample.rssKiB > 0 &&
    Number.isFinite(sample.pssKiB) && sample.pssKiB > 0;
  if (report.samples !== 20 || report.stressRounds !== 100 || !validSamples(report.cancelMs, 100) || !Array.isArray(report.workloads) ||
      report.workloads.length !== 3 || report.workloads.some((workload, index) =>
        workload.name !== ['scalar', 'clean_deduplicate_1000', 'sum_10000'][index] ||
        !validSamples(workload.elapsedMs, 20)) || !Array.isArray(report.memory) || report.memory.length !== 11 ||
      report.memory.some((sample, index) => sample.round !== index * 10 || !validMemory(sample)) ||
      !validMemory(report.cooldownMemory) || report.cooldownMemory.round !== 100) {
    throw Error('Invalid or incomplete app measurements.');
  }
  return report;
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 330000, maxBuffer: 4*1024*1024 });
  if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stderr ?? 'Command failed');
  return result.stdout;
}
function main() {
  const [key, ...extra] = process.argv.slice(2);
  if (!key || !/^[A-Za-z0-9._:-]+$/.test(key) || extra.length) {
    throw Error('Usage: node tools/test-agent-sandbox-app.mjs <connect-key>; build and install the current signed main HAP first, then build tools/build-app.ps1 -Test.');
  }
  const hdc = path.join(process.env.DEVECO_HOME ?? 'C:/Program Files/Huawei/DevEco Studio', 'sdk/default/openharmony/toolchains/hdc.exe');
  const device = (...args) => run(hdc, ['-t', key, ...args]);
  const arch = device('shell', 'uname', '-m').trim();
  if (!['aarch64','x86_64'].includes(arch)) throw Error('No supported connected device: ' + arch);
  const bundle = JSON5.parse(readFileSync(path.join(root,'AppScope/app.json5'),'utf8')).app.bundleName;
  const installed = device('shell','bm','dump','-n',bundle);
  if (!installed.includes(bundle) || installed.includes('[Fail]')) throw Error('Install the current signed main HAP with install -r first.');
  const hap = path.join(root,'entry/build/default/outputs/ohosTest/entry-ohosTest-signed.hap');
  const bytes = readFileSync(hap);
  const install = device('install','-r',hap);
  if (!/install bundle successfully/i.test(install)) throw Error('Test HAP installation not confirmed: '+install);
  const output = device('shell','aa','test','-b',bundle,'-m','entry_test','-s','unittest',
    '/ets/testrunner/OpenHarmonyTestRunner','-s','timeout','300000');
  const stamp = new Date().toISOString().replaceAll(/[:.]/g,'-');
  const directory = path.join(root,'native/agent-sandbox/target/device-reports');
  mkdirSync(directory,{recursive:true});
  writeFileSync(path.join(directory,`${stamp}-${arch}-napi.txt`),output);
  const measurements = parseAppMeasurements(output);
  const report = { measured_at:new Date().toISOString(), arch, connect_key:key,
    test_hap_sha256:createHash('sha256').update(bytes).digest('hex'), cases:12, recovery_rounds:20,
    cargo_lock_sha256:createHash('sha256').update(readFileSync(path.join(root,'native/agent-sandbox/Cargo.lock'))).digest('hex'),
    wasm_sha256:createHash('sha256').update(readFileSync(path.join(root,'native/agent-sandbox/engine/quickjs.wasm'))).digest('hex'),
    measurements, status:'passed' };
  const file = path.join(directory,`${stamp}-${arch}-napi.json`);
  writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log('[sandbox-app] passed: '+file);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('[sandbox-app] '+error.message); process.exitCode=1; }
}
