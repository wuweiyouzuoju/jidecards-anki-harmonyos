// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { fileIo as fs } from '@kit.CoreFileKit';
import { AgentHistoryRepository, AgentHistoryIO } from '../../model/agent/AgentHistoryRepository';
import { safeConversation } from '../../model/agent/AgentHistoryProjection';
import { AgentConversation } from '../../model/agent/AgentConversationTypes';
import { UTF8编码 } from '../../proto/core/utf8';
import { AgentCheckpointStore } from './AgentCheckpointStore';
import { AgentDocumentStore } from './AgentDocumentStore';

class AgentHistoryFiles implements AgentHistoryIO {
  private readonly context: common.UIAbilityContext;
  private readonly directory: string;
  /** @throws {Error} 创建目录失败由仓库调用入口报告。 */
  constructor(context: common.UIAbilityContext) {
    this.context = context; this.directory = `${context.filesDir}/agent-history`;
    if (!fs.accessSync(this.directory)) fs.mkdirSync(this.directory);
  }
  private path(name: string): string {
    if (!new RegExp('^[A-Za-z0-9._-]+$').test(name)) throw new Error('history_path_invalid');
    return `${this.directory}/${name}`;
  }
  /** @throws {Error} IO失败交给仓库，只有文件不存在返回null。 */
  async read(name: string): Promise<string | null> {
    const path: string = this.path(name);
    if (!fs.accessSync(path)) return null;
    return fs.readText(path);
  }
  /** @throws {Error} 短写/落盘/重命名失败保留旧文件，由仓库报告。 */
  async write(name: string, text: string): Promise<void> {
    const path: string = this.path(name); const temporary: string = `${path}.tmp`;
    const file: fs.File = await fs.open(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      const bytes: Uint8Array = UTF8编码(text);
      let offset: number = 0;
      while (offset < bytes.length) {
        const chunk: ArrayBuffer = bytes.slice(offset, offset + 65536).buffer as ArrayBuffer;
        const written: number = await fs.write(file.fd, chunk);
        if (written <= 0) throw new Error('history_write_failed');
        offset += written;
      }
      await fs.fsync(file.fd);
    } finally { await fs.close(file); }
    await fs.rename(temporary, path);
  }
  /** @throws {Error} 清理失败保留索引中的重试清单。 */
  async remove(name: string): Promise<void> {
    const path: string = this.path(name);
    if (fs.accessSync(path)) await fs.unlink(path);
  }
  /** @throws {Error} 旧存储读取/解析失败阻止迁移，不伪装为空列表。 */
  async legacy(): Promise<AgentConversation[]> {
    const store: preferences.Preferences = await preferences.getPreferences(this.context, 'jidecards_ai_agent_history');
    const raw: preferences.ValueType = await store.get('conversations_v1', '[]');
    if (typeof raw !== 'string') throw new Error('history_legacy_invalid');
    const values: AgentConversation[] = JSON.parse(raw) as AgentConversation[];
    if (!Array.isArray(values)) throw new Error('history_legacy_invalid');
    for (const value of values) {
      if (value === null || typeof value.id !== 'string' || !Array.isArray(value.messages) ||
        !Array.isArray(value.audits) || !Array.isArray(value.sources) || !Array.isArray(value.results)) {
        throw new Error('history_legacy_invalid');
      }
    }
    return values;
  }
  sanitize(value: AgentConversation): AgentConversation { return safeConversation(value); }
  /** @throws {Error} 删除后移除迁移备份；失败交给清理清单重试。 */
  async clearLegacy(): Promise<void> {
    const store: preferences.Preferences = await preferences.getPreferences(this.context, 'jidecards_ai_agent_history');
    await store.put('conversations_v1', '[]'); await store.flush();
  }
  /** @throws {Error} 关联文档/检查点清理失败交给持久化重试清单。 */
  async cleanupConversation(id: string): Promise<void> {
    new AgentDocumentStore(this.context).removeConversation(id);
    new AgentCheckpointStore(this.context).remove(id);
  }
}

let repository: AgentHistoryRepository | null = null;
/** @throws {Error} 缺少上下文和IO错误保持可观察，不能伪装为空历史或保存成功。 */
export function agentHistoryRepository(): AgentHistoryRepository {
  if (repository === null) {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) throw new Error('history_unavailable');
    repository = new AgentHistoryRepository(new AgentHistoryFiles(context));
  }
  return repository;
}
