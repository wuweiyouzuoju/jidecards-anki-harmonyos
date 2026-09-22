// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import type { AgentSessionState } from '../../model/agent/AgentSessionState';
import { UTF8编码 } from '../../proto/core/utf8';

/** 检索快照独立存文件，避免全库 ID 挤占 Preferences 的单值容量。 */
export class AgentCheckpointStore {
  private readonly directory: string;
  constructor(context: common.UIAbilityContext) { this.directory = `${context.filesDir}/agent-checkpoints`; }

  private path(id: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) { throw new Error('invalid_conversation_id'); }
    return `${this.directory}/${id}.json`;
  }

  /** @throws {Error} 检查点 IO 或解析失败，由会话入口记录并禁止盲目恢复。 */
  save(id: string, state: AgentSessionState): void {
    const target: string = this.path(id);
    if (!fs.accessSync(this.directory)) { fs.mkdirSync(this.directory); }
    const temporary: string = `${target}.tmp`;
    const file: fs.File = fs.openSync(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      const bytes: Uint8Array = UTF8编码(JSON.stringify(state));
      let offset: number = 0;
      while (offset < bytes.length) {
        const chunk: ArrayBuffer = bytes.slice(offset, Math.min(bytes.length, offset + 65536)).buffer as ArrayBuffer;
        const written: number = fs.writeSync(file.fd, chunk);
        if (written <= 0) { throw new Error('checkpoint_write_failed'); }
        offset += written;
      }
      fs.fsyncSync(file.fd);
    } finally { fs.closeSync(file); }
    fs.renameSync(temporary, target);
  }

  /** @throws {Error} 检查点 IO 或解析失败，由会话入口记录并禁止盲目恢复。 */
  load(id: string): AgentSessionState | null {
    const target: string = this.path(id);
    if (!fs.accessSync(target)) { return null; }
    return JSON.parse(fs.readTextSync(target)) as AgentSessionState;
  }

  /** @throws {Error} 检查点 IO 或解析失败，由会话入口记录并禁止盲目恢复。 */
  remove(id: string): void {
    const target: string = this.path(id);
    if (fs.accessSync(target)) { fs.unlinkSync(target); }
  }
}
