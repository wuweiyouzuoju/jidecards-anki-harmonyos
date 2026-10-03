// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { ImportOperation, ImportCancelled } from '../../entry/src/main/ets/model/ImportOperation.ts';
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
  fs.stat = async () => ({size: input.length});
  return {api: files(fs), input, writes, closed, reads};
}

test('copy cancellation releases descriptors and stops before consuming the rest of the file', async () => {
  const h = harness();
  const operation = new ImportOperation(() => operation.cancel());
  await assert.rejects(h.api.按描述符复制文件('input', 'output', operation), ImportCancelled);
  assert.deepEqual(h.closed, [2, 1]); assert.ok(Buffer.concat(h.writes).length < h.input.length);
});
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

// Replacement integration now exercises the durable recovery adapter against a real temporary filesystem.
import { after } from 'node:test';
import { promises as fsp, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPlatformModule } from './platform-module-harness.mjs';
const roots=[];
after(async()=>{for(const root of roots) await fsp.rm(root,{recursive:true,force:true});});
async function replacement(fail='') {
  const root=mkdtempSync(path.join(tmpdir(),'jide-import-')); roots.push(root);
  await fsp.mkdir(root+'/collection.media');
  await fsp.writeFile(root+'/collection.anki2','original db');
  await fsp.writeFile(root+'/collection.mdb','original media db');
  await fsp.writeFile(root+'/collection.media/original','original media');
  await fsp.writeFile(root+'/input.colpkg','package');
  const events=[];
  const exists=async p=>{try{await fsp.access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
  const copy=async(src,dst)=>{events.push(['copy',src,dst]);if(fail==='backup'&&dst.includes('transfer-recovery/')&&dst.endsWith('collection.mdb'))throw Error('disk full');await fsp.copyFile(src,dst);};
  const remove=async p=>{events.push(['remove',p]);if(fail==='cleanup'&&p.endsWith('transfer-recovery-discarded'))throw Error('cleanup');await fsp.rm(p,{recursive:true,force:true});};
  const deps={fs:{...fsp,listFile:async p=>fsp.readdir(p)},statfs:{getFreeSize:async()=>fail==='space'?0:1e12},
    路径存在:exists,复制文件:copy,复制目录:async(src,dst)=>{if(await exists(src)){events.push(['copy',src,dst]);await fsp.cp(src,dst,{recursive:true});}},
    删除目录:remove,确保目录存在:async p=>fsp.mkdir(p,{recursive:true})};
  const recovery=loadPlatformModule('backend/TransferRecovery.ts','({checkReplacementSpace,prepareReplacementRecovery,markReplacementCommitted,recoverInterruptedReplacement,cleanupReplacementRecovery})',deps);
  const session={关闭集合:async()=>events.push('close'),确保已打开:async()=>events.push('open'),
    在集合关闭下调用:async()=>{events.push('import');await fsp.writeFile(root+'/collection.anki2','new db');await fsp.writeFile(root+'/collection.media/new','new media');if(fail==='import')throw Error('import failed');return new Uint8Array();}};
  const run=loadPlatformModule('backend/数据迁移服务.ts','替换集合',{...deps,...recovery,withImportProgress:async(_op,fn)=>fn(),
    复制URI到沙箱:async()=>root+'/input.colpkg',静默删除:async p=>fsp.rm(p,{force:true}),
    后端会话:{获取实例:()=>session},服务号:{后端导入导出:39},导入导出方法:{导入集合包:0},encodeImportCollectionPackageRequest:x=>x});
  return {root,events,recovery,run:()=>run(root,'provider://collection',true),read:async p=>fsp.readFile(root+'/'+p,'utf8')};
}
test('failed import restores complete safety copy before reopening and preserves original error',async()=>{
 const h=await replacement('import');await assert.rejects(h.run(),/import failed/);
 assert.equal(await h.read('collection.anki2'),'original db');assert.equal(await h.read('collection.mdb'),'original media db');
 assert.equal(await h.read('collection.media/original'),'original media');await assert.rejects(h.read('collection.media/new'));
 assert.equal(h.events.at(-1),'open');
});
test('failed safety copy cleans partial backup, reopens original and never starts import',async()=>{
 const h=await replacement('backup');await assert.rejects(h.run(),/disk full/);
 assert.equal(h.events.includes('import'),false);assert.ok(h.events.includes('open'));assert.equal(await h.read('collection.anki2'),'original db');
 await assert.rejects(fsp.access(h.root+'/transfer-recovery'));
});
test('cleanup failure after success never rolls back the accepted replacement, including next startup',async()=>{
 const h=await replacement('cleanup');await h.run();assert.equal(await h.read('collection.anki2'),'new db');
 await h.recovery.recoverInterruptedReplacement(h.root);assert.equal(await h.read('collection.anki2'),'new db');
});
test('space failure occurs before closing or modifying the collection',async()=>{
 const h=await replacement('space');await assert.rejects(h.run(),/transfer_space_insufficient/);assert.deepEqual(h.events,[]);
 assert.equal(await h.read('collection.anki2'),'original db');
});
test('startup restores an interrupted replacement and removes WAL and newly imported media',async()=>{
 const h=await replacement();await h.recovery.prepareReplacementRecovery(h.root,null);
 await fsp.writeFile(h.root+'/collection.anki2','half imported');await fsp.writeFile(h.root+'/collection.anki2-wal','stale WAL');
 await fsp.writeFile(h.root+'/collection.media/partial','partial');
 await h.recovery.recoverInterruptedReplacement(h.root);await h.recovery.recoverInterruptedReplacement(h.root);
 assert.equal(await h.read('collection.anki2'),'original db');await assert.rejects(h.read('collection.anki2-wal'));await assert.rejects(h.read('collection.media/partial'));
});
test('an incomplete backup never replaces the intact current database',async()=>{
 const h=await replacement();await fsp.mkdir(h.root+'/transfer-recovery');await fsp.writeFile(h.root+'/transfer-recovery/collection.anki2','partial backup');
 await h.recovery.recoverInterruptedReplacement(h.root);assert.equal(await h.read('collection.anki2'),'original db');
});
test('interruption during rollback retains backup and retries the whole rollback',async()=>{
 const h=await replacement();await h.recovery.prepareReplacementRecovery(h.root,null);
 await fsp.writeFile(h.root+'/collection.anki2','partial rollback');await fsp.rm(h.root+'/collection.media',{recursive:true});
 await h.recovery.recoverInterruptedReplacement(h.root);assert.equal(await h.read('collection.media/original'),'original media');
 assert.equal(await h.read('collection.anki2'),'original db');
});
