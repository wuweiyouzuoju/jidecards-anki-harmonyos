// SPDX-License-Identifier: AGPL-3.0-or-later
import { promises as fs } from 'node:fs';
import { loadPlatformModule } from './tests/platform-module-harness.mjs';

// Only the platform IO adapter is replaced; production copy/recovery code executes unchanged.
export function recoveryAdapter(fault = () => {}) {
  const io = {
    ...fs,
    access: async p => { try { await fs.access(p); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } },
    listFile: p => fs.readdir(p),
    copyFile: async (src, dst) => { await fault('copy', src, dst); await fs.copyFile(src, dst); },
    unlink: async p => { await fault('unlink', p); await fs.unlink(p); },
    mkdir: async p => { await fault('mkdir', p); await fs.mkdir(p); },
  };
  const files = loadPlatformModule('backend/DataTransferFiles.ts',
    '({复制文件,复制目录,删除目录,确保目录存在,路径存在})', { fs: io });
  return loadPlatformModule('backend/TransferRecovery.ts',
    '({prepareReplacementRecovery,markReplacementCommitted,recoverInterruptedReplacement,cleanupReplacementRecovery})',
    { fs: io, ...files });
}
