import assert from 'node:assert/strict';
import test from 'node:test';
import { NoteSaveLifecycle } from '../../entry/src/main/ets/model/NoteSaveLifecycle.ts';

test('accepted note save can finish after page disappearance but cannot navigate', () => {
  const lifecycle = new NoteSaveLifecycle();
  lifecycle.appear();
  const token = lifecycle.accept();
  assert.notEqual(token, null);
  lifecycle.disappear();
  assert.equal(lifecycle.isCurrent(token), false);
  assert.equal(lifecycle.canNavigate(token), false);
});

test('a new page generation invalidates an older save token', () => {
  const lifecycle = new NoteSaveLifecycle();
  lifecycle.appear();
  const oldToken = lifecycle.accept();
  lifecycle.disappear();
  lifecycle.appear();
  const newToken = lifecycle.accept();
  assert.notEqual(oldToken, newToken);
  assert.equal(lifecycle.canNavigate(oldToken), false);
  assert.equal(lifecycle.canNavigate(newToken), true);
});
