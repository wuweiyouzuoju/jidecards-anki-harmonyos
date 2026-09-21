// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudyOptions } from '../../entry/src/main/ets/model/StudyTiming.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function harness() {
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity(), calls = [];
  const card = { cardId: 42, states: Object.fromEntries(['current', 'again', 'hard', 'good', 'easy'].map((key, i) =>
    [key, new Uint8Array([i, 255, 128, 0])])) };
  const backend = {
    canUndo: async () => true,
    studyOptions: async () => new StudyOptions(),
    queuedCards: async () => ({ cards: [card], newCount: 1, learningCount: 2, reviewCount: 3 }),
    renderCard: async id => ({ id }), describeStates: async () => ['1m', '5m', '1d', '4d'],
    answer: async input => { calls.push(input); }, undo: async () => { calls.push('undo'); },
    congrats: async () => ({ learnRemaining: 0 })
  };
  const session = new StudySessionController(backend, scheduler, activity);
  session.activate();
  return { scheduler, activity, backend, session, card, calls };
}

test('snapshots carry autoplay and discard a late preference read after leaving the card', async () => {
  const { session, backend } = harness();
  backend.studyOptions = async () => Object.assign(new StudyOptions(), { autoplay: false });
  assert.equal((await session.loadNext(1, () => true)).options.autoplay, false);
  const gate = deferred();
  let current = true;
  backend.studyOptions = () => gate.promise;
  const pending = session.loadNext(1, () => current);
  await turn();
  current = false;
  gate.resolve(new StudyOptions());
  assert.equal(await pending, null);
});

test('each successful rating preserves raw bytes and queues one coalesced intent without starting sync', async () => {
  const { session, card, calls, scheduler } = harness();
  const choices = ['again', 'hard', 'good', 'easy'];
  for (let rating = 0; rating < 4; rating++) {
    await session.answer(card, rating, 1000, 750);
    assert.equal(calls[rating].currentState, card.states.current);
    assert.equal(calls[rating].newState, card.states[choices[rating]]);
    assert.equal(calls[rating].millisecondsTaken, 250);
    assert.equal(scheduler.hasPending(), true);
    assert.equal(scheduler.canSync(), false, 'viewing or answering another card retains priority');
  }
  session.markComplete();
  assert.equal(scheduler.isStudyComplete(), true);
  scheduler.consume();
  assert.equal(scheduler.hasPending(), false);
  await session.undo();
  assert.equal(scheduler.hasPending(), true, 'a later write belongs to the next sync');
  assert.equal(scheduler.canSync(), false);
});

test('failed writes and invalid ratings cannot announce successful learning changes', async () => {
  const { session, card, backend, scheduler, calls } = harness();
  for (const rating of [-1, 4, 1.5, NaN]) await assert.rejects(session.answer(card, rating, 0, 0), /Invalid rating/);
  assert.equal(calls.length, 0);
  backend.answer = async () => { throw new Error('disk full'); };
  await assert.rejects(session.answer(card, 2, 0, 0), /disk full/);
  backend.undo = async () => { throw new Error('cannot undo'); };
  await assert.rejects(session.undo(), /cannot undo/);
  assert.equal(scheduler.hasPending(), false);
});

test('disposed pages retain priority until accepted writes finish, including failures', async () => {
  for (const fail of [false, true]) {
    const { session, card, backend, scheduler } = harness(), gate = deferred();
    backend.answer = () => gate.promise;
    const write = session.answer(card, 2, 1000, 1100);
    await turn(); session.dispose();
    assert.equal(scheduler.canSync(), false);
    if (fail) { gate.reject(new Error('write failed')); await assert.rejects(write); }
    else { gate.resolve(); await write; }
    assert.equal(scheduler.canSync(), true);
    assert.equal(scheduler.hasPending(), !fail);
    assert.equal(scheduler.isStudyComplete(), false, 'disposed pages are not completion screens');
  }
});

test('resuming completion waits for reserved or running collection work, then reads a fresh queue during media', async () => {
  const { session, backend, scheduler, activity } = harness(), owner = {};
  session.markComplete();
  activity.reserveCollection();
  let reads = 0;
  backend.queuedCards = async () => { reads++; return { cards: [], newCount: 0, learningCount: 0, reviewCount: 0 }; };
  const next = session.loadNext(1, () => true);
  await turn();
  assert.equal(reads, 0);
  assert.equal(scheduler.canSync(), false, 'starting a read closes the automatic sync window synchronously');
  activity.acquire(owner);
  await turn(); assert.equal(reads, 0);
  activity.setCollectionBusy({}, false);
  await turn(); assert.equal(reads, 0, 'another owner cannot release the lock');
  activity.setCollectionBusy(owner, false);
  const snapshot = await next;
  assert.equal(snapshot.card, null);
  assert.equal(reads, 1);
  assert.equal(activity.isActive(), true, 'media lease remains active');
});

