// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { noteAudioParts, replaceNoteAudioPart, localNoteAudioPath, noteAudioExtension,
  prepareNoteAudioFields, MAX_NOTE_AUDIO_BYTES } from '../../entry/src/main/ets/model/NoteAudioDraft.ts';
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { editorPageHarness } from './editor-page-harness.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const attachment = (id = 1, fieldIndex = 0) => ({ id, fieldIndex, uri: '/cache/note-audio-1-1.mp3',
  filename: '', label: 'voice.mp3', temporary: true });

test('audio parts keep original bytes, repeated occurrences and surrounding HTML when edited or removed', () => {
  const value = '<b>中文</b>[sound:语音 1.mp3]尾部[sound:语音 1.mp3]';
  const parts = noteAudioParts(value);
  assert.equal(parts.map(p => p.text).join(''), value);
  assert.deepEqual(parts.filter(p => p.filename).map(p => p.filename), ['语音 1.mp3', '语音 1.mp3']);
  assert.equal(replaceNoteAudioPart(value, 1, ''), '<b>中文</b>尾部[sound:语音 1.mp3]');
  assert.equal(replaceNoteAudioPart(value, 2, '修改'), '<b>中文</b>[sound:语音 1.mp3]修改[sound:语音 1.mp3]');
  assert.deepEqual(noteAudioParts(''), [{ start: 0, end: 0, text: '', filename: '' }]);
  assert.equal(replaceNoteAudioPart(value, 30, 'x'), value);
  assert.equal(noteAudioParts('[sound:broken\nname]')[0].filename, '');
  assert.equal(noteAudioParts('[sound:a&amp;&lt;&#20013;.mp3]')[1].filename, 'a&<中.mp3');
});

test('existing audio resolves only within flat collection media directory', () => {
  assert.equal(localNoteAudioPath('/files', '语 音.mp3'), '/files/collection.media/语 音.mp3');
  for (const name of ['', '.', '..', '../a', 'a/b', 'a\\b', 'https://x', 'file:a', 'x\0']) {
    assert.throws(() => localNoteAudioPath('/files', name));
  }
});

test('audio import recognizes actual common container headers, rejects other and empty files', () => {
  const bytes = text => new TextEncoder().encode(text);
  for (const [header, ext] of [['ID3audio', 'mp3'], ['RIFF0000WAVE', 'wav'], ['OggSdata', 'ogg'],
    ['fLaCdata', 'flac'], ['0000ftypM4A ', 'm4a']]) assert.equal(noteAudioExtension(bytes(header)), ext);
  assert.equal(noteAudioExtension(Uint8Array.of(0xff, 0xf1, 0x50, 0x80)), 'aac');
  assert.equal(noteAudioExtension(Uint8Array.of(0xff, 0xfb, 0x90, 0)), 'mp3');
  for (const data of [bytes('<html>'), bytes('RIFF0000WEBP'), new Uint8Array()]) assert.throws(() => noteAudioExtension(data));
});

test('mixed audio draft saves Core returned names, freezes membership and reuses imports after partial failure', async () => {
  const audios = [attachment(1, 0), attachment(2, 1)]; let imports = 0;
  await assert.rejects(prepareNoteAudioFields(['<img src="a.jpg">', 'answer'], audios, async () => {
    if (++imports === 2) throw Error('disk full'); return 'actual.mp3';
  }), /disk full/);
  assert.equal(audios[0].filename, 'actual.mp3');
  assert.deepEqual(await prepareNoteAudioFields(['<img src="a.jpg">', 'answer'], audios, async () => 'next.m4a'),
    ['<img src="a.jpg">[sound:actual.mp3]', 'answer[sound:next.m4a]']);
  assert.equal(imports, 2);
  const gate = deferred(), fields = ['original'], selected = [attachment()];
  const save = prepareNoteAudioFields(fields, selected, async () => { await gate.promise; return 'x.mp3'; });
  fields[0] = 'late'; selected.length = 0; gate.resolve();
  assert.deepEqual(await save, ['original[sound:x.mp3]']);
  await assert.rejects(prepareNoteAudioFields([''], [attachment(1, 4)], async () => assert.fail()), /Invalid audio field/);
  await assert.rejects(prepareNoteAudioFields([''], [attachment()], async () => 'bad]name'), /Invalid audio import/);
  assert.deepEqual(await prepareNoteAudioFields([''], [attachment()], async () => 'a&<中>.mp3'),
    ['[sound:a&amp;&lt;中&gt;.mp3]']);
});

