// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoteMediaCompiled } from '../check-note-media-compiled.mjs';

test('compiled media checker rejects source and reproduces missing controller injection in legacy output', () => {
  assert.throws(() => checkNoteMediaCompiled('@Component struct NoteFieldCard {}', ''), /fresh CompileArkTS/);
  const field = `export class NoteFieldCard extends ViewPU {
    constructor(parent, params) { super(); this.mediaDialog = new NativeDialogHost(); }
    aboutToAppear() {}
    openManager(kind) {
      this.mediaDialog.open(dismiss => new CustomDialogController({ onWillDismiss: dismiss, builder: () => {
        const dialog = new NoteMediaDialog(); dialog.kind = kind; dialog.owner = this;
        dialog.setController(); ViewPU.create(dialog);
      }}));
    }
  }`;
  const dialog = `export class NoteMediaDialog extends ViewPU {
    session = new NoteMediaSession('', 0, [], [], 'fixture');
    aboutToAppear() {} sync() {} setController(controller) { this.controller = controller; }
    initialRender() {
      ViewPU.create(new DialogHeader(this, { onClose: () => this.controller?.close(),
        onAction: () => this.controller?.close() }));
    }
  }`;
  assert.throws(() => checkNoteMediaCompiled(field, dialog), /compiled button must close the native window/);
});
