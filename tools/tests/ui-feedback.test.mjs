// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUiFeedback } from './ui-feedback-harness.mjs';
import { readFileSync, readdirSync } from 'node:fs';

test('UI resource lookup retains formatting arguments and dynamic resource names', () => {
  const api = loadUiFeedback();
  const calls = [];
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: (id, ...args) => { calls.push([id, ...args]); return args.join(' / '); },
    getStringByNameSync: (name, ...args) => { calls.push(args.length ? [name, ...args] : name); return 'Theme'; }
  } }) };
  assert.equal(api.resourceText(context, { id: 7 }, 'Parent', 'Child'), 'Parent / Child');
  assert.equal(api.resourceText(context, { id: 8 }, 12, 'cards'), '12 / cards');
  assert.equal(api.namedResourceText(context, 'theme_color_aurora'), 'Theme');
  assert.equal(api.namedResourceText(context, 'notetype_change_field_moved', 'Front', 1, 2, ''), 'Theme');
  assert.deepEqual(calls, [[7, 'Parent', 'Child'], [8, 12, 'cards'], 'theme_color_aurora',
    ['notetype_change_field_moved', 'Front', 1, 2, '']]);
});

test('unavailable resources produce an explicit marker and log, including a missing host', () => {
  const logs = [];
  const api = loadUiFeedback({ error: (...args) => logs.push(args), warn() {} });
  for (const context of [{ getHostContext: () => undefined }, { getHostContext: () => ({
    resourceManager: { getStringSync() { throw Error('missing'); }, getStringByNameSync() { throw Error('missing'); } }
  }) }]) {
    assert.equal(api.resourceText(context, { id: -1, params: ['app.string.missing'] }), '[app.string.missing]');
    assert.equal(api.resourceText(context, { id: 9 }), '[9]');
    assert.equal(api.namedResourceText(context, 'missing'), '[missing]');
  }
  assert.equal(logs.length, 6);
});

test('a toast failure cannot turn a completed write into an operation failure', async () => {
  let written = false, failed = false;
  const logs = [];
  const api = loadUiFeedback({ error() {}, warn: (...args) => logs.push(args) });
  try {
    await Promise.resolve(); written = true;
    api.showToastSafely({ getPromptAction: () => ({ showToast() { throw Error('detached window'); } }) }, { message: 'done' });
  } catch { failed = true; }
  assert.equal(written, true);
  assert.equal(failed, false);
  assert.equal(logs.length, 1);
  const options = { message: 'done', duration: 1000 };
  api.showToastSafely({ getPromptAction: () => ({ showToast: actual => assert.deepEqual(actual, options) }) }, options);
});

test('dynamic app string Resources use their name instead of the unresolved negative ID', () => {
  const logs = [], calls = [];
  const api = loadUiFeedback({ error: (...args) => logs.push(args), warn() {} });
  const base = JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url), 'utf8'));
  const english = JSON.parse(readFileSync(new URL('../../entry/src/main/resources/en_US/element/string.json', import.meta.url), 'utf8'));
  for (const resources of [base, english]) {
    const strings = new Map(resources.string.map(item => [item.name, item.value]));
    const context = { getHostContext: () => ({ resourceManager: {
      getStringSync: id => { throw Error(`Unresolved ID: ${id}`); },
      getStringByNameSync: (name, ...args) => { calls.push([name, ...args]); return strings.get(name); }
    } }) };
    for (const name of ['add_note_image_add', 'note_audio_add', 'note_editor_visual', 'note_editor_source_edit', 'note_editor_expand']) {
      const resource = { id: -1, type: 10003, params: ['app.string.' + name] };
      assert.equal(api.localizedResourceText(context, resources === base ? 'zh-Hans' : 'en', resource), strings.get(name));
      assert.deepEqual(resource.params, ['app.string.' + name]);
    }
    const resource = { id: -1, type: 10003, params: ['app.string.study_auto_advance_seconds', 5] };
    api.resourceText(context, resource);
    assert.deepEqual(calls.at(-1), ['study_auto_advance_seconds', 5]);
    api.resourceText(context, resource, 12.5);
    assert.deepEqual(calls.at(-1), ['study_auto_advance_seconds', 12.5]);
  }
  assert.equal(logs.length, 0);
});

