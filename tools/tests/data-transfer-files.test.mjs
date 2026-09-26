// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
function files(fs) {
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/DataTransferFiles.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  return new Function('fs', stripTypeScriptTypes(source) + '; return {按描述符复制文件, 复制目录, 删除目录};')(fs);
}
function harness(fail = '') {
  const input = Buffer.alloc(200_000); for (let i = 0; i < input.length; i++) input[i] = i % 251;
  let position = 0; const writes = [], closed = [], reads = [];
  const fs = {OpenMode: {READ_ONLY: 0, READ_WRITE: 1, CREATE: 2, TRUNC: 4},
    open: async (path, mode) => {if (fail === 'open' && mode !== 0) throw Error('open'); return {fd: mode === 0 ? 1 : 2};},
    read: async (_fd, buffer, options) => {
      reads.push(options.length); if (fail === 'read') throw Error('read');
      const count = Math.min(997, input.length - position); new Uint8Array(buffer).set(input.subarray(position, position + count)); position += count; return count;
    },
    write: async (_fd, buffer, options) => {
      assert.equal('offset' in options, false);
      if (fail === 'write') throw Error('write'); if (fail === 'zero') return 0;
      const count = Math.min(options.length, 73); writes.push(Buffer.from(buffer).subarray(0, count)); return count;
    }, close: async file => {closed.push(file.fd); if (fail === 'close' && file.fd === 2) throw Error('close');}};
  return {api: files(fs), input, writes, closed, reads};
}
test('async provider stream preserves short reads/writes with bounded buffers and closes both descriptors', async () => {
  const h = harness(); await h.api.按描述符复制文件('provider://input', 'provider://output');
  assert.deepEqual(Buffer.concat(h.writes), h.input); assert.deepEqual(h.closed, [2, 1]);
  assert.ok(h.reads.every(n => n === 64 * 1024));
});
for (const fault of ['open', 'read', 'write', 'zero', 'close']) test(`stream failure ${fault} releases every acquired descriptor`, async () => {
  const h = harness(fault); await assert.rejects(h.api.按描述符复制文件('input', 'output'));
  assert.deepEqual(h.closed, fault === 'open' ? [1] : [2, 1]);
});
test('recursive restore removal propagates failure instead of overwriting a partially removed media tree', async () => {
  const api = files({access: async () => true, listFile: async () => ['a'], stat: async () => ({isDirectory: () => false}), unlink: async () => {throw Error('permission');}});
  await assert.rejects(api.删除目录('/media'), /permission/);
});
test('migration file adapter has no blocking filesystem calls', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/DataTransferFiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fs\.\w+Sync\(/);
});

function replacement(fail) {
  const events = [];
  const copy = async (source, dest) => {events.push(['copy', source, dest]); if (fail === 'backup' && dest.endsWith('collection.mdb')) throw Error('disk full');};
  const session = {关闭集合: async () => events.push('close'),
    在集合关闭下调用: async () => {events.push('import'); if (fail === 'import') throw Error('import failed');},
    确保已打开: async () => events.push('open')};
  const deps = {复制目录: copy, 删除目录: async path => {events.push(['remove', path]); if (fail === 'cleanup' && path.includes('safety')) throw Error('cleanup');},
    确保目录存在: async () => {}, 复制文件: copy, 复制URI到沙箱: async () => '/temporary.colpkg',
    按描述符复制文件: async () => {}, 静默删除: async path => events.push(['unlink', path]),
    后端会话: {获取实例: () => session}, 服务号: {后端导入导出: 39}, 导入导出方法: {导入集合包: 0}, encodeImportCollectionPackageRequest: x => x};
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/数据迁移服务.ts', import.meta.url), 'utf8')
    .replace(/^import [\s\S]*?from ['"][^'"]+['"];\r?\n/gm, '').replace(/export /g, '');
  const run = new Function(...Object.keys(deps), stripTypeScriptTypes(source) + '; return 替换集合;')(...Object.values(deps));
  return {events, run: () => run('/files', 'provider://collection', true)};
}
test('failed import restores complete safety copy before reopening and preserves original error', async () => {
  const h = replacement('import'); await assert.rejects(h.run(), /import failed/);
  const importAt = h.events.indexOf('import'); assert.equal(h.events[0], 'close');
  assert.equal(h.events.slice(0, importAt).filter(e => e[0] === 'copy').length, 3);
  assert.equal(h.events.slice(importAt).filter(e => e[0] === 'copy').length, 3);
  assert.ok(h.events.indexOf('open') > importAt); assert.deepEqual(h.events.at(-1), ['unlink', '/temporary.colpkg']);
});
test('failed safety copy cleans partial backup, reopens original and never starts import', async () => {
  const h = replacement('backup'); await assert.rejects(h.run(), /disk full/);
  assert.equal(h.events.includes('import'), false); assert.ok(h.events.includes('open'));
  assert.ok(h.events.some(e => e[0] === 'remove' && e[1].includes('safety')));
});
test('cleanup failure after success never rolls back the accepted replacement', async () => {
  const h = replacement('cleanup'); await h.run();
  assert.equal(h.events.filter(e => e[0] === 'copy').length, 3); assert.equal(h.events.filter(e => e === 'open').length, 1);
});