test('new changes during media remain pending without delaying the local rating', async () => {
  const { session, scheduler, activity, card, calls } = harness(), owner = {};
  scheduler.request(); scheduler.consume(); activity.acquire(owner); activity.setCollectionBusy(owner, false);
  await session.answer(card, 3, 1000, 1200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].millisecondsTaken, 0);
  assert.equal(scheduler.hasPending(), true);
  assert.equal(activity.canAutoSync(Date.now()), false);
});

test('disposed or superseded queue reads never reach rendering after collection wait', async () => {
  const { session, backend, scheduler, activity } = harness();
  activity.reserveCollection();
  let reads = 0;
  backend.queuedCards = async () => { reads++; throw new Error('must not run'); };
  const load = session.loadNext(1, () => false);
  session.dispose(); activity.cancelReservation();
  assert.equal(await load, null);
  assert.equal(reads, 0);
  assert.equal(scheduler.canSync(), true);
});

test('stale snapshots stop between backend calls; undo query failure still permits learning', async () => {
  const { session, backend } = harness();
  backend.canUndo = async () => { throw new Error('unavailable'); };
  const snapshot = await session.loadNext(1, () => true);
  assert.equal(snapshot.canUndo, false);
  assert.equal(snapshot.card.cardId, 42);
  let current = true, described = false;
  backend.renderCard = async () => { current = false; return {}; };
  backend.describeStates = async () => { described = true; return []; };
  assert.equal(await session.loadNext(1, () => current), null);
  assert.equal(described, false);
});

test('completion metadata in flight continues to block automatic sync after the page leaves', async () => {
  const { session, backend, scheduler } = harness(), gate = deferred();
  backend.congrats = () => gate.promise;
  const read = session.congrats(); await turn(); session.dispose();
  assert.equal(scheduler.canSync(), false);
  gate.resolve({}); await assert.rejects(read, /disposed/);
  assert.equal(scheduler.canSync(), true);
});

test('scheduler preserves pending requests across subscribers and multiple overlapping study lifetimes', () => {
  const scheduler = new AutoSyncScheduler(), first = {}, second = {};
  scheduler.request();
  let wakes = 0;
  scheduler.setListener(() => { wakes++; });
  assert.equal(wakes, 1);
  scheduler.setStudyActive(first, true); scheduler.setStudyActive(second, true);
  scheduler.setStudyActive(first, false);
  assert.equal(scheduler.canSync(), false);
  scheduler.removeStudy(first);
  assert.equal(scheduler.canSync(), false, 'old session completion must not release a newer session');
  scheduler.setListener(null); scheduler.setStudyActive(second, false);
  assert.equal(scheduler.isStudyComplete(), true);
  scheduler.consume();
  assert.equal(scheduler.hasPending(), false);
});

for (const phase of ['canUndo', 'queuedCards', 'renderCard', 'studyOptions', 'describeStates']) {
  test(`disposal during ${phase} stops the read even when caller still reports current`, async () => {
    const { session, backend, scheduler } = harness();
    const original = backend[phase], gate = deferred();
    backend[phase] = async (...args) => { await gate.promise; return original(...args); };
    const result = session.loadNext(1, () => true);
    await turn(); session.dispose(); gate.resolve();
    assert.equal(await result, null);
    assert.equal(scheduler.canSync(), true);
  });
}

test('completion read disposed while waiting never starts backend work', async () => {
  const { session, backend, activity } = harness();
  activity.reserveCollection(); let reads = 0;
  backend.congrats = async () => { reads++; return {}; };
  const result = session.congrats(); session.dispose(); activity.cancelReservation();
  await assert.rejects(result, /disposed/); assert.equal(reads, 0);
});

test('accepted edits snapshot note identity, fields and tags before waiting for collection', async () => {
  const { session, backend, activity, scheduler } = harness();
  activity.reserveCollection(); let saved;
  backend.updateNote = async note => { saved = note; };
  const note = { id: 9, guid: 'g', notetypeId: 2, usn: 3, mtimeSecs: 4 };
  const fields = ['accepted'], tags = ['original'];
  const result = session.saveNote(note, fields, tags);
  note.id = 100; fields[0] = 'late'; tags.push('late'); session.dispose();
  assert.equal(scheduler.canSync(), false); activity.cancelReservation(); await result;
  assert.deepEqual(saved, { id: 9, guid: 'g', notetypeId: 2, usn: 3, mtimeSecs: 4, fields: ['accepted'], tags: ['original'] });
  assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), true);
});

for (const [method, args] of [['buryCard', [9, 2]], ['removeCard', [9]], ['unburyDeck', [10]]]) {
  test(`${method} retains the write lease after disposal and notifies only success`, async () => {
    const { session, backend, scheduler } = harness(), gate = deferred(); let captured;
    backend[method] = async (...values) => { captured = values; await gate.promise; };
    const result = session[method](...args); await turn(); session.dispose();
    assert.equal(scheduler.canSync(), false); assert.deepEqual(captured, args);
    gate.resolve(); await result; assert.equal(scheduler.hasPending(), true); assert.equal(scheduler.canSync(), true);
  });
}
