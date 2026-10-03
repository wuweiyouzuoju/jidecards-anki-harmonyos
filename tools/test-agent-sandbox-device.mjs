// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function parseRuntimeResult(output) {
  const results = [...output.matchAll(/^test result: (.+)$/gm)];
  if (results.length !== 1 || !/^ok\. [1-9]\d* passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;/.test(results[0][1])) {
    throw new Error('Runtime tests did not finish with all tests passing.');
  }
  return results[0][1].trim();
}

export function parseProbeResult(output, arch, samples) {
  const report = JSON.parse(output);
  if (report.schema_version !== 1 || report.target_arch !== arch || report.samples !== samples ||
      !Number.isFinite(report.module_init_ms) || report.module_init_ms < 0 ||
      !Array.isArray(report.workloads) || report.workloads.length !== 3 ||
      !Array.isArray(report.memory_checkpoints) || report.memory_checkpoints.length < 2) {
    throw new Error('Invalid or mismatched device probe report.');
  }
  for (const stats of [...report.workloads.map(w => w.elapsed_ms), report.cancel_join_ms]) {
    if (!stats || ['min', 'median', 'p95', 'max'].some(key => !Number.isFinite(stats[key])) ||
        !(0 <= stats.min && stats.min <= stats.median && stats.median <= stats.p95 && stats.p95 <= stats.max)) {
      throw new Error('Invalid probe timing distribution.');
    }
  }
  for (const checkpoint of report.memory_checkpoints) {
    if (!checkpoint.process || !Number.isInteger(checkpoint.process.rss_kib) || checkpoint.process.rss_kib <= 0 ||
        !Number.isInteger(checkpoint.process.high_water_kib) || checkpoint.process.high_water_kib < checkpoint.process.rss_kib) {
      throw new Error('Device process memory measurement is missing.');
    }
  }
  return report;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 600_000, maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result.stdout;
}

function main() {
  const [connectKey, sampleArg = '20', ...extra] = process.argv.slice(2);
  const samples = Number(sampleArg);
  if (!connectKey || !/^[A-Za-z0-9._:-]+$/.test(connectKey) || !Number.isInteger(samples) || samples < 1 || samples > 100 || extra.length) {
    throw new Error('Usage: node tools/test-agent-sandbox-device.mjs <connect-key> [samples: 1..100]');
  }
  const native = path.join(process.env.DEVECO_HOME ?? 'C:\\Program Files\\Huawei\\DevEco Studio', 'sdk/default/openharmony');
  const hdc = path.join(native, 'toolchains/hdc.exe');
  const device = (...args) => run(hdc, ['-t', connectKey, ...args]);
  const machine = device('shell', 'uname', '-m').trim();
  const arch = { aarch64: 'aarch64', x86_64: 'x86_64' }[machine];
  if (!arch) throw new Error(`Unsupported device architecture: ${machine}`);
  console.log(`[sandbox-device] ${connectKey}: ${arch}; building pinned sources`);
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/build-agent-sandbox.ps1', '-Target', 'ohos'], { stdio: 'inherit' });

  const target = `${arch}-unknown-linux-ohos`;
  const env = {
    ...process.env,
    JIDECARDS_OHOS_CLANG: path.join(native, 'native/llvm/bin/clang.exe'),
    JIDECARDS_OHOS_SYSROOT: path.join(native, 'native/sysroot'),
    [`CARGO_TARGET_${target.toUpperCase().replaceAll('-', '_')}_LINKER`]: path.join(root, `tools/ohos-${arch === 'aarch64' ? 'aarch64' : 'x86_64'}-clang.cmd`)
  };
  const artifacts = run('cargo', ['test', '--manifest-path', 'native/agent-sandbox/Cargo.toml', '--locked', '--release',
    '--test', 'runtime', '--no-run', '--target', target, '--message-format=json'], { env })
    .trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const tests = artifacts.filter(item => item.reason === 'compiler-artifact' && item.target.name === 'runtime' && item.executable);
  if (tests.length !== 1) throw new Error('Cargo did not identify exactly one runtime test executable.');
  const probe = path.join(root, `native/agent-sandbox/target/${target}/release/examples/probe`);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const remote = `/data/local/tmp/jidecards-sandbox-${stamp}`;
  device('shell', 'mkdir', remote);
  for (const [local, name] of [[tests[0].executable, 'runtime-tests'], [probe, 'probe']]) {
    device('file', 'send', path.resolve(local), `${remote}/${name}`);
    device('shell', 'chmod', '700', `${remote}/${name}`);
  }
  // hdc can return zero even when the remote command fails. Validate the program output.
  const testOutput = device('shell', `${remote}/runtime-tests`, '--test-threads=1');
  const directory = path.join(root, 'native/agent-sandbox/target/device-reports');
  mkdirSync(directory, { recursive: true });
  const testLog = path.join(directory, `${stamp}-${arch}-tests.txt`);
  writeFileSync(testLog, testOutput);
  if (/Permission denied/.test(testOutput)) {
    throw new Error(`Device refused standalone execution; use the signed ohosTest path. Raw output: ${testLog}`);
  }
  const testResult = parseRuntimeResult(testOutput);
  const measurement = parseProbeResult(device('shell', `${remote}/probe`, String(samples)), arch, samples);
  const wasm = readFileSync(path.join(root, 'native/agent-sandbox/engine/quickjs.wasm'));
  if (measurement.wasm_bytes !== wasm.length) throw new Error('Device probe embeds a different Wasm size.');
  const report = { measured_at: new Date().toISOString(), connect_key: connectKey, remote_directory: remote,
    wasm_sha256: createHash('sha256').update(wasm).digest('hex'), tests: testResult, probe: measurement };
  const reportPath = path.join(directory, `${stamp}-${arch}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`[sandbox-device] passed: ${reportPath}`);
  console.log(JSON.stringify(measurement, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[sandbox-device] ${error.message}`); process.exitCode = 1; }
}
