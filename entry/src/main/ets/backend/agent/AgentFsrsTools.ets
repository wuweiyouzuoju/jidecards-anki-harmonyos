// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentScope } from './AgentScope';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler, AgentActionToolHandler } from './AgentToolRegistry';
import { FsrsService, fsrsContextSnapshot } from '../FsrsService';
import { fsrsOptimizeInput, fsrsWorkloadInput } from '../../model/FsrsOptions';
import { agentFsrsTools, decodeAgentFsrsArguments } from '../../model/agent/AgentFsrsTools';
import type { FsrsSimulationAction } from '../../model/agent/AgentFsrsTools';
import { createAgentAction } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';

class FsrsReadHandler implements AgentReadToolHandler {
  private readonly owner: AgentFsrsTools;
  private readonly name: string;
  constructor(owner: AgentFsrsTools, name: string) { this.owner = owner; this.name = name; }
  execute(json: string): Promise<string> { return this.owner.read(this.name, json); }
}
class FsrsActionHandler implements AgentActionToolHandler {
  private readonly owner: AgentFsrsTools;
  constructor(owner: AgentFsrsTools) { this.owner = owner; }
  propose(json: string): Promise<AgentAction> { return this.owner.propose(json); }
}
/** 配置范围和 Core 运算共用领域服务，工具只提供有界读取与确认提案。 */
export class AgentFsrsTools {
  private readonly fsrs: FsrsService = new FsrsService();
  private readonly scope: AgentScope;
  constructor(scope: AgentScope) { this.scope = scope; }
  register(registry: AgentToolRegistry): void {
    for (const definition of agentFsrsTools()) {
      if (definition.name.startsWith('propose_')) registry.registerAction(definition.name, new FsrsActionHandler(this));
      else registry.registerRead(definition.name, new FsrsReadHandler(this, definition.name));
    }
  }
  async read(name: string, json: string): Promise<string> {
    const args = decodeAgentFsrsArguments(name, json);
    if (name === 'compute_fsrs_memory_state') {
      this.scope.assertReadableCardIds([args.cardId!]);
      return JSON.stringify({ cardId: args.cardId, source: 'computed_from_history', saved: false,
        result: await this.fsrs.memoryState(args.cardId!) });
    }
    this.scope.assertReadableDeckIds([args.deckId!]);
    const context = await this.fsrs.deckContext(args.deckId!);
    const optimize = fsrsOptimizeInput(context.config, false, context.search);
    if (name === 'get_fsrs_history_count') {
      return JSON.stringify({ deckId: args.deckId, presetId: context.config.id, search: optimize.search,
        ignoreBeforeDate: context.config.config!.ignoreRevlogsBeforeDate, unit: 'non_new_cards',
        result: await this.fsrs.historyCount(context.config.config!.ignoreRevlogsBeforeDate, optimize.search) });
    }
    const params: number[] = (args.params ?? optimize.currentParams).slice();
    return JSON.stringify({ deckId: args.deckId, presetId: context.config.id, search: optimize.search,
      ignoreBeforeMs: optimize.ignoreRevlogsBeforeMs, method: 'EvaluateParamsLegacy', validation: 'historical_fit',
      params: params, usesCoreDefaults: params.length === 0,
      result: await this.fsrs.evaluate({ params: params, search: optimize.search, ignoreRevlogsBeforeMs: optimize.ignoreRevlogsBeforeMs }) });
  }
  async propose(json: string): Promise<AgentAction> {
    const args = decodeAgentFsrsArguments('propose_simulate_fsrs', json);
    this.scope.assertReadableDeckIds([args.deckId!]);
    const context = await this.fsrs.deckContext(args.deckId!);
    const input = fsrsWorkloadInput(context.config, context.options, args.days!, context.search);
    if (args.desiredRetention !== undefined) input.desiredRetention = args.desiredRetention;
    if (args.newLimit !== undefined) input.newLimit = args.newLimit;
    if (args.reviewLimit !== undefined) input.reviewLimit = args.reviewLimit;
    const payload: FsrsSimulationAction = { deckId: args.deckId!, snapshot: fsrsContextSnapshot(context), input: input };
    return createAgentAction('fsrs_simulation', JSON.stringify(payload));
  }
}
