// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentToolCall, ChangeDraft, ToolRisk } from '../../model/agent/AgentTypes';
import { toolRiskOf } from '../../model/agent/AgentPolicy';
import type { AgentClarificationRequest } from '../../model/agent/AgentClarification';
import { decodeAgentClarificationRequest, decodeAgentCreateTargetRequest } from '../../model/agent/AgentClarification';
import { AgentApprovalRequired } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';
import { parseAgentToolJsonObject } from '../../model/agent/AgentToolSchemas';
import type { AgentDocumentToolOutput } from '../../model/agent/AgentDocuments';
import type { ProviderInputImage } from '../../model/agent/ProviderProtocol';

export interface AgentActionToolHandler {
  propose(argumentsJson: string): Promise<AgentAction>;
}

export interface AgentReadToolHandler {
  execute(argumentsJson: string): Promise<string>;
  executeContent?(argumentsJson: string): Promise<AgentDocumentToolOutput>;
  cancel?(): void;
}

export interface AgentDraftToolHandler {
  propose(argumentsJson: string): Promise<ChangeDraft>;
}

export interface AgentToolResult {
  outputJson: string;
  images?: ProviderInputImage[];
  draft: ChangeDraft | null;
  clarification: AgentClarificationRequest | null;
  action?: AgentAction;
}

export interface AgentSettingToolHandler {
  execute(argumentsJson: string): Promise<string>;
}

export interface AgentNavigationToolHandler {
  execute(argumentsJson: string): Promise<string>;
}

interface SharedTemplateDraftOutput {
  status: string;
  draftId: string;
  summary: string;
  risk: string;
  affectedNoteCount: number;
  affectedCardCount: number;
  affectedNotetypeIds: number[];
}

function highRiskDraftOutput(draft: ChangeDraft): string {
  if (draft.operations.length !== 1 || !['update_template', 'update_notetype_fields', 'restore_notetype', 'update_notetype_latex'].includes(draft.operations[0].kind)) {
    return JSON.stringify(draft);
  }
  // The app keeps the exact ID set for confirmation; the model only needs the shared update and counts.
  const output: SharedTemplateDraftOutput = {
    status: 'awaiting_confirmation', draftId: draft.id, summary: draft.summary, risk: draft.risk,
    affectedNoteCount: draft.affectedNoteIds.length, affectedCardCount: draft.affectedCardIds.length,
    affectedNotetypeIds: draft.affectedNotetypeIds.slice()
  };
  return JSON.stringify(output);
}

export class AgentToolRegistryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** 卡库写入只生成提案；可逆本机设置使用独立注册和宿主授权。 */
export class AgentToolRegistry {
  private readonly navigationHandlers: Map<string, AgentNavigationToolHandler> = new Map<string, AgentNavigationToolHandler>();
  private navigationBusy: boolean = false;

  registerNavigation(name: string, handler: AgentNavigationToolHandler): void {
    if (toolRiskOf(name) !== 'navigation') throw new AgentToolRegistryError('tool_registration_rejected');
    this.navigationHandlers.set(name, handler);
  }
  private readonly settingHandlers: Map<string, AgentSettingToolHandler> = new Map<string, AgentSettingToolHandler>();
  private settingBusy: boolean = false;

  registerSetting(name: string, handler: AgentSettingToolHandler): void {
    if (toolRiskOf(name) !== 'setting_write') { throw new AgentToolRegistryError('tool_registration_rejected'); }
    this.settingHandlers.set(name, handler);
  }
  private activeRead: AgentReadToolHandler | null = null;

  cancelActive(): void {
    this.activeRead?.cancel?.();
  }
  private readonly actionHandlers: Map<string, AgentActionToolHandler> = new Map<string, AgentActionToolHandler>();

  registerAction(name: string, handler: AgentActionToolHandler): void {
    if (toolRiskOf(name) !== 'write') { throw new AgentToolRegistryError('tool_registration_rejected'); }
    this.actionHandlers.set(name, handler);
  }
  private readonly readHandlers: Map<string, AgentReadToolHandler> =
    new Map<string, AgentReadToolHandler>();
  private readonly draftHandlers: Map<string, AgentDraftToolHandler> =
    new Map<string, AgentDraftToolHandler>();
  private readonly highRiskDraftHandlers: Map<string, AgentDraftToolHandler> =
    new Map<string, AgentDraftToolHandler>();

  registerRead(name: string, handler: AgentReadToolHandler): void {
    if (toolRiskOf(name) !== 'read') {
      throw new AgentToolRegistryError('tool_registration_rejected');
    }
    this.readHandlers.set(name, handler);
  }