function importHarness({ size, readFailure = false, writeFailure = false, coreFailure = false } = {}) {
  const data = new TextEncoder().encode('ID3short audio'), events = [];
  let offset = 0;
  const fs = {
    OpenMode: { READ_ONLY: 0, READ_WRITE: 1, CREATE: 2, TRUNC: 4 },
    open: async uri => { events.push(['open', uri]); return { fd: uri === 'provider://one' ? 1 : 2 }; },
    stat: async () => ({ size: size ?? data.length }),
    read: async (_fd, buffer) => {
      if (readFailure) return 0;
      const length = Math.min(3, data.length - offset, buffer.byteLength);
      new Uint8Array(buffer).set(data.slice(offset, offset + length)); offset += length; return length;
    },
    write: async (_fd, buffer) => { if (writeFailure) return 0; events.push(['write', buffer.byteLength]); return buffer.byteLength; },
    close: async file => events.push(['close', file.fd]), unlink: async path => events.push(['unlink', path])
  };
  const dependencies = { fs, MAX_NOTE_AUDIO_BYTES, noteAudioExtension,
    媒体服务: class { async 添加媒体文件(name, bytes) {
      if (coreFailure) throw Error('Core write'); events.push(['core', name, [...bytes]]); return 'actual.mp3';
    } } };
  return { events, data,
    run: loadPlatformModule('backend/NoteAudioImport.ets', 'importNoteAudio', dependencies),
    stage: loadPlatformModule('backend/NoteAudioImport.ets', 'stageNoteAudio', dependencies) };
}

test('provider short reads import full audio bytes and close descriptor even on size/read/Core failure', async () => {
  const h = importHarness(); assert.equal(await h.run('provider://one'), 'actual.mp3');
  assert.deepEqual(h.events.find(e => e[0] === 'core'), ['core', 'note-audio.mp3', [...h.data]]);
  assert.ok(h.events.some(e => e[0] === 'close' && e[1] === 1));
  for (const options of [{ size: 0 }, { size: MAX_NOTE_AUDIO_BYTES + 1 }, { readFailure: true }, { coreFailure: true }]) {
    const f = importHarness(options); await assert.rejects(f.run('provider://one'));
    assert.deepEqual(f.events.at(-1), ['close', 1]);
  }
});

test('chosen audio uses owned cache copy for preview and failed staging removes only that copy', async () => {
  const h = importHarness(), path = await h.stage('provider://one', '/cache');
  assert.match(path, /^\/cache\/note-audio-[\d-]+\.mp3$/);
  assert.equal(h.events.filter(e => e[0] === 'core').length, 0);
  assert.equal(h.events.filter(e => e[0] === 'close').length, 2);
  const f = importHarness({ writeFailure: true }); await assert.rejects(f.stage('provider://one', '/cache'));
  assert.match(f.events.find(e => e[0] === 'unlink')[1], /^\/cache\/note-audio-/);
  assert.deepEqual(f.events.at(-1), ['close', 2]);
});

test('creation save freezes audio fields, blocks duplicate writes and finishes after departure without late UI', async () => {
  const gate = deferred(), states = [], writes = []; let commits = 0;
  const session = new NoteCreationSession({ importAudio: async () => { await gate.promise; return 'recording.m4a'; },
    saveNote: async input => writes.push(input), committed: () => commits++, errorMessage: e => e.message }, s => states.push(s));
  const input = { deckId: 3, notetypeId: 4, fields: ['question'], tags: [], images: [], audios: [attachment()] };
  const pending = session.save(input); await turn(); input.fields[0] = 'late';
  await session.save(input); assert.equal(writes.length, 0); session.dispose(); const count = states.length;
  gate.resolve(); await pending;
  assert.deepEqual(writes[0].fields, ['question[sound:recording.m4a]']);
  assert.equal(commits, 1); assert.equal(states.length, count);
});

