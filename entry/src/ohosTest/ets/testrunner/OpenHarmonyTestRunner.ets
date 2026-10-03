// SPDX-License-Identifier: AGPL-3.0-or-later
import { abilityDelegatorRegistry, TestRunner } from '@kit.TestKit';
import { hidebug, hilog } from '@kit.PerformanceAnalysisKit';
import { systemDateTime } from '@kit.BasicServicesKit';
import sandbox from 'libagent_sandbox.so';
import { AgentCodeTool } from '../../../main/ets/backend/agent/AgentCodeTool';
import { AgentToolRegistry } from '../../../main/ets/backend/agent/AgentToolRegistry';
import { AgentToolSchemaError } from '../../../main/ets/model/agent/AgentToolSchemas';

interface NativeResult { ok: boolean; resultJson?: string; error?: string; elapsedMs?: number; }
interface MemorySample { round: number; rssKiB: number; pssKiB: number; }
interface Workload { name: string; source: string; input: string; expected: string; elapsedMs: number[]; }
interface Measurements {
  samples: number; stressRounds: number; workloads: Workload[]; cancelMs: number[];
  memory: MemorySample[]; cooldownMemory?: MemorySample;
}

function check(value: boolean, message: string): void {
  if (!value) { throw new Error(message); }
}

async function nativeRun(source: string, input: string = 'null'): Promise<NativeResult> {
  return JSON.parse(await sandbox.start(source, input).result) as NativeResult;
}

function memorySample(round: number): MemorySample {
  const value = hidebug.getAppNativeMemInfo();
  return { round: round, rssKiB: Number(value.rss), pssKiB: Number(value.pss) };
}

async function measure(): Promise<Measurements> {
  const input: string[] = [];
  const expected: string[] = [];
  for (let i: number = 0; i < 1000; i++) { input.push(` Field ${i % 200} `); }
  for (let i: number = 0; i < 200; i++) { expected.push(`field ${i}`); }
  const workloads: Workload[] = [
    { name: 'scalar', source: 'return 42;', input: 'null', expected: '42', elapsedMs: [] },
    { name: 'clean_deduplicate_1000', source: 'return [...new Set(input.map(s => s.trim().toLowerCase()))];',
      input: JSON.stringify(input), expected: JSON.stringify(expected), elapsedMs: [] },
    { name: 'sum_10000', source: 'let n=0; for(let i=0;i<10000;i++) n+=i; return n;',
      input: 'null', expected: '49995000', elapsedMs: [] }
  ];
  for (const workload of workloads) {
    for (let i: number = 0; i < 20; i++) {
      const result = await nativeRun(workload.source, workload.input);
      check(result.ok && result.resultJson === workload.expected && result.elapsedMs !== undefined,
        `measurement ${workload.name}`);
      workload.elapsedMs.push(result.elapsedMs ?? -1);
    }
  }
  const report: Measurements = {
    samples: 20, stressRounds: 100, workloads: workloads, cancelMs: [], memory: [memorySample(0)]
  };
  const failures: string[] = [
    'const parts=[]; for(let i=0;i<24;i++) parts.push(new Uint8Array(1024*1024)); return parts.length;',
    "return 'x'.repeat(65537);",
    'function f(){return f()+1} return f();'
  ];
  for (let round: number = 1; round <= report.stressRounds; round++) {
    const pending = sandbox.start('while(true){}', 'null');
    await new Promise<void>((resolve: () => void): void => { setTimeout(resolve, 30); });
    const start = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP);
    sandbox.cancel(pending.id);
    check((JSON.parse(await pending.result) as NativeResult).error === 'cancelled', 'measured cancellation');
    report.cancelMs.push(systemDateTime.getUptime(systemDateTime.TimeType.STARTUP) - start);
    for (const source of failures) {
      check(!(await nativeRun(source)).ok, 'stress must fail');
      check((await nativeRun('return 42;')).resultJson === '42', 'stress recovery');
    }
    if (round % 10 === 0) { report.memory.push(memorySample(round)); }
  }
  await new Promise<void>((resolve: () => void): void => { setTimeout(resolve, 5000); });
  report.cooldownMemory = memorySample(report.stressRounds);
  return report;
}

