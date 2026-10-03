// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { recoveryAdapter } from '../core-interop-recovery.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'jidecards-interop-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root,'.recovery-owned'),'synthetic-only\n');
  const artifacts = process.env.JIDECARDS_INTEROP_ARTIFACTS;
  if (artifacts) {
    assert.equal(await fs.readFile(path.join(artifacts, '.interop-owned'), 'utf8'), 'synthetic-only\n');
    // Runner-generated, cleanly closed Core database; never discover a user profile.
    await fs.cp(path.join(artifacts, 'synthetic-collection'), root, { recursive: true });
  } else {
    await fs.mkdir(path.join(root, 'collection.media'));
    const db = new DatabaseSync(path.join(root, 'collection.anki2'));
    db.exec("CREATE TABLE notes(id INTEGER PRIMARY KEY,guid TEXT); INSERT INTO notes VALUES(17,'synthetic'); CREATE TABLE cards(id INTEGER PRIMARY KEY,nid INTEGER,ord INTEGER); INSERT INTO cards VALUES(27,17,2); CREATE TABLE revlog(id INTEGER PRIMARY KEY,cid INTEGER,ease INTEGER); INSERT INTO revlog VALUES(37,27,3)");
    db.close();
    await fs.writeFile(path.join(root, 'collection.mdb'), 'synthetic media database');
    await fs.writeFile(path.join(root, 'collection.media', 'only-synthetic.png'), 'synthetic media bytes');
  }
  const before = await contents(root);
  return { root, before };
}

async function contents(root) {
  const entries = {};
  async function walk(directory, prefix = '') {
    for (const name of (await fs.readdir(directory)).sort()) {
      const p = path.join(directory, name), key = prefix + name;
      if ((await fs.stat(p)).isDirectory()) { if (!name.startsWith('transfer-recovery')) await walk(p, key + '/'); }
      else if (!name.includes('-wal') && !name.includes('-shm') && !name.includes('-journal')) entries[key] = await fs.readFile(p);
    }
  }
  await walk(root); return entries;
}

async function damage(root) {
  await fs.writeFile(path.join(root, 'collection.anki2'), 'partial imported collection');
  await fs.writeFile(path.join(root, 'collection.anki2-wal'), 'stale WAL');
  await fs.writeFile(path.join(root, 'collection.anki2-shm'), 'stale SHM');
  await fs.writeFile(path.join(root, 'collection.anki2-journal'), 'stale journal');
  await fs.writeFile(path.join(root, 'collection.media', 'partial-new-file'), 'partial imported media');
}

async function assertRestored(root, before) {
  assert.deepEqual(await contents(root), before);
  for (const suffix of ['-wal', '-shm', '-journal']) await assert.rejects(fs.access(path.join(root, 'collection.anki2' + suffix)), { code: 'ENOENT' });
  const db = new DatabaseSync(path.join(root, 'collection.anki2'), { readOnly: true });
  try {
    // Actual Anki schema requires Core's unicase collation. The runner reopens
    // those recovered copies with Core's integrity check in a separate stage.
    if (!process.env.JIDECARDS_INTEROP_ARTIFACTS) assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('SELECT count(*) AS n FROM cards c LEFT JOIN notes n ON n.id=c.nid WHERE n.id IS NULL').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM revlog r LEFT JOIN cards c ON c.id=r.cid WHERE c.id IS NULL').get().n, 0);
  } finally { db.close(); }
}

async function saveForCore(root,name) {
  const artifacts=process.env.JIDECARDS_INTEROP_ARTIFACTS;
  if (!artifacts) return;
  await fs.mkdir(path.join(artifacts,'recovered'),{recursive:true});
  await fs.cp(root,path.join(artifacts,'recovered',name),{recursive:true,errorOnExist:true,force:false});
}

test('process death after prepare restores actual SQLite identities/history and media on a fresh startup', async t => {
  const {root,before} = await fixture(t);
  const child = fork(fileURLToPath(new URL('./core-interop-recovery-worker.mjs', import.meta.url)), [root], { stdio: ['ignore','ignore','inherit','ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw Error('recovery worker exited before prepare'); }),
    new Promise((_,reject) => { const timer=setTimeout(() => reject(Error('recovery worker timeout')),15000); timer.unref(); })]);
  assert.equal(ready[0], 'prepared-and-damaged');
  const exited = once(child,'exit'); child.kill(); await exited;
  const fresh = recoveryAdapter();
  await fresh.recoverInterruptedReplacement(root); await fresh.recoverInterruptedReplacement(root);
  await assertRestored(root,before);
  await saveForCore(root,'process-death');
});

test('IO failure during rollback retains a complete source and a new adapter retries the whole recovery', async t => {
  const {root,before} = await fixture(t);
  await recoveryAdapter().prepareReplacementRecovery(root,null); await damage(root);
  let fail=true;
  const broken = recoveryAdapter((op,src,dst) => { if (fail && op==='copy' && dst.includes('collection.media') && !dst.includes('transfer-recovery')) throw Error('injected interrupted restore'); });
  await assert.rejects(broken.recoverInterruptedReplacement(root),/injected interrupted restore/);
  assert.deepEqual(await fs.readFile(path.join(root,'transfer-recovery','collection.anki2')),before['collection.anki2']);
  fail=false; await recoveryAdapter().recoverInterruptedReplacement(root); await assertRestored(root,before);
  await saveForCore(root,'retry-rollback');
});

test('committed replacement survives cleanup failure and never replays the retained old database', async t => {
  const {root} = await fixture(t);
  let fail=true;
  const api=recoveryAdapter((op,p) => { if (fail && op==='unlink' && p.includes('transfer-recovery-discarded')) throw Error('injected cleanup failure'); });
  await api.prepareReplacementRecovery(root,null);
  await fs.writeFile(path.join(root,'collection.media','accepted-media'),'accepted bytes');
  const db=new DatabaseSync(path.join(root,'collection.anki2')); db.exec('UPDATE notes SET guid=guid || \'-accepted\''); db.close();
  const accepted=await contents(root);
  await api.markReplacementCommitted(root); await api.cleanupReplacementRecovery(root);
  assert.deepEqual(await contents(root),accepted); fail=false;
  await recoveryAdapter().recoverInterruptedReplacement(root); assert.deepEqual(await contents(root),accepted);
  await assert.rejects(fs.access(path.join(root,'transfer-recovery-discarded')), {code:'ENOENT'});
  await saveForCore(root,'committed-cleanup');
});
