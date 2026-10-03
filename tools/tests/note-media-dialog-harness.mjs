// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadComponentLogic } from './platform-module-harness.mjs';
import { NoteMediaSession } from '../../entry/src/main/ets/model/NoteMediaSession.ts';
import { noteMediaParts, noteImagePreviewSource } from '../../entry/src/main/ets/model/NoteMediaParts.ts';

export function mediaDialogHarness(select = async () => [], initial = {}) {
  const events = [];
  const Dialog = loadComponentLogic('components/common/NoteMediaDialog.ets', 'NoteMediaDialog', {
    NoteMediaSession, noteMediaParts, noteImagePreviewSource,
    NoteAudioPreview: class { async stop() { events.push('stop'); } },
    discardNoteRecordings: async audios => events.push(['cleanup', audios.map(a => a.uri)]),
    photoAccessHelper: { PhotoSelectOptions: class {}, PhotoViewMIMETypes: { IMAGE_TYPE: 'image' },
      PhotoViewPicker: class { async select(options) { events.push(['pick', options.maxSelectNumber]); return { photoUris: await select() }; } } },
    resourceText: (_ctx, key) => key, $r: key => key
  });
  const dialog = new Dialog();
  Object.assign(dialog, initial, {
    controller: { close() { events.push('close'); dialog.aboutToDisappear(); } },
    onApply: (value, images, audios) => events.push(['apply', value, images, audios]),
    onClosed: () => events.push('closed'),
    getUIContext: () => ({ getHostContext: () => ({ filesDir: '/files' }) })
  });
  dialog.aboutToAppear();
  return { dialog, events };
}
