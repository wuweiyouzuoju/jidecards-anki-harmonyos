// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentToolSchemaError } from './AgentToolSchemas';

export interface CodeArguments {
  source: string;
  inputJson: string;
}

interface CodeResult {
  ok: boolean;
  error?: string;
  resultJson?: string;
}

const ERRORS: Record<string, string> = {
  sandbox_input_limit: 'Reduce source to 65500 UTF-8 bytes and inputJson to 128 KiB.',
  sandbox_invalid_input: 'inputJson must contain a valid JSON value.',
  sandbox_deadline: 'The 3 second deadline expired. Reduce the work per call.',
  sandbox_fuel: 'Instruction budget exhausted. Simplify the algorithm or reduce input.',
  sandbox_output_limit: 'Return a smaller JSON value, at most 64 KiB; aggregate or slice the result.',
  sandbox_invalid_result: 'Return a synchronous JSON value, not undefined, a Promise, BigInt or a cycle.',
  sandbox_script_error: 'Script failed or exhausted its heap/stack. Check syntax and types; reduce allocations or recursion.',
  sandbox_engine_error: 'The local runtime failed. Do not claim the calculation succeeded.',
  sandbox_internal_error: 'The local runtime failed. Do not claim the calculation succeeded.',
  cancelled: 'The execution was cancelled.'
};

// Match native UTF-8 sizing, including replacement of isolated UTF-16 surrogates.
export function codeUtf8Bytes(value: string): number {
  let bytes: number = 0;
  for (let i: number = 0; i < value.length; i++) {
    const code: number = value.charCodeAt(i);
    if (code < 0x80) { bytes++; }
    else if (code < 0x800) { bytes += 2; }
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else { bytes += 3; }
  }
  return bytes;
}

export function decodeCodeArguments(json: string): CodeArguments {
  if (json.length > 1200000) { throw new Error('sandbox_input_limit'); }
  let args: CodeArguments;
  try { args = JSON.parse(json) as CodeArguments; }
  catch (_) { throw new AgentToolSchemaError('invalid_json', '', 'Provide a JSON object with source and inputJson.'); }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new AgentToolSchemaError('invalid_type', '', 'Expected an object with source and inputJson.');
  }
  const keys: string[] = Object.keys(args);
  if (keys.some((key: string): boolean => key !== 'source' && key !== 'inputJson')) {
    throw new AgentToolSchemaError('unexpected_property', '', 'Only source and inputJson are accepted.', keys, ['source', 'inputJson']);
  }
  if (typeof args.source !== 'string' || args.source.trim().length === 0 || typeof args.inputJson !== 'string') {
    throw new AgentToolSchemaError('invalid_type', '', 'source must be a nonempty function body; inputJson must be a JSON string.');
  }
  if (codeUtf8Bytes(args.source) > 65500 || codeUtf8Bytes(args.inputJson) > 131072) {
    throw new AgentToolSchemaError('sandbox_input_limit', '', ERRORS.sandbox_input_limit);
  }
  // Input validation belongs to the bounded native worker, not the UI thread.
  return args;
}

export function decodeCodeResult(json: string): string {
  if (json.length > 400000) { throw new Error('sandbox_invalid_response'); }
  let result: CodeResult;
  try { result = JSON.parse(json) as CodeResult; }
  catch (_) { throw new Error('sandbox_invalid_response'); }
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('sandbox_invalid_response');
  }
  if (result.ok === false && typeof result.error === 'string' &&
    Object.keys(ERRORS).includes(result.error)) {
    throw new AgentToolSchemaError(result.error, '', ERRORS[result.error]);
  }
  if (result.ok !== true || typeof result.resultJson !== 'string' || codeUtf8Bytes(result.resultJson) > 65536) {
    throw new Error('sandbox_invalid_response');
  }
  try { JSON.parse(result.resultJson); }
  catch (_) { throw new Error('sandbox_invalid_response'); }
  return `{"status":"completed","result":${result.resultJson}}`;
}
