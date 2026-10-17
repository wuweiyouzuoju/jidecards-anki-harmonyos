// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { surfaceMotionApi } from './motion-harness.mjs';
import { nativeDialogHostClass } from './platform-module-harness.mjs';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('pages, section switches, dialogs and overlays read the same current profile', () => {
  const api = surfaceMotionApi();
  const surface = api.SurfaceTransition;
  for (const [style, duration, offset, scale] of [
    ['restrained', 250, 0, 0.96], ['lively', 290, 16, 0.92], ['restrained', 250, 0, 0.96]
  ]) {
    api.setStyle(style);
    const options = surface.pageAnimation();
    assert.equal(options.duration, duration);
    assert.equal(options.curve, 'ease-out');
    assert.deepEqual(options.expectedFrameRateRange, { min: 60, max: 120, expected: 60 });
    for (const forward of [true, false]) {
      const page = surface.pageContent(forward);
      assert.equal(page.enter.value, 0);
      assert.deepEqual(page.enter.combined.value, { x: offset === 0 ? 0 : offset * (forward ? 1 : -1) });
      assert.deepEqual(page.enter.options, options);
      assert.equal(page.exit.value, 0);
      assert.deepEqual(page.exit.options, { duration: 0 }, 'transparent outgoing text hides immediately');
      assert.equal(page.exit.combined, undefined);
    }
    assert.equal(surface.pageContent(true, false), api.TransitionEffect.IDENTITY, 'initial section has no second entrance');
    const dialog = surface.dialog();
    assert.deepEqual(dialog.enter.combined.value, { x: scale, y: scale });
    assert.equal(dialog.enter.options.duration, duration);
    assert.equal(dialog.exit.combined, undefined, 'dialog closing does not shrink');
    assert.deepEqual(dialog.exit.options, { duration, curve: 'ease-out' });
    const overlay = surface.pageOverlay();
    assert.deepEqual(overlay.options, options);
    assert.equal(overlay.combined, undefined, 'full preview background and Web do not slide');
  }
});

test('all nine destinations keep equivalent forward and return callbacks', () => {
  const api = surfaceMotionApi('lively');
  for (const [file, name, opacity, offset] of [
    ['设置页', 'SettingsPage'], ['统计页', 'StatsPage'], ['学习提醒页', 'ReminderPage'],
    ['浏览页', 'BrowserPage'], ['添加笔记页', 'AddNotePage'], ['学习页', 'StudyPage'], ['AI制卡页', 'AiCardPage'],
    ['EditNotePage', 'EditNotePage', 'opacityValue', 'navigationOffset'],
    ['NoteDraftPreviewPage', 'NoteDraftPreviewPage', 'opacityValue', 'navigationOffset']
  ]) {
    const source = read('pages/' + file + '.ets');
    const marker = 'CustomTransition.getInstance().注册NavParam(';
    const start = source.indexOf(marker);
    assert.ok(start >= 0, name);
    let end = start + marker.length, depth = 1;
    while (depth) { if (source[end] === '(') depth++; else if (source[end] === ')') depth--; end++; }
    let callbacks;
    const state = {};
    const registry = { 注册NavParam: (id, begin, finish) => { assert.equal(id, name); callbacks = { begin, finish }; } };
    const invoke = new Function('CustomTransition', 'navigationEnterOffset',
      stripTypeScriptTypes(source.slice(start, end) + ';', { mode: 'transform' }));
    invoke.call(state, { getInstance: () => registry }, api.navigationEnterOffset);
    for (const forward of [true, false]) {
      callbacks.begin(forward, false);
      assert.equal(state[opacity ?? '转场透明度'], 0, name);
      assert.equal(state[offset ?? 'navigationOffset'], forward ? 16 : -16, name);
      callbacks.finish(forward, false);
      assert.equal(state[opacity ?? '转场透明度'], 1, name);
      assert.equal(state[offset ?? 'navigationOffset'], 0, name);
      callbacks.finish(forward, true);
      assert.equal(state[opacity ?? '转场透明度'], 0, name);
    }
    assert.match(source, new RegExp(`注销NavParam\\('${name}'\\)`));
  }
});