test('existing-note save shares sync exclusion and keeps audio names on retry', async () => {
  const h = editorPageHarness(); await h.page.load(); const gate = deferred(), audios = [attachment()];
  h.io.audio = async () => { await gate.promise; h.imports.push('audio'); return 'actual.mp3'; };
  h.io.write = async () => { throw Error('write'); };
  const save = h.page.save(['draft', 'back'], [], [], audios); await turn();
  assert.equal(h.scheduler.canSync(), false); gate.resolve(); assert.equal(await save, false);
  assert.equal(audios[0].filename, 'actual.mp3'); assert.equal(h.scheduler.canSync(), true);
  h.io.write = async notes => h.writes.push(notes);
  assert.equal(await h.page.save(['draft', 'back'], [], [], audios), true);
  assert.equal(h.imports.length, 1); assert.equal(h.writes[0][0].fields[0], 'draft[sound:actual.mp3]');
});

function recorderHarness({ denied = false, gate, stopGate } = {}) {
  const events = [], listeners = new Map();
  const recorder = { on: (key, callback) => listeners.set(key, callback),
    prepare: (config, callback) => { events.push(['prepare', config]); callback(null); }, start: async () => events.push('start'),
    stop: async () => { events.push('stop'); if (stopGate) await stopGate.promise; }, release: async () => events.push('release') };
  const dependencies = { abilityAccessCtrl: { createAtManager: () => ({ requestPermissionsFromUser: async () => {
    if (gate) await gate.promise; return { authResults: [denied ? -1 : 0] };
  } }) }, media: { createAVRecorder: async () => recorder, CodecMimeType: { AUDIO_AAC: 'aac' },
    ContainerFormatType: { CFT_MPEG_4A: 'm4a' }, AudioSourceType: { AUDIO_SOURCE_TYPE_MIC: 1 } },
  fs: { OpenMode: { READ_WRITE: 1, CREATE: 2, TRUNC: 4 }, open: async path => { events.push(['open', path]); return { fd: 7 }; },
    close: async () => events.push('close'), stat: async () => ({ size: 40 }), unlink: async path => events.push(['unlink', path]) },
  hilog: { warn() {} } };
  const Recorder = loadPlatformModule('utils/NoteAudioRecorder.ets', 'NoteAudioRecorder', dependencies);
  return { recorder: new Recorder(), events, listeners,
    discard: loadPlatformModule('utils/NoteAudioRecorder.ets', 'discardNoteRecordings', dependencies) };
}

test('recording requests permission on demand, uses AAC in M4A, closes resources and hands off draft path', async () => {
  const h = recorderHarness(); await h.recorder.start({ cacheDir: '/cache' }, () => assert.fail());
  const config = h.events.find(e => Array.isArray(e) && e[0] === 'prepare')[1];
  assert.equal(config.profile.audioCodec, 'aac'); assert.equal(config.profile.fileFormat, 'm4a');
  const path = await h.recorder.finish(); assert.match(path, /note-recording-.*\.m4a$/);
  assert.equal(h.events.includes('close'), true); assert.equal(h.events.filter(e => e[0] === 'unlink').length, 0);
});

test('denied permission and cancellation during permission or finalization never yield an attachment', async () => {
  const denied = recorderHarness({ denied: true }); await assert.rejects(denied.recorder.start({ cacheDir: '/cache' }, () => {}));
  assert.equal(denied.events.length, 0);
  const gate = deferred(), h = recorderHarness({ gate });
  const start = h.recorder.start({ cacheDir: '/cache' }, () => {}), cancel = h.recorder.cancel(); gate.resolve();
  await Promise.all([start, cancel]); assert.equal(h.events.includes('start'), false);
  const stopGate = deferred(), f = recorderHarness({ stopGate }); await f.recorder.start({ cacheDir: '/cache' }, () => {});
  const finish = f.recorder.finish(); await f.recorder.cancel(); stopGate.resolve();
  await assert.rejects(finish, /interrupted/); assert.ok(f.events.some(e => e[0] === 'unlink'));
});

