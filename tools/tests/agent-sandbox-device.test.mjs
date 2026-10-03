// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeResult, parseProbeResult } from '../test-agent-sandbox-device.mjs';
import { checkAppTestOutput, parseAppMeasurements } from '../test-agent-sandbox-app.mjs';

test('device acceptance rejects hdc success without a completed runtime test run', () => {
  for (const text of ['', "can't execute: Is a directory", 'running 8 tests\ntest x ... ok',
    'test result: FAILED. 7 passed; 1 failed;',
    'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 8 filtered out;',
    'test result: ok. 7 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out;']) {
    assert.throws(() => parseRuntimeResult(text));
  }
  const result = 'test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.99s\r\n';
  assert.match(parseRuntimeResult(result), /^ok\./);
  assert.throws(() => parseRuntimeResult(result + result));
});

test('device probe reports must match requested architecture, sample count and measurements', () => {
  const timing = { min: 1, median: 2, p95: 3, max: 4 };
  const valid = { schema_version: 1, target_arch: 'aarch64', samples: 20, module_init_ms: 10,
    workloads: [1, 2, 3].map(() => ({ elapsed_ms: timing })), cancel_join_ms: timing,
    memory_checkpoints: [0, 20].map(rounds => ({ rounds, process: { rss_kib: 8000, high_water_kib: 10000 } })) };
  assert.deepEqual(parseProbeResult(JSON.stringify(valid), 'aarch64', 20), valid);
  for (const broken of [
    { ...valid, target_arch: 'x86_64' }, { ...valid, samples: 1 },
    { ...valid, memory_checkpoints: [] }, { ...valid, cancel_join_ms: { ...timing, max: 0 } },
    { ...valid, module_init_ms: -1 }
  ]) assert.throws(() => parseProbeResult(JSON.stringify(broken), 'aarch64', 20));
  assert.throws(() => parseProbeResult('not a JSON report', 'aarch64', 20));
});

test('app acceptance requires the complete NAPI marker and rejects transport false-success', () => {
  checkAppTestOutput('AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20');
  for (const text of ['', '[Fail]Not match target founded', 'AGENT_SANDBOX_NAPI_PASS',
    'AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20\nAGENT_SANDBOX_NAPI_FAIL',
    'AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20\nError Code:123']) {
    assert.throws(() => checkAppTestOutput(text));
  }
});

test('app measurements require every workload, cancellation sample and memory checkpoint', () => {
  const report = { samples: 20, stressRounds: 100, cancelMs: Array(100).fill(1),
    workloads: ['scalar', 'clean_deduplicate_1000', 'sum_10000'].map(name => ({ name, elapsedMs: Array(20).fill(10) })),
    memory: Array.from({ length: 11 }, (_, index) => ({ round: index * 10, rssKiB: 10000, pssKiB: 8000 })),
    cooldownMemory: { round: 100, rssKiB: 10000, pssKiB: 8000 } };
  const output = value => 'AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20\nAGENT_SANDBOX_METRICS_PART 0 ' + JSON.stringify(value);
  assert.deepEqual(parseAppMeasurements(output(report)), report);
  for (const invalid of [{ ...report, samples: 0 }, { ...report, cancelMs: [1] },
    { ...report, stressRounds: 20 }, { ...report, cooldownMemory: null },
    { ...report, workloads: report.workloads.slice(1) }, { ...report, memory: [] },
    { ...report, memory: [{ round: 0, rssKiB: 0, pssKiB: 0 }, ...report.memory.slice(1)] }]) {
    assert.throws(() => parseAppMeasurements(output(invalid)));
  }
  assert.throws(() => parseAppMeasurements(output(report) + '\nAGENT_SANDBOX_METRICS_PART 0 {}'));
  assert.throws(() => parseAppMeasurements(output(report).replace('PART 0', 'PART 1')));
  assert.throws(() => parseAppMeasurements('AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20'));
});
