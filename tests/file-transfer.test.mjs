import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { transferFileName, transferExportName } from '../src/core/FileTransfer.ts';
const source = readFileSync(new URL('../src/harmony/FileTransfer.ets', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function fixture(options = {}) {
  const events = [], files = new Map(), input = Buffer.from('large provider file '.repeat(10000));
  let next = 0, saved;
  const fs = {
    OpenMode: { READ_ONLY: 1, READ_WRITE: 2, CREATE: 4, TRUNC: 8 },
    async open(path, mode) { const file = { fd: ++next, path, mode, offset: 0, chunks: [] }; files.set(file.fd, file); events.push('open:' + path); return file; },
    async stat() { return { size: options.total ?? input.length }; },
    async read(fd, target, { length }) { const file = files.get(fd); const count = Math.min(options.eof ? 0 : 997, length, input.length - file.offset);
      new Uint8Array(target).set(input.subarray(file.offset, file.offset + count)); file.offset += count; return count; },
    async write(fd, buffer) { if (options.writeError) throw Error('write failed'); const count = options.zeroWrite ? 0 : Math.min(17, buffer.byteLength);
      files.get(fd).chunks.push(Buffer.from(buffer).subarray(0, count)); return count; },
    async fsync() { events.push('flush'); if (options.flushError) throw Error('flush failed'); },
    async close(file) { events.push('close:' + file.path); if (file.path === 'out') saved = Buffer.concat(file.chunks); }
  };
  const picker = { DocumentSelectOptions: class {}, DocumentSaveOptions: class {}, DocumentViewPicker: class {
    async select(value) { events.push('select'); assert.equal(value.maxSelectNumber, 1); return options.cancel ? [] : ['provider://file']; }
    async save(value) { events.push('save'); assert.deepEqual(value.newFileNames, ['test.jidepalace.zip']); return options.cancel ? [] : ['out']; }
  } };
  const api = new Function('fs', 'picker', 'transferExportName', stripTypeScriptTypes(source, { mode: 'strip' }) +
    '\nreturn { copyTransferFile, selectTransferFile, saveTransferFile };')(fs, picker, transferExportName);
  return { api, events, input, saved: () => saved };
}
test('URI display names and export names exclude queries, traversal characters and malformed suffixes', () => {
  assert.equal(transferFileName('provider://files/%E5%BB%BA%E7%AD%91.zip?token=a#b'), '建筑.zip');
  assert.equal(transferFileName('provider://files/%broken'), '%broken');
  assert.equal(transferExportName('../a:b', '.zip'), '.._a_b.zip');
  assert.equal(transferExportName('..', '.zip'), 'export.zip');
  assert.throws(() => transferExportName('name', '../zip'));
});
test('real async copy handles short reads/writes and flushes before releasing descriptors', async () => {
  const f = fixture(), progress = [];
  await f.api.copyTransferFile('in', 'out', f.input.length, { check() {}, progress(done, total) { progress.push([done, total]); } });
  assert.deepEqual(f.saved(), f.input);
  assert.deepEqual(f.events.slice(-3), ['flush', 'close:out', 'close:in']);
  assert.deepEqual(progress.at(-1), [f.input.length, f.input.length]);
  assert.ok(progress.every((p, i) => i === 0 || p[0] > progress[i - 1][0]));
});
test('size limit refuses input before creating a destination', async () => {
  const f = fixture(); await assert.rejects(f.api.copyTransferFile('in', 'out', 1), /大小/);
  assert.deepEqual(f.events, ['open:in', 'close:in']);
});
test('short input, zero writes, write and flush failures release both descriptors', async () => {
  for (const option of [{ eof: true }, { zeroWrite: true }, { writeError: true }, { flushError: true }]) {
    const f = fixture(option); await assert.rejects(f.api.copyTransferFile('in', 'out'));
    assert.deepEqual(f.events.slice(-2), ['close:out', 'close:in']);
  }
});
test('cancellation during copying releases files and does not flush a partial result', async () => {
  const f = fixture(); let checks = 0;
  await assert.rejects(f.api.copyTransferFile('in', 'out', f.input.length, { check() { if (++checks === 4) throw Error('cancelled'); }, progress() {} }), /cancelled/);
  assert.deepEqual(f.events.slice(-2), ['close:out', 'close:in']); assert.ok(!f.events.includes('flush'));
});
test('picker cancellation opens no files; save returns URI only after flush', async () => {
  const cancelled = fixture({ cancel: true });
  assert.equal(await cancelled.api.selectTransferFile({}, ['.zip']), null);
  assert.equal(await cancelled.api.saveTransferFile({}, 'in', 'test', '.jidepalace.zip'), null);
  assert.deepEqual(cancelled.events, ['select', 'save']);
  const f = fixture(); assert.equal(await f.api.saveTransferFile({}, 'in', 'test', '.jidepalace.zip'), 'out');
  assert.deepEqual(f.saved(), f.input); assert.ok(f.events.includes('flush'));
});
