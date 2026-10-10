// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadComponentLogic } from './platform-module-harness.mjs';
import { NoteMediaSession } from '../../entry/src/main/ets/model/NoteMediaSession.ts';
import { noteMediaParts, noteImagePreviewSource } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
import { noteVisualInterfaceObservation, AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';

export function mediaDialogHarness(select = async () => [], initial = {}, tracker = new AppInterfaceTracker()) {
  const events = [];
  const Dialog = loadComponentLogic('components/editor/NoteMediaDialog.ets', 'NoteMediaDialog', {
    NoteMediaSession, noteMediaParts, noteImagePreviewSource, noteVisualInterfaceObservation,
    noteVisualKind: initial.noteVisualKind ?? (async () => 'image'),
    appInterface: {
      observe: value => { events.push(['observe', value]); return tracker.observe(value); },
      leave: (surface, version) => { events.push(['leave', surface]); tracker.leave(surface, version); }
    },
    NoteAudioPreview: class { async stop() { events.push('stop'); } },
    discardNoteRecordings: async audios => events.push(['cleanup', audios.map(a => a.uri)]),
    discardNoteDrawingImages: async images => events.push(['image-cleanup', images.map(a => a.uri)]),
    photoAccessHelper: { PhotoSelectOptions: class {}, PhotoViewMIMETypes: { IMAGE_VIDEO_TYPE: 'image-video' },
      PhotoViewPicker: class { async select(options) { events.push(['pick', options.maxSelectNumber, options.MIMEType]); return { photoUris: await select() }; } } },
    resourceText: (_ctx, key) => key, $r: key => key
  });
  const dialog = new Dialog();
  Object.assign(dialog, initial, {
    onRequestClose: initial.onRequestClose ?? (() => { events.push('close'); dialog.aboutToDisappear(); }),
    onApply: initial.onApply ?? ((value, images, audios) => events.push(['apply', value, images, audios])),
    onClosed: initial.onClosed ?? (() => events.push('closed')),
    getUIContext: () => ({ getHostContext: () => ({ filesDir: '/files', cacheDir: '/cache' }) })
  });
  dialog.aboutToAppear();
  return { dialog, events, tracker };
}