test('draft cleanup preserves selected originals and collection media even if filenames resemble recordings', async () => {
  const h = recorderHarness(); const selected = attachment(); selected.temporary = false;
  await h.discard([selected, { ...attachment(), uri: '/files/collection.media/voice.mp3' },
    { ...attachment(), uri: '/files/collection.media/note-audio-1-1.mp3' }, attachment()]);
  assert.deepEqual(h.events, [['unlink', '/cache/note-audio-1-1.mp3']]);
});

function fieldHarness(overrides = {}) {
  const events = [], state = { stopped: 0, recording: false };
  const Field = loadComponentLogic('components/common/NoteAudioField.ets', 'NoteAudioField', {
    APP_FOREGROUND_KEY: 'foreground', NoteAudioPreview: class {},
    NoteAudioRecorder: class { async start() { state.recording = true; } async finish() { return '/cache/note-recording-1-1.m4a'; }
      async cancel() { state.recording = false; } },
    picker: { AudioSelectOptions: class {}, AudioViewPicker: class { async select() { return []; } } },
    discardNoteRecordings: async audios => events.push(['cleanup', audios]), stageNoteAudio: async () => '/cache/note-audio-1-1.mp3',
    resourceText: (_ctx, key) => key, $r: key => key, localNoteAudioPath, replaceNoteAudioPart,
    noteAudioParts,
    ...overrides
  });
  const field = new Field(); Object.assign(field, { value: '文字[sound:one.mp3]尾部',
    preview: { stop: async () => state.stopped++, play: async (_uri, changed) => { changed(true); changed(false); } },
    getUIContext: () => ({ getHostContext: () => ({ filesDir: '/files', cacheDir: '/cache' }) }),
    onAdd: (...args) => events.push(['add', ...args]), onBusy: busy => events.push(['busy', busy]),
    onChange: value => events.push(['change', value]) });
  return { field, events, state };
}

test('audio field removes only a reference, recording blocks host actions, and cancel adds no attachment', async () => {
  const h = fieldHarness(); h.field.removePart(1); assert.deepEqual(h.events.at(-1), ['change', '文字尾部']);
  await h.field.record(); assert.equal(h.field.recording, true); assert.deepEqual(h.events.at(-1), ['busy', true]);
  await h.field.cancelRecording(); assert.equal(h.field.recording, false); assert.deepEqual(h.events.at(-1), ['busy', false]);
  assert.equal(h.events.some(e => e[0] === 'add'), false);
  await h.field.record(); await h.field.finishRecording(); assert.deepEqual(h.events.at(-2), ['add', '/cache/note-recording-1-1.m4a', 'app.string.note_audio_recorded', true]);
  h.field.aboutToDisappear();
});

test('late picker response and staging after departure cannot add audio, new cache copy is cleaned', async () => {
  const gate = deferred(); const h = fieldHarness({ picker: { AudioSelectOptions: class {},
    AudioViewPicker: class { async select() { return ['provider://one']; } } }, stageNoteAudio: async () => {
      await gate.promise; return '/cache/note-audio-1-1.mp3';
    } });
  const pending = h.field.pick(); await turn(); h.field.aboutToDisappear(); gate.resolve(); await pending;
  assert.equal(h.events.some(e => e[0] === 'add'), false); assert.ok(h.events.some(e => e[0] === 'cleanup'));
});

