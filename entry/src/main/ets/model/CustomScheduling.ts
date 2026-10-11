// SPDX-License-Identifier: AGPL-3.0-or-later
import { UTF8编码 } from '../proto/core/utf8';
/** Platform execution is injected; this module owns the Anki script invocation contract. */
export interface SchedulingScriptRuntime {
  execute(source: string, inputJson: string): Promise<string>;
}
export const CUSTOM_SCHEDULING_RUNTIME = 'bounded_synchronous_javascript';
export const CUSTOM_SCHEDULING_MAX_BYTES = 60000;
export interface CustomSchedulingInfo {
  configured: boolean;
  runtime: string;
  synchronous: boolean;
  asyncSupported: boolean;
  writableByAgent: boolean;
  maxScriptBytes: number;
}
export function customSchedulingInfo(script: string = ''): CustomSchedulingInfo {
  return { configured: script.trim() !== '', runtime: CUSTOM_SCHEDULING_RUNTIME, synchronous: true,
    asyncSupported: false, writableByAgent: true, maxScriptBytes: CUSTOM_SCHEDULING_MAX_BYTES };
}
export function validateSchedulingScript(script: string): boolean { return UTF8编码(script).length <= CUSTOM_SCHEDULING_MAX_BYTES; }

export function schedulingScriptSource(script: string): string {
  // Sandbox input is frozen. Each candidate gets its own mutable customData, as in Anki 26.05.
  return `
const payload = JSON.parse(JSON.stringify(input));
const states = payload.states;
const ctx = payload.ctx;
ctx.seed = BigInt(ctx.seed);
const customData = {};
for (const name of ['again', 'hard', 'good', 'easy']) {
  try { customData[name] = JSON.parse(states.current.customData); }
  catch (_) { customData[name] = {}; }
}
const result = (function(states, customData, ctx) {
${script}
})(states, customData, ctx);
if (result && typeof result.then === 'function') throw new Error('Async scheduling is unsupported');
const checkNumbers = (value) => {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite scheduling value');
  if (value && typeof value === 'object') for (const child of Object.values(value)) checkNumbers(child);
};
checkNumbers(states);
checkNumbers(customData);
for (const name of ['again', 'hard', 'good', 'easy']) {
  states[name].customData = JSON.stringify(customData[name]);
}
return states;`;
}
