// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { AgentToolDiagnostic } from './AgentTypes';

const CORE_TOOL_NAMES: string[] = ['discover_tools', 'get_app_structure', 'request_clarification'];
const MAX_LOADED_TOOLS: number = 12;
const MAX_DISCOVERY_RESULTS: number = 6;

export function agentToolDiscoveryDefinition(): ProviderFunctionTool {
  return {
    name: 'discover_tools',
    description: '按功能关键词检索可用工具，或按准确名称加载工具。匹配工具的完整参数定义会加入下一次模型请求。',
    parametersJson: '{"type":"object","properties":{"query":{"type":"string","maxLength":200},' +
      '"names":{"type":"array","items":{"type":"string","minLength":1,"maxLength":100},"maxItems":6},' +
      '"offset":{"type":"integer","minimum":0,"maximum":1000},' +
      '"limit":{"type":"integer","minimum":1,"maximum":6}},"required":[],"additionalProperties":false}',
    exampleArgumentsJson: '{"query":"搜索笔记","limit":4}',
    rules: 'Provide a short feature keyword in Chinese/English, or exact names (up to 6). Query results load automatically. ' +
      'Use nextOffset with the same query to continue. An empty match is not evidence that all capabilities are absent. ' +
      'Call loaded tools only after receiving their schemas in the NEXT request; never guess arguments or batch discovery with an unloaded tool. ' +
      'Only current mode/device/web-enabled capabilities can be loaded. Discovery never executes a domain tool or grants write permission. ' +
      'At most 12 non-core definitions remain loaded; least recently used definitions may be removed. Rediscover when needed.'
  };
}

interface DiscoveryArguments { query?: string; names?: string[]; offset?: number; limit?: number; }
interface ToolMatch { tool: ProviderFunctionTool; score: number; }
interface ToolSummary { name: string; description: string; }
interface DiscoveryOutput {
  status: string; tools: ToolSummary[]; totalMatched: number; nextOffset: number;
  loadedNames: string[]; removedNames: string[];
}

export class AgentToolDiscoveryError extends Error {
  private readonly path: string;
  private readonly detail: string;
  constructor(code: string, path: string, detail: string) {
    super(code); this.path = path; this.detail = detail;
  }
  diagnostic(): AgentToolDiagnostic {
    return { stage: 'arguments', code: this.message, path: this.path, message: this.detail,
      receivedKeys: [], allowedKeys: ['query', 'names', 'offset', 'limit'],
      validTemplateJson: agentToolDiscoveryDefinition().exampleArgumentsJson };
  }
}

/** 请求内拥有定义窗口；目录来自已过滤的真实声明，搜索和加载不执行任何业务操作。 */
export class AgentToolDiscovery {
  private readonly catalog: ProviderFunctionTool[];
  private readonly loaded: string[] = [];

  constructor(catalog: ProviderFunctionTool[]) { this.catalog = catalog.slice(); }

  definitions(): ProviderFunctionTool[] {
    const result: ProviderFunctionTool[] = [];
    for (const name of CORE_TOOL_NAMES.concat(this.loaded)) {
      const tool: ProviderFunctionTool | undefined = this.catalog.find(
        (entry: ProviderFunctionTool): boolean => entry.name === name);
      if (tool !== undefined) { result.push(tool); }
    }
    return result;
  }

  touch(name: string): void {
    const index: number = this.loaded.indexOf(name);
    if (index >= 0) { this.loaded.splice(index, 1); this.loaded.push(name); }
  }

  /** @throws {AgentToolDiscoveryError} 参数或名称无效时不改变已加载定义。 */
  discover(json: string): string {
    const args: DiscoveryArguments = this.decode(json);
    const matches: ProviderFunctionTool[] = args.names !== undefined && args.names.length > 0 ?
      this.namedTools(args.names) : this.search(args.query ?? '');
    const offset: number = args.offset ?? 0;
    const limit: number = args.limit ?? MAX_DISCOVERY_RESULTS;
    const selected: ProviderFunctionTool[] = matches.slice(offset, offset + limit);
    const removed: string[] = [];
    for (const tool of selected) {
      if (CORE_TOOL_NAMES.includes(tool.name)) continue;
      const index: number = this.loaded.indexOf(tool.name);
      if (index >= 0) this.loaded.splice(index, 1);
      this.loaded.push(tool.name);
    }
    while (this.loaded.length > MAX_LOADED_TOOLS) { removed.push(this.loaded.shift() ?? ''); }
    const output: DiscoveryOutput = {
      status: selected.length > 0 ? 'tools_loaded_for_next_request' : 'no_matching_tools',
      tools: selected.map((tool: ProviderFunctionTool): ToolSummary => ({ name: tool.name, description: tool.description })),
      totalMatched: matches.length, nextOffset: offset + selected.length < matches.length ? offset + selected.length : -1,
      loadedNames: selected.map((tool: ProviderFunctionTool): string => tool.name), removedNames: removed
    };
    return JSON.stringify(output);
  }