test('replacement audio previews its staged URI and deletion removes its draft without treating a marker as a file', async () => {
  const h = fieldHarness();
  const item = { ...attachment(), reference: '[sound:jidecards-draft:test-audio-1]' };
  h.field.value = 'before' + item.reference + 'after'; h.field.audios = [item];
  assert.equal(h.field.partUri(1), item.uri);
  assert.equal(h.field.partLabel(1), item.label);
  h.field.onRemove = id => h.events.push(['remove', id]); h.field.removePart(1);
  assert.deepEqual(h.events.slice(-2), [['change', 'beforeafter'], ['remove', item.id]]);
  const replacement = fieldHarness({ picker: { AudioSelectOptions: class {},
    AudioViewPicker: class { async select() { return ['provider://new.mp3']; } } } });
  replacement.field.onReplace = (...args) => replacement.events.push(['replace', ...args]);
  await replacement.field.pick(1, -1);
  assert.deepEqual(replacement.events.find(e => e[0] === 'replace'),
    ['replace', 1, -1, '/cache/note-audio-1-1.mp3', 'new.mp3', true]);
  assert.equal(replacement.events.some(e => e[0] === 'add'), false);
});

test('shared preview replaces old playback, reports decoder failure and stops before departure', async () => {
  let complete = deferred(); const events = [], player = {
    onPlaybackError() {}, 停止: async () => { events.push('stop'); complete.resolve(); },
    播放队列: async paths => { events.push(['play', paths]); complete = deferred(); },
    waitForCompletion: () => complete.promise, 释放: async () => events.push('release')
  };
  const Preview = loadPlatformModule('utils/NoteAudioPreview.ets', 'NoteAudioPreview', {
    fs: { stat: async () => ({ size: 10 }) }, 声音播放器: class { constructor() { return player; } }
  });
  const preview = new Preview(), first = [], second = [];
  const a = preview.play('one', playing => first.push(playing)); await turn();
  const b = preview.play('two', playing => second.push(playing)); await turn(); await a;
  assert.equal(first.at(-1), false); assert.equal(second.at(-1), true);
  player.onPlaybackError(); complete.resolve(); await assert.rejects(b, /playback failed/);
  assert.equal(second.at(-1), false);
  await preview.dispose(); assert.deepEqual(events.slice(-2), ['stop', 'release']);
  await preview.play('late', () => assert.fail());
});

test('missing audio errors are visible and background cancels microphone capture without attaching', async () => {
  const h = fieldHarness(); h.field.preview.play = async () => { throw Error('missing'); };
  await h.field.play('one', 'one.mp3'); assert.equal(h.field.errorMessage, 'app.string.note_audio_play_failed');
  await h.field.record(); h.field.foreground = false; h.field.backgroundChanged(); await turn();
  assert.equal(h.field.recording, false); assert.equal(h.events.some(e => e[0] === 'add'), false);
  h.field.aboutToDisappear();
});

test('audio recording and picker busy flags block the real form save and close paths', async () => {
  const Form = loadComponentLogic('components/browser/浏览编辑区.ets', '浏览编辑区', {
    NoteAudioPreview: class { async dispose() {} }, discardNoteRecordings: async () => {},
    confirmNoteDiscard: async () => assert.fail('must not prompt while microphone is active'),
    noteDraftChanged: () => true, parseNoteTags: () => []
  });
  const form = new Form(); form.fieldNames = ['Front']; form.audioBusy = true;
  form.onSave = async () => assert.fail('must not save while recording');
  form.onCancel = () => assert.fail('must not leave while recording');
  await form.提交(); await form.requestClose();
  assert.equal(form.images.length, 0);
});

test('stable position rows read latest text and sound filename after edits and deletion shifts', () => {
  const h = fieldHarness(); assert.equal(h.field.partFilename(1), 'one.mp3');
  h.field.value = '新[sound:two.mp3]末尾';
  assert.equal(h.field.partFilename(1), 'two.mp3'); assert.equal(h.field.partText(0), '新');
  h.field.value = replaceNoteAudioPart(h.field.value, 1, '');
  assert.equal(h.field.partText(0), '新末尾'); assert.equal(h.field.partFilename(1), '');
});
