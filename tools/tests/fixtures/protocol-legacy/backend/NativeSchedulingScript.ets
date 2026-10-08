// SPDX-License-Identifier: AGPL-3.0-or-later
import sandbox from 'libagent_sandbox.so';
import { CodeArguments, decodeCodeArguments, decodeCodeResult } from '../model/agent/AgentCodeExecution';
import { AgentToolSchemaError } from '../model/agent/AgentToolSchemas';
import { SchedulingScriptRuntime } from '../model/CustomScheduling';

interface ScriptResult { result: Object; }
/** Scheduling uses the existing bounded engine without acquiring Agent tools or write permissions. */
export class NativeSchedulingScript implements SchedulingScriptRuntime {
  async execute(source: string, inputJson: string): Promise<string> {
    try {
      const input: CodeArguments = { source: source, inputJson: inputJson };
      const args: CodeArguments = decodeCodeArguments(JSON.stringify(input));
      const task = sandbox.start(args.source, args.inputJson);
      const envelope: ScriptResult = JSON.parse(decodeCodeResult(await task.result)) as ScriptResult;
      return JSON.stringify(envelope.result);
    } catch (error) {
      if (error instanceof AgentToolSchemaError) throw new Error(`${error.code}: ${error.detailMessage}`);
      throw new Error(error instanceof Error ? error.message : 'Custom scheduling runtime failed');
    }
  }
}
