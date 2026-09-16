// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register, stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { normalizeCardTextSize } from '../../entry/src/main/ets/model/CardTextSize.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 笔记类型方法 } from '../../entry/src/main/ets/backend/服务索引.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const nativeStub = 'export const openBackend = () => 0; export const closeBackend = () => {}; export const runMethodRaw = async () => new Uint8Array();';
const hook = `export function resolve(s,c,n) {
  if(s === 'libjidecards.so') return {url: ${JSON.stringify('data:text/javascript;base64,' + Buffer.from(nativeStub).toString('base64'))},shortCircuit:true};
  if(s === '@kit.NetworkKit') return {url:'data:text/javascript,export const http = {};',shortCircuit:true};
  return n(s,c);
}`;
register('data:text/javascript;base64,' + Buffer.from(hook).toString('base64'), import.meta.url);

test('new note type returns the backend ID from OpChangesWithId, including changes payload', async () => {
  const { 后端会话 } = await import('../../entry/src/main/ets/backend/后端会话.ts');
  const previous = 后端会话.获取实例;
  const response = new 协议写入器();
  const changes = new 协议写入器();
  changes.写入布尔(3, true);
  response.写入字节(1, changes.转为字节());
  response.写入64位整数(2, 1789123456789);
  let bytes = response.转为字节();
  后端会话.获取实例 = () => ({ 调用: async (_service, method) => {
    assert.equal(method, 笔记类型方法.添加笔记类型旧版);
    return bytes;
  } });
  try {
    const { 笔记类型服务 } = await import('../../entry/src/main/ets/backend/笔记类型服务.ts');
    const service = new 笔记类型服务();
    assert.equal(await service.添加笔记类型旧版('{"name":"Basic"}'), 1789123456789);
    bytes = new Uint8Array();
    await assert.rejects(service.添加笔记类型旧版('{}'), /Invalid note type ID/);
  } finally {
    后端会话.获取实例 = previous;
  }
});

test('card text size normalizes corrupt, fractional and out-of-range values', () => {
  assert.equal(normalizeCardTextSize(NaN), 100);
  assert.equal(normalizeCardTextSize(Infinity), 100);
  assert.equal(normalizeCardTextSize(-20), 50);
  assert.equal(normalizeCardTextSize(201), 200);
  assert.equal(normalizeCardTextSize(129.6), 130);
});

test('card text preference survives restart; failed save keeps the last successful size', async () => {
  const source = read('entry/src/main/ets/utils/CardTextSizeStore.ets')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const disk = new Map([['cardTextSizePercent', 140]]);
  let cache = new Map(disk);
  const app = new Map([['abilityContext', {}]]);
  let fail = false;
  const context = vm.createContext({
    CARD_TEXT_SIZE_KEY: 'cardTextSizePercent', DEFAULT_CARD_TEXT_SIZE: 100, normalizeCardTextSize,
    AppStorage: { get: key => app.get(key), setOrCreate: (key, value) => app.set(key, value) },
    preferences: { getPreferencesSync: () => ({
      getSync: (key, fallback) => cache.get(key) ?? fallback,
      putSync: (key, value) => cache.set(key, value),
      flush: async () => { if (fail) throw new Error('disk full'); for (const [k,v] of cache) disk.set(k,v); }
    }) }, hilog: { warn() {} }
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  context.initializeCardTextSize();
  assert.equal(app.get('cardTextSizePercent'), 140);
  await context.saveCardTextSize(170);
  app.delete('cardTextSizePercent'); cache = new Map(disk);
  context.initializeCardTextSize();
  assert.equal(app.get('cardTextSizePercent'), 170);
  fail = true;
  await assert.rejects(context.saveCardTextSize(190), /disk full/);
  assert.equal(app.get('cardTextSizePercent'), 170);
  assert.equal(cache.get('cardTextSizePercent'), 170);
});

test('study and preview both consume the global text scale', () => {
  for (const path of ['pages/学习页.ets', 'components/browser/卡片预览页.ets']) {
    assert.match(read(`entry/src/main/ets/${path}`), /\.textZoomRatio\(this\.cardTextSizePercent\)/);
  }
  assert.match(read('entry/src/main/ets/components/settings/外观分组.ets'), /CardTextSizeControl\(\)/);
});
