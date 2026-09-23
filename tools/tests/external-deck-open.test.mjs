// SPDX-License-Identifier: AGPL-3.0-or-later
import { HomeWorkCoordinator } from '../../entry/src/main/ets/model/HomeWorkCoordinator.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DataTransferSession, initialTransferState } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { externalDeckUri, ExternalDeckOpenQueue } from '../../entry/src/main/ets/model/ExternalDeckOpen.ts';
import { canPresentHomePrompt } from '../../entry/src/main/ets/model/HomeActivityPolicy.ts';

const action = 'ohos.want.action.viewData';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const home = read('entry/src/main/ets/pages/首页.ets');
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('external APKG recognition preserves encoded names and handles uppercase/extensions and opaque typed URIs', () => {
  for (const uri of ['file://documents/词汇.apkg', 'file://chat/%E8%AF%8D%20%E6%B1%87.APKG',
    'file://chat/deck%2Eapkg?token=read']) assert.equal(externalDeckUri(action, uri, ''), uri);
  for (const type of ['com.jide.kapian.apkg', 'application/apkg', 'application/x-apkg']) {
    assert.equal(externalDeckUri(action, 'file://chat/1234', type), 'file://chat/1234');
  }
  for (const uri of ['https://site/deck.apkg', 'jidecards://stats', '/data/deck.apkg',
    'file://chat/backup.colpkg', 'file://chat/deck.zip', 'file://chat/deck.jide', 'file://chat/deck.json',
    'file://chat/deck.apkg.exe', 'file://chat/%ZZ.apkg']) {
    assert.equal(externalDeckUri(action, uri, 'com.jide.kapian.apkg'), null);
  }
  assert.equal(externalDeckUri('action.system.home', 'file://chat/deck.apkg', ''), null);
  assert.equal(externalDeckUri(action, 'file://chat/1234', 'application/octet-stream'), null);
});

test('queued and running files deduplicate, serialize, and permit intentional reopen after completion', () => {
  const queue = new ExternalDeckOpenQueue();
  assert.equal(queue.enqueue('first'), true);
  assert.equal(queue.enqueue('first'), false);
  queue.enqueue('second');
  assert.equal(queue.begin(), 'first');
  assert.equal(queue.begin(), null);
  assert.equal(queue.enqueue('first'), false);
  queue.finish();
  assert.equal(queue.begin(), 'second');
  queue.finish();
  assert.equal(queue.hasPending(), false);
  assert.equal(queue.enqueue('first'), true);
});

function harness(failure = false) {
  const queue = new ExternalDeckOpenQueue(), events = [];
  let finishImport;
  const imported = new Promise(resolve => { finishImport = resolve; });
  const activity = { foreground: true, atHome: true, collectionReady: true, collectionBusy: false,
    dialogOpen: false, interactionBusy: false, startupChecking: true };
  const page = { pendingSyncAction: null, transfer: initialTransferState(),
    canPresentStartupPrompt: () => !queue.hasPending() && canPresentHomePrompt(activity) };
  const session = new DataTransferSession({
    importDeck: async uri => { events.push(uri, 'import'); await imported; if (failure) throw new Error('unreadable deck'); return null; },
    committed: () => events.push('committed'), pickDeck: () => assert.fail('external open must not launch a picker')
  }, state => { page.transfer = state; }, async () => { events.push('refresh', 'expand'); }, () => events.push('success'));
  const timers = [];
  const coordinator = new HomeWorkCoordinator(queue, { schedule: fn => { timers.push(fn); return timers.length; }, cancel() {} });
  page.tryImportExternalDeck = () => {
    coordinator.wake({ activity: () => activity, hasDeferredNavigation: () => page.pendingSyncAction !== null,
      importDeck: uri => session.importUri(uri), importFailed: e => { throw e; },
      flushNavigation() {}, manualSyncPending: () => false, startManualSync() {},
      presentAnnouncement: () => false, continueStartup() {}, scheduleSync() {} });
    while (timers.length) timers.shift()();
    return true;
  };
  return { page, queue, activity, events, finishImport };
}

for (const [field, value] of [['foreground', false], ['atHome', false], ['collectionReady', false],
  ['collectionBusy', true], ['dialogOpen', true], ['interactionBusy', true]]) {
  test(`external file waits for ${field} then imports once without a picker`, async () => {
    const { page, queue, activity, events, finishImport } = harness();
    queue.enqueue('file://chat/deck.apkg');
    activity[field] = value;
    assert.equal(page.tryImportExternalDeck(), true);
    assert.deepEqual(events, []);
    assert.equal(page.canPresentStartupPrompt(), false);
    activity[field] = !value;
    page.tryImportExternalDeck(); page.tryImportExternalDeck();
    await settle();
    assert.equal(events.filter(x => x === 'import').length, 1);
    assert.equal(page.transfer.phase, 'running');
    assert.equal(queue.enqueue('file://chat/deck.apkg'), false);
    finishImport(); await settle();
    assert.equal(queue.hasPending(), false);
    assert.equal(page.transfer.visible, false);
    assert.equal(page.transfer.phase, 'idle');
    assert.ok(events.includes('refresh'));
    assert.ok(events.includes('expand'));
  });
}

test('failed external import releases queue and shows the existing failure panel', async () => {
  const { page, queue, events, finishImport } = harness(true);
  queue.enqueue('file://chat/broken.apkg');
  page.tryImportExternalDeck(); finishImport(); await settle();
  assert.equal(queue.hasPending(), false);
  assert.equal(page.transfer.error, 'unreadable deck');
  assert.equal(page.transfer.visible, true);
  assert.equal(page.transfer.phase, 'idle');
  assert.equal(events.includes('refresh'), false);
});

test('APKG FileOpen declaration matches registered UTD and both Ability lifecycle entry points', () => {
  const manifest = read('entry/src/main/module.json5');
  const declarations = JSON.parse(read('entry/src/main/resources/rawfile/arkdata/utd/utd.json5')).UniformDataTypeDeclarations;
  assert.deepEqual(declarations.map(item => item.FilenameExtensions[0]), ['.apkg']);
  for (const declaration of declarations) assert.ok(manifest.includes(`type: '${declaration.TypeId}'`));
  assert.match(manifest, /scheme: 'file',[\s\S]*?linkFeature: 'FileOpen'/);
  assert.match(manifest, /launchType: 'singleton'/);
  assert.doesNotMatch(manifest, /application\/octet-stream|type: '\*\/\*'/);
  const ability = read('entry/src/main/ets/entryability/EntryAbility.ets');
  for (const method of ['onCreate', 'onNewWant']) {
    const start = ability.indexOf('  ' + method + '(');
    assert.ok(ability.slice(start, ability.indexOf('\n  }', start)).includes('this.receiveExternalDeck(want)'));
  }
  assert.match(home, /@StorageLink\(EXTERNAL_DECK_OPEN_REVISION_KEY\) @Watch\('homeActivityChanged'\)/);
});
