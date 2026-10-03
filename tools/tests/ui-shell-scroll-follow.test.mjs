// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { ScrollTailFollower } from '../../entry/src/main/ets/model/ScrollTailFollower.ts';

function harness() {
  const pending = new Map();
  let next = 0, scrolls = 0, visible = true, fail = false;
  const follower = new ScrollTailFollower(() => {
    if (fail) throw new Error('not laid out');
    scrolls++;
  }, () => visible, 32, {
    schedule: callback => { pending.set(++next, callback); return next; },
    cancel: id => pending.delete(id)
  });
  return { follower, pending, get scrolls() { return scrolls; },
    visible: value => { visible = value; }, fail: value => { fail = value; },
    flush: () => { for (const [id, callback] of pending) { pending.delete(id); callback(); } } };
}

test('shared tail follower coalesces streaming updates and waits for a visible host', () => {
  const h = harness();
  h.visible(false); h.follower.queue(); assert.equal(h.pending.size, 0);
  h.visible(true); h.follower.queue(); h.follower.queue(); assert.equal(h.pending.size, 1);
  h.visible(false); h.flush(); assert.equal(h.scrolls, 0);
  h.visible(true); h.follower.queue(); h.flush(); assert.equal(h.scrolls, 1);
});

test('paused generations cannot scroll or erase a newer pending task after cancellation', () => {
  const h = harness();
  h.follower.queue(); const stale = [...h.pending.values()][0];
  assert.equal(h.follower.didScroll(-10, true, false), 'paused');
  assert.equal(h.pending.size, 0); assert.equal(h.follower.isFollowing(), false);
  assert.equal(h.follower.didScroll(0, true, true), 'none');
  assert.equal(h.follower.didScroll(10, false, true), 'none');
  assert.equal(h.follower.didScroll(10, true, false), 'none');
  assert.equal(h.pending.size, 0);
  assert.equal(h.follower.didScroll(10, true, true), 'resumed');
  stale(); assert.equal(h.scrolls, 0); assert.equal(h.pending.size, 1);
  h.follower.queue(); assert.equal(h.pending.size, 1);
  h.flush(); assert.equal(h.scrolls, 1);
  assert.equal(h.follower.didScroll(10, true, true), 'none');
});

test('disposal cancels pending work and cannot be reversed by later events', () => {
  const h = harness();
  h.follower.queue(); const stale = [...h.pending.values()][0];
  h.follower.dispose(); h.follower.dispose(); stale();
  h.follower.queue(); assert.equal(h.follower.resume(), false);
  assert.equal(h.follower.didScroll(10, true, true), 'none');
  assert.equal(h.pending.size, 0); assert.equal(h.scrolls, 0);
});

test('layout failure releases its task so the next content update can retry', () => {
  const h = harness();
  h.fail(true); h.follower.queue(); assert.doesNotThrow(() => h.flush());
  assert.equal(h.scrolls, 0); assert.equal(h.follower.isFollowing(), true);
  h.fail(false); h.follower.queue(); h.flush(); assert.equal(h.scrolls, 1);
});