  /** @throws {AgentToolDiscoveryError} 目录外名称不能被加载。 */
  private namedTools(names: string[]): ProviderFunctionTool[] {
    const result: ProviderFunctionTool[] = [];
    for (const name of names) {
      const tool: ProviderFunctionTool | undefined = this.catalog.find((entry: ProviderFunctionTool): boolean => entry.name === name);
      if (tool === undefined) throw new AgentToolDiscoveryError('tool_not_available', 'names',
        `Tool ${name} is not available in the current catalog. Discovery cannot enable unsupported or disabled tools.`);
      result.push(tool);
    }
    return result;
  }

  private search(query: string): ProviderFunctionTool[] {
    const normalized: string = query.trim().toLowerCase();
    const terms: string[] = normalized.match(new RegExp('[a-z0-9]+|[\\u3400-\\u9fff]+', 'g')) ?? [];
    const matches: ToolMatch[] = [];
    for (const tool of this.catalog) {
      const name: string = tool.name.toLowerCase();
      const description: string = tool.description.toLowerCase();
      let score: number = name === normalized ? 1000 : 0;
      if (description.includes(normalized)) score += 100;
      for (const term of terms) {
        if (name.includes(term)) score += 20;
        if (description.includes(term)) score += 10;
        if (term.length > 2 && new RegExp('[\\u3400-\\u9fff]').test(term)) {
          for (let index: number = 0; index < term.length - 1; index++) {
            if (description.includes(term.slice(index, index + 2))) score += 1;
          }
        }
      }
      if (score > 0) matches.push({ tool: tool, score: score });
    }
    matches.sort((left: ToolMatch, right: ToolMatch): number => right.score - left.score || left.tool.name.localeCompare(right.tool.name));
    return matches.map((match: ToolMatch): ProviderFunctionTool => match.tool);
  }

  /** @throws {AgentToolDiscoveryError} 严格拒绝无效参数，不改变定义窗口。 */
  private decode(json: string): DiscoveryArguments {
    let args: DiscoveryArguments;
    try { args = JSON.parse(json) as DiscoveryArguments; }
    catch (error) { throw new AgentToolDiscoveryError('invalid_json', '', 'Provide a valid JSON object.'); }
    if (args === null || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some((key: string): boolean => !['query', 'names', 'offset', 'limit'].includes(key))) {
      throw new AgentToolDiscoveryError('invalid_tool_arguments', '', 'Only query, names, offset and limit are accepted.');
    }
    if (args.query !== undefined && (typeof args.query !== 'string' || args.query.length > 200)) {
      throw new AgentToolDiscoveryError('invalid_value', 'query', 'query must be a string of at most 200 characters.');
    }
    if (args.names !== undefined && (!Array.isArray(args.names) || args.names.length > MAX_DISCOVERY_RESULTS ||
      args.names.some((name: string): boolean => typeof name !== 'string' || name.length === 0 || name.length > 100) ||
      new Set<string>(args.names).size !== args.names.length)) {
      throw new AgentToolDiscoveryError('invalid_value', 'names', 'names must contain at most 6 distinct, exact tool names.');
    }
    if ((args.names === undefined || args.names.length === 0) && (args.query ?? '').trim().length === 0) {
      throw new AgentToolDiscoveryError('missing_property', 'query', 'Provide feature keywords or exact tool names.');
    }
    if (args.offset !== undefined && (!Number.isSafeInteger(args.offset) || args.offset < 0 || args.offset > 1000)) {
      throw new AgentToolDiscoveryError('invalid_value', 'offset', 'offset must be an integer between 0 and 1000.');
    }
    if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > MAX_DISCOVERY_RESULTS)) {
      throw new AgentToolDiscoveryError('invalid_value', 'limit', 'limit must be an integer between 1 and 6.');
    }
    return args;
  }
}
