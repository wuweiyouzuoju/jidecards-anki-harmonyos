// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadPlatformModule } from './platform-module-harness.mjs';

/** 执行真实分页与解码，仅适配文件系统、磁盘空间和 Harmony 文本解码器。 */
export function pagingDependencies(fs, freeSize = Number.MAX_SAFE_INTEGER) {
  return loadPlatformModule('backend/agent/AgentTextPaging.ets',
    '{AgentTextPageWriter,streamAgentTextFile,ensureAgentDocumentSpace}', {
      fs, statfs: {getFreeSize: async()=>freeSize}, UTF8编码: text=>new TextEncoder().encode(text),
      util: {TextDecoder:{create(encoding, options) {
        const decoder = new TextDecoder(encoding, options);
        return {decodeToString:(bytes, opts)=>decoder.decode(bytes, opts)};
      }}}
    });
}