  registerDraft(name: string, handler: AgentDraftToolHandler): void {
    if (toolRiskOf(name) !== 'write') {
      throw new AgentToolRegistryError('tool_registration_rejected');
    }
    this.draftHandlers.set(name, handler);
  }

  registerHighRiskDraft(name: string, handler: AgentDraftToolHandler): void {
    if (toolRiskOf(name) !== 'high_risk' || !name.startsWith('propose_')) {
      throw new AgentToolRegistryError('tool_registration_rejected');
    }
    this.highRiskDraftHandlers.set(name, handler);
  }

  isDraftTool(name: string): boolean {
    return this.draftHandlers.has(name) || this.highRiskDraftHandlers.has(name);
  }

  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    parseAgentToolJsonObject(call.name, call.argumentsJson);
    const actionHandler: AgentActionToolHandler | undefined = this.actionHandlers.get(call.name);
    if (actionHandler !== undefined) {
      const action: AgentAction = await actionHandler.propose(call.argumentsJson);
      return { outputJson: JSON.stringify({ status: 'awaiting_confirmation', actionId: action.id }),
        draft: null, clarification: null, action: action };
    }
    if (call.name === 'request_clarification' || call.name === 'request_create_target') {
      const clarification: AgentClarificationRequest = call.name === 'request_create_target' ?
        decodeAgentCreateTargetRequest(call.argumentsJson) : decodeAgentClarificationRequest(call.argumentsJson);
      return {
        outputJson: JSON.stringify({ status: 'awaiting_user', clarificationId: clarification.id }),
        draft: null,
        clarification: clarification
      };
    }
    const risk: ToolRisk = toolRiskOf(call.name);
    if (risk === 'navigation') {
      const handler: AgentNavigationToolHandler | undefined = this.navigationHandlers.get(call.name);
      if (handler === undefined) throw new AgentToolRegistryError('tool_unavailable');
      if (this.navigationBusy) throw new AgentToolRegistryError('tool_busy');
      this.navigationBusy = true;
      try { return { outputJson: await handler.execute(call.argumentsJson), draft: null, clarification: null }; }
      finally { this.navigationBusy = false; }
    }
    if (risk === 'setting_write') {
      const handler: AgentSettingToolHandler | undefined = this.settingHandlers.get(call.name);
      if (handler === undefined) { throw new AgentToolRegistryError('tool_unavailable'); }
      if (this.settingBusy) { throw new AgentToolRegistryError('tool_busy'); }
      this.settingBusy = true;
      try { return { outputJson: await handler.execute(call.argumentsJson), draft: null, clarification: null }; }
      finally { this.settingBusy = false; }
    }
    if (risk === 'read') {
      const handler: AgentReadToolHandler | undefined = this.readHandlers.get(call.name);
      if (handler === undefined) {
        throw new AgentToolRegistryError('tool_unavailable');
      }
      let output: string;
      let images: ProviderInputImage[] | undefined;
      if (this.activeRead !== null) { throw new AgentToolRegistryError('tool_busy'); }
      this.activeRead = handler;
      try {
        if (handler.executeContent !== undefined) {
          const content: AgentDocumentToolOutput = await handler.executeContent(call.argumentsJson);
          output = content.outputJson; images = content.images;
        } else { output = await handler.execute(call.argumentsJson); }
      }
      catch (error) {
        if (error instanceof AgentApprovalRequired) {
          return { outputJson: JSON.stringify({ status: 'awaiting_confirmation', actionId: error.action.id }),
            draft: null, clarification: null, action: error.action };
        }
        if (error instanceof Error) { throw error; }
        throw new Error('tool_failed');
      } finally {
        if (this.activeRead === handler) { this.activeRead = null; }
      }
      return { outputJson: output, images: images, draft: null, clarification: null };
    }
    if (risk === 'write') {
      const handler: AgentDraftToolHandler | undefined = this.draftHandlers.get(call.name);
      if (handler === undefined) {
        throw new AgentToolRegistryError('tool_unavailable');
      }
      const draft: ChangeDraft = await handler.propose(call.argumentsJson);
      return { outputJson: JSON.stringify(draft), draft: draft, clarification: null };
    }
    if (risk === 'high_risk' && call.name.startsWith('propose_')) {
      const handler: AgentDraftToolHandler | undefined = this.highRiskDraftHandlers.get(call.name);
      if (handler === undefined) {
        throw new AgentToolRegistryError('tool_unavailable');
      }
      const draft: ChangeDraft = await handler.propose(call.argumentsJson);
      if (draft.risk !== 'high_risk') {
        throw new AgentToolRegistryError('tool_result_risk_mismatch');
      }
      return { outputJson: highRiskDraftOutput(draft), draft: draft, clarification: null };
    }
    throw new AgentToolRegistryError('tool_blocked');
  }
}
