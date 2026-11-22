// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../../entry/src/main/ets/utils/PageFirstFrame.ets', import.meta.url), 'utf8')
  .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
function harness() {
  const timers = new Map(); let next = 0, frame;
  const Gate = new Function('FrameCallback', 'setTimeout', 'clearTimeout',
    stripTypeScriptTypes(source, { mode: 'transform' }) + '; return PageFirstFrame;')(
    class {}, callback => { timers.set(++next, callback); return next; }, id => timers.delete(id));
  return { gate: new Gate(), timers, context: { postFrameCallback: callback => { frame = callback; } },
    idle: () => frame.onIdle(2000000) };
}
test('entry waits for layout idle, shares preparation and releases timers exactly once', async () => {
  const h = harness(); let done = false;
  const pending = h.gate.wait(h.context); pending.then(() => { done = true; });
  assert.equal(h.gate.wait(h.context), pending);
  await Promise.resolve(); assert.equal(done, false);
  h.idle(); await pending; assert.equal(done, true); assert.equal(h.timers.size, 0);
  h.idle(); assert.equal(h.gate.wait(h.context), pending);
});
test('destroyed pages, stopped frames and platform errors cannot leave navigation waiting', async () => {
  for (const action of ['dispose', 'timeout', 'error']) {
    const h = harness();
    if (action === 'error') h.context.postFrameCallback = () => { throw Error('window closed'); };
    const pending = h.gate.wait(h.context);
    if (action === 'dispose') h.gate.complete();
    if (action === 'timeout') [...h.timers.values()][0]();
    await pending; assert.equal(h.timers.size, 0);
  }
});
