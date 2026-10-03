// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentToolCall, AgentToolDiagnostic, AgentToolTrace } from './AgentTypes';

const DEFAULT_MAX_TOOL_TEXT: number = 8192;
const MIN_TOOL_TEXT: number = 64;

export interface SanitizedAgentToolText {
  text: string;
  truncated: boolean;
}

export interface AgentToolFailureRecord {
  count: number;
  requireCorrection: boolean;
  shouldAbort: boolean;
}

/** 每轮独立实例；第三次完全相同的失败触发提前熔断。 */
export class AgentToolFailureTracker {
  private readonly counts: Map<string, number> = new Map<string, number>();

  record(toolName: string, argumentsJson: string,
    diagnostic: AgentToolDiagnostic): AgentToolFailureRecord {
    const fingerprint: string = buildAgentToolFailureFingerprint(toolName, argumentsJson, diagnostic);
    const previous: number | undefined = this.counts.get(fingerprint);
    const count: number = (previous === undefined ? 0 : previous) + 1;
    this.counts.set(fingerprint, count);
    return { count: count, requireCorrection: count >= 2, shouldAbort: count >= 3 };
  }
}

function redactAgentToolText(value: string): string {
  return value
    .replace(/("(?:apiKey|api_key|authorization|bearer|token|access_token|secret)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"')
    .replace(/Bearer\s+[^\s"}]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/data:[^\s"\\]+/gi, '[MEDIA OMITTED]');
}

/** 工具参数、输出和诊断共用的最终可见边界。 */
export function sanitizeAgentToolJson(value: string,
  maximum: number = DEFAULT_MAX_TOOL_TEXT): SanitizedAgentToolText {
  const limit: number = Math.max(MIN_TOOL_TEXT, Math.floor(maximum));
  const redacted: string = redactAgentToolText(value);
  if (redacted.length <= limit) {
    return { text: redacted, truncated: false };
  }
  const marker: string = `…[truncated=true,originalLength=${redacted.length}]`;
  const prefixLength: number = Math.max(0, limit - marker.length);
  return { text: `${redacted.slice(0, prefixLength)}${marker}`.slice(0, limit), truncated: true };
}

function canonicalJson(value: string): string {
  try {
    const parsed: Object = JSON.parse(value) as Object;
    const normalized: string = JSON.stringify(parsed);
    const propertyPattern: RegExp = /"((?:\\.|[^"\\])*)"\s*:/g;
    const keys: string[] = [];
    const seen: Set<string> = new Set<string>();
    let match: RegExpExecArray | null = propertyPattern.exec(normalized);
    while (match !== null) {
      let key: string = match[1];
      try { key = JSON.parse(`"${match[1]}"`) as string; } catch (error) { /* 保留原始键。 */ }
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
      match = propertyPattern.exec(normalized);
    }
    keys.sort();
    return JSON.stringify(parsed, keys);
  } catch (error) {
    // 指纹不进入日志；不能截断，否则长参数后半段的真实修正会被误判为重复。
    return value;
  }
}

/** 指纹只用于一轮内识别完全相同的失败，不作为安全哈希。 */
export function buildAgentToolFailureFingerprint(toolName: string, argumentsJson: string,
  diagnostic: AgentToolDiagnostic): string {
  return `${toolName}\n${canonicalJson(argumentsJson)}\n${diagnostic.code}\n${diagnostic.path}`;
}

export function createStartedAgentToolTrace(call: AgentToolCall, providerRound: number,
  sequence: number): AgentToolTrace {
  const args: SanitizedAgentToolText = sanitizeAgentToolJson(call.argumentsJson);
  return {
    callId: call.id,
    toolName: call.name,
    status: 'started',
    providerRound: providerRound,
    sequence: sequence,
    argumentsJson: args.text,
    outputJson: '',
    errorCode: '',
    errorPath: '',
    errorMessage: '',
    receivedKeys: [],
    allowedKeys: [],
    validTemplateJson: '',
    repeatCount: 0,
    argumentsTruncated: args.truncated,
    outputTruncated: false,
    diagnosticTruncated: false,
    expanded: false,
    legacySummary: ''
  };
}

export function completeAgentToolTrace(started: AgentToolTrace, outputJson: string): AgentToolTrace {
  const output: SanitizedAgentToolText = sanitizeAgentToolJson(outputJson);
  return {
    callId: started.callId, toolName: started.toolName, status: 'completed',
    providerRound: started.providerRound, sequence: started.sequence,
    argumentsJson: started.argumentsJson, outputJson: output.text,
    errorCode: '', errorPath: '', errorMessage: '', receivedKeys: [], allowedKeys: [],
    validTemplateJson: '', repeatCount: 0,
    argumentsTruncated: started.argumentsTruncated, outputTruncated: output.truncated,
    diagnosticTruncated: false, expanded: started.expanded, legacySummary: ''
  };
}

export function failAgentToolTrace(started: AgentToolTrace, diagnostic: AgentToolDiagnostic,
  repeatCount: number): AgentToolTrace {
  const message: SanitizedAgentToolText = sanitizeAgentToolJson(diagnostic.message, 2048);
  const template: SanitizedAgentToolText = sanitizeAgentToolJson(diagnostic.validTemplateJson, 4096);
  return {
    callId: started.callId, toolName: started.toolName, status: 'failed',
    providerRound: started.providerRound, sequence: started.sequence,
    argumentsJson: started.argumentsJson, outputJson: '',
    errorCode: diagnostic.code, errorPath: diagnostic.path, errorMessage: message.text,
    receivedKeys: diagnostic.receivedKeys.slice(), allowedKeys: diagnostic.allowedKeys.slice(),
    validTemplateJson: template.text, repeatCount: repeatCount,
    argumentsTruncated: started.argumentsTruncated, outputTruncated: false,
    diagnosticTruncated: message.truncated || template.truncated,
    expanded: started.expanded, legacySummary: ''
  };
}
