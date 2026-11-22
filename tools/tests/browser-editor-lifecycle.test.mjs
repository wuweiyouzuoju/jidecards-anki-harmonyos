// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { NoteEditorWheelSession } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';

function harness() {
  const dependencies = noteInterfaceDependencies();
  const Pane = loadComponentLogic('components/browser/BrowserEditorPane.ets', 'BrowserEditorPane', {
    ...dependencies, NoteEditorSession, initialNoteEditorState, NoteEditorWheelSession,
    BrowserOperationController, AnkiNoteUpdate: class {}, AnkiNoteEditor: class {}, NavPathStack: class {}
  });
  const pane = new Pane(), paths = [], wheel = [];
  Object.assign(pane, { active: true, visible: true, getUIContext: () => ({}),
    pathStack: { pushPath: path => paths.push(path) }, wheelSession: { setVisible: value => wheel.push(value) } });
  return { pane, paths, wheel, tracker: dependencies.appInterface };
}

test('JIDE observes the retained browser editor visibility after preview return', () => {
  const { pane, tracker } = harness();
  const visible = () => tracker.snapshot().find(item => item.surface === 'browser_editor').values.find(item => item.id === 'visible').value;
  pane.setVisible(); assert.equal(visible(), 'true');
  pane.visible = false; pane.setVisible(); assert.equal(visible(), 'false');
  pane.visible = true; pane.setVisible(); assert.equal(visible(), 'true');
});

test('wide editor recovers its preview guard on visibility return when navigation omits onPop', () => {
  const { pane, paths, wheel } = harness(); let returned = 0;
  assert.equal(pane.openPreview({}, () => returned++), true);
  assert.equal(wheel.at(-1), false);
  assert.equal(pane.openPreview({}, () => {}), false, 'only one draft preview owns the editor');
  pane.visible = false; pane.setVisible(); assert.equal(returned, 0);
  pane.visible = true; pane.setVisible();
  assert.equal(returned, 1); assert.equal(pane.previewReturn, 1); assert.equal(wheel.at(-1), true);
  paths[0].onPop(); assert.equal(returned, 1, 'late pop cannot finish the same preview twice');
});

test('late pop from an earlier preview cannot clear the new preview or mutate a disposed editor', () => {
  const { pane, paths } = harness(); const returns = [];
  pane.openPreview({}, () => returns.push(1));
  pane.visible = false; pane.setVisible(); pane.visible = true; pane.setVisible();
  pane.openPreview({}, () => returns.push(2));
  paths[0].onPop(); assert.equal(pane.previewOpen, true); assert.deepEqual(returns, [1]);
  pane.aboutToDisappear(); paths[1].onPop(); assert.deepEqual(returns, [1]);
  assert.equal(pane.previewReturn, 1);
});

test('navigation failure restores the wheel and hidden or busy editors cannot open preview', () => {
  const { pane, wheel } = harness(); let returned = 0;
  pane.pathStack.pushPath = () => { throw Error('navigation unavailable'); };
  assert.equal(pane.openPreview({}, () => returned++), false);
  assert.equal(pane.previewOpen, false); assert.equal(pane.previewReturnHandler, null);
  assert.equal(wheel.at(-1), true); assert.equal(returned, 0);
  for (const key of ['visible', 'active']) {
    pane[key] = false; assert.equal(pane.openPreview({}, () => {}), false); pane[key] = true;
  }
  for (const key of ['linksVisible']) {
    pane[key] = true; assert.equal(pane.openPreview({}, () => {}), false); pane[key] = false;
  }
  pane.editor.busy = true; assert.equal(pane.openPreview({}, () => {}), false);
});
