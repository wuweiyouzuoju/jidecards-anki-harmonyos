// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../../entry/src/main/ets/pages/设置页.ets', import.meta.url), 'utf8');
function method(signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0);
  const body = source.indexOf('{', start);
  let end = body + 1, depth = 1;
  while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
  return stripTypeScriptTypes('class Host {' + source.slice(start, end) + '}', { mode: 'transform' });
}
test('opening settings registers navigation without reading collection or overwriting live theme', async () => {
  let registered = false, warned = false, prepare;
  const Host = new Function('CustomTransition', 'initializeRedemption', 'hilog',
    `${method('  aboutToAppear()')}; return Host;`)(
    { getInstance: () => ({ registerPage: (_id, _update, preparation) => { registered = true; prepare = preparation; } }) },
    () => Promise.reject(new Error('offline')), { warn: () => { warned = true; } });
  const host = new Host();
  let frameReady;
  const frame = new Promise(resolve => { frameReady = resolve; });
  Object.assign(host, { disposed: true, 主题模式值: 'dark', 颜色主题值: 'current',
    firstFrame: { wait: () => frame }, getUIContext: () => ({}),
    加载牌组列表: () => assert.fail('directory must not read collection') });
  host.aboutToAppear();
  assert.equal(registered, true);
  assert.equal(host.disposed, false);
  assert.equal(host.主题模式值, 'dark');
  assert.equal(host.颜色主题值, 'current');
  assert.equal(prepare(), frame, 'navigation waits for the first completed layout');
  frameReady();
  await frame;
  await Promise.resolve();
  assert.equal(warned, true, 'initialization failure remains recoverable');
});
test('export waits for fresh deck candidates and leaving cancels only the pending UI opening', async () => {
  const events = [];
  const Host = new Function('syncActivity', '$r', `${method('  private async 打开数据迁移(')}; return Host;`)(
    { isCollectionBusy: () => false }, value => value);
  const host = new Host();
  let complete;
  Object.assign(host, { disposed: false,
    加载牌组列表: () => new Promise(resolve => { complete = resolve; events.push('read'); }),
    transferSession: { open: (...args) => events.push(args), startImport: () => events.push('import') } });
  let pending = host.打开数据迁移('exportDeck', 0, true);
  assert.deepEqual(events, ['read']);
  complete(); await pending;
  assert.deepEqual(events[1], ['exportDeck', 0, true]);
  pending = host.打开数据迁移('exportDeck', 0, true);
  host.disposed = true; complete(); await pending;
  assert.equal(events.length, 3);
  host.disposed = false;
  await host.打开数据迁移('importFile', 0, false);
  assert.equal(events.at(-1), 'import');
});