/** Test-only entry: no provider, collection, filesystem or application settings access. */
export default class OpenHarmonyTestRunner implements TestRunner {
  onPrepare(): void {}

  async onRun(): Promise<void> {
    const delegator = abilityDelegatorRegistry.getAbilityDelegator();
    try {
      check((await nativeRun('return 42;')).resultJson === '42', 'scalar');
      check((await nativeRun('return [...new Set(input.map(s => s.trim()))];', '["a"," a ","b"]'))
        .resultJson === '["a","b"]', 'deduplicate');
      const pending = sandbox.start('while(true){}', 'null');
      let busy: boolean = false;
      try { sandbox.start('return 1;', 'null'); }
      catch (error) { busy = (error as Error).message === 'sandbox_busy'; }
      check(busy, 'process-wide single task');
      // Leave time for the native worker to begin while the ArkTS event loop stays responsive.
      await new Promise<void>((resolve: () => void): void => { setTimeout(resolve, 1); });
      sandbox.cancel(pending.id);
      check((JSON.parse(await pending.result) as NativeResult).error === 'cancelled', 'live cancel');
      sandbox.cancel(pending.id);
      check((await nativeRun('return 42;')).resultJson === '42', 'stale cancellation and recovery');
      check((await nativeRun('return Promise.resolve(1);')).error === 'sandbox_invalid_result', 'promise');
      check((await nativeRun("return 'x'.repeat(65537);")).error === 'sandbox_output_limit', 'output limit');
      check((await nativeRun('return input;', '{')).error === 'sandbox_invalid_input', 'invalid input');
      check((await nativeRun('return typeof fetch + ":" + typeof require + ":" + typeof process;'))
        .resultJson === '"undefined:undefined:undefined"', 'no ambient capabilities');
      const registry: AgentToolRegistry = new AgentToolRegistry();
      new AgentCodeTool().register(registry);
      for (let i: number = 0; i < 20; i++) {
        const result = await registry.execute({ id: `run-${i}`, name: 'execute_code',
          argumentsJson: '{"source":"return {draft: {operations: []}};","inputJson":"null"}' });
        check(result.draft === null && result.action === undefined && result.clarification === null, 'no write authority');
        check(result.outputJson === '{"status":"completed","result":{"draft":{"operations":[]}}}', 'registry result');
      }
      let failed: boolean = false;
      try {
        await registry.execute({ id: 'fail', name: 'execute_code',
          argumentsJson: '{"source":"throw new Error();","inputJson":"null"}' });
      } catch (error) { failed = error instanceof AgentToolSchemaError && error.code === 'sandbox_script_error'; }
      check(failed, 'structured script failure');
      check((await nativeRun('return 42;')).resultJson === '42', 'final recovery');
      const measurements = await measure();
      for (const workload of measurements.workloads) {
        workload.source = '';
        workload.input = '';
        workload.expected = '';
      }
      const metrics = JSON.stringify(measurements);
      // TestKit truncates long individual messages. Emit bounded ordered chunks.
      for (let offset: number = 0; offset < metrics.length; offset += 500) {
        await delegator.print(`AGENT_SANDBOX_METRICS_PART ${offset / 500} ${metrics.slice(offset, offset + 500)}\n`);
      }
      await delegator.finishTest('AGENT_SANDBOX_NAPI_PASS cases=12 recoveryRounds=20', 0);
    } catch (error) {
      try { await delegator.finishTest(`AGENT_SANDBOX_NAPI_FAIL ${(error as Error).message}`, -1); }
      catch (reportError) {
        hilog.error(0x0000, 'AgentSandboxTest', 'AGENT_SANDBOX_NAPI_FAIL test result transport failed');
      }
    }
  }
}
