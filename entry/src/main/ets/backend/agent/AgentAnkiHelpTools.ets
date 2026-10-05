// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceManager } from '@kit.LocalizationKit';
import { util } from '@kit.ArkTS';
import { AgentAnkiHelp, agentAnkiHelpTools } from '../../model/agent/AgentAnkiHelp';
import type { AnkiHelpIndex, AnkiHelpRepository } from '../../model/agent/AgentAnkiHelp';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler } from './AgentToolRegistry';

class BundledAnkiHelpRepository implements AnkiHelpRepository {
  private resources: resourceManager.ResourceManager;
  constructor(resources: resourceManager.ResourceManager) { this.resources = resources; }
  /** @throws {Error} 缺失或损坏资源由工具读取边界报告，不回退成空教程。 */
  private async read(path: string): Promise<string> {
    const bytes: Uint8Array = await this.resources.getRawFileContent(`anki-manual/${path}`);
    const options: util.TextDecoderOptions = { fatal: true, ignoreBOM: false };
    return util.TextDecoder.create('utf-8', options).decodeToString(bytes);
  }
  /** @throws {Error} 资源和 JSON 错误向工具调用方传播。 */
  async index(): Promise<AnkiHelpIndex> { return JSON.parse(await this.read('index.json')) as AnkiHelpIndex; }
  /** @throws {Error} 原文读取失败由 Runner 报告。 */
  readTopic(topicId: string): Promise<string> {
    if (!/^[a-z][a-z0-9-]{0,99}$/.test(topicId)) throw new Error('invalid_anki_help_topic');
    return this.read(`topics/${topicId}.mdx`);
  }
}
class AnkiHelpReadHandler implements AgentReadToolHandler {
  private library: AgentAnkiHelp;
  private name: string;
  constructor(library: AgentAnkiHelp, name: string) { this.library = library; this.name = name; }
  cancel(): void { this.library.cancel(); }
  execute(json: string): Promise<string> { return this.library.execute(this.name, json); }
}
export class AgentAnkiHelpTools {
  private library: AgentAnkiHelp;
  constructor(resources: resourceManager.ResourceManager) { this.library = new AgentAnkiHelp(new BundledAnkiHelpRepository(resources)); }
  register(registry: AgentToolRegistry): void {
    for (const tool of agentAnkiHelpTools()) registry.registerRead(tool.name, new AnkiHelpReadHandler(this.library, tool.name));
  }
}
