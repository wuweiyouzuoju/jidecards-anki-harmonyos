// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync,
  existsSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { loadUiFeedback } from './ui-feedback-harness.mjs';
import { isBackupName } from '../../entry/src/main/ets/model/BackupCoordinator.ts';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test('local restore fixes its source before backup retention and notifies home only after commit', async () => {
  for (const fail of ['', 'backup', 'restore']) {
    const root = mkdtempSync(path.join(tmpdir(), 'jide-backup-')); roots.push(root);
    mkdirSync(root + '/backups');
    const name = 'backup-2026-10-05-12.00.00.colpkg';
    const source = root + '/backups/' + name;
    writeFileSync(source, 'selected backup');
    const events = [], values = new Map([['需要刷新主页', 4], ['cardContentChangedTick', 5]]);
    const Backend = loadPlatformModule('backend/LocalBackups.ets', 'LocalBackups', {
      fs: { accessSync: existsSync, mkdirSync, copyFileSync, statSync, unlinkSync, listFileSync: readdirSync },
      isBackupName, syncActivity: { waitForCollection: async () => {} },
      后端会话: { 获取实例: () => ({ 确保已打开: async () => {} }) },
      集合服务: class { async createBackup(_folder, force) {
        assert.equal(force, true); events.push('backup');
        if (fail === 'backup') throw Error('backup disk full');
        unlinkSync(source); return true;
      } },
      替换集合: async (_root, staged, confirmed) => {
        events.push('restore'); assert.equal(confirmed, true);
        assert.equal(readFileSync(staged, 'utf8'), 'selected backup');
        if (fail === 'restore') throw Error('restore rejected');
      },
      AppStorage: { get: key => values.get(key), setOrCreate: (key, value) => { events.push(key); values.set(key, value); } }
    });
    const backend = new Backend(root);
    if (fail) await assert.rejects(backend.restore(name)); else await backend.restore(name);
    assert.deepEqual(events, fail === 'backup' ? ['backup'] : fail === 'restore' ? ['backup', 'restore'] :
      ['backup', 'restore', '需要刷新主页', 'cardContentChangedTick']);
    assert.equal(values.get('需要刷新主页'), fail ? 4 : 5);
    assert.equal(values.get('cardContentChangedTick'), fail ? 5 : 6);
    assert.equal(readdirSync(root).some(name => name.startsWith('backup-restore-')), false);
  }
});

function panel(locale = 'base') {
  const entries = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(item => [item.name, item.value]));
  const resources = { getStringSync: (id, ...args) => {
    let result = entries.get(id.replace('app.string.', '')); assert.ok(result, id);
    for (const arg of args) result = result.replace('%s', arg); return result;
  } };
  const tracker = new AppInterfaceTracker(), dialogs = [], toasts = [], calls = [];
  const Panel = loadComponentLogic('components/settings/备份管理面板.ets', '备份管理面板', {
    ...loadUiFeedback(), appInterface: tracker, visibleInterfaceItems,
    颜色键: { 动作主色: 'action' }, $r: id => ({id}), hilog: {error() {}},
    backupCoordinator: { restore: async (backend, name, confirmed) => { calls.push([name, confirmed]); await backend.restore(name); } }
  });
  const item = new Panel(); item.visible = true;
  item.getUIContext = () => ({ getHostContext: () => ({resourceManager: resources}),
    getPromptAction: () => ({showToast: options => toasts.push(options.message)}),
    showAlertDialog: options => dialogs.push(options) });
  item.backups = ['backup-2026-10-05-12.00.00.colpkg', 'backup-2026-10-05-13.00.00.colpkg'];
  item.selectedBackup = item.backups[0];
  item.backend = { restore: async () => {}, list: async () => [...item.backups] };
  const view = () => tracker.snapshot().find(view => view.surface === 'backup_management');
  return {item, tracker, dialogs, toasts, calls, view};
}

test('restore confirmation pins the named backup, guards duplicate writes and publishes real busy/result state', async () => {
  for (const locale of ['base', 'en_US']) {
    const h = panel(locale); const name = h.item.selectedBackup;
    h.item.restoreBackup(); assert.ok(h.dialogs[0].message.includes(name));
    h.item.selectBackup(h.item.backups[1]);
    let release; h.item.backend.restore = () => new Promise(resolve => {release = resolve;});
    h.dialogs[0].secondaryButton.action(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.view().busy, true);
    assert.ok(h.view().items.every(item => !item.enabled));
    await h.item.executeRestore(h.item.backups[1]); assert.equal(h.calls.length, 1);
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.calls, [[name, true]]);
    assert.ok(h.item.statusMessage.includes(name)); assert.ok(h.toasts.some(message => message.includes(name)));
    assert.equal(h.view().busy, false);
    assert.equal(h.view().values.find(value => value.id === 'result').value, h.item.statusMessage);
    h.item.aboutToDisappear(); assert.equal(h.tracker.snapshot().length, 0);
  }
});

test('committed restore with a failed list refresh keeps success distinct from a rejected restore', async () => {
  for (const fail of ['restore', 'list']) {
    const h = panel();
    h.item.backend[fail] = async () => {throw Error('native failure detail');};
    await h.item.executeRestore(h.item.selectedBackup);
    assert.ok(h.item.errorMessage.includes('native failure detail'));
    assert.equal(h.item.statusMessage !== '', fail === 'list');
    assert.equal(h.item.errorMessage.includes('无需重复恢复'), fail === 'list');
    assert.ok(h.toasts.some(message => message.includes('native failure detail')));
    assert.equal(h.view().values.find(value => value.id === 'error_detail').value, h.item.errorMessage);
  }
});