test('unresolved names and positive ID failures stay observable instead of selecting another resource', () => {
  const logs = [], calls = [];
  const api = loadUiFeedback({ error: (...args) => logs.push(args), warn() {} });
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: id => { calls.push(id); throw Error('missing ID'); },
    getStringByNameSync: name => { calls.push(name); throw Error('missing name'); }
  } }) };
  assert.equal(api.resourceText(context, { id: -1, params: ['app.string.missing'] }), '[app.string.missing]');
  assert.equal(api.resourceText(context, { id: -1, params: ['app.media.image'] }), '[app.media.image]');
  assert.equal(api.resourceText(context, { id: 7, params: ['format value'] }), '[7]');
  assert.deepEqual(calls, ['missing', -1, 7]);
  assert.equal(logs.length, 3);
});

test('short toast messages omit final periods while retaining progress ellipses and message content', () => {
  const api = loadUiFeedback();
  let actual;
  const context = { getPromptAction: () => ({ showToast: value => { actual = value; } }),
    getHostContext: () => ({ resourceManager: { getStringSync: (_id, count) => `已保存 ${count} 张卡片。` } }) };
  for (const [message, expected] of [
    ['卡片数据已同步，可以开始学习。', '卡片数据已同步，可以开始学习'],
    ['媒体同步完成。', '媒体同步完成'], ['Media sync complete.', 'Media sync complete'],
    ['已保存。请返回。', '已保存。请返回'], ['Loading...', 'Loading...'],
    ['加载中…', '加载中…'], ['Version 3.0.0', 'Version 3.0.0'],
    ['打开 https://ankiweb.net', '打开 https://ankiweb.net'],
    [{ id: 7, params: [3] }, '已保存 3 张卡片']
  ]) {
    const options = { message, duration: 3000, bottom: '64vp' };
    api.showToastSafely(context, options);
    assert.deepEqual(actual, { ...options, message: expected });
  }
});

test('all native toast entry points use the shared feedback formatter', () => {
  const root = new URL('../../entry/src/main/ets/', import.meta.url);
  for (const path of readdirSync(root, { recursive: true })) {
    if (!/\.(ets|ts)$/.test(path) || path.replaceAll('\\', '/') === 'utils/UiFeedback.ets') continue;
    const source = readFileSync(new URL(path.replaceAll('\\', '/'), root), 'utf8');
    assert.doesNotMatch(source, /\.showToast\s*\(/, `${path} bypasses the shared toast formatter`);
  }
});


test('resource objects retain embedded format arguments and explicit arguments take precedence', () => {
  const api = loadUiFeedback();
  const calls = [];
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: (id, ...args) => { calls.push([id, ...args]); return `%s 秒`.replace('%s', args[0]); }
  } }) };
  // 静态 $r 编译后 params 从第一项起就是格式参数，不包含资源名。
  const resource = { id: 7, type: 10003, params: ['5'] };
  assert.equal(api.resourceText(context, resource), '5 秒');
  assert.equal(api.resourceText(context, resource, 12.5), '12.5 秒');
  assert.deepEqual(calls, [[7, '5'], [7, 12.5]]);
  assert.deepEqual(resource.params, ['5']);
});

test('compiled static string resources preserve every substitution in real Chinese and English text', () => {
  const api = loadUiFeedback();
  const ids = new Map([[100, 'cloud_deck_qq_group_entry'], [101, 'cloud_deck_download']]);
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8'))
      .string.map(item => [item.name, item.value]));
    const context = { getHostContext: () => ({ resourceManager: {
      getStringSync: (id, ...args) => strings.get(ids.get(id)).replace(/%[sd]/g, () => String(args.shift()))
    } }) };
    for (const [id, params] of [[100, ['726837065']], [101, [3]]]) {
      const resource = { id, type: 10003, params: Object.freeze([...params]) };
      const expected = strings.get(ids.get(id)).replace(/%[sd]/g, String(params[0]));
      assert.equal(api.resourceText(context, resource), expected);
      assert.equal(api.localizedResourceText(context, locale, resource), expected);
      assert.deepEqual(resource.params, params);
    }
  }
});

test('a static string argument that resembles a resource name is still a substitution', () => {
  const api = loadUiFeedback();
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: (id, ...args) => { assert.equal(id, 99); return args.join(' / '); },
    getStringByNameSync: () => assert.fail('static IDs must not switch to name lookup')
  } }) };
  assert.equal(api.resourceText(context, { id: 99, params: ['app.string.some_text', 0, ''] }), 'app.string.some_text / 0 / ');
});
