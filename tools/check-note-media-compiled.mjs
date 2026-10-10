// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { NoteMediaSession } from '../entry/src/main/ets/model/NoteMediaSession.ts';
import { noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource } from '../entry/src/main/ets/model/NoteMediaParts.ts';
import { noteVisualInterfaceObservation } from '../entry/src/main/ets/model/AppInterface.ts';

/** Execute both fresh compiler outputs without synthesizing controller injection.
 * Platform substitutes do not verify ArkUI scheduling, layout, animation or bytecode.
 */
export function checkNoteMediaCompiled(fieldSource, dialogSource) {
  assert.match(fieldSource, /export class NoteFieldCard extends ViewPU/, 'Pass fresh CompileArkTS NoteFieldCard.ts output.');
  assert.match(dialogSource, /export class NoteMediaDialog extends ViewPU/, 'Pass fresh CompileArkTS NoteMediaDialog.ts output.');
  const events = [], windows = [];
  let activeWindow, nextId = 0;
  class Property {
    constructor(value) { this.value = value; }
    get() { return this.value; }
    set(value) { this.value = value; }
    reset(value) { this.value = value; }
    setToDefaultValue(value) { if (this.value === undefined) this.value = value; }
    purgeDependencyOnElmtId() {}
    aboutToBeDeleted() {}
  }
  class ViewPU {
    createStorageProp(_key, value) { return new Property(value); }
    createStorageLink(_key, value) { return new Property(value); }
    finalizeConstruction() {}
    declareWatch() {}
    observeComponentCreation2(callback) { callback(++nextId, true); }
    ifElseBranchUpdateFunction(_branch, callback) { callback(); }
    forEachUpdateFunction(_id, items, callback) { items.forEach(callback); }
    getUIContext() { return { getHostContext: () => ({ filesDir: '/files', cacheDir: '/cache' }) }; }
    static create(component) {
      if (component.constructor.name === 'NoteMediaDialog') {
        activeWindow.component = component;
        component.aboutToAppear();
      }
      component.initialRender?.();
    }
  }
  class CustomDialogController {
    constructor(options) { this.options = options; this.visible = false; windows.push(this); }
    open() { this.visible = true; activeWindow = this; this.options.builder(); }
    close() { if (this.visible) { this.visible = false; this.component?.aboutToDisappear(); } }
  }
  class DialogFrame {
    constructor(_parent, params) { this.params = params; }
    initialRender() { activeWindow.frame = this.params; this.params.header(); this.params.content(); }
  }
  class DialogHeader {
    constructor(_parent, params) { this.params = params; }
    initialRender() { activeWindow.header = this.params; }
  }
  class DisplayOnly { initialRender() {} }
  // 系统绘图替身只消费本次编译出的父子回调，不模拟画布或 ArkUI 状态调度。
  class DrawingEditor {
    constructor(_parent, params) { this.params = params; }
    initialRender() {
      activeWindow.drawing = this.params;
      this.params.onReady(() => this.params.onCancel());
    }
  }
  const SurfaceTransition = { dialogEnterAnimation: () => ({}), dialogExitAnimation: () => ({}) };
  const Color = { Transparent: 'transparent', White: 'white' }, DialogAlignment = { Center: 'center' };
  const hostSource = readFileSync(new URL('../entry/src/main/ets/components/common/NativeDialogHost.ets', import.meta.url), 'utf8');
  const NativeDialogHost = new Function('SurfaceTransition', 'Color', 'DialogAlignment', stripTypeScriptTypes(
    hostSource.replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, ''), { mode: 'transform' }) + ';return NativeDialogHost;')(
      SurfaceTransition, Color, DialogAlignment);
  const nativeElement = new Proxy({}, { get: () => () => {} });
  const context = vm.createContext({
    ViewPU, CustomDialogController, DialogFrame, DialogHeader, NativeDialogHost, SurfaceTransition, Color, DialogAlignment,
    ObservedPropertySimplePU: Property, ObservedPropertyObjectPU: Property,
    SynchedPropertySimpleOneWayPU: Property, SynchedPropertyObjectOneWayPU: Property,
    NoteMediaSession, noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource, noteVisualInterfaceObservation,
    NoteAudioPreview: class { async stop() {} }, discardNoteRecordings: async () => {},
    discardNoteDrawingImages: async () => {},
    appInterface: { observe: () => ++nextId, leave() {} },
    颜色键: {}, 应用尺寸: {}, PressFeedback: class {}, $r: key => key,
    showToastSafely: () => assert.fail('opening should succeed'), resourceText: (_ctx, key) => key,
    NoteVisualPreview: DisplayOnly, NoteAudioField: DisplayOnly, LabeledActionRow: DisplayOnly,
    IconActionButton: DisplayOnly, 按下态按钮: DisplayOnly,
    NoteDrawingEditor: DrawingEditor,
    Column: nativeElement, Row: nativeElement, Stack: nativeElement, If: nativeElement, ForEach: nativeElement, Text: nativeElement,
    __Common__: nativeElement,
    Alignment: {TopEnd:'top-end'},
    __Common__: nativeElement,
    Button: nativeElement, SurfaceBorder: { options: () => ({}) }, TextAlign: { Start: 'start' }
  });
  for (const [source, name] of [[dialogSource, 'NoteMediaDialog'], [fieldSource, 'NoteFieldCard']]) {
    const body = source.replace(/^import[^;]*;\s*/gm, '').replace(/^export /gm, '');
    vm.runInContext(stripTypeScriptTypes(body, { mode: 'transform' }) + `\nthis.${name} = ${name};`, context, { timeout: 1000 });
  }
  let cases = 0;
  for (const kind of ['image', 'audio']) for (const picked of [false, true]) for (const commit of [false, true]) {
    const field = new context.NoteFieldCard(undefined, {});
    field.onAudioBusy = busy => events.push(['busy', busy]);
    field.onMediaApply = (...draft) => events.push(['apply', ...draft]);
    field.aboutToAppear(); field.openManager(kind);
    const window = windows.at(-1), dialog = window.component;
    if (picked) {
      if (kind === 'audio') dialog.session.addAudio('/cache/note-audio-1-1.mp3', 'voice.mp3', true);
      else dialog.session.addImage('photo://new');
      dialog.sync();
    }
    dialog.initialRender();
    const before = events.filter(event => event[0] === 'apply').length;
    (commit ? window.header.onAction : window.header.onClose)();
    assert.equal(window.visible, false, `${kind}/${picked}/${commit}: compiled button must close the native window`);
    assert.equal(field.mediaDialog.current(), null);
    assert.equal(events.at(-1)[1], false, 'parent must unlock');
    assert.equal(events.filter(event => event[0] === 'apply').length - before, commit ? 1 : 0);
    if (commit) {
      const applied = events.filter(event => event[0] === 'apply').at(-1);
      assert.equal(applied[2].length, picked && kind === 'image' ? 1 : 0);
      assert.equal(applied[3].length, picked && kind === 'audio' ? 1 : 0);
    }
    field.openManager(kind);
    const backdrop = windows.at(-1); backdrop.frame.onDismiss();
    assert.equal(backdrop.visible, false, 'compiled backdrop must cancel the native window');
    field.openManager(kind);
    const reopened = windows.at(-1); reopened.component.working = true;
    reopened.options.onWillDismiss({ dismiss: () => assert.fail('busy window') });
    assert.equal(reopened.visible, true);
    reopened.component.working = false;
    reopened.options.onWillDismiss({ dismiss: () => reopened.close() });
    assert.equal(reopened.visible, false, 'compiled system back must close after the busy operation ends');
    field.aboutToDisappear(); cases++;
  }
  const field = new context.NoteFieldCard(undefined, {});
  field.onMediaApply = (...draft) => events.push(['drawing-apply', ...draft]);
  field.aboutToAppear(); field.openManager('image');
  const drawingWindow = windows.at(-1), dialog = drawingWindow.component;
  dialog.editDrawing(); dialog.initialRender();
  drawingWindow.options.onWillDismiss({dismiss:()=>assert.fail('drawing back must stay in the media window')});
  assert.equal(dialog.drawingActive, false, 'compiled Back cancels only the child editor');
  assert.equal(drawingWindow.visible, true); assert.equal(dialog.images.length, 0);
  dialog.editDrawing(); dialog.initialRender(); const staleDrawing = drawingWindow.drawing;
  staleDrawing.onApply('file:///cache/note-drawing-image-1.png');
  assert.equal(dialog.drawingActive, false); assert.equal(dialog.images.length, 1);
  dialog.editDrawing(); dialog.initialRender();
  staleDrawing.onApply('file:///cache/note-drawing-image-stale.png');
  assert.equal(dialog.drawingActive, true); assert.equal(dialog.images.length, 1);
  drawingWindow.drawing.onCancel(); dialog.initialRender(); drawingWindow.header.onAction();
  assert.equal(drawingWindow.visible, false);
  assert.equal(events.find(event => event[0] === 'drawing-apply')[2][0].uri, 'file:///cache/note-drawing-image-1.png');
  field.aboutToDisappear();
  return { cases: cases + 2, windows: windows.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw Error('Usage: node tools/check-note-media-compiled.mjs <compiled-NoteFieldCard.ts> <compiled-NoteMediaDialog.ts>');
    const inputs = process.argv.slice(2).map(path => ({ path: resolve(path), source: readFileSync(path, 'utf8') }));
    const result = checkNoteMediaCompiled(inputs[0].source, inputs[1].source);
    console.log(JSON.stringify({ ...result, inputs: inputs.map(input => ({ path: input.path,
      sha256: createHash('sha256').update(input.source).digest('hex') })) }));
  } catch (error) { console.error(`[note-media:compiled] ${error.message}`); process.exitCode = 1; }
}
