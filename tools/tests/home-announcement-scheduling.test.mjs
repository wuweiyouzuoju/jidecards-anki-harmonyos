// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeAnnouncementController } from '../../entry/src/main/ets/model/HomeAnnouncementController.ts';
test('announcement scheduling owns one timer; canceled callbacks cannot consume a newer timer', async () => {
  const callbacks = [], canceled = []; let checks = 0;
  const controller = new HomeAnnouncementController({schedule: fn => {callbacks.push(fn); return callbacks.length;}, cancel: id => canceled.push(id)});
  await controller.check(async () => null, async () => false);
  const check = async () => {checks++; return false;};
  controller.request(() => true, check, Date.now()); controller.request(() => true, check, Date.now());
  assert.equal(callbacks.length, 1); controller.pause(); controller.request(() => true, check, Date.now());
  callbacks[0](); controller.request(() => true, check, Date.now()); assert.equal(callbacks.length, 2); assert.equal(checks, 0);
  callbacks[1](); assert.equal(checks, 1); controller.dispose(); controller.request(() => true, check, Date.now());
  assert.equal(callbacks.length, 2); assert.deepEqual(canceled, [1]);
});
