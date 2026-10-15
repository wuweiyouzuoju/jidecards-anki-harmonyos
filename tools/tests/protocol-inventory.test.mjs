// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { inventory } from '../protocol/inventory.mjs';

test('protocol inventory is independent of filesystem enumeration order', t => {
  const schema = JSON.parse(fs.readFileSync(new URL('../core-protocol-schema.json', import.meta.url), 'utf8'));
  const expected = inventory(schema);
  const original = fs.readdirSync;
  // Windows and Linux return mixed-case directory names in different orders.
  t.mock.method(fs, 'readdirSync', (...args) => original(...args).reverse());
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.deepEqual(inventory(schema), expected);
});
