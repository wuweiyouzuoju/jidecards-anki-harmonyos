// SPDX-License-Identifier: AGPL-3.0-or-later
import sandbox from 'libagent_sandbox.so';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler } from './AgentToolRegistry';
import { decodeCodeArguments, decodeCodeResult } from '../../model/agent/AgentCodeExecution';

export class AgentCodeTool implements AgentReadToolHandler {
  private taskId: number = 0;

  register(registry: AgentToolRegistry): void {
    registry.registerRead('execute_code', this);
  }

  async execute(argumentsJson: string): Promise<string> {
    const args = decodeCodeArguments(argumentsJson);
    if (this.taskId !== 0) { throw new Error('sandbox_busy'); }
    const task = sandbox.start(args.source, args.inputJson);
    this.taskId = task.id;
    try {
      return decodeCodeResult(await task.result);
    } finally {
      this.taskId = 0;
    }
  }

  cancel(): void {
    if (this.taskId !== 0) { sandbox.cancel(this.taskId); }
  }
}