test('settings only enable local motion after mounting and use the current navigation direction', () => {
  const source = read('components/设置面板.ets');
  const start = source.indexOf('  private sectionChanged()');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Host = new Function(stripTypeScriptTypes('class Host {' + method + '}', { mode: 'transform' }) + ';return Host;')();
  const host = new Host();
  let publications = 0;
  Object.assign(host, { activeSection: 'ai', previousSection: '', animateSection: false,
    sectionNavigationReady: false, publishInterface: () => publications++ });
  host.sectionChanged();
  assert.equal(host.animateSection, false, 'initial target stays inside the outer Navigation entrance');
  host.sectionNavigationReady = true;
  for (const target of ['appearance', '', 'data', '']) {
    host.activeSection = target; host.sectionChanged();
    assert.equal(host.animateSection, true);
    assert.equal(host.sectionForward, target !== '');
    assert.equal(host.previousSection, target);
  }
  assert.equal(publications, 5);
  assert.match(source, /ForEach\(\[this\.activeSection\]/);
  assert.match(source, /\.transition\(SurfaceTransition\.pageContent\(this\.sectionForward, this\.animateSection\)\)/);
  assert.doesNotMatch(source, /\.transition\(.*(?:dialog\(|backdrop\(|OPACITY)/,
    'settings child panels own their effects; host must not wrap another transition');
});

test('same surface effects have one owner across all modal implementations', () => {
  const paths = readdirSync(root, { recursive: true }).filter(path => path.endsWith('.ets'));
  let owners = 0;
  for (const path of paths) {
    const source = read(path.replaceAll('\\', '/'));
    if (source.includes('SurfaceTransition.dialog()')) {
      owners++;
      assert.match(source, /SurfaceTransition\.backdrop\(\)/, path);
      assert.doesNotMatch(source, /TransitionEffect\.scale|TransitionEffect\.asymmetric/, path);
    }
    if (path.replaceAll('\\', '/') !== 'utils/SurfaceTransition.ets') {
      assert.doesNotMatch(source, /TransitionEffect\.scale\(\{ x: currentMotionProfile\(\)\.dialogScale/, path);
    }
  }
  assert.equal(owners, 9, 'deck options now use page navigation; ordinary forms and the crop surface retain their own transition');
  assert.doesNotMatch(read('components/牌组选项面板.ets'), /SurfaceTransition\.(?:dialog|backdrop)/);
  assert.match(read('pages/DeckOptionsPage.ets'), /注册NavParam\('DeckOptionsPage'/);
  for (const file of ['components/提醒编辑面板.ets', 'components/browser/查找替换对话框.ets',
    'components/home/创建过滤牌组面板.ets', 'components/牌组定制面板.ets']) {
    assert.match(read(file), /DialogFrame\(/, file);
  }
  assert.match(read('components/创建牌组面板.ets'), /DialogFrame\(/);
  const home = read('pages/首页.ets');
  assert.match(home, /\.transition\(SurfaceTransition\.pageContent\(true, compact\)\)/);
  assert.match(home, /\.transition\(SurfaceTransition\.pageContent\(false, this\.当前断点 === 'xs' && this\.deckNavigationStarted\)\)\s*\.visibility/);
  assert.match(home, /Visibility\.Hidden : Visibility\.Visible/, 'return keeps the existing list mounted');
  assert.match(read('components/browser/卡片预览页.ets'), /\.transition\(SurfaceTransition\.pageOverlay\(\)\)/);
});

test('native CustomDialog windows share parameters and own their window animation once', () => {
  let hosts = 0;
  for (const path of readdirSync(root, { recursive: true }).filter(path => path.endsWith('.ets'))) {
    const source = read(path.replaceAll('\\', '/'));
    const marker = 'new CustomDialogController({';
    let start = source.indexOf(marker);
    while (start >= 0) {
      let end = start + marker.length, depth = 1;
      while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
      const options = source.slice(start, end);
      for (const key of ['openAnimation', 'closeAnimation', 'customStyle', 'width', 'height', 'maskColor', 'alignment', 'autoCancel']) {
        assert.match(options, new RegExp(key + ': presentation\\.' + key), path);
      }
      assert.match(options, /onWillDismiss: dismiss/, path);
      hosts++;
      start = source.indexOf(marker, end);
    }
  }
  assert.ok(hosts >= 13);
  const api = surfaceMotionApi();
  const frame = read('components/common/DialogFrame.ets');
  const expressions = [...frame.matchAll(/\.transition\((this\.nativeHost[^\n]+)\)/g)].map(match => match[1]);
  assert.equal(expressions.length, 2);
  for (const nativeHost of [true, false]) {
    for (const expression of expressions) {
      const effect = new Function('SurfaceTransition', 'TransitionEffect', 'return ' + expression)
        .call({ nativeHost }, api.SurfaceTransition, api.TransitionEffect);
      if (nativeHost) assert.equal(effect, api.TransitionEffect.IDENTITY);
      else assert.notEqual(effect, api.TransitionEffect.IDENTITY);
    }
  }
});

test('persistent native-dialog owners create current-style windows on each open', () => {
  const api = surfaceMotionApi();
  for (const [path, field, name] of [
    ['components/settings/AboutSettings.ets', 'feedbackDialog', 'createFeedbackDialog'],
    ['components/数据迁移面板.ets', 'legacyHelp', 'createLegacyHelp'],
    ['components/settings/同步分组.ets', 'serverDialogController', 'createServerDialog']
  ]) {
    const source = read(path).replaceAll('\r\n', '\n'), start = source.indexOf('  private readonly ' + name + ':');
    const method = source.slice(start, source.indexOf('\n  };', start) + 6);
    const builderName = method.match(/builder: ([^({\s]+)\(/)[1];
    let closed = 0;
    const values = { SurfaceTransition: api.SurfaceTransition, Color: { Transparent: 'transparent' },
      DialogAlignment: { Center: 'center' }, $r: key => key, [builderName]: props => props,
      CustomDialogController: class { constructor(options) { this.options = options; } open() {} close() { closed++; } }
    };
    const Host = new Function(...Object.keys(values),
      stripTypeScriptTypes('class Host {' + method + '}', { mode: 'transform' }) + ';return Host;')(...Object.values(values));
    const host = new Host(); host[field] = new (nativeDialogHostClass(api))();
    for (const [style, duration] of [['restrained', 250], ['lively', 290], ['restrained', 250]]) {
      api.setStyle(style); host[field].open(host[name]);
      const options = host[field].current().options;
      assert.equal(options.openAnimation.duration, duration, path);
      assert.equal(options.closeAnimation.duration, duration, path);
      assert.equal(options.closeAnimation.curve, 'ease-out', path);
    }
    assert.equal(closed, 2, path);
  }
});
