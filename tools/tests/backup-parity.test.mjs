import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { BackupCoordinator, isBackupName } from '../../entry/src/main/ets/model/BackupCoordinator.ts';
test('backup coordinator serializes work and rejects unsafe restore names', async () => {
  assert.equal(isBackupName('backup-2026-09-21-10.30.00.colpkg'), true);
  assert.equal(isBackupName('collection.colpkg'), false);
  const scheduler = new AutoSyncScheduler(); const coordinator = new BackupCoordinator(scheduler);
  const events = []; let release;
  const backend = { create: async force => { events.push(['create', force]); await new Promise(resolve => { release = resolve; }); return true; }, list: async () => [], restore: async name => events.push(['restore', name]) };
  const first = coordinator.create(backend); await Promise.resolve();
  await assert.rejects(coordinator.create(backend), /already running/);
  release(); assert.equal(await first, true); assert.equal(scheduler.canSync(), true);
  await assert.rejects(coordinator.restore(backend, 'collection.colpkg', true), /Invalid/);
  await coordinator.restore(backend, 'backup-2026-09-21-10.30.00.colpkg', true);
  assert.deepEqual(events, [['create', true], ['restore', 'backup-2026-09-21-10.30.00.colpkg']]);
});
