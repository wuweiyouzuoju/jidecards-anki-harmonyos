// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { NativeDialogHost, nativeDialogHostClass } from './platform-module-harness.mjs';
import { surfaceMotionApi } from './motion-harness.mjs';

function windowFactory(events, name) {
  return onWillDismiss => ({ onWillDismiss, open() { events.push('open:' + name); }, close() { events.push('close:' + name); } });
}

test('typed callbacks capture window identity across close, replacement and reactivation', () => {
  const host = new NativeDialogHost(); let current;
  host.open(dismiss => { current = host.captureCurrent(); return windowFactory([], 'first')(dismiss); });
  assert.equal(current(), true);
  host.close(); assert.equal(current(), false);
  host.open(windowFactory([], 'second')); assert.equal(current(), false);
  const second = host.captureCurrent(); host.dispose(); host.activate();
  assert.equal(second(), false);
});

test('replacement closes the old native window once; a late dismissal cannot cancel the current window', () => {
  const host = new NativeDialogHost(), events = [];
  let business = 0, dismissed = 0;
  host.open(windowFactory(events, 'first'), () => { business++; return true; });
  const first = host.current();
  host.open(windowFactory(events, 'second'));
  const second = host.current();
  first.onWillDismiss({ dismiss() { dismissed++; } });
  assert.equal(host.current(), second); assert.equal(business, 0); assert.equal(dismissed, 1);
  host.close(); host.close();
  assert.deepEqual(events, ['open:first', 'close:first', 'open:second', 'close:second']);
  assert.equal(host.current(), null);
});

test('button callbacks from closed or disposed content never close a newer native window', () => {
  const host = new NativeDialogHost(), events = [];
  host.open(windowFactory(events, 'first'));
  const closeFirst = host.guard(() => host.close());
  host.open(windowFactory(events, 'second'));
  const second = host.current(); closeFirst(); assert.equal(host.current(), second);
  const closeSecond = host.guard(() => host.close());
  closeSecond(); assert.equal(host.current(), null);
  const stale = host.guard(() => { throw Error('destroyed content callback'); });
  host.dispose(); stale();
});

test('every native dismissal obeys the live busy guard and releases the window when allowed', () => {
  const host = new NativeDialogHost(), events = [];
  let busy = true, requests = 0, dismissed = 0;
  host.open(windowFactory(events, 'form'), () => { requests++; return !busy; });
  const window = host.current(), action = { dismiss() { dismissed++; } };
  window.onWillDismiss(action); assert.equal(host.current(), window); assert.equal(dismissed, 0);
  busy = false; window.onWillDismiss(action);
  assert.equal(host.current(), null); assert.equal(requests, 2); assert.equal(dismissed, 1);
  host.close(); assert.deepEqual(events, ['open:form'], 'a native dismissal already owns the close');
});

test('disposing rejects new opens and never calls destroyed business state from a late dismissal', () => {
  const host = new NativeDialogHost(), events = [];
  let destroyed = false, dismissed = 0;
  host.open(windowFactory(events, 'form'), () => { assert.equal(destroyed, false); return true; });
  const window = host.current(); host.dispose(); destroyed = true;
  window.onWillDismiss({ dismiss() { dismissed++; } });
  host.open(() => { throw Error('disposed host must not construct content'); });
  assert.equal(host.current(), null); assert.equal(dismissed, 1);
  assert.deepEqual(events, ['open:form', 'close:form']);
  host.activate(); host.open(windowFactory(events, 'reappeared'));
  assert.ok(host.current());
});

test('a business dismissal that opens another window cannot release that replacement', () => {
  const host = new NativeDialogHost(), events = [];
  host.open(windowFactory(events, 'first'), () => { host.open(windowFactory(events, 'second')); return true; });
  const first = host.current(); first.onWillDismiss({ dismiss() {} });
  assert.ok(host.current());
  assert.deepEqual(events, ['open:first', 'close:first', 'open:second']);
});

test('failed native construction or open releases ownership and still allows retry', () => {
  const host = new NativeDialogHost(), events = [];
  assert.throws(() => host.open(() => { throw Error('construction'); }), /construction/);
  assert.equal(host.current(), null);
  assert.throws(() => host.open(() => ({ open() { throw Error('opening'); }, close() { events.push('cleanup'); } })), /opening/);
  assert.equal(host.current(), null); assert.deepEqual(events, ['cleanup']);
  host.open(windowFactory(events, 'retry')); assert.ok(host.current());
});

test('one native presentation owns geometry, mask policy and current motion parameters', () => {
  const motion = surfaceMotionApi(), Host = nativeDialogHostClass(motion), host = new Host();
  for (const [style, duration] of [['restrained', 250], ['lively', 290]]) {
    motion.setStyle(style); const options = host.presentation();
    assert.equal(options.width, '100%'); assert.equal(options.height, '100%');
    assert.equal(options.maskColor, 'transparent'); assert.equal(options.autoCancel, false);
    assert.equal(options.customStyle, true); assert.equal(options.openAnimation.duration, duration);
    assert.equal(options.closeAnimation.duration, duration);
  }
});

test('all native factories retain a compiler field context and consume the common presentation and dismissal', () => {
  const root = new URL('../../entry/src/main/ets/', import.meta.url);
  let factories = 0;
  for (const path of readdirSync(root, {recursive:true}).filter(path => path.endsWith('.ets'))) {
    const source = readFileSync(new URL(path.replaceAll('\\','/'), root), 'utf8').replaceAll('\r\n','\n');
    const constructors = [...source.matchAll(/new CustomDialogController\(/g)];
    for (const constructor of constructors) {
      const start = source.lastIndexOf('\n  private readonly ', constructor.index);
      assert.ok(start >= 0, path);
      const end = source.indexOf('\n  };', start);
      const factory = source.slice(start, end + 6);
      assert.ok(end > constructor.index, `${path}: native creation must remain a field factory`);
      assert.doesNotMatch(factory, /\n  private [^r]/, path);
      assert.match(factory, /NativeDialogPresentation = this\.\w+\.presentation\(\)/, path);
      assert.match(factory, /onWillDismiss: dismiss/, path);
      for (const key of ['autoCancel','customStyle','alignment','width','height','maskColor','openAnimation','closeAnimation']) {
        assert.match(factory, new RegExp(key + ': presentation\\.' + key), path);
      }
      factories++;
    }
  }
  assert.ok(factories >= 13, 'audit includes study, settings, deck options, editing and media windows');
});

test('native content uses the common frame directly or the existing help/gift adapter', () => {
  const root = new URL('../../entry/src/main/ets/', import.meta.url);
  for (const path of readdirSync(root, {recursive:true}).filter(path => path.endsWith('.ets'))) {
    const source = readFileSync(new URL(path.replaceAll('\\','/'), root), 'utf8');
    for (const match of source.matchAll(/@CustomDialog\s+(?:export\s+)?struct\s+(\w+|[^\s{]+)\s*\{([\s\S]*?)^\}/gm)) {
      assert.doesNotMatch(match[2], /this\.controller\??\.(?:close|open)\(/,
        `${path}: factory builders do not receive an injected controller; use the window owner's callback`);
      assert.match(match[2], /(?:DialogFrame|字段帮助面板)\(\{ nativeHost: true/, `${path}: ${match[1]}`);
      assert.doesNotMatch(match[2], /\.constraintSize\(\{ maxWidth: 480, maxHeight: '[\d]+%'/, path);
    }
  }
});
